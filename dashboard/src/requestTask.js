import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

export const RPC = "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey("D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ");
export const WASM_HASH = "ee0b3e4c3ede257e3719c52deee27528ea791218cdea3a5802fd52bf9ce5057a";

// Public owner keys of the three nodes already staked on devnet.
const NODE_OWNERS = [
  "GXD26Q35NjyUiWu93rVU8iQzm3vfU7pTSYXyZDrcvq3d",
  "CVxAsXthJSZezHGNmLzeFjaV49CGEuHBHjMUnBoxr97n",
  "5czt2hE9Xn5UFqQvGEkgwF8FqCjDn8MLhofMRE7ShUgb",
];

const connection = new Connection(RPC, "confirmed");

function concat(parts) {
  return Buffer.concat(parts.map((part) => Buffer.from(part)));
}

function u32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

function u64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

async function discriminator(name) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`global:${name}`));
  return Buffer.from(hash).subarray(0, 8);
}

export function solToLamports(text) {
  const trimmed = String(text).trim();
  if (!/^\d+(\.\d{1,9})?$/.test(trimmed)) {
    throw new Error("Reward must be a SOL amount with at most 9 decimals.");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const lamports = BigInt(whole) * 1_000_000_000n + BigInt((frac + "000000000").slice(0, 9));
  if (lamports <= 0n) throw new Error("Reward must be greater than zero.");
  return lamports;
}

export function mazeInput(seed, size) {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error("Maze seed must be a whole number.");
  }
  if (!Number.isSafeInteger(size) || size <= 0 || size > 0xffffffff) {
    throw new Error("Maze size must be a whole number.");
  }
  return concat([u64(seed), u32(size)]);
}

async function withRetries(action) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastError = err;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw lastError;
}

function readTaskCount(data) {
  const bytes = Uint8Array.from(data);
  return new DataView(bytes.buffer).getBigUint64(96, true);
}

const ROUND_STATUS = ["Requested", "Committing", "Revealing", "Finalized", "Failed", "Refunded"];

function taskPda(taskId) {
  return PublicKey.findProgramAddressSync([Buffer.from("task"), u64(taskId)], PROGRAM_ID)[0];
}

async function readAccount(pubkey) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await connection.getAccountInfo(pubkey);
    } catch (err) {
      lastError = err;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  throw lastError;
}

export function describeRound(round) {
  const size = round.committee;
  const need = round.threshold;
  if (round.status === "Committing") {
    return `${round.commits} of ${size} committed. ${need} of ${size} must agree.`;
  }
  if (round.status === "Revealing") {
    return `${round.reveals} of ${size} revealed. ${need} of ${size} must agree.`;
  }
  if (round.status === "Finalized") {
    return `${round.reveals} of ${size} revealed. ${need} of ${size} was enough.`;
  }
  if (round.status === "Refunded") {
    return `The reward returned to the requester. ${need} of ${size} had to agree.`;
  }
  if (round.status === "Failed") {
    return "The round failed before a result was stored.";
  }
  return `${need} of ${size} must agree.`;
}

function parseTask(raw, taskId, task) {
  const data = Uint8Array.from(raw);
  const view = new DataView(data.buffer);
  const inputLen = view.getUint32(72, true);
  const seed = inputLen >= 12 ? view.getBigUint64(76, true) : null;
  const mazeSize = inputLen >= 12 ? view.getUint32(84, true) : null;
  let offset = 76 + inputLen + 8;
  const committee = data[offset];
  offset += 1;
  const committeeLen = view.getUint32(offset, true);
  offset += 4 + committeeLen * 32;
  const status = data[offset];
  return {
    id: taskId.toString().padStart(2, "0"),
    address: task.toBase58(),
    status: ROUND_STATUS[status] || "Unknown",
    commits: data[offset + 1],
    reveals: data[offset + 2],
    seed,
    mazeSize,
    committee,
    threshold: Math.floor(committee / 2) + 1,
  };
}

function parseResult(raw) {
  if (!raw) return null;
  const data = Uint8Array.from(raw);
  const view = new DataView(data.buffer);
  const outputLen = view.getUint32(40, true);
  const offset = 44 + outputLen + 32;
  const names = ["Finalized", "Failed", "Refunded"];
  return {
    status: names[data[offset]] || "Unknown",
    agreed: data[offset + 1],
    committee: data[offset + 2],
  };
}

function settledView(task, result) {
  const size = task.committee;
  const agreement = `${result.agreed} of ${size}`;
  if (result.status === "Finalized" && result.agreed < size) {
    return { status: "Slashed", title: "Minority lost stake", agreement, effect: "Stake cut", tone: "bad" };
  }
  if (result.status === "Finalized") {
    return { status: "Finalized", title: "Majority paid", agreement, effect: "Paid", tone: "good" };
  }
  if (result.status === "Refunded") {
    if (task.reveals >= size && result.agreed < task.threshold) {
      return { status: "Refunded", title: "No majority", agreement, effect: "Returned", tone: "muted" };
    }
    const progress = task.commits < size ? task.commits : task.reveals;
    return {
      status: "Refunded",
      title: "Window expired",
      agreement: `${progress} of ${size}`,
      effect: "Returned",
      tone: "muted",
    };
  }
  return { status: "Failed", title: "Round failed", agreement, effect: "—", tone: "bad" };
}

export async function readRound(taskId) {
  const task = taskPda(taskId);
  const info = await readAccount(task);
  if (!info) return null;
  const parsed = parseTask(info.data, taskId, task);
  const live = parsed.status === "Committing" || parsed.status === "Revealing";
  return {
    ...parsed,
    tone: parsed.status === "Finalized" ? "good" : parsed.status === "Failed" ? "bad" : live ? "live" : "muted",
  };
}

export async function readSettledRounds() {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const configInfo = await readAccount(config);
  if (!configInfo) throw new Error("The protocol config is missing on devnet.");
  const count = Number(readTaskCount(configInfo.data));
  if (!count) return [];

  const ids = [];
  for (let id = count; id >= 1; id -= 1) ids.push(BigInt(id));
  const tasks = ids.map((id) => taskPda(id));
  const taskInfos = await withRetries(() => connection.getMultipleAccountsInfo(tasks));
  const rows = [];
  const resultKeys = [];
  for (let index = 0; index < ids.length; index += 1) {
    if (!taskInfos[index]) continue;
    rows.push(parseTask(taskInfos[index].data, ids[index], tasks[index]));
    const [result] = PublicKey.findProgramAddressSync(
      [Buffer.from("result"), tasks[index].toBuffer()],
      PROGRAM_ID
    );
    resultKeys.push(result);
  }
  if (!rows.length) return [];

  const resultInfos = await withRetries(() => connection.getMultipleAccountsInfo(resultKeys));
  const settled = [];
  for (let index = 0; index < rows.length; index += 1) {
    const result = parseResult(resultInfos[index]?.data);
    if (!result) continue;
    settled.push({ ...rows[index], ...settledView(rows[index], result) });
  }
  return settled;
}

function solText(lamports) {
  const whole = lamports / 1_000_000_000n;
  const frac = (lamports % 1_000_000_000n).toString().padStart(9, "0").slice(0, 3);
  return `${whole.toString()}.${frac}`;
}

const NODE_STATUS = ["Active", "Inactive", "Slashed"];

export async function readNodes() {
  const nodes = [];
  for (let index = 0; index < NODE_OWNERS.length; index++) {
    const owner = new PublicKey(NODE_OWNERS[index]);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("node"), owner.toBuffer()],
      PROGRAM_ID
    );
    const info = await readAccount(pda);
    if (!info) continue;
    const data = Buffer.from(info.data);
    const stake = data.readBigUInt64LE(40);
    const status = data[48];
    nodes.push({
      id: String(index + 1).padStart(2, "0"),
      address: pda.toBase58(),
      status: NODE_STATUS[status] || "Unknown",
      tone: status === 2 ? "bad" : status === 0 ? "good" : "muted",
      stakeText: solText(stake),
      reduced: stake < 1_000_000_000n,
    });
  }
  return nodes;
}

export async function latestRound() {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const info = await readAccount(config);
  if (!info) throw new Error("The protocol config is missing on devnet.");
  const id = readTaskCount(info.data);
  if (id === 0n) return null;
  return readRound(id);
}

export function committeeNodes() {
  return NODE_OWNERS.map(
    (owner) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("node"), new PublicKey(owner).toBuffer()],
        PROGRAM_ID
      )[0]
  );
}

export async function nextTaskId() {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const info = await withRetries(() => connection.getAccountInfo(config));
  if (!info) throw new Error("The protocol config is missing on devnet.");

  let id = readTaskCount(info.data) + 1n;
  for (let step = 0; step < 16; step++) {
    const [task] = PublicKey.findProgramAddressSync(
      [Buffer.from("task"), u64(id)],
      PROGRAM_ID
    );
    const existing = await withRetries(() => connection.getAccountInfo(task));
    if (!existing) return { id, task };
    id += 1n;
  }
  throw new Error("Could not find a free task id.");
}

export async function buildRequestTask({ requester, taskId, rewardLamports, seed, mazeSize }) {
  const input = mazeInput(seed, mazeSize);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const [task] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), u64(taskId)],
    PROGRAM_ID
  );
  const wasm = Buffer.from(WASM_HASH, "hex");
  const data = concat([
    await discriminator("request_task"),
    u64(taskId),
    wasm,
    u32(input.length),
    input,
    u64(rewardLamports),
    Buffer.from([3]),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: task, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(requester), isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...committeeNodes().map((pubkey) => ({
        pubkey,
        isSigner: false,
        isWritable: false,
      })),
    ],
    data,
  });

  const { blockhash, lastValidBlockHeight } = await withRetries(() =>
    connection.getLatestBlockhash("confirmed")
  );
  const tx = new Transaction({
    feePayer: new PublicKey(requester),
    recentBlockhash: blockhash,
  }).add(ix);

  return { tx, task, blockhash, lastValidBlockHeight };
}

export async function sendSigned(signed, blockhash, lastValidBlockHeight) {
  const signature = await withRetries(() => connection.sendRawTransaction(signed.serialize()));
  try {
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    if (confirmation.value?.err) {
      throw new Error(`Devnet rejected the transaction. ${signature}`);
    }
  } catch (err) {
    const message = err?.message || "Confirmation failed.";
    if (message.includes(signature)) throw err;
    throw new Error(`${message} Signature: ${signature}`);
  }
  return signature;
}

export function explorerTx(signature) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
