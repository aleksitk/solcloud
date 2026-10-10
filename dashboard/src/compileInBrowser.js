// Compile AssemblyScript to Wasm in the browser, so the published site needs no server.
// The compiler is several megabytes, so it loads only when Compile is first pressed.

const MAX_SOURCE = 32_000;
let compiler = null;

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function compileInBrowser(source) {
  if (typeof source !== "string" || source.trim() === "") throw new Error("Write a function first.");
  if (source.length > MAX_SOURCE) throw new Error("That source is too long.");

  compiler ||= import("assemblyscript/asc");
  const asc = await compiler;

  let binary = null;
  // The same flags as the worker's build, so the same source gives the same Wasm.
  const { error, stderr } = await asc.main(
    ["function.ts", "--outFile", "function.wasm", "--noAssert", "--runtime", "minimal", "--noColors"],
    {
      readFile: (name) => (name === "function.ts" ? source : null),
      writeFile: (name, contents) => {
        if (name.endsWith(".wasm")) binary = contents;
      },
      listFiles: () => [],
    }
  );
  if (error || !binary) {
    const detail = stderr.toString().trim();
    throw new Error(detail || error?.message || "Compile failed.");
  }
  const bytes = Uint8Array.from(binary);
  return { hash: await sha256Hex(bytes), bytes };
}
