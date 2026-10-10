// The packaged node: one file to download and run, no Node.js or git needed.
// First run: make a key, wait for devnet SOL, stake. Every run: start the listener.
// Build it with: npm run build:node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
// Anchor ships CommonJS. Node 22 does not see BN as a named export, so take the default.
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "./idl/solcloud.json" with { type: "json" };
import { DEFAULT_RPC } from "./lib.mjs";

const { AnchorProvider, BN, Program, Wallet } = anchor;

const LAMPORTS = 1_000_000_000;
// Rent for the node account plus fees for a long run of commits and reveals.
const SPARE_LAMPORTS = 60_000_000;

const home = process.env.SOLCLOUD_DATA || join(homedir(), ".solcloud");
const keyFile = join(home, "node-keypair.json");

function say(text = "") {
  console.log(text);
}

function sol(lamports) {
  return (Number(lamports) / LAMPORTS).toFixed(3);
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A double-clicked window closes the moment the process ends. Hold it open to be read.
function holdOpen() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question("\nPress Enter to close.", () => {
      rl.close();
      resolve();
    });
  });
}

function loadOrCreateKey() {
  mkdirSync(home, { recursive: true });
  if (existsSync(keyFile)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyFile, "utf8"))));
  }
  const fresh = Keypair.generate();
  writeFileSync(keyFile, JSON.stringify(Array.from(fresh.secretKey)), { mode: 0o600 });
  say(`A new key for this node was saved to ${keyFile}`);
  say("Keep that file. It owns the stake.");
  return fresh;
}

async function retry(action) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await action();
    } catch (err) {
      if (attempt === 6) throw err;
      await pause(1500 * attempt);
    }
  }
}

async function ensureStaked(owner, program) {
  const connection = program.provider.connection;
  const config = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
  const node = PublicKey.findProgramAddressSync([Buffer.from("node"), owner.publicKey.toBuffer()], program.programId)[0];
  if (await retry(() => connection.getAccountInfo(node))) {
    say("This key already runs a staked node.");
    return;
  }

  const minStake = (await retry(() => program.account.config.fetch(config))).minStake.toNumber();
  const need = minStake + SPARE_LAMPORTS;
  let asked = false;
  for (;;) {
    const balance = await retry(() => connection.getBalance(owner.publicKey));
    if (balance >= need) break;
    if (!asked) {
      say();
      say(`This node needs ${sol(need)} devnet SOL: ${sol(minStake)} to stake and a little for fees.`);
      say("Send it to this address:");
      say();
      say(`    ${owner.publicKey.toBase58()}`);
      say();
      say("Waiting for it to arrive. Leave this window open.");
      asked = true;
    }
    await pause(10_000);
  }

  say(`Staking ${sol(minStake)} SOL…`);
  const signature = await program.methods
    .registerNode(new BN(minStake))
    .accounts({ config, node, owner: owner.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  say(`Staked. ${signature}`);
}

async function main() {
  say("SolCloud node");
  say("-------------");
  process.env.SOLCLOUD_DATA = home;
  globalThis.SOLCLOUD_IDL = idl;

  const owner = loadOrCreateKey();
  say(`Node address: ${owner.publicKey.toBase58()}`);
  const connection = new Connection(process.env.SOLCLOUD_RPC || DEFAULT_RPC, "confirmed");
  const program = new Program(idl, new AnchorProvider(connection, new Wallet(owner), { commitment: "confirmed" }));
  await ensureStaked(owner, program);

  say();
  say("The node is running. It answers tasks on its own. Close this window to stop it.");
  say();
  process.argv[2] = keyFile;
  await import("./listener.mjs");
}

main().catch(async (err) => {
  console.error(`\nThe node stopped: ${err?.message || err}`);
  await holdOpen();
  process.exit(1);
});
