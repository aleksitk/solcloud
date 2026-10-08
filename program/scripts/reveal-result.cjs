// Each node reveals the output and nonce that match its commitment.
// Run from Ubuntu, in the program folder:
//   node scripts/reveal-result.cjs 5

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");

const PROGRAM_ID = new PublicKey("D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ");
const RPC = "https://api.devnet.solana.com";
if (!process.argv[2]) {
  console.error("usage: node scripts/reveal-result.cjs <task-id>");
  process.exit(1);
}
const TASK_ID = BigInt(process.argv[2]);
const PATH_LENGTH = 35628;
const PATH_HASH = 0xea340764c91ec770n;
const NONCES = [11n, 22n, 33n];

function discriminator(name) {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
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

function outputBytes() {
  return Buffer.concat([u32(PATH_LENGTH), u64(PATH_HASH)]);
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

function alreadyRevealed(data) {
  if (!data || data.length < 140) return false;
  const outputLen = data.readUInt32LE(136);
  const revealedAt = 136 + 4 + outputLen + 8;
  return data[revealedAt] === 1;
}

async function main() {
  const home = path.join(os.homedir(), ".config", "solana");
  const connection = new Connection(RPC, "confirmed");
  const taskIdBuf = Buffer.alloc(8);
  taskIdBuf.writeBigUInt64LE(TASK_ID);
  const [task] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskIdBuf],
    PROGRAM_ID
  );
  const output = outputBytes();

  for (let n = 1; n <= 3; n++) {
    const owner = loadKeypair(path.join(home, `solcloud-node${n}.json`));
    const [commitPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("commit"), task.toBuffer(), owner.publicKey.toBuffer()],
      PROGRAM_ID
    );

    const existing = await retry("commit", () => connection.getAccountInfo(commitPda));
    if (alreadyRevealed(existing?.data)) {
      console.log(`node ${n} already revealed:`, commitPda.toBase58());
      continue;
    }

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: task, isSigner: false, isWritable: true },
        { pubkey: commitPda, isSigner: false, isWritable: true },
        { pubkey: owner.publicKey, isSigner: true, isWritable: true },
      ],
      data: Buffer.concat([
        discriminator("reveal_result"),
        u64(TASK_ID),
        u32(output.length),
        output,
        u64(NONCES[n - 1]),
      ]),
    });

    const signature = await retry("send", () =>
      connection.sendTransaction(new Transaction().add(ix), [owner])
    );
    await retry("confirm", () => connection.confirmTransaction(signature, "confirmed"));
    console.log(`node ${n} signature:`, signature);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
