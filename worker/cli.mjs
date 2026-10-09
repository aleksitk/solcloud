// SolCloud from a terminal, without the site.
//   node cli.mjs request <keypair.json> --wasm <file.wasm|hash> --input <hex> [--reward 0.05] [--committee 3]
//   node cli.mjs stake   <keypair.json> [--sol 1]
//   node cli.mjs status  <task-id>
//   node cli.mjs nodes
// Add --dry-run to request or stake to simulate without sending.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { DEFAULT_RPC, idlCandidates } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const LAMPORTS = 1_000_000_000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  fail(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 6).join("\n").replaceAll("// ", ""));
}

function flags(args) {
  const out = {};
  for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith("--")) continue;
    const name = args[index].slice(2);
    const next = args[index + 1];
    if (next === undefined || next.startsWith("--")) out[name] = true;
    else {
      out[name] = next;
      index += 1;
    }
  }
  return out;
}

function loadKeypair(file) {
  if (!file || !existsSync(file)) fail(`Keypair file not found: ${file || "(none given)"}`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8"))));
}

function connect(keypair) {
  const idlPath = idlCandidates(here, process.env.SOLCLOUD_IDL).find((candidate) => existsSync(candidate));
  if (!idlPath) fail("IDL not found. Expected worker/idl/solcloud.json.");
  const connection = new Connection(process.env.SOLCLOUD_RPC || DEFAULT_RPC, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(keypair || Keypair.generate()), { commitment: "confirmed" });
  return new Program(JSON.parse(readFileSync(idlPath, "utf8")), provider);
}

function pda(program, ...seeds) {
  return PublicKey.findProgramAddressSync(seeds, program.programId)[0];
}

function u64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function statusName(status) {
  return Object.keys(status)[0];
}

// The same draw the program makes: a Fisher-Yates shuffle fed by sha256(slot ‖ task id).
function selectCommittee(owners, size, seedSlot, taskId) {
  let state = createHash("sha256").update(Buffer.concat([u64(seedSlot), u64(taskId)])).digest();
  const order = owners.slice();
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = createHash("sha256").update(state).digest();
    const swapAt = Number(state.readBigUInt64LE(0) % BigInt(index + 1));
    [order[index], order[swapAt]] = [order[swapAt], order[index]];
  }
  return order.slice(0, size);
}

function wasmHash(value) {
  if (!value || value === true) fail("--wasm needs a .wasm file or a 64-character SHA-256.");
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  if (!existsSync(value)) fail(`Wasm file not found: ${value}`);
  return createHash("sha256").update(readFileSync(value)).digest("hex");
}

async function request(args) {
  const opts = flags(args);
  const requester = loadKeypair(args[0]);
  const program = connect(requester);
  const hash = wasmHash(opts.wasm);
  const inputHex = opts.input === true || opts.input === undefined ? "" : String(opts.input);
  if (!/^([0-9a-f]{2})*$/i.test(inputHex)) fail("--input must be hex bytes, for example 05000000.");
  const input = Buffer.from(inputHex, "hex");
  if (input.length > 64) fail("The input is capped at 64 bytes.");
  const size = Number(opts.committee || 3);
  const reward = Math.round(Number(opts.reward || 0.05) * LAMPORTS);
  if (!(reward > 0)) fail("--reward must be more than 0.");

  const configKey = pda(program, Buffer.from("config"));
  const config = await program.account.config.fetch(configKey);
  const owners = config.activeNodes.map((owner) => owner.toBase58());
  if (owners.length < size) fail(`Only ${owners.length} nodes are in the registry. Choose a smaller committee.`);

  let taskId = BigInt(config.taskCount.toString()) + 1n;
  let task = pda(program, Buffer.from("task"), u64(taskId));
  while (await program.provider.connection.getAccountInfo(task)) {
    taskId += 1n;
    task = pda(program, Buffer.from("task"), u64(taskId));
  }
  const seedSlot = await program.provider.connection.getSlot("confirmed");
  const committee = selectCommittee(owners, size, seedSlot, taskId);

  const call = program.methods
    .requestTask(new BN(taskId.toString()), [...Buffer.from(hash, "hex")], input, new BN(reward), size, new BN(seedSlot))
    .accounts({ config: configKey, task, requester: requester.publicKey, systemProgram: SystemProgram.programId })
    .remainingAccounts(
      committee.map((owner) => ({
        pubkey: pda(program, Buffer.from("node"), new PublicKey(owner).toBuffer()),
        isSigner: false,
        isWritable: false,
      }))
    );

  console.log(`task ${taskId}  wasm ${hash}`);
  console.log(`committee ${committee.join(" ")}`);
  if (opts["dry-run"]) {
    await call.simulate();
    console.log("dry run passed. Nothing was sent.");
    return;
  }
  console.log(`signature ${await call.rpc()}`);
  console.log(`follow it with: node cli.mjs status ${taskId}`);
}

async function stake(args) {
  const opts = flags(args);
  const owner = loadKeypair(args[0]);
  const program = connect(owner);
  const lamports = Math.round(Number(opts.sol || 1) * LAMPORTS);
  const node = pda(program, Buffer.from("node"), owner.publicKey.toBuffer());
  if (await program.provider.connection.getAccountInfo(node)) fail(`This key already runs node ${node.toBase58()}.`);

  const call = program.methods.registerNode(new BN(lamports)).accounts({
    config: pda(program, Buffer.from("config")),
    node,
    owner: owner.publicKey,
    systemProgram: SystemProgram.programId,
  });
  console.log(`owner ${owner.publicKey.toBase58()}  node ${node.toBase58()}  stake ${lamports / LAMPORTS} SOL`);
  if (opts["dry-run"]) {
    await call.simulate();
    console.log("dry run passed. Nothing was sent.");
    return;
  }
  console.log(`signature ${await call.rpc()}`);
  console.log(`now start the listener: node listener.mjs ${args[0]}`);
}

async function status(args) {
  if (!/^\d+$/.test(args[0] || "")) fail("usage: node cli.mjs status <task-id>");
  const program = connect();
  const taskKey = pda(program, Buffer.from("task"), u64(args[0]));
  const task = await program.account.taskAccount.fetchNullable(taskKey);
  if (!task) fail(`Task ${args[0]} does not exist.`);
  console.log(`task ${args[0]}  ${statusName(task.status)}  commits ${task.commitCount}/${task.committeeSize}  reveals ${task.revealCount}/${task.committeeSize}`);
  const result = await program.account.taskResult.fetchNullable(pda(program, Buffer.from("result"), taskKey.toBuffer()));
  if (!result) return;
  console.log(`result ${statusName(result.status)}  agreed ${result.agreedCount}/${result.committeeSize}`);
  console.log(`output ${Buffer.from(result.finalOutput).toString("hex")}`);
}

async function nodes() {
  const program = connect();
  const config = await program.account.config.fetch(pda(program, Buffer.from("config")));
  for (const owner of config.activeNodes) {
    const node = await program.account.nodeAccount.fetch(pda(program, Buffer.from("node"), owner.toBuffer()));
    console.log(
      `${owner.toBase58()}  ${statusName(node.status)}  stake ${node.stakeAmount.toNumber() / LAMPORTS} SOL  completed ${node.tasksCompleted}  slashed ${node.tasksSlashed}`
    );
  }
}

const [command, ...rest] = process.argv.slice(2);
const run = { request, stake, status, nodes }[command];
if (!run) usage();
run(rest).catch((err) => fail(err?.message?.split("\n")[0] || String(err)));
