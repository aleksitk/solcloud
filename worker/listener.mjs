// One node, one process. Polls devnet and commits, then reveals, its own tasks.
// Start: node listener.mjs <keypair.json>

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { moduleFile, runWasm } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const RPC = "https://api.devnet.solana.com";
const idlPath = join(here, "..", "program", "target", "idl", "solcloud.json");
const stateDir = join(here, ".state");
const logFile = join(here, "logs", "listener.log");

function log(taskId, action, result) {
  const line = `${new Date().toISOString()} ${taskId} ${action} ${result}`;
  console.log(line);
  mkdirSync(dirname(logFile), { recursive: true });
  appendFileSync(logFile, `${line}\n`);
}

function statePath(taskId) {
  return join(stateDir, `${taskId}.json`);
}

function readState(taskId) {
  return JSON.parse(readFileSync(statePath(taskId), "utf8"));
}

function writeState(taskId, output, nonce) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    statePath(taskId),
    JSON.stringify({
      output: Buffer.from(output).toString("hex"),
      nonce: nonce.toString(),
    })
  );
}

function removeState(taskId) {
  const file = statePath(taskId);
  if (existsSync(file)) unlinkSync(file);
}

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

async function retry(label, fn) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === 5) throw err;
      log("-", label, `failed, retry ${attempt}/5`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

const keypairPath = process.argv[2];
if (!keypairPath) {
  console.error("usage: node listener.mjs <keypair.json>");
  process.exit(1);
}
if (!existsSync(idlPath)) {
  console.error(`IDL not found: ${idlPath}`);
  process.exit(1);
}

const owner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8"))));
const idl = JSON.parse(readFileSync(idlPath, "utf8"));
const connection = new Connection(RPC, "confirmed");
const provider = new AnchorProvider(connection, new Wallet(owner), { commitment: "confirmed" });
const program = new Program(idl, provider);
const [nodePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("node"), owner.publicKey.toBuffer()],
  program.programId
);

function commitPda(taskKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("commit"), taskKey.toBuffer(), owner.publicKey.toBuffer()],
    program.programId
  )[0];
}

async function ensureModule(hash) {
  const file = moduleFile(hash);
  if (existsSync(file)) return { file, downloaded: false };
  const base = process.env.SOLCLOUD_WASM_BASE;
  if (!base) {
    throw new Error(`No local wasm for ${hash}, and SOLCLOUD_WASM_BASE is unset.`);
  }
  const root = base.endsWith("/") ? base : `${base}/`;
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

async function commitTask(task) {
  const taskId = task.account.taskId.toString();
  const wasmHash = Buffer.from(task.account.wasmHash).toString("hex");
  const input = Uint8Array.from(Buffer.from(task.account.input));
  let file = "";
  let downloaded = false;
  let output;
  try {
    ({ file, downloaded } = await ensureModule(wasmHash));
    output = await runWasm({ file, hash: wasmHash, input });
  } catch (err) {
    if (downloaded && file && existsSync(file)) unlinkSync(file);
    log(taskId, "wasm", err?.message || String(err));
    return;
  }
  const nonce = randomBytes(8).readBigUInt64LE();
  const hashCommitment = commitment(output, nonce);
  writeState(taskId, output, nonce);
  try {
    const signature = await retry("commit", () =>
      program.methods
        .commitResult(new BN(taskId), Array.from(hashCommitment))
        .accounts({
          task: task.publicKey,
          commit: commitPda(task.publicKey),
          node: nodePda,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc()
    );
    log(taskId, "commit", signature);
  } catch (err) {
    removeState(taskId);
    log(taskId, "commit", err?.message || String(err));
  }
}

async function revealTask(task) {
  const taskId = task.account.taskId.toString();
  const saved = readState(taskId);
  const output = Buffer.from(saved.output, "hex");
  const nonce = new BN(saved.nonce);
  try {
    const signature = await retry("reveal", () =>
      program.methods
        .revealResult(new BN(taskId), output, nonce)
        .accounts({
          task: task.publicKey,
          commit: commitPda(task.publicKey),
          owner: owner.publicKey,
        })
        .signers([owner])
        .rpc()
    );
    log(taskId, "reveal", signature);
    removeState(taskId);
  } catch (err) {
    log(taskId, "reveal", err?.message || String(err));
  }
}

let running = false;

async function pollOnce() {
  if (running) return;
  running = true;
  try {
    const tasks = await program.account.taskAccount.all();
    for (const task of tasks) {
      if (!task.account.committee.some((member) => sameKey(member, owner.publicKey))) continue;
      const taskId = task.account.taskId.toString();
      const status = statusName(task.account.status);
      const saved = existsSync(statePath(taskId));
      try {
        if (status === "committing" && !saved) {
          await commitTask(task);
        } else if (status === "revealing" && saved) {
          const commit = await program.account.commitAccount.fetchNullable(commitPda(task.publicKey));
          if (commit?.revealed) removeState(taskId);
          else await revealTask(task);
        }
      } catch (err) {
        log(taskId, "error", err?.message || String(err));
      }
    }
  } catch (err) {
    log("-", "poll", err?.message || String(err));
  } finally {
    running = false;
  }
}

log("-", "start", `${owner.publicKey.toBase58()} node ${nodePda.toBase58()}`);
setInterval(pollOnce, 3000);
