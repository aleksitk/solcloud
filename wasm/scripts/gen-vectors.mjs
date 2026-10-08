// Generate testvectors/vectors.json: the pinned set of known
// (input -> expected output) pairs, plus the SHA-256 of the .wasm they were
// produced from. Nodes and tests use this to detect any determinism drift.

import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule, runOne, readWasmBytes } from "./load.mjs";
import { INPUTS } from "./inputs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "testvectors");
const outFile = join(outDir, "vectors.json");

const wasmSha256 = createHash("sha256").update(readWasmBytes()).digest("hex");
const exports = await loadModule();

const vectors = INPUTS.map((input) => {
  const out = runOne(exports, input.seed, input.size);
  return { seed: input.seed, size: input.size, ...out };
});

const payload = {
  function: "labyrinth-shortest-path",
  abi: "alloc(size:u32)->ptr; run(ptr,len)->(outputLen<<32)|outputPtr; maze input u64LE seed || u32LE size; maze output u32LE pathLength || u64LE pathHash. Helpers: solve, getPathLength, getPathHash.",
  wasmSha256,
  generatedAt: new Date().toISOString(),
  vectors,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n");

console.log(`wrote ${vectors.length} vectors to ${outFile}`);
console.log(`wasm sha256: ${wasmSha256}`);
