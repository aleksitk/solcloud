import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// compileSource also writes worker/modules/<hash>.wasm for the local node.
import { compileSource } from "./server/compile.mjs";

const workerDir = join(dirname(fileURLToPath(import.meta.url)), "..", "worker");

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 40_000) {
        reject(new Error("That source is too long."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function checkApi() {
  return {
    name: "solcloud-check",
    configureServer(server) {
      server.middlewares.use("/api/check", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const child = spawn(process.execPath, ["check.mjs"], { cwd: workerDir, windowsHide: true });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => child.kill(), 60_000);
        child.stdout.on("data", (chunk) => {
          if (stdout.length < 4000) stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk) => {
          if (stderr.length < 4000) stderr += chunk.toString("utf8");
        });
        function reply(ok, detail) {
          if (res.writableEnded) return;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok, detail }));
        }
        child.on("error", (err) => {
          clearTimeout(timer);
          reply(false, err.message || "The check could not start.");
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          const passed = code === 0
            && stdout.includes("pathLength=35628")
            && stdout.includes("wrong hash rejected")
            && stdout.includes("timeout stopped");
          if (passed) {
            reply(true, "");
            return;
          }
          const line = (stderr || stdout)
            .trim()
            .split("\n")
            .map((item) => item.trim())
            .filter((item) => item && !item.startsWith("Node.js v"))
            .pop() || "The check failed.";
          reply(false, line.slice(0, 180));
        });
      });
    },
  };
}

function compileApi() {
  return {
    name: "solcloud-compile",
    configureServer(server) {
      server.middlewares.use("/api/compile", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          const { source } = JSON.parse(await readBody(req));
          const { hash, bytes } = await compileSource(source);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ hash, wasmBase64: Buffer.from(bytes).toString("base64") }));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: err.message || "Compile failed." }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), compileApi(), checkApi()],
  server: { port: 5173, strictPort: true },
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
});
