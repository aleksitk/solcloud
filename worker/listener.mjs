// One node, one process. Polls devnet, commits and reveals its own tasks,
// then settles any round that is ready: finalize after the last reveal or
// once the reveal window has closed, refund when the commit window closed.
// Start: node listener.mjs <keypair.json>

import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  DEFAULT_POLL_MS,
  DEFAULT_RPC,
  DEFAULT_WASM_BASE,
  formatLogLine,
  idlCandidates,
  logFile,
  nextDelay,
  ownerTag,
  pollMs,
  rpcHost,
  stateFile,
} from "./lib.mjs";
import { moduleFile, runWasm } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// A deadline is compared with this machine's clock. The margin keeps a
// slightly fast clock from sending a refund the chain would still reject.
const CLOCK_MARGIN_SECS = 20;

function statusName(status) {
  if (typeof status === "string") return status;
  if (status && typeof status === "object") return Object.keys(status)[0] || "";
  return "";
}

function sameKey(member, pubkey) {
  const text = typeof member === "string" ? member : member.toBase58();
  return text === pubkey.toBase58();
}

function commitment(output, nonce) {
  const nonceBytes = Buffer.alloc(8);
  nonceBytes.writeBigUInt64LE(nonce);
  return createHash("sha256").update(Buffer.concat([Buffer.from(output), nonceBytes])).digest();
}

function nowSecs() {
  return Math.floor(Date.now() / 1000);
}

const keypairPath = process.argv[2];
if (!keypairPath) {
  console.error("usage: node listener.mjs <keypair.json>");
  process.exit(1);
}

const owner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8"))));
const ownerText = owner.publicKey.toBase58();
const tag = ownerTag(ownerText);
const idlTried = idlCandidates(here, process.env.SOLCLOUD_IDL);
const idlPath = idlTried.find((candidate) => existsSync(candidate));
if (!idlPath) {
  console.error("IDL not found. Tried:");
  for (const candidate of idlTried) console.error(candidate);
  process.exit(1);
}

const rpc = process.env.SOLCLOUD_RPC || DEFAULT_RPC;
const wasmBase = process.env.SOLCLOUD_WASM_BASE || DEFAULT_WASM_BASE;
const interval = process.env.SOLCLOUD_POLL_MS === undefined ? DEFAULT_POLL_MS : pollMs(process.env.SOLCLOUD_POLL_MS);
const nodeLog = logFile(here, ownerText);
let stopping = false;

function log(taskId, action, detail) {
  const line = formatLogLine({
    iso: new Date().toISOString(),
    node: tag,
    task: taskId,
    action,
    detail,
  });
  console.log(line);
  mkdirSync(dirname(nodeLog), { recursive: true });
  appendFileSync(nodeLog, `${line}\n`);
}

// The same notice every poll would bury the log. Say it once per task.
const said = new Set();
function logOnce(taskId, action, detail) {
  const key = `${taskId}:${action}:${detail}`;
  if (said.has(key)) return;
  said.add(key);
  log(taskId, action, detail);
}

function errorText(err) {
  const text = err?.message || String(err);
  return text.split("\n")[0];
}

function statePath(taskId) {
  return stateFile(here, ownerText, taskId);
}

function readState(taskId) {
  const saved = JSON.parse(readFileSync(statePath(taskId), "utf8"));
  return { output: Buffer.from(saved.output, "hex"), nonce: BigInt(saved.nonce) };
}

function writeState(taskId, output, nonce) {
  const file = statePath(taskId);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({
      output: Buffer.from(output).toString("hex"),
      nonce: nonce.toString(),
    })
  );
  renameSync(tmp, file);
}

function removeState(taskId) {
  const file = statePath(taskId);
  if (existsSync(file)) unlinkSync(file);
}

process.on("unhandledRejection", (err) => {
  log("-", "unhandledRejection", errorText(err));
});
process.on("uncaughtException", (err) => {
  log("-", "uncaughtException", errorText(err));
});
function shutdown() {
  if (stopping) return;
  stopping = true;
  log("-", "stop", "stop");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const idl = JSON.parse(readFileSync(idlPath, "utf8"));
const connection = new Connection(rpc, "confirmed");
const provider = new AnchorProvider(connection, new Wallet(owner), { commitment: "confirmed" });
const program = new Program(idl, provider);

function pda(...seeds) {
  return PublicKey.findProgramAddressSync(seeds, program.programId)[0];
}

const configPda = pda(Buffer.from("config"));

function nodePdaOf(ownerKey) {
  return pda(Buffer.from("node"), ownerKey.toBuffer());
}

function commitPdaOf(taskKey, ownerKey) {
  return pda(Buffer.from("commit"), taskKey.toBuffer(), ownerKey.toBuffer());
}

function resultPda(taskKey) {
  return pda(Buffer.from("result"), taskKey.toBuffer());
}

const nodePda = nodePdaOf(owner.publicKey);

// A commit account made before `revealed_at` existed is 8 bytes shorter.
// Eight zero bytes on the end read as revealed_at = 0, the same way the
// program reads it. Borsh ignores bytes past the last field.
async function readCommit(taskKey, ownerKey = owner.publicKey) {
  const info = await connection.getAccountInfo(commitPdaOf(taskKey, ownerKey));
  if (!info) return null;
  return program.coder.accounts.decode("commitAccount", Buffer.concat([info.data, Buffer.alloc(8)]));
}

// Config is read as raw bytes: the treasury sits at a fixed offset in every
// layout, including the 107-byte account from before `active_nodes`.
let treasury = null;
async function readTreasury() {
  if (treasury) return treasury;
  const info = await connection.getAccountInfo(configPda);
  if (!info) throw new Error("Config account is missing.");
  treasury = new PublicKey(info.data.subarray(40, 72));
  return treasury;
}

// Send, and before each new attempt ask the chain whether the last one landed.
// A transaction can land while its confirmation times out. Sending it again
// would then fail with "already in use", which is how a node lost its nonce.
async function send(taskId, label, build, landed) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await build().rpc();
    } catch (err) {
      if (await landed().catch(() => false)) return "landed";
      if (attempt === 5) throw err;
      log(taskId, label, `failed, retry ${attempt}/5: ${errorText(err)}`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

// A requester can store the module on chain, under their own key and its hash.
// Returns the bytes only when the upload is complete and they hash to `hash`.
async function moduleFromChain(hash, requester) {
  const key = pda(Buffer.from("module"), requester.toBuffer(), Buffer.from(hash, "hex"));
  const stored = await program.account.moduleAccount.fetchNullable(key);
  if (!stored || !stored.sealed) return null;
  const bytes = Buffer.from(stored.data);
  if (createHash("sha256").update(bytes).digest("hex") !== hash) return null;
  return bytes;
}

// Where a module comes from, in order: this machine, the chain, then the HTTP base.
async function ensureModule(hash, requester) {
  const file = moduleFile(hash);
  if (existsSync(file)) return { file, downloaded: false };
  const onChain = await moduleFromChain(hash, requester).catch(() => null);
  if (onChain) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, onChain);
    return { file, downloaded: true };
  }
  if (!wasmBase) throw new Error(`No wasm for ${hash} on this machine or on chain, and SOLCLOUD_WASM_BASE is unset.`);
  const root = wasmBase.endsWith("/") ? wasmBase : `${wasmBase}/`;
  const url = new URL(`${hash}.wasm`, root);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Wasm URL must be http or https: ${url}`);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Wasm download failed (${response.status}) ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return { file, downloaded: true };
}

// Run the task once and keep the output and nonce. A later commit attempt
// reuses the same pair, so the hash on chain always matches the saved file.
async function prepare(task, taskId) {
  if (existsSync(statePath(taskId))) return readState(taskId);
  const wasmHash = Buffer.from(task.account.wasmHash).toString("hex");
  const input = Uint8Array.from(Buffer.from(task.account.input));
  let file = "";
  let downloaded = false;
  try {
    ({ file, downloaded } = await ensureModule(wasmHash, task.account.requester));
    const output = Buffer.from(await runWasm({ file, hash: wasmHash, input }));
    const nonce = randomBytes(8).readBigUInt64LE();
    writeState(taskId, output, nonce);
    log(taskId, "run", `output=${output.toString("hex")}`);
    return { output, nonce };
  } catch (err) {
    if (downloaded && file && existsSync(file)) unlinkSync(file);
    logOnce(taskId, "wasm", errorText(err));
    return null;
  }
}

async function commitTask(task, taskId) {
  const onChain = await readCommit(task.publicKey);
  if (onChain) {
    if (!existsSync(statePath(taskId))) {
      logOnce(taskId, "commit", "on chain, but the saved output and nonce are gone. This node cannot reveal");
    }
    return;
  }
  if (nowSecs() > task.account.commitDeadline.toNumber()) return;

  const saved = await prepare(task, taskId);
  if (!saved) return;
  const hashCommitment = commitment(saved.output, saved.nonce);
  try {
    const signature = await send(
      taskId,
      "commit",
      () =>
        program.methods
          .commitResult(new BN(taskId), Array.from(hashCommitment))
          .accountsPartial({
            task: task.publicKey,
            commit: commitPdaOf(task.publicKey, owner.publicKey),
            node: nodePda,
            owner: owner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner]),
      async () => {
        const commit = await readCommit(task.publicKey);
        return Boolean(commit) && Buffer.from(commit.hashCommitment).equals(hashCommitment);
      }
    );
    log(taskId, "commit", signature);
  } catch (err) {
    // The saved file stays. The next poll sends the same commitment again.
    log(taskId, "commit", errorText(err));
  }
}

async function revealTask(task, taskId) {
  const onChain = await readCommit(task.publicKey);
  if (!onChain) return;
  if (onChain.revealed) {
    removeState(taskId);
    return;
  }
  if (!existsSync(statePath(taskId))) {
    logOnce(taskId, "reveal", "no saved output and nonce for this commit");
    return;
  }
  if (nowSecs() > task.account.revealDeadline.toNumber()) return;
  // Test switch: commit and then stay silent, to exercise the slash for a missing reveal.
  if (process.env.SOLCLOUD_SKIP_REVEAL === "1") {
    logOnce(taskId, "reveal", "skipped: SOLCLOUD_SKIP_REVEAL is set");
    return;
  }

  const saved = readState(taskId);
  if (!Buffer.from(onChain.hashCommitment).equals(commitment(saved.output, saved.nonce))) {
    logOnce(taskId, "reveal", "the saved output and nonce do not match the commit on chain");
    return;
  }
  try {
    const signature = await send(
      taskId,
      "reveal",
      () =>
        program.methods
          .revealResult(new BN(taskId), saved.output, new BN(saved.nonce.toString()))
          .accountsPartial({
            task: task.publicKey,
            commit: commitPdaOf(task.publicKey, owner.publicKey),
            owner: owner.publicKey,
          })
          .signers([owner]),
      async () => Boolean((await readCommit(task.publicKey))?.revealed)
    );
    log(taskId, "reveal", signature);
    removeState(taskId);
  } catch (err) {
    log(taskId, "reveal", errorText(err));
  }
}

// Which settle step a round is ready for, if any. Anyone may send either one.
function settleStep(task) {
  const account = task.account;
  const status = statusName(account.status);
  const now = nowSecs() - CLOCK_MARGIN_SECS;
  if (status === "revealing" && account.revealCount === account.committeeSize) return "finalize";
  if (status === "committing" && now > account.commitDeadline.toNumber()) return "refund";
  // A closed reveal window is settled by finalize too. It counts the reveals
  // that arrived and slashes the nodes that committed and stayed silent.
  if (status === "revealing" && now > account.revealDeadline.toNumber()) return "finalize";
  return null;
}

async function settleTask(task, taskId, step) {
  const result = resultPda(task.publicKey);
  const settled = async () => Boolean(await connection.getAccountInfo(result));
  if (await settled()) return;

  try {
    let build;
    if (step === "finalize") {
      // Remaining accounts are triples in committee order: commit, owner wallet, node PDA.
      const remaining = [];
      for (const member of task.account.committee) {
        const memberKey = new PublicKey(member);
        remaining.push(
          { pubkey: commitPdaOf(task.publicKey, memberKey), isSigner: false, isWritable: false },
          { pubkey: memberKey, isSigner: false, isWritable: true },
          { pubkey: nodePdaOf(memberKey), isSigner: false, isWritable: true }
        );
      }
      const treasuryKey = await readTreasury();
      build = () =>
        program.methods
          .finalize(new BN(taskId))
          .accountsPartial({
            task: task.publicKey,
            result,
            config: configPda,
            treasury: treasuryKey,
            requester: task.account.requester,
            payer: owner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(remaining)
          .signers([owner]);
    } else {
      build = () =>
        program.methods
          .refundExpired(new BN(taskId))
          .accountsPartial({
            task: task.publicKey,
            result,
            requester: task.account.requester,
            payer: owner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner]);
    }
    const signature = await send(taskId, step, build, settled);
    log(taskId, step, signature);
  } catch (err) {
    // Another node may have settled it in the same moment.
    if (await settled().catch(() => false)) return;
    log(taskId, step, errorText(err));
  }
}

async function pollOnce() {
  const tasks = await program.account.taskAccount.all();
  for (const task of tasks) {
    if (stopping) return;
    const taskId = task.account.taskId.toString();
    const status = statusName(task.account.status);
    try {
      const mine = task.account.committee.some((member) => sameKey(member, owner.publicKey));
      if (mine && status === "committing") await commitTask(task, taskId);
      else if (mine && status === "revealing") await revealTask(task, taskId);
      else if (mine && existsSync(statePath(taskId))) removeState(taskId);

      const step = settleStep(task);
      if (step) await settleTask(task, taskId, step);
    } catch (err) {
      log(taskId, "error", errorText(err));
    }
  }
}

// One poll at a time. A busy public RPC answers 429; wait longer each time.
async function loop() {
  let failures = 0;
  while (!stopping) {
    try {
      await pollOnce();
      failures = 0;
    } catch (err) {
      failures += 1;
      log("-", "poll", errorText(err));
    }
    await new Promise((resolve) => setTimeout(resolve, nextDelay(interval, failures)));
  }
}

log(
  "-",
  "start",
  `owner=${ownerText} pda=${nodePda.toBase58()} program=${program.programId.toBase58()} rpc=${rpcHost(rpc)} idl=${idlPath} poll=${interval} wasm=${wasmBase || "local only"}`
);
loop();
