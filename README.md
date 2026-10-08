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
2. **Request.** The dashboard reads the nodes that are active at that moment, ranks them by reputation, and breaks a tie with the latest block hash. The wallet signs `request_task` and names that committee. The reward moves into the task account.
3. **Run.** A node checks the Wasm SHA-256, then runs `alloc` and `run` on a worker thread with a timeout. The host import is only `env.abort`.
4. **Commit, then reveal.** The output stays hidden until every committee node has committed. The reveal must match the commit.
5. **Settle.** `finalize` pays the majority and slashes a mismatch (the live config takes 50% of that node's recorded stake). A timeout with a missing commit or reveal refunds the requester and does not slash.

Reputation is stored on the node account. The program does not change it after a round yet, so equal scores are ordered by the block hash.

The dashboard signs the request and the stake, and it reads accounts. Commit, reveal, and finalize for the live rounds are sent by the scripts in `program/scripts/` from the operator machine. The worker runner does not listen for tasks yet.

## Repository

```
solcloud/
├── program/     Anchor program and the devnet scripts
├── wasm/        Labyrinth module, alloc/run ABI, test vectors
├── worker/      Hash check and timed Wasm run
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

## Settle a round

These scripts run from `program/` with the devnet keypairs on the operator machine. Pass the task id:

```bash
node scripts/commit-result.cjs <task-id>
node scripts/reveal-result.cjs <task-id>
node scripts/finalize.cjs <task-id>
```

`commit-faulty.cjs` and `reveal-faulty.cjs` are the mismatch used to show a slash. `refund-expired.cjs` returns a reward after a missed window.

## Limits

- The function must be deterministic. Floats, time, and randomness are out.
- Input and output are capped at 64 bytes.
- The committee is explicit. The chain checks that each account is an active node. It does not shuffle the list itself.
- A new node joins the registry from the site. It is called when the ranking selects it.
- Security is an honest majority plus stake, not a cryptographic proof.
