# SolCloud

> **Verifiable Off-Chain Compute for Solana Programs** — cryptoeconomic trust, commodity hardware.

SolCloud lets Solana programs offload heavy deterministic computation to a network of independent
nodes and verify the result on-chain via **2-of-3 consensus, staking, and slashing**.

---

## 📌 Status

🚧 Active development — Colosseum Hackathon (submission: Oct 10, 2026).

## 🧩 Problem

A Solana program has a strict Compute Unit budget per transaction (~1.4M CU today). Many useful
deterministic tasks — pathfinding, order matching, risk/liquidation calculations, simulations —
don't fit within that limit. Today developers run these on their own centralized server, which means:

- **Users must trust a single server** and can't verify the result wasn't forged.
- **A single point of failure** can take the whole app down.

Existing alternatives have trade-offs: ZK coprocessors are mathematically strong but proving is
expensive and relatively slow; TEE-based oracle compute requires trusting the hardware and its vendor.

## 💡 Solution

Three independent nodes run the exact same computation. If two agree on the same answer, it's
accepted; a node that returns a different answer loses part of its stake.

## 🏗️ Architecture

```
dApp Program ──(1) request_task──► SolCloud Program (Anchor) ◄── Node Registry (staked)
                                        │ (2) committee: 3 nodes
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
  Raspberry Pi #1                 Raspberry Pi #2                 Raspberry Pi #3
        └──────── (3) commit(hash) → reveal(result) ─────────────────────┘
                                        ▼
                            2-of-3? → (4a) TaskResult + reward | (4b) slashing
                                        ▼
                        (5) dApp reads the verified result
```

1. **Request & escrow** — a dApp calls `request_task(wasm_hash, input, max_reward)` via CPI; the
   reward is locked in escrow. Input travels in the transaction, so it's small (~1232-byte tx limit).
2. **Committee selection** — the program picks 3 staked nodes using a seed derived from a recent
   slot hash and the task ID.
3. **Execution** — each node verifies the Wasm hash and runs the function in an isolated sandbox.
4. **Commit → reveal** — nodes first submit `hash(result ‖ nonce)`, then reveal the result and nonce.
5. **Finalize & slashing** — if two reveals match, the result is stored in a `TaskResult` account and
   the reward is distributed; a mismatching node is slashed.
6. **Consume** — the dApp reads the finalized `TaskResult` and verifies status is `Finalized`.

## 📦 Repository layout

```
solcloud/
├── program/        # Anchor program (Rust) — registry, task, commit/reveal, finalize, slashing
├── worker/         # Worker node (TypeScript) — listener, Wasm runner, commit/reveal
├── wasm/           # Demo function (labyrinth shortest-path) → .wasm
├── consumer/       # Consumer dApp (small Anchor program)
├── dashboard/      # React + Tailwind + @solana/web3.js UI
└── docs/           # Architecture, diagrams
```

## 🚀 Setup

> TODO: expand as development progresses.

### Prerequisites
- Node.js (LTS)
- Rust + Cargo
- Solana CLI + Anchor
- 3× Raspberry Pi (64-bit OS) for the worker nodes

## 🎯 MVP scope

- **Solana program (Anchor):** node registry & staking, `request_task` + escrow, committee
  selection, commit/reveal, 2-of-3 finalize, slashing, timeout/refund, `TaskResult`.
- **Worker node (TypeScript):** task listener, Wasm hash verification, sandboxed execution in a
  worker thread with timeout and memory limits, commit/reveal. Includes a "faulty" flag for the demo.
- **Demo function (Wasm):** shortest path through a procedurally generated 512×512 labyrinth
  (deterministic; input is just a seed + size, output is path length + path hash).
- **Consumer dApp (small Anchor program):** reads a `TaskResult` and updates its own state based on it.
- **Dashboard (React + Tailwind + @solana/web3.js):** function registration, task launch, live
  committee status, node stakes, slashing animation, and transaction links.

## 🔐 Security & economics

Security relies on an **honest majority plus stake**. Each node must stake to join, which makes
Sybil identities costly. Stake must exceed the value a node secures (`stake ≥ k · V_max`). The Wasm
function runs with **empty imports** (no time, network, files, or randomness) and strict resource
limits (execution timeout, memory cap, output-size cap). See `docs/` for details.

## 🧭 Honest limitations

- Works only for **deterministic** functions.
- **3× compute overhead** due to redundancy.
- **Small input/output** in the MVP (transaction-size bound).
- Security depends on an **honest majority and stake**; it strengthens as the network grows.
- Latency is **a few seconds** (request, commit, reveal, finalize) — not sub-millisecond.
- **No private input** supported in the MVP.

## 📄 License

TBD
