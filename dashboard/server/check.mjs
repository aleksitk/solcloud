import { STARTER } from "../src/starter.js";
import { compileSource } from "./compile.mjs";

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
