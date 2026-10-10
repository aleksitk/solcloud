# SolCloud SDK

Send a task to SolCloud from your own code and read the answer a committee agreed on. There is no account to open and no API key: a Solana keypair with some SOL pays the reward and signs the request.

Needs Node.js 22 or newer.

```bash
npm install github:aleksitk/solcloud
```

```js
import { SolCloud } from "solcloud";

const cloud = new SolCloud({ keypair: "./backend-key.json" });

const round = await cloud.run({
  wasm: "./my-function.wasm", // stored on chain the first time, reused after
  input: "05000000",          // 1 to 64 bytes, hex or a Uint8Array
  reward: 0.05,               // SOL, split among the nodes that agree
  committee: 3,               // 3, 5, 7, 9 or 11 nodes
});

if (round.status === "finalized") {
  console.log(round.outputHex, `${round.agreed} of ${round.committeeSize} agreed`);
} else {
  // "refunded": no majority in time. The reward is back in the keypair.
}
```

`run` usually returns in under a minute. It can take up to ten when a node on the committee is offline, because the round then waits for its window to close.

## Calls

| Call | What it does |
| --- | --- |
| `new SolCloud({ keypair, rpc })` | `keypair` is a file path, a secret key, or a `Keypair`. Leave it out to only read. `rpc` defaults to the public devnet RPC. |
| `run(task)` | `request`, then `wait`. Returns the settled round. |
| `request(task)` | Creates the task and returns `{ taskId, signature, wasmHash, committee }` at once. |
| `wait(taskId, { timeoutMs, pollMs })` | Polls until the round settles. |
| `status(taskId)` | Where a task stands now, or `null` if it does not exist. |
| `publish(wasm)` | Stores a module on chain and returns its `hash`. `request` does this for you when given bytes or a file. |
| `nodes()` | The staked nodes a committee is drawn from. |

`wasm` can be the module's bytes, a path to a `.wasm` file, or the SHA-256 of a module this keypair already published.

## What it costs

- The reward you set, per task. It comes back in full when a round is refunded.
- Rent for the task account, and a transaction fee.
- Once per module: rent for the account that holds the Wasm, about 0.007 SOL per kilobyte.

## Try it

`sdk/example.mjs` runs one task and prints the answer:

```bash
node sdk/example.mjs ./backend-key.json ./my-function.wasm 05000000
```

## Limits

- Devnet only.
- The program must be deterministic: integers only, no clock, no randomness. Input and output are capped at 64 bytes, a module at 10,000.
- The public devnet RPC limits requests. Pass your own `rpc` for anything beyond a test.
