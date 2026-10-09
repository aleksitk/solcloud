import { join } from "node:path";

export const DEFAULT_RPC = "https://api.devnet.solana.com";
export const DEFAULT_POLL_MS = 5000;

export function ownerTag(pubkey) {
  return String(pubkey).slice(0, 8);
}

export function formatLogLine({ iso, node, task, action, detail }) {
  return `${iso} node=${node} task=${task} ${action} ${detail}`;
}

export function idlCandidates(workerDir, envIdl) {
  const paths = [];
  if (envIdl) paths.push(envIdl);
  paths.push(join(workerDir, "idl", "solcloud.json"));
  paths.push(join(workerDir, "..", "program", "target", "idl", "solcloud.json"));
  return paths;
}

export function pollMs(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_POLL_MS;
  return value;
}

export function rpcHost(rpc) {
  return new URL(rpc).host;
}

export function stateFile(workerDir, owner, taskId) {
  return join(workerDir, ".state", owner, `${taskId}.json`);
}

export function logFile(workerDir, owner) {
  return join(workerDir, "logs", `${ownerTag(owner)}.log`);
}

// Where a node downloads a task's wasm when worker/modules does not have it.
// The file is checked against the task's SHA-256, so the host is not trusted.
// SOLCLOUD_WASM_BASE overrides it, for example with the published site's /wasm/.
export const DEFAULT_WASM_BASE = "https://raw.githubusercontent.com/aleksitk/solcloud/main/dashboard/public/wasm/";

// Wait between polls. After failures (a busy RPC answers 429) the wait doubles, up to a minute.
export function nextDelay(base, failures) {
  if (failures <= 0) return base;
  return Math.min(base * 2 ** failures, 60_000);
}
