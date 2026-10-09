# SolCloud

Verifiable off-chain compute for Solana. Staked nodes run the same deterministic Wasm program, commit a hash, then reveal the output. The chain pays the majority and cuts the stake of a mismatch.

The program is on devnet: [`D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ`](https://explorer.solana.com/address/D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ?cluster=devnet).

## Problem

A Solana transaction has a hard compute budget. Pathfinding, matching, and similar deterministic work do not fit inside it. Teams then run that work on one server. Users cannot check the answer, and that server is a single point of failure.

Zero-knowledge coprocessors prove the result, at the cost of a slow and expensive proof. Trusted hardware asks you to trust the chip vendor.

## Solution

The requester chooses an odd committee of 3, 5, 7, 9, or 11 nodes and locks a reward. Every selected node runs the same Wasm on the same input. They first post `sha256(output ‖ nonce)`, then reveal the output. Agreement is a majority: `floor(N / 2) + 1`. The majority is paid from the escrow. A node that reveals a different output loses part of its stake. If there is no majority, or the window expires before the committee finishes, the reward returns to the requester.

The function has to be deterministic integer Wasm. It exports `alloc` and `run`. Input and output are at most 64 bytes. The built-in demo is a labyrinth: a seed and a size go in, a path length and a path hash come out.

## Architecture

```
Wallet ── request_task ──► SolCloud program (devnet)
                               │  escrow on the task account
                               │  committee = N active node accounts
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
     Node 1                 Node 2                 Node N
        └──── commit(hash) ──► reveal(output, nonce) ─┘
                               ▼
                    finalize: majority paid, mismatch slashed
                               ▼
                    TaskResult account, read by the dashboard
```

1. **Register.** A wallet stakes at least 1 SOL into a node account. The stake stays there.
2. **Request.** The wallet signs `request_task` with a slot it just read. The program draws the committee from `config.active_nodes` with `sha256(slot ‖ task_id)` and rejects any other list. The reward moves into the task account.
3. **Run.** A node checks the Wasm SHA-256, then runs `alloc` and `run` on a worker thread with a timeout. The host import is only `env.abort`.
4. **Commit, then reveal.** The output stays hidden until every committee node has committed. The reveal must match the commit.
5. **Settle.** `finalize` pays the majority and slashes a mismatch (the live config takes 50% of that node's recorded stake). A timeout with a missing commit or reveal refunds the requester and does not slash.

`register_node` adds the owner to `config.active_nodes`, so a new node can be drawn on the next request.

The dashboard signs the request and the stake, and it reads accounts. A node runs `worker/listener.mjs`. It commits and reveals its own tasks, then sends `finalize` once every reveal is in, or `refund_expired` once a window has closed. Anyone may send those two, so no operator has to step in. The manual scripts stay in `program/scripts/` as a fallback.

## Repository

```
solcloud/
├── program/     Anchor program and the devnet scripts
├── wasm/        Labyrinth module, alloc/run ABI, test vectors
├── worker/      Hash check, timed Wasm run, and the task listener
├── dashboard/   The site: rounds, functions, new task, stake
└── docs/        Toolchain notes
```

## Run the site

From `dashboard/`:

```bash
npm install
npm run dev
```

Open http://localhost:5173/. Use a Devnet wallet. The site can register a node and escrow a task. It does not commit or reveal for the nodes.

## Check the Wasm

From `wasm/`:

```bash
npm install
npm run verify
npm run abi
```

`verify` checks the pinned labyrinth vectors. `abi` checks `alloc` and `run`. The current labyrinth module hash is `ee0b3e4c3ede257e3719c52deee27528ea791218cdea3a5802fd52bf9ce5057a`.

From `worker/`:

```bash
npm run check
```

That runs the maze vector, rejects a file whose hash does not match, and stops a run that exceeds the timeout.

## Running a node

One process per keypair. From `worker/`, after `npm install`. The listener reads the IDL from `worker/idl/solcloud.json`; copy `program/target/idl/solcloud.json` there after each `anchor build`.

```bash
node listener.mjs ~/.config/solana/solcloud-node1.json
```

The listener uses `worker/modules/<hash>.wasm` when that file is already on the machine. Otherwise it downloads `SOLCLOUD_WASM_BASE/<hash>.wasm` and refuses the file if the SHA-256 does not match the task. The process polls devnet every 5 seconds (`SOLCLOUD_POLL_MS`) and waits longer after a failed poll. `SOLCLOUD_RPC` points it at another RPC. It stores the output and nonce in `worker/.state/<owner>/<task_id>.json` before it commits, and keeps them until the reveal lands. Before it sends a commit or reveal again, it checks whether the last one already landed. Each event is also appended to `worker/logs/<owner>.log`.

`worker/solcloud-listener.service` restarts the process if it exits. Edit `WorkingDirectory` and the keypair path in that file, then:

```bash
sudo cp solcloud-listener.service /etc/systemd/system/
sudo systemctl enable --now solcloud-listener
```

## From a terminal

`worker/cli.mjs` does what the site does, with a keypair file in place of a wallet:

```bash
node cli.mjs request ~/.config/solana/id.json --wasm my-function.wasm --input 05000000 --reward 0.05 --committee 3
node cli.mjs stake ~/.config/solana/node.json --sol 1
node cli.mjs status 14
node cli.mjs nodes
```

`--wasm` takes a compiled file or its SHA-256. `--input` is hex bytes. `--dry-run` simulates `request` or `stake` without sending.

`worker/start-nodes.sh` starts one listener for each `~/.config/solana/solcloud-node*.json`, or for the keypairs named, and restarts any that exits.

## Settle a round by hand

The listeners settle rounds on their own. These scripts are the fallback. They run from `program/` with the devnet keypairs on the operator machine. Pass the task id:

```bash
node scripts/commit-result.cjs <task-id>
node scripts/reveal-result.cjs <task-id>
node scripts/finalize.cjs <task-id>
```

`commit-faulty.cjs` and `reveal-faulty.cjs` are the mismatch used to show a slash. `refund-expired.cjs` returns a reward after a missed window.

## Limits

- The function must be deterministic. Floats, time, and randomness are out.
- Input and output are capped at 64 bytes.
- The committee draw uses a recent slot and the task id. It is not a VRF: a requester can try other task ids until the draw suits them.
- A registered node is drawn whether or not its listener is running. An offline node stalls the round until the window closes, then the reward is refunded.
- Security is an honest majority plus stake, not a cryptographic proof.
