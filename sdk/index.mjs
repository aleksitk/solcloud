// SolCloud from your own code: send a task, wait, read the answer.
//
//   import { SolCloud } from "solcloud";
//   const cloud = new SolCloud({ keypair: "./backend-key.json" });
//   const { output } = await cloud.run({ wasm: "./my-function.wasm", input: "05000000" });
//
// There is no account to open. The keypair pays the reward and signs the request.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
// Anchor ships CommonJS. Node 22 does not see BN as a named export, so take the default.
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "./idl.json" with { type: "json" };

const { AnchorProvider, BN, Program, Wallet } = anchor;

export const DEVNET_RPC = "https://api.devnet.solana.com";
const LAMPORTS = 1_000_000_000;
// Bytes of a module per write. A transaction holds about 1 KB.
const CHUNK = 900;
const MAX_MODULE = 10_000;
const MAX_IO = 64;
// Commits are due five minutes after the request and reveals five minutes after that.
const SETTLE_TIMEOUT_MS = 12 * 60_000;

function u64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function statusName(status) {
  return Object.keys(status)[0];
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadKeypair(source) {
  if (source instanceof Keypair) return source;
  if (typeof source === "string") {
    if (!existsSync(source)) throw new Error(`Keypair file not found: ${source}`);
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(source, "utf8"))));
  }
  if (source instanceof Uint8Array || Array.isArray(source)) return Keypair.fromSecretKey(Uint8Array.from(source));
  throw new Error("keypair must be a file path, a secret key, or a Keypair.");
}

function inputBytes(input) {
  let bytes;
  if (typeof input === "string") {
    if (!/^([0-9a-f]{2})*$/i.test(input)) throw new Error("input must be hex bytes, for example 05000000.");
    bytes = Buffer.from(input, "hex");
  } else if (input instanceof Uint8Array) {
    bytes = Buffer.from(input);
  } else {
    throw new Error("input must be a hex string or bytes.");
  }
  if (bytes.length === 0 || bytes.length > MAX_IO) throw new Error(`input must be 1 to ${MAX_IO} bytes.`);
  return bytes;
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

export class SolCloud {
  /**
   * @param {object} [options]
   * @param {string | Uint8Array | number[] | Keypair} [options.keypair] Pays and signs. Leave out to only read.
   * @param {string} [options.rpc] Defaults to SOLCLOUD_RPC, then the public devnet RPC.
   */
  constructor({ keypair, rpc = process.env.SOLCLOUD_RPC || DEVNET_RPC } = {}) {
    this.keypair = keypair ? loadKeypair(keypair) : null;
    this.connection = new Connection(rpc, "confirmed");
    const wallet = new Wallet(this.keypair || Keypair.generate());
    this.program = new Program(idl, new AnchorProvider(this.connection, wallet, { commitment: "confirmed" }));
  }

  /** The address that pays for tasks, or null when this client only reads. */
  get address() {
    return this.keypair ? this.keypair.publicKey.toBase58() : null;
  }

  #pda(...seeds) {
    return PublicKey.findProgramAddressSync(seeds, this.program.programId)[0];
  }

  #signer() {
    if (!this.keypair) throw new Error("This call signs a transaction. Pass a keypair to new SolCloud().");
    return this.keypair;
  }

  /**
   * Store a compiled module on chain so every node can fetch it. Safe to call again:
   * a finished module is left alone and an interrupted upload resumes.
   * @param {Uint8Array | string} wasm The module's bytes, or a path to a .wasm file.
   * @returns {Promise<{ hash: string, account: string, transactions: number }>}
   */
  async publish(wasm) {
    const owner = this.#signer();
    const bytes = typeof wasm === "string" ? readFileSync(wasm) : Buffer.from(wasm);
    if (bytes.length === 0 || bytes.length > MAX_MODULE) {
      throw new Error(`A module must be 1 to ${MAX_MODULE} bytes. This one is ${bytes.length}.`);
    }
    const hash = sha256Hex(bytes);
    const module = this.#pda(Buffer.from("module"), owner.publicKey.toBuffer(), Buffer.from(hash, "hex"));
    let stored = await this.program.account.moduleAccount.fetchNullable(module);
    let transactions = 0;
    if (!stored?.sealed) {
      if (!stored) {
        await this.program.methods
          .createModule([...Buffer.from(hash, "hex")], bytes.length)
          .accounts({ module, uploader: owner.publicKey, systemProgram: SystemProgram.programId })
          .rpc();
        transactions += 1;
        stored = { data: [] };
      }
      for (let at = stored.data.length; at < bytes.length; at += CHUNK) {
        await this.program.methods
          .writeModule(Buffer.from(bytes.subarray(at, at + CHUNK)))
          .accounts({ module, uploader: owner.publicKey })
          .rpc();
        transactions += 1;
      }
    }
    return { hash, account: module.toBase58(), transactions };
  }

  /**
   * Create a task. Returns as soon as the request lands; use wait() for the answer.
   * @param {object} task
   * @param {Uint8Array | string} task.wasm Module bytes, a path to a .wasm file, or the SHA-256 of a module already published.
   * @param {Uint8Array | string} task.input 1 to 64 bytes, as bytes or a hex string.
   * @param {number} [task.reward] SOL locked for the nodes. Default 0.05.
   * @param {number} [task.committee] How many nodes run it: 3, 5, 7, 9 or 11. Default 3.
   * @returns {Promise<{ taskId: string, signature: string, wasmHash: string, committee: string[] }>}
   */
  async request({ wasm, input, reward = 0.05, committee = 3 }) {
    const requester = this.#signer();
    const data = inputBytes(input);
    const lamports = Math.round(Number(reward) * LAMPORTS);
    if (!(lamports > 0)) throw new Error("reward must be more than 0 SOL.");
    if (![3, 5, 7, 9, 11].includes(committee)) throw new Error("committee must be 3, 5, 7, 9 or 11.");

    let wasmHash;
    if (typeof wasm === "string" && /^[0-9a-f]{64}$/i.test(wasm)) wasmHash = wasm.toLowerCase();
    else wasmHash = (await this.publish(wasm)).hash;

    const configKey = this.#pda(Buffer.from("config"));
    const config = await this.program.account.config.fetch(configKey);
    const owners = config.activeNodes.map((owner) => owner.toBase58());
    if (owners.length < committee) {
      throw new Error(`Only ${owners.length} nodes are staked. Choose a smaller committee.`);
    }

    let taskId = BigInt(config.taskCount.toString()) + 1n;
    let task = this.#pda(Buffer.from("task"), u64(taskId));
    while (await this.connection.getAccountInfo(task)) {
      taskId += 1n;
      task = this.#pda(Buffer.from("task"), u64(taskId));
    }
    const seedSlot = await this.connection.getSlot("confirmed");
    const drawn = selectCommittee(owners, committee, seedSlot, taskId);

    const signature = await this.program.methods
      .requestTask(new BN(taskId.toString()), [...Buffer.from(wasmHash, "hex")], data, new BN(lamports), committee, new BN(seedSlot))
      .accounts({ config: configKey, task, requester: requester.publicKey, systemProgram: SystemProgram.programId })
      .remainingAccounts(
        drawn.map((owner) => ({
          pubkey: this.#pda(Buffer.from("node"), new PublicKey(owner).toBuffer()),
          isSigner: false,
          isWritable: false,
        }))
      )
      .rpc();
    return { taskId: taskId.toString(), signature, wasmHash, committee: drawn };
  }

  /**
   * Where a task stands right now.
   * @param {string | number | bigint} taskId
   * @returns {Promise<null | { taskId: string, status: string, settled: boolean, commits: number, reveals: number, committeeSize: number, agreed: number | null, output: Uint8Array | null, outputHex: string | null }>}
   *   null when no such task exists. status is "committing", "revealing", "finalized" or "refunded".
   *   output is set only when status is "finalized".
   */
  async status(taskId) {
    const taskKey = this.#pda(Buffer.from("task"), u64(taskId));
    const task = await this.program.account.taskAccount.fetchNullable(taskKey);
    if (!task) return null;
    const stored = await this.program.account.taskResult.fetchNullable(this.#pda(Buffer.from("result"), taskKey.toBuffer()));
    const status = stored ? statusName(stored.status) : statusName(task.status);
    const finalized = status === "finalized";
    const output = finalized ? Uint8Array.from(stored.finalOutput) : null;
    return {
      taskId: String(taskId),
      status,
      settled: Boolean(stored),
      commits: task.commitCount,
      reveals: task.revealCount,
      committeeSize: task.committeeSize,
      agreed: stored ? stored.agreedCount : null,
      output,
      outputHex: output ? Buffer.from(output).toString("hex") : null,
    };
  }

  /**
   * Poll until the round settles. A round ends "finalized" with an output, or "refunded"
   * with the reward returned: check status before you use the output.
   * @param {string | number | bigint} taskId
   * @param {{ timeoutMs?: number, pollMs?: number }} [options]
   */
  async wait(taskId, { timeoutMs = SETTLE_TIMEOUT_MS, pollMs = 3000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let misses = 0;
    for (;;) {
      try {
        const now = await this.status(taskId);
        if (!now) throw new Error(`Task ${taskId} does not exist.`);
        if (now.settled) return now;
        misses = 0;
      } catch (err) {
        // A busy public RPC answers 429 now and then. Give up only if it keeps failing.
        if (/does not exist/.test(err.message) || (misses += 1) > 5) throw err;
      }
      if (Date.now() > deadline) throw new Error(`Task ${taskId} did not settle in ${Math.round(timeoutMs / 1000)} seconds.`);
      await pause(pollMs);
    }
  }

  /**
   * request() then wait(): send the task and come back with the settled round.
   * @param {Parameters<SolCloud["request"]>[0] & { timeoutMs?: number, pollMs?: number }} task
   */
  async run({ timeoutMs, pollMs, ...task }) {
    const sent = await this.request(task);
    const settled = await this.wait(sent.taskId, { timeoutMs, pollMs });
    return { ...sent, ...settled };
  }

  /**
   * The staked nodes a committee is drawn from.
   * @returns {Promise<{ owner: string, status: string, stake: number, completed: number, slashed: number }[]>}
   */
  async nodes() {
    const config = await this.program.account.config.fetch(this.#pda(Buffer.from("config")));
    const out = [];
    for (const owner of config.activeNodes) {
      const node = await this.program.account.nodeAccount.fetch(this.#pda(Buffer.from("node"), owner.toBuffer()));
      out.push({
        owner: owner.toBase58(),
        status: statusName(node.status),
        stake: node.stakeAmount.toNumber() / LAMPORTS,
        completed: Number(node.tasksCompleted),
        slashed: Number(node.tasksSlashed),
      });
    }
    return out;
  }
}
