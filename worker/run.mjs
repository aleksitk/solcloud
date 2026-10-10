// Load a SolCloud Wasm module, check its SHA-256, and run it off the main thread.
// Usage: node run.mjs <sha256-hex> <input-hex>
//        node run.mjs <wasm-file> <sha256-hex> <input-hex>

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const here = dirname(fileURLToPath(import.meta.url));

export function moduleFile(hash) {
  const name = String(hash).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(name)) throw new Error("Wasm hash must be 64 hex characters.");
  return join(process.env.SOLCLOUD_DATA || here, "modules", `${name}.wasm`);
}

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
    // The packaged node has no thread.mjs on disk, so it carries that file's code as text.
    const packed = globalThis.SOLCLOUD_THREAD;
    const worker = packed
      ? new Worker(packed, { eval: true, workerData: { wasm, input, delayMs } })
      : new Worker(new URL("./thread.mjs", import.meta.url), { workerData: { wasm, input, delayMs } });
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
  const args = process.argv.slice(2);
  let file;
  let hash;
  let inputHex;
  if (args.length === 2) {
    hash = args[0];
    file = moduleFile(hash);
    inputHex = args[1];
  } else if (args.length === 3) {
    [file, hash, inputHex] = args;
  }
  if (!file || !hash || !inputHex) {
    console.error("usage: node run.mjs <sha256-hex> <input-hex>");
    process.exit(1);
  }
  runWasm({ file, hash, input: hexToBytes(inputHex) }).then(
    (output) => console.log(Buffer.from(output).toString("hex")),
    (err) => {
      console.error(err.message);
      process.exit(1);
    }
  );
}
