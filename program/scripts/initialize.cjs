// Step 1 of the devnet happy path: create the global Config account.
// Run from Ubuntu, where the devnet wallet lives:
//   node scripts/initialize.cjs

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

const MIN_STAKE = 1_000_000_000n; // 1 SOL
const REWARD_DEFAULT = 50_000_000n; // 0.05 SOL
const SLASH_BPS = 5000; // 50%

function discriminator(name) {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

function u16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

function loadWallet() {
  const file = path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const wallet = loadWallet();
  const connection = new Connection(RPC, "confirmed");
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID
  );

  const existing = await connection.getAccountInfo(config);
  if (existing) {
    console.log("config already exists:", config.toBase58());
    return;
  }

  const data = Buffer.concat([
    discriminator("initialize"),
    u64(MIN_STAKE),
    u64(REWARD_DEFAULT),
    u16(SLASH_BPS),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature, "confirmed");
  console.log("config:", config.toBase58());
  console.log("signature:", signature);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
