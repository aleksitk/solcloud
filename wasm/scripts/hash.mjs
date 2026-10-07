// Print the SHA-256 of the compiled .wasm file.
//
// This hash is what gets registered on-chain. A worker node downloads the
// .wasm, recomputes this hash, and refuses to run if it doesn't match.

import { createHash } from "node:crypto";
import { readWasmBytes, WASM_PATH } from "./load.mjs";

const bytes = readWasmBytes();
const sha256 = createHash("sha256").update(bytes).digest("hex");

console.log("file:    " + WASM_PATH);
console.log("bytes:   " + bytes.length);
console.log("sha256:  " + sha256);
