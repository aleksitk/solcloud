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
// Rounds already on devnet named the maze before `run` was added.
const PREVIOUS_LABYRINTH_HASH = "52d0b49e663d826e92598ff7c0939b2c26804026c750d3cfa92a3dd3986686f6";

export function isLabyrinth(hash) {
  return hash === WASM_HASH || hash === PREVIOUS_LABYRINTH_HASH;
}

function hexBytes(bytes) {
  let hex = "";
  for (let index = 0; index < bytes.length; index += 1) {
    hex += bytes[index].toString(16).padStart(2, "0");
  }
  return hex;
}

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
  const wasmHash = hexBytes(data.subarray(40, 72));
  const inputLen = view.getUint32(72, true);
  const seed = inputLen >= 12 ? view.getBigUint64(76, true) : null;
  const mazeSize = inputLen >= 12 ? view.getUint32(84, true) : null;
  const rewardAt = 76 + inputLen;
  const reward = rewardAt + 8 <= data.length ? view.getBigUint64(rewardAt, true) : 0n;
  let offset = rewardAt + 8;
  const committee = data[offset];
  offset += 1;
  const committeeLen = view.getUint32(offset, true);
  offset += 4 + committeeLen * 32;
  const status = data[offset];
  const createdAt = offset + 11 <= data.length ? Number(view.getBigInt64(offset + 3, true)) : 0;
  const storedId = offset + 35 <= data.length ? view.getBigUint64(offset + 27, true) : taskId;
  return {
    id: storedId.toString().padStart(2, "0"),
    address: task.toBase58(),
    status: ROUND_STATUS[status] || "Unknown",
    commits: data[offset + 1],
    reveals: data[offset + 2],
    createdAt,
    seed,
    mazeSize,
    wasmHash,
    requester: new PublicKey(data.subarray(8, 40)).toBase58(),
    reward,
    committee,
    threshold: Math.floor(committee / 2) + 1,
  };
}

function parseResult(raw) {
  if (!raw) return null;
  const data = Uint8Array.from(raw);
  const view = new DataView(data.buffer);
  const outputLen = view.getUint32(40, true);
  if (44 + outputLen > data.length) return null;
  const hashAt = 44 + outputLen;
  const offset = hashAt + 32;
  const names = ["Finalized", "Failed", "Refunded"];
  return {
    status: names[data[offset]] || "Unknown",
    agreed: data[offset + 1],
    committee: data[offset + 2],
    output: hexBytes(data.subarray(44, 44 + outputLen)),
    outputHash: hexBytes(data.subarray(hashAt, hashAt + 32)),
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

export async function readMyRequests(owner) {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const configInfo = await readAccount(config);
  if (!configInfo) throw new Error("The protocol config is missing on devnet.");
  const count = Number(readTaskCount(configInfo.data));
  if (!count) return [];

  const ids = [];
  const tasks = [];
  for (let id = 1; id <= count; id += 1) {
    ids.push(BigInt(id));
    tasks.push(taskPda(BigInt(id)));
  }
  const taskInfos = await withRetries(() => connection.getMultipleAccountsInfo(tasks));
  const mine = [];
  for (let index = 0; index < taskInfos.length; index += 1) {
    if (!taskInfos[index]) continue;
    const task = parseTask(taskInfos[index].data, ids[index], tasks[index]);
    if (task.requester !== owner) continue;
    mine.push(task);
  }
  if (!mine.length) return [];

  const resultKeys = mine.map(
    (task) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("result"), new PublicKey(task.address).toBuffer()],
        PROGRAM_ID
      )[0]
  );
  const resultInfos = await withRetries(() => connection.getMultipleAccountsInfo(resultKeys));
  const rows = mine.map((task, index) => {
    const live = task.status === "Requested" || task.status === "Committing" || task.status === "Revealing";
    return {
      id: task.id,
      address: task.address,
      status: task.status,
      reward: task.reward,
      tone: task.status === "Finalized" ? "good" : task.status === "Failed" ? "bad" : live ? "live" : "muted",
      result: resultInfos[index] ? resultKeys[index].toBase58() : null,
    };
  });
  rows.sort((a, b) => b.id.localeCompare(a.id));
  return rows;
}

export async function readRound(taskId) {
  const task = taskPda(taskId);
  const info = await readAccount(task);
  if (!info) return null;
  const parsed = parseTask(info.data, taskId, task);
  const [result] = PublicKey.findProgramAddressSync(
    [Buffer.from("result"), task.toBuffer()],
    PROGRAM_ID
  );
  const resultInfo = await readAccount(result);
  const parsedResult = parseResult(resultInfo?.data);
  const live = parsed.status === "Committing" || parsed.status === "Revealing";
  return {
    ...parsed,
    output: parsedResult ? parsedResult.output : null,
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

function shortOwner(owner) {
  return `${owner.slice(0, 4)}…${owner.slice(-4)}`;
}

export function nodePda(owner) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("node"), new PublicKey(owner).toBuffer()],
    PROGRAM_ID
  )[0];
}

export async function readMinStake() {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const info = await readAccount(config);
  if (!info) throw new Error("The protocol config is missing on devnet.");
  return Buffer.from(info.data).readBigUInt64LE(72);
}

function parseCommit(raw) {
  const data = Buffer.from(raw);
  if (data.length < 170) return null;
  const outputLen = data.readUInt32LE(136);
  let cursor = 140 + outputLen;
  if (cursor + 18 > data.length) return null;
  cursor += 8;
  const revealed = data[cursor] === 1;
  cursor += 1 + 8 + 1;
  const revealedAt = cursor + 8 <= data.length ? data.readBigInt64LE(cursor) : 0n;
  return {
    task: new PublicKey(data.subarray(8, 40)).toBase58(),
    outputHash: hexBytes(data.subarray(104, 136)),
    revealed,
    revealedAt,
  };
}

function revealSeconds(createdAt, revealedAt) {
  if (!createdAt || revealedAt <= 0n) return null;
  const seconds = Number(revealedAt) - createdAt;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds;
}

export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function meanReveal(rows) {
  const samples = rows.filter(
    (row) => (row.outcome === "Won" || row.outcome === "Slashed") && row.seconds != null
  );
  if (!samples.length) return null;
  return samples.reduce((sum, row) => sum + row.seconds, 0) / samples.length;
}

// Mean time-to-reveal on finalized rounds only. The node never submits this.
export function averageCompletion(rows) {
  return formatDuration(meanReveal(rows));
}

function nodeOutcome(task, commit, result) {
  if (task.status === "Finalized" && result?.status === "Finalized") {
    if (commit.revealed && commit.outputHash === result.outputHash) {
      return { outcome: "Won", tone: "good" };
    }
    return { outcome: "Slashed", tone: "bad" };
  }
  if (task.status === "Refunded" || result?.status === "Refunded") {
    if (task.reveals >= task.committee) return { outcome: "No majority", tone: "muted" };
    return { outcome: "Timed out", tone: "muted" };
  }
  return { outcome: "Open", tone: "live" };
}

async function accountsInfo(keys) {
  const infos = [];
  for (let start = 0; start < keys.length; start += 100) {
    const part = keys.slice(start, start + 100);
    const next = await withRetries(() => connection.getMultipleAccountsInfo(part));
    infos.push(...next);
  }
  return infos;
}

async function loadCommitRows(owners) {
  const grouped = new Map(owners.map((owner) => [owner, []]));
  if (!owners.length) return grouped;

  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const configInfo = await readAccount(config);
  if (!configInfo) throw new Error("The protocol config is missing on devnet.");
  const count = Number(readTaskCount(configInfo.data));
  if (!count) return grouped;

  const tasks = [];
  for (let id = 1; id <= count; id += 1) tasks.push(taskPda(BigInt(id)));
  const taskInfos = await accountsInfo(tasks);

  const commitKeys = [];
  const commitWhere = [];
  for (const owner of owners) {
    const ownerKey = new PublicKey(owner);
    for (let index = 0; index < tasks.length; index += 1) {
      commitKeys.push(
        PublicKey.findProgramAddressSync(
          [Buffer.from("commit"), tasks[index].toBuffer(), ownerKey.toBuffer()],
          PROGRAM_ID
        )[0]
      );
      commitWhere.push({ owner, index });
    }
  }
  const commitInfos = await accountsInfo(commitKeys);

  const needed = [];
  const hits = [];
  for (let index = 0; index < commitInfos.length; index += 1) {
    if (!commitInfos[index]) continue;
    const commit = parseCommit(commitInfos[index].data);
    if (!commit) continue;
    needed.push(commitWhere[index]);
    hits.push(commit);
  }
  if (!hits.length) return grouped;

  const taskIndexes = [...new Set(needed.map((item) => item.index))];
  const resultKeys = taskIndexes.map(
    (index) => PublicKey.findProgramAddressSync([Buffer.from("result"), tasks[index].toBuffer()], PROGRAM_ID)[0]
  );
  const resultInfos = await accountsInfo(resultKeys);
  const resultByIndex = new Map(taskIndexes.map((index, position) => [index, resultInfos[position]]));

  for (let index = 0; index < hits.length; index += 1) {
    const where = needed[index];
    if (!taskInfos[where.index]) continue;
    const task = parseTask(taskInfos[where.index].data, BigInt(where.index + 1), tasks[where.index]);
    const result = parseResult(resultByIndex.get(where.index)?.data);
    const seconds = revealSeconds(task.createdAt, hits[index].revealedAt);
    const verdict = nodeOutcome(task, hits[index], result);
    grouped.get(where.owner).push({
      id: task.id,
      address: task.address,
      committee: task.committee,
      seconds,
      time: formatDuration(seconds),
      ...verdict,
    });
  }
  for (const rows of grouped.values()) rows.sort((a, b) => b.id.localeCompare(a.id));
  return grouped;
}

export async function readNodeHistory(owner) {
  const grouped = await loadCommitRows([owner]);
  return grouped.get(owner) || [];
}

const COMMITTEE_SIZES = [3, 5, 7, 9, 11];

export async function readNodeBrowser() {
  const nodes = (await readNodes()).filter((node) => node.status === "Active");
  const sizes = COMMITTEE_SIZES.filter((size) => size <= nodes.length);
  const grouped = await loadCommitRows(nodes.map((node) => node.owner));
  return nodes.map((node) => {
    const seconds = meanReveal(grouped.get(node.owner) || []);
    return {
      ...node,
      sizes,
      sizesText: sizes.length ? sizes.join(" ") : "—",
      average: formatDuration(seconds),
      averageSeconds: seconds,
    };
  });
}

function successOf(completed, slashed) {
  const settled = completed + slashed;
  if (settled === 0n) return { success: "None yet", successRank: null };
  const tenths = Number((completed * 1000n) / settled);
  const whole = Math.floor(tenths / 10);
  const fraction = tenths % 10;
  return {
    success: fraction === 0 ? `${whole}%` : `${whole}.${fraction}%`,
    successRank: tenths,
  };
}

export async function findNode(owner) {
  const node = nodePda(owner);
  const info = await readAccount(node);
  if (!info) return null;
  const data = Buffer.from(info.data);
  const status = data[48];
  const completed = data.length >= 65 ? data.readBigUInt64LE(57) : 0n;
  const slashed = data.length >= 74 ? data.readBigUInt64LE(66) : 0n;
  return {
    address: node.toBase58(),
    stake: data.readBigUInt64LE(40),
    status: NODE_STATUS[status] || "Unknown",
    tone: status === 2 ? "bad" : status === 0 ? "good" : "muted",
    completed,
    slashed,
    ...successOf(completed, slashed),
  };
}

// Nodes created before tasks_slashed are 66 bytes. Finalize grows them to 74.
async function nodeAccounts() {
  const [current, grown] = await Promise.all([
    withRetries(() => connection.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: 66 }] })),
    withRetries(() => connection.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: 74 }] })),
  ]);
  return [...current, ...grown];
}

export async function readNodes() {
  const accounts = await nodeAccounts();
  const known = new Map(NODE_OWNERS.map((owner, index) => [owner, index]));
  const nodes = accounts.map(({ pubkey, account }) => {
    const data = Buffer.from(account.data);
    const owner = new PublicKey(data.subarray(8, 40)).toBase58();
    const stake = data.readBigUInt64LE(40);
    const status = data[48];
    const reputation = data.readBigInt64LE(49);
    const completed = data.length >= 65 ? data.readBigUInt64LE(57) : 0n;
    const slashed = data.length >= 74 ? data.readBigUInt64LE(66) : 0n;
    const order = known.get(owner);
    return {
      id: order === undefined ? shortOwner(owner) : String(order + 1).padStart(2, "0"),
      owner,
      order: order === undefined ? 1000 : order,
      address: pubkey.toBase58(),
      status: NODE_STATUS[status] || "Unknown",
      reputation,
      tone: status === 2 ? "bad" : status === 0 ? "good" : "muted",
      stake,
      stakeText: solText(stake),
      reduced: stake < 1_000_000_000n,
      ...successOf(completed, slashed),
    };
  });
  nodes.sort((a, b) => a.order - b.order || a.owner.localeCompare(b.owner));
  return nodes;
}

export async function buildRegisterNode({ owner, stakeLamports }) {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const node = nodePda(owner);
  const data = concat([await discriminator("register_node"), u64(stakeLamports)]);
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: node, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(owner), isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  const { blockhash, lastValidBlockHeight } = await withRetries(() =>
    connection.getLatestBlockhash("confirmed")
  );
  const tx = new Transaction({
    feePayer: new PublicKey(owner),
    recentBlockhash: blockhash,
  }).add(ix);
  return { tx, node, blockhash, lastValidBlockHeight };
}

export async function latestRound() {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const info = await readAccount(config);
  if (!info) throw new Error("The protocol config is missing on devnet.");
  const id = readTaskCount(info.data);
  if (id === 0n) return null;
  return readRound(id);
}

export function activeNodes(nodes) {
  return nodes.filter((node) => node.status === "Active");
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, next) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

// Active nodes, highest reputation first. Equal scores are shuffled with the seed.
export function pickCommittee(nodes, size, seed) {
  const buckets = new Map();
  for (const node of activeNodes(nodes)) {
    const key = (node.reputation ?? 0n).toString();
    const bucket = buckets.get(key);
    if (bucket) bucket.push(node);
    else buckets.set(key, [node]);
  }
  const ranks = [...buckets.keys()].sort((left, right) => {
    const a = BigInt(left);
    const b = BigInt(right);
    if (a === b) return 0;
    return a > b ? -1 : 1;
  });
  const next = mulberry32(seed);
  const picked = [];
  for (const rank of ranks) {
    picked.push(...shuffle(buckets.get(rank), next));
  }
  return picked.slice(0, size);
}

export async function committeeSeed() {
  const { blockhash } = await withRetries(() => connection.getLatestBlockhash("confirmed"));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(blockhash));
  return new Uint32Array(digest)[0];
}

// Config bytes before active_nodes: discriminator plus the original fields.
const ACTIVE_NODES_AT = 107;
export const MAX_SEED_SLOT_LAG = 300;

// Owners stored on the upgraded config, in registry order.
// null means the live account is still the old size.
export async function readActiveOwners() {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const info = await readAccount(config);
  if (!info) throw new Error("The protocol config is missing on devnet.");
  const data = Buffer.from(info.data);
  if (data.length < ACTIVE_NODES_AT + 4) return null;
  const count = data.readUInt32LE(ACTIVE_NODES_AT);
  if (count > 32) return null;
  const need = ACTIVE_NODES_AT + 4 + count * 32;
  if (data.length < need) return null;
  const owners = [];
  for (let index = 0; index < count; index += 1) {
    const start = ACTIVE_NODES_AT + 4 + index * 32;
    owners.push(new PublicKey(data.subarray(start, start + 32)).toBase58());
  }
  return owners;
}

async function sha256Bytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

// Same draw as the program: sha256(slot_le ‖ task_id_le), then Fisher-Yates.
export async function selectCommittee(owners, size, seedSlot, taskId) {
  const input = Buffer.alloc(16);
  input.writeBigUInt64LE(BigInt(seedSlot), 0);
  input.writeBigUInt64LE(BigInt(taskId), 8);
  let state = await sha256Bytes(input);
  const order = owners.slice();
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = await sha256Bytes(state);
    const draw = Buffer.from(state).readBigUInt64LE(0);
    const swapAt = Number(draw % BigInt(index + 1));
    const held = order[index];
    order[index] = order[swapAt];
    order[swapAt] = held;
  }
  return order.slice(0, size);
}

export async function currentSlot() {
  return withRetries(() => connection.getSlot("processed"));
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

export async function buildRequestTask({
  requester,
  taskId,
  rewardLamports,
  seed,
  mazeSize,
  wasmHash = WASM_HASH,
  committeeSize,
  owners,
  seedSlot,
}) {
  if (!Number.isInteger(committeeSize) || !Array.isArray(owners) || owners.length !== committeeSize) {
    throw new Error("The committee does not match the chosen size.");
  }
  const input = mazeInput(seed, mazeSize);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const [task] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), u64(taskId)],
    PROGRAM_ID
  );
  const wasm = Buffer.from(wasmHash, "hex");
  const data = concat([
    await discriminator("request_task"),
    u64(taskId),
    wasm,
    u32(input.length),
    input,
    u64(rewardLamports),
    Buffer.from([committeeSize]),
    ...(seedSlot === undefined || seedSlot === null ? [] : [u64(seedSlot)]),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: task, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(requester), isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...owners.map((owner) => ({
        pubkey: nodePda(owner),
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
