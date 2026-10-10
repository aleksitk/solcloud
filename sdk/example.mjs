// Run one task from a script and print the answer.
//   node sdk/example.mjs <keypair.json> <file.wasm> <input-hex>

import { SolCloud } from "solcloud";

const [keypair, wasm, input] = process.argv.slice(2);
if (!keypair || !wasm || !input) {
  console.error("usage: node sdk/example.mjs <keypair.json> <file.wasm> <input-hex>");
  process.exit(1);
}

const cloud = new SolCloud({ keypair });
console.log(`paying from ${cloud.address}`);

const round = await cloud.run({ wasm, input, reward: 0.05, committee: 3 });

console.log(`task ${round.taskId}: ${round.status}, ${round.agreed} of ${round.committeeSize} agreed`);
// A refunded round has no output: the reward went back to this keypair.
if (round.status === "finalized") console.log(`output ${round.outputHex}`);

// The RPC websocket would keep this script alive after the work is done.
process.exit(0);
