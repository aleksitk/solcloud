// Check the shared alloc/run ABI against the pinned maze vectors.
// run() must return the same 12 bytes as solve + getPathLength + getPathHash.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModule, runBytes, runOne } from "./load.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(readFileSync(join(here, "..", "testvectors", "vectors.json"), "utf8"));
const exports = await loadModule();

function mazeInput(seed, size) {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt(seed), true);
  view.setUint32(8, size, true);
  return bytes;
}

function decode(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pathHash = view.getBigUint64(4, true);
  return {
    pathLength: view.getUint32(0, true),
    pathHash: "0x" + pathHash.toString(16).padStart(16, "0"),
  };
}

let failures = 0;

for (const vector of expected.vectors) {
  const throughRun = decode(runBytes(exports, mazeInput(vector.seed, vector.size)));
  const throughSolve = runOne(exports, vector.seed, vector.size);
  const ok =
    throughRun.pathLength === vector.pathLength &&
    throughRun.pathHash === vector.pathHash &&
    throughRun.pathLength === throughSolve.pathLength &&
    throughRun.pathHash === throughSolve.pathHash;
  if (!ok) {
    failures += 1;
    console.error(
      `FAIL seed=${vector.seed} size=${vector.size} run=${throughRun.pathLength} ${throughRun.pathHash} solve=${throughSolve.pathLength} ${throughSolve.pathHash}`,
    );
  } else {
    console.log(`ok   seed=${vector.seed} size=${vector.size} pathLength=${throughRun.pathLength}`);
  }
}

const ptr = exports.alloc(12) >>> 0;
const rejected = [
  ["short input", exports.run(ptr, 11)],
  ["oversize input", exports.run(ptr, 65)],
  ["alloc 0", exports.alloc(0)],
  ["alloc 65", exports.alloc(65)],
];
for (const [label, value] of rejected) {
  const packed = typeof value === "bigint" ? value : BigInt(value >>> 0);
  if (packed !== 0n) {
    failures += 1;
    console.error(`FAIL ${label} returned ${packed}`);
  } else {
    console.log(`ok   reject ${label}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} abi check(s) failed`);
  process.exit(1);
}
console.log(`\nrun matches solve on all ${expected.vectors.length} vectors`);
