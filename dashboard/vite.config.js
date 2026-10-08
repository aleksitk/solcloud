import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { compileSource } from "./server/compile.mjs";

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
  plugins: [react(), tailwindcss(), compileApi()],
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
