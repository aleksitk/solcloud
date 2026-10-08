// Create one task for nodes 1, 2, and 3.
// Run from Ubuntu:
//   node scripts/request-task.cjs 3

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
const TASK_ID = BigInt(process.argv[2] || "3");
const REWARD = 50_000_000n; // 0.05 SOL
const WASM_SHA256 = "52d0b49e663d826e92598ff7c0939b2c26804026c750d3cfa92a3dd3986686f6";

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

const ACTIVE_NODES_AT = 107;

function readActiveOwners(data) {
  if (!data || data.length < ACTIVE_NODES_AT + 4) return null;
  const bytes = Buffer.from(data);
  const count = bytes.readUInt32LE(ACTIVE_NODES_AT);
  if (count > 32) return null;
  const need = ACTIVE_NODES_AT + 4 + count * 32;
  if (bytes.length < need) return null;
  const owners = [];
  for (let index = 0; index < count; index += 1) {
    const start = ACTIVE_NODES_AT + 4 + index * 32;
    owners.push(new PublicKey(bytes.subarray(start, start + 32)).toBase58());
  }
  return owners;
}

function selectCommittee(owners, size, seedSlot, taskId) {
  const input = Buffer.alloc(16);
  input.writeBigUInt64LE(BigInt(seedSlot), 0);
  input.writeBigUInt64LE(BigInt(taskId), 8);
  let state = crypto.createHash("sha256").update(input).digest();
  const order = owners.slice();
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = crypto.createHash("sha256").update(state).digest();
    const swapAt = Number(state.readBigUInt64LE(0) % BigInt(index + 1));
    const held = order[index];
    order[index] = order[swapAt];
    order[swapAt] = held;
  }
  return order.slice(0, size);
}

async function main() {
  const home = path.join(os.homedir(), ".config", "solana");
  const requester = loadKeypair(path.join(home, "id.json"));
  const connection = new Connection(RPC, "confirmed");

  let nodeAccounts = [1, 2, 3].map((n) => {
    const owner = loadKeypair(path.join(home, `solcloud-node${n}.json`));
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("node"), owner.publicKey.toBuffer()],
      PROGRAM_ID
    );
    return pda;
  });

  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const taskIdBuf = Buffer.alloc(8);
  taskIdBuf.writeBigUInt64LE(TASK_ID);
  const [task] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskIdBuf],
    PROGRAM_ID
  );

  let existing = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      existing = await connection.getAccountInfo(task);
      break;
    } catch (err) {
      if (attempt === 5) throw err;
      console.log(`rpc failed, retry ${attempt}/5`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  if (existing) {
    console.log("task already exists:", task.toBase58());
    return;
  }

  // Wasm input: seed = 1 (u64 LE), size = 512 (u32 LE).
  const input = Buffer.concat([u64(1n), u32(512)]);
  const configInfo = await connection.getAccountInfo(config);
  const registry = readActiveOwners(configInfo?.data);
  let seedSlot = null;
  if (registry) {
    if (registry.length < 3) {
      throw new Error(`Only ${registry.length} nodes are in the on-chain registry.`);
    }
    seedSlot = await connection.getSlot("processed");
    const picked = selectCommittee(registry, 3, seedSlot, TASK_ID);
    nodeAccounts = picked.map((owner) => {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("node"), new PublicKey(owner).toBuffer()],
        PROGRAM_ID
      );
      return pda;
    });
  }
  const data = Buffer.concat([
    discriminator("request_task"),
    u64(TASK_ID),
    Buffer.from(WASM_SHA256, "hex"),
    u32(input.length),
    input,
    u64(REWARD),
    Buffer.from([3]),
    ...(seedSlot === null ? [] : [u64(BigInt(seedSlot))]),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: task, isSigner: false, isWritable: true },
      { pubkey: requester.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...nodeAccounts.map((pubkey) => ({
        pubkey,
        isSigner: false,
        isWritable: false,
      })),
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [requester]);
  await connection.confirmTransaction(signature, "confirmed");
  console.log("task:", task.toBase58());
  console.log("signature:", signature);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
