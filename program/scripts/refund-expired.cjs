// Refund task 1. Its 60-second commit window closed before any node committed.
//   node scripts/refund-expired.cjs

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");

const PROGRAM_ID = new PublicKey("D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ");
const RPC = "https://api.devnet.solana.com";
const TASK_ID = 1n;

function discriminator(name) {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

function loadKeypair(file) {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function retry(label, fn) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === 5) throw err;
      console.log(`${label} failed, retry ${attempt}/5`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function main() {
  const home = path.join(os.homedir(), ".config", "solana");
  const payer = loadKeypair(path.join(home, "id.json"));
  const connection = new Connection(RPC, "confirmed");
  const taskIdBuf = Buffer.alloc(8);
  taskIdBuf.writeBigUInt64LE(TASK_ID);
  const [task] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskIdBuf],
    PROGRAM_ID
  );
  const [result] = PublicKey.findProgramAddressSync(
    [Buffer.from("result"), task.toBuffer()],
    PROGRAM_ID
  );

  const before = await retry("balance", () => connection.getBalance(payer.publicKey));
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: task, isSigner: false, isWritable: true },
      { pubkey: result, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator("refund_expired"), u64(TASK_ID)]),
  });

  const signature = await retry("send", () =>
    connection.sendTransaction(new Transaction().add(ix), [payer])
  );
  await retry("confirm", () => connection.confirmTransaction(signature, "confirmed"));
  const after = await retry("balance", () => connection.getBalance(payer.publicKey));

  console.log("task:", task.toBase58());
  console.log("result:", result.toBase58());
  console.log("signature:", signature);
  console.log("requester net SOL:", (after - before) / LAMPORTS_PER_SOL);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
