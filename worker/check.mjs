// Prove the runner on the compiled maze: hash gate, output bytes, and timeout.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWasm } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const wasmFile = join(here, "..", "wasm", "build", "solcloud_maze.wasm");
const vectors = JSON.parse(readFileSync(join(here, "..", "wasm", "testvectors", "vectors.json"), "utf8"));
const hash = vectors.wasmSha256;

function mazeInput(seed, size) {
  const bytes = Buffer.alloc(12);
  bytes.writeBigUInt64LE(BigInt(seed), 0);
  bytes.writeUInt32LE(size, 8);
  return new Uint8Array(bytes);
}

function decode(output) {
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  return {
    pathLength: view.getUint32(0, true),
    pathHash: view.getBigUint64(4, true),
  };
}

const vector = vectors.vectors[0];
const output = await runWasm({
  file: wasmFile,
  hash,
  input: mazeInput(vector.seed, vector.size),
});
const got = decode(output);
const expectedHash = BigInt(vector.pathHash);
if (got.pathLength !== vector.pathLength || got.pathHash !== expectedHash) {
  console.error(`FAIL output ${got.pathLength} ${got.pathHash.toString(16)}`);
  process.exit(1);
}
console.log(`ok   seed=${vector.seed} size=${vector.size} pathLength=${got.pathLength}`);

let hashRejected = false;
try {
  await runWasm({
    file: wasmFile,
    hash: "0".repeat(64),
    input: mazeInput(1, 64),
  });
} catch (err) {
  hashRejected = err.message.startsWith("Wasm hash is ");
}
if (!hashRejected) {
  console.error("FAIL a wrong hash was accepted");
  process.exit(1);
}
console.log("ok   wrong hash rejected");

let timedOut = false;
try {
  await runWasm({
    file: wasmFile,
    hash,
    input: mazeInput(vector.seed, vector.size),
    timeoutMs: 40,
    delayMs: 300,
  });
} catch (err) {
  timedOut = err.message === "The wasm run timed out.";
}
if (!timedOut) {
  console.error("FAIL the timeout did not stop the run");
  process.exit(1);
}
console.log("ok   timeout stopped the run");
