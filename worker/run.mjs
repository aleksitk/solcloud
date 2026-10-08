// Load a SolCloud Wasm module, check its SHA-256, and run it off the main thread.
// Usage: node run.mjs <wasm-file> <sha256-hex> <input-hex>

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";

const IO_CAP = 64;
const DEFAULT_TIMEOUT_MS = 10_000;

export function runWasm({ file, hash, input, timeoutMs = DEFAULT_TIMEOUT_MS, delayMs = 0 }) {
  if (!(input instanceof Uint8Array) || input.length === 0 || input.length > IO_CAP) {
    return Promise.reject(new Error("Input must be 1 to 64 bytes."));
  }
  const wasm = readFileSync(file);
  const actual = createHash("sha256").update(wasm).digest("hex");
  if (actual !== String(hash).toLowerCase()) {
    return Promise.reject(new Error(`Wasm hash is ${actual}.`));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./thread.mjs", import.meta.url), {
      workerData: { wasm, input, delayMs },
    });
    let settled = false;
    const timer = setTimeout(() => {
      finish(() => reject(new Error("The wasm run timed out.")));
    }, timeoutMs);

    function finish(done) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      done();
    }

    worker.once("message", (message) => {
      if (message.ok) finish(() => resolve(message.output));
      else finish(() => reject(new Error(message.error || "Wasm run failed.")));
    });
    worker.once("error", (err) => {
      finish(() => reject(err));
    });
  });
}

function hexToBytes(hex) {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error("Input must be hex bytes.");
  }
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

if (process.argv[1] && process.argv[1].endsWith("run.mjs")) {
  const [file, hash, inputHex] = process.argv.slice(2);
  if (!file || !hash || !inputHex) {
    console.error("usage: node run.mjs <wasm-file> <sha256-hex> <input-hex>");
    process.exit(1);
  }
  const output = await runWasm({ file, hash, input: hexToBytes(inputHex) });
  console.log(Buffer.from(output).toString("hex"));
}
