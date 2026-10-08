import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWasm } from "../../worker/run.mjs";
import { STARTER } from "../src/starter.js";
import { compileSource } from "./compile.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const { hash, bytes } = await compileSource(STARTER);
const { instance } = await WebAssembly.instantiate(bytes, {
  env: {
    abort() {
      throw new Error("abort");
    },
  },
});
const ptr = instance.exports.alloc(4) >>> 0;
new DataView(instance.exports.memory.buffer).setUint32(ptr, 41, true);
const packed = BigInt.asUintN(64, instance.exports.run(ptr, 4));
const outPtr = Number(packed & 0xffffffffn);
const out = new DataView(instance.exports.memory.buffer).getUint32(outPtr, true);
if (out !== 42) {
  console.error(`FAIL got ${out}`);
  process.exit(1);
}
console.log(`ok   hash=${hash} bytes=${bytes.length} 41+1=${out}`);

const saved = join(here, "..", "..", "worker", "modules", `${hash}.wasm`);
const onDisk = await readFile(saved);
if (createHash("sha256").update(onDisk).digest("hex") !== hash) {
  console.error("FAIL saved file hash does not match");
  process.exit(1);
}
const input = new Uint8Array(4);
new DataView(input.buffer).setUint32(0, 41, true);
const fromNode = await runWasm({ file: saved, hash, input });
const nodeOut = new DataView(fromNode.buffer, fromNode.byteOffset, fromNode.byteLength).getUint32(0, true);
if (nodeOut !== 42) {
  console.error(`FAIL node read ${nodeOut}`);
  process.exit(1);
}
console.log("ok   node read the saved file");

let rejected = false;
try {
  await compileSource("export function run(");
} catch {
  rejected = true;
}
if (!rejected) {
  console.error("FAIL a broken module was accepted");
  process.exit(1);
}
console.log("ok   broken source rejected");
