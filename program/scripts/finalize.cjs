// Tally the reveals, store the result, and pay the matching nodes.
// The requester is read from the task, so a dashboard wallet can differ from id.json.
// Run from Ubuntu, in the program folder:
//   node scripts/finalize.cjs 5

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
if (!process.argv[2]) {
  console.error("usage: node scripts/finalize.cjs <task-id>");
  process.exit(1);
}
const TASK_ID = BigInt(process.argv[2]);

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

  const existing = await retry("result", () => connection.getAccountInfo(result));
  if (existing) {
    console.log("result already exists:", result.toBase58());
    return;
  }

  const taskInfo = await retry("task", () => connection.getAccountInfo(task));
  if (!taskInfo) throw new Error("task account is missing");
  const requester = new PublicKey(taskInfo.data.subarray(8, 40));

  const owners = [1, 2, 3].map((n) =>
    loadKeypair(path.join(home, `solcloud-node${n}.json`))
  );
  const pairs = owners.map((owner) => {
    const [commitPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("commit"), task.toBuffer(), owner.publicKey.toBuffer()],
      PROGRAM_ID
    );
    return { commitPda, owner: owner.publicKey };
  });

  const before = [];
  for (const pair of pairs) {
    before.push(await retry("balance", () => connection.getBalance(pair.owner)));
  }

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: task, isSigner: false, isWritable: true },
      { pubkey: result, isSigner: false, isWritable: true },
      {
        pubkey: PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0],
        isSigner: false,
        isWritable: false,
      },
      { pubkey: payer.publicKey, isSigner: false, isWritable: true },
      { pubkey: requester, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...pairs.flatMap(({ commitPda, owner }) => {
        const [nodePda] = PublicKey.findProgramAddressSync(
          [Buffer.from("node"), owner.toBuffer()],
          PROGRAM_ID
        );
        return [
          { pubkey: commitPda, isSigner: false, isWritable: false },
          { pubkey: owner, isSigner: false, isWritable: true },
          { pubkey: nodePda, isSigner: false, isWritable: true },
        ];
      }),
    ],
    data: Buffer.concat([discriminator("finalize"), u64(TASK_ID)]),
  });

  const signature = await retry("send", () =>
    connection.sendTransaction(new Transaction().add(ix), [payer])
  );
  await retry("confirm", () => connection.confirmTransaction(signature, "confirmed"));

  console.log("result:", result.toBase58());
  console.log("signature:", signature);
  console.log("requester:", requester.toBase58());
  for (let i = 0; i < owners.length; i++) {
    const after = await retry("balance", () => connection.getBalance(pairs[i].owner));
    const gained = (after - before[i]) / LAMPORTS_PER_SOL;
    console.log(`node ${i + 1} gained SOL:`, gained);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
