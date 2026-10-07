// Re-run the demo function against the pinned testvectors/vectors.json and fail
// (non-zero exit) if anything drifted. This is the determinism regression gate.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule, runOne, readWasmBytes } from "./load.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const vectorsFile = join(here, "..", "testvectors", "vectors.json");

const expected = JSON.parse(readFileSync(vectorsFile, "utf8"));
const wasmSha256 = createHash("sha256").update(readWasmBytes()).digest("hex");

let failures = 0;

if (expected.wasmSha256 && expected.wasmSha256 !== wasmSha256) {
  console.warn(
    `! wasm sha256 changed: vectors were pinned to ${expected.wasmSha256},\n` +
      `  current build is ${wasmSha256}. Re-run gen-vectors if this is intended.`
  );
}

const exports = await loadModule();

for (const v of expected.vectors) {
  const out = runOne(exports, v.seed, v.size);
  const ok = out.pathLength === v.pathLength && out.pathHash === v.pathHash;
  if (!ok) {
    failures++;
    console.error(
      `FAIL seed=${v.seed} size=${v.size}\n` +
        `  expected pathLength=${v.pathLength} pathHash=${v.pathHash}\n` +
        `  got      pathLength=${out.pathLength} pathHash=${out.pathHash}`
    );
  } else {
    console.log(`ok   seed=${v.seed} size=${v.size} pathLength=${out.pathLength}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} vector(s) failed — determinism drift!`);
  process.exit(1);
}
console.log(`\nall ${expected.vectors.length} vectors match`);
