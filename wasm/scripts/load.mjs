// Shared helper: load and instantiate the compiled SolCloud demo Wasm module.
//
// The module is instantiated with a single no-op-ish `abort` import. It has NO
// access to time, network, files, or randomness — the only non-determinism a
// Wasm module could get comes from host imports, and we provide none of those.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const WASM_PATH = join(here, "..", "build", "solcloud_maze.wasm");

export function readWasmBytes() {
  return readFileSync(WASM_PATH);
}

export async function loadModule() {
  const bytes = readWasmBytes();
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {
      // AssemblyScript may emit an `abort` import; make it throw loudly.
      abort(_msg, _file, line, col) {
        throw new Error(`wasm abort at ${line}:${col}`);
      },
    },
  });
  return instance.exports;
}

// Run the demo function for a single (seed, size) input and return the result.
// `seed` is a BigInt (u64), `size` a Number (u32). i64 values cross the JS
// boundary as BigInt (Node's WebAssembly BigInt integration).
export function runOne(exports, seed, size) {
  exports.solve(BigInt(seed), size >>> 0);
  const pathLength = exports.getPathLength() >>> 0;
  // getPathHash() is a u64; across the JS boundary it arrives as a *signed*
  // i64 BigInt, so reinterpret it as unsigned 64-bit before formatting.
  const pathHash = BigInt.asUintN(64, exports.getPathHash());
  return {
    pathLength,
    pathHash: "0x" + pathHash.toString(16).padStart(16, "0"),
  };
}
