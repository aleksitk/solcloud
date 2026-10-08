// Compile one AssemblyScript module by shelling out to asc.
// Calling the compiler library in-process runs out of memory on this machine.
// asc is the same binary that builds the maze.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_SOURCE = 32_000;
const here = dirname(fileURLToPath(import.meta.url));
const ascBin = join(here, "..", "node_modules", "assemblyscript", "bin", "asc.js");
const modulesDir = join(here, "..", "..", "worker", "modules");

function runAsc(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: 1, stderr: stderr || "Compile timed out." });
    }, 45_000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stderr: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr });
    });
  });
}

export async function compileSource(source) {
  if (typeof source !== "string" || source.trim() === "") {
    throw new Error("Write a function first.");
  }
  if (source.length > MAX_SOURCE) {
    throw new Error("That source is too long.");
  }
  const dir = await mkdtemp(join(tmpdir(), "solcloud-asc-"));
  try {
    const input = join(dir, "function.ts");
    const output = join(dir, "function.wasm");
    await writeFile(input, source);
    const { code, stderr } = await runAsc([
      ascBin,
      input,
      "--outFile",
      output,
      "--noAssert",
      "--runtime",
      "minimal",
      "--noColors",
    ]);
    if (code !== 0) {
      const detail = stderr.replaceAll(input, "function.ts").trim();
      throw new Error(detail || "Compile failed.");
    }
    const bytes = await readFile(output);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("Compile failed.");
    await mkdir(modulesDir, { recursive: true });
    await writeFile(join(modulesDir, `${hash}.wasm`), bytes);
    return { hash, bytes };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
