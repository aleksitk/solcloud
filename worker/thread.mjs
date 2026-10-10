// Runs inside a worker thread. The parent has already checked the Wasm hash.
// The only host import is abort. There is no clock, file, or random import.

import { parentPort, workerData } from "node:worker_threads";

const IO_CAP = 64;

function fail(error) {
  parentPort.postMessage({ ok: false, error });
}

async function main() {
  try {
  if (workerData.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, workerData.delayMs));
  }
  const { instance } = await WebAssembly.instantiate(workerData.wasm, {
    env: {
      abort(_msg, _file, line, col) {
        throw new Error(`wasm abort at ${line}:${col}`);
      },
    },
  });
  const exports = instance.exports;
  const input = workerData.input;
  if (input.length === 0 || input.length > IO_CAP) {
    fail("Input must be 1 to 64 bytes.");
  } else {
    const ptr = exports.alloc(input.length) >>> 0;
    if (ptr === 0) {
      fail("Wasm alloc rejected the input.");
    } else {
      new Uint8Array(exports.memory.buffer).set(input, ptr);
      const packed = BigInt.asUintN(64, exports.run(ptr, input.length));
      const outPtr = Number(packed & 0xffffffffn);
      const outLen = Number(packed >> 32n);
      if (packed === 0n || outLen === 0 || outLen > IO_CAP) {
        fail("Wasm run rejected the input.");
      } else {
        const output = new Uint8Array(exports.memory.buffer.slice(outPtr, outPtr + outLen));
        parentPort.postMessage({ ok: true, output });
      }
    }
  }
  } catch (err) {
    fail(err.message || "Wasm run failed.");
  }
}

main();
