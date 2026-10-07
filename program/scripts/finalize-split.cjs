// Task 4 finalize. All three answers differ, so there is no majority.
// The full reward returns to the requester. Nobody is slashed.
//   node scripts/finalize-split.cjs

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
const TASK_ID = 4n;

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

function stakeOf(data) {
  return data.readBigUInt64LE(8 + 32);
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
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

  const owners = [1, 2, 3].map((n) =>
    loadKeypair(path.join(home, `solcloud-node${n}.json`))
  );
  const pairs = owners.map((owner) => {
    const [commitPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("commit"), task.toBuffer(), owner.publicKey.toBuffer()],
      PROGRAM_ID
    );
    const [nodePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("node"), owner.publicKey.toBuffer()],
      PROGRAM_ID
    );
    return { commitPda, owner: owner.publicKey, nodePda };
  });

  const beforeRequester = await retry("balance", () => connection.getBalance(payer.publicKey));
  const beforeStake = [];
  for (const pair of pairs) {
    const info = await retry("node", () => connection.getAccountInfo(pair.nodePda));
    beforeStake.push(stakeOf(info.data));
  }

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: task, isSigner: false, isWritable: true },
      { pubkey: result, isSigner: false, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...pairs.flatMap(({ commitPda, owner, nodePda }) => [
        { pubkey: commitPda, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: false, isWritable: true },
        { pubkey: nodePda, isSigner: false, isWritable: true },
      ]),
    ],
    data: Buffer.concat([discriminator("finalize"), u64(TASK_ID)]),
  });

  const signature = await retry("send", () =>
    connection.sendTransaction(new Transaction().add(ix), [payer])
  );
  await retry("confirm", () => connection.confirmTransaction(signature, "confirmed"));

  const afterRequester = await retry("balance", () => connection.getBalance(payer.publicKey));
  console.log("result:", result.toBase58());
  console.log("signature:", signature);
  console.log(
    "requester net SOL:",
    (afterRequester - beforeRequester) / LAMPORTS_PER_SOL
  );
  for (let i = 0; i < pairs.length; i++) {
    const info = await retry("node", () => connection.getAccountInfo(pairs[i].nodePda));
    const afterStake = stakeOf(info.data);
    const stake = Number(afterStake) / LAMPORTS_PER_SOL;
    const lost = Number(beforeStake[i] - afterStake) / LAMPORTS_PER_SOL;
    console.log(`node ${i + 1} stake SOL: ${stake}  slashed SOL: ${lost}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
