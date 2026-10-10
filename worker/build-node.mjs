// Pack the node into one executable for the machine this runs on.
//   npm run build:node   ->   dist/solcloud-node(.exe)
// It bundles node-app.mjs and everything it imports, then injects that bundle
// into a copy of the Node.js binary (Node's single executable application).

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const bundle = join(dist, "solcloud-node.cjs");
const blob = join(dist, "sea-prep.blob");
const exe = join(dist, process.platform === "win32" ? "solcloud-node.exe" : "solcloud-node");
mkdirSync(dist, { recursive: true });

// The worker thread has no file to load inside the executable, so its code travels as text.
const thread = buildSync({
  entryPoints: [join(here, "thread.mjs")],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
}).outputFiles[0].text;

buildSync({
  entryPoints: [join(here, "node-app.mjs")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: bundle,
  // Optional native speed-ups of the websocket library. It works without them.
  external: ["bufferutil", "utf-8-validate"],
  define: {
    "globalThis.SOLCLOUD_THREAD": JSON.stringify(thread),
    "import.meta.url": "importMetaUrl",
  },
  // Node prints notes about its own internals on start. They mean nothing to an operator.
  banner: {
    js: 'process.removeAllListeners("warning"); process.on("warning", () => {}); const importMetaUrl = require("node:url").pathToFileURL(__filename).href;',
  },
  logLevel: "warning",
});

const seaConfig = join(dist, "sea-config.json");
writeFileSync(seaConfig, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true }));
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

copyFileSync(process.execPath, exe);
const postject = join(here, "node_modules", "postject", "dist", "cli.js");
execFileSync(
  process.execPath,
  [postject, exe, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2", "--overwrite"],
  { stdio: "inherit" }
);

console.log(`${exe}  ${(statSync(exe).size / 1_000_000).toFixed(0)} MB`);
