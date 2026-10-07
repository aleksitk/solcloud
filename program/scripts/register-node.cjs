// Register one staked node. The number picks the key file:
//   node scripts/register-node.cjs 1
//   node scripts/register-node.cjs 2
//   node scripts/register-node.cjs 3

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
const STAKE = 1_000_000_000n; // 1 SOL, matches the config minimum
const FUND = 1_020_000_000n; // stake plus rent and fees

function discriminator(name) {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

function loadOrCreate(file) {
  if (fs.existsSync(file)) {
    const secret = Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")));
    return Keypair.fromSecretKey(secret);
  }
  const keypair = Keypair.generate();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Array.from(keypair.secretKey)));
  return keypair;
}

function loadPayer() {
  const file = path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function send(connection, tx, signers) {
  const signature = await connection.sendTransaction(tx, signers);
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

async function main() {
  const index = process.argv[2] || "1";
  if (!/^[1-9][0-9]*$/.test(index)) {
    throw new Error("usage: node scripts/register-node.cjs <number>");
  }
  const payer = loadPayer();
  const nodeFile = path.join(
    os.homedir(),
    ".config",
    "solana",
    `solcloud-node${index}.json`
  );
  const node = loadOrCreate(nodeFile);
  const connection = new Connection(RPC, "confirmed");

  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const [nodePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("node"), node.publicKey.toBuffer()],
    PROGRAM_ID
  );

  const existing = await connection.getAccountInfo(nodePda);
  if (existing) {
    console.log("node already registered:", node.publicKey.toBase58());
    console.log("node account:", nodePda.toBase58());
    return;
  }

  const payerBalance = await connection.getBalance(payer.publicKey);
  const nodeBalance = await connection.getBalance(node.publicKey);
  console.log("payer SOL:", payerBalance / LAMPORTS_PER_SOL);
  console.log("node wallet:", node.publicKey.toBase58());

  if (BigInt(nodeBalance) < FUND) {
    const need = FUND - BigInt(nodeBalance);
    if (BigInt(payerBalance) < need + 20_000_000n) {
      throw new Error("payer does not have enough SOL to fund the node");
    }
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: node.publicKey,
        lamports: Number(need),
      })
    );
    console.log("fund signature:", await send(connection, fundTx, [payer]));
  }

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: nodePda, isSigner: false, isWritable: true },
      { pubkey: node.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator("register_node"), u64(STAKE)]),
  });

  console.log("register signature:", await send(connection, new Transaction().add(ix), [node]));
  console.log("node account:", nodePda.toBase58());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
