// Grow the live config account so active_nodes can be stored.
// Run from the program folder:
//   node scripts/extend-registry.cjs

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");

const PROGRAM_ID = new PublicKey("D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ");
const RPC = "https://api.devnet.solana.com";
const ACTIVE_NODES_AT = 107;

function discriminator(name) {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function loadAuthority() {
  const file = path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")));
  return Keypair.fromSecretKey(secret);
}

function readActiveNodes(data) {
  if (!data || data.length < ACTIVE_NODES_AT + 4) return [];
  const count = data.readUInt32LE(ACTIVE_NODES_AT);
  const owners = [];
  for (let index = 0; index < count; index += 1) {
    const start = ACTIVE_NODES_AT + 4 + index * 32;
    if (start + 32 > data.length) break;
    owners.push(new PublicKey(data.subarray(start, start + 32)).toBase58());
  }
  return owners;
}

async function send(connection, tx, signers) {
  const signature = await connection.sendTransaction(tx, signers);
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

async function printConfig(connection, config) {
  const info = await connection.getAccountInfo(config);
  if (!info) throw new Error("config account is missing");
  const owners = readActiveNodes(info.data);
  console.log("config bytes:", info.data.length);
  console.log("active_nodes:", owners.length ? owners.join(" ") : "(none)");
}

async function main() {
  const authority = loadAuthority();
  const connection = new Connection(RPC, "confirmed");
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: discriminator("extend_registry"),
  });

  console.log("extend signature:", await send(connection, new Transaction().add(ix), [authority]));
  await printConfig(connection, config);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
