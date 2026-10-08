# SolCloud — TODO

**Deadline: submission materials due Oct 10, 2026 (Build Station: Oct 5–13).**
**Code freeze: Oct 8. Oct 9–10: video + submission. Oct 11–12: buffer only.**

> **New core feature — Configurable committee size.**
> Instead of a fixed 3-node committee, the requester chooses the committee size `N`
> (odd values **3, 5, 7, 9, 11**). Consensus is reached by **majority**:
> `threshold = floor(N/2) + 1` matching reveals (e.g. N=3 → 2, N=5 → 3, N=11 → 6).
> Reward, escrow, and committee selection all scale with `N`. Odd sizes avoid ties.

---

## Phase 0 — Registration & setup (Day 1)

- [ ] Register on Colosseum (colosseum.com), location = Georgia
- [ ] Fill submission form (as draft, do not finalize)
- [ ] Confirm exact submission deadline and timezone
- [ ] Review Colosseum rules: existing-project eligibility, tracks, prizes
- [ ] Decide on Build Station attendance and register
- [x] Create public GitHub repo + README skeleton
- [x] Generate Solana devnet keypairs, fund from devnet SOL faucet

---

## Phase 1 — Pi setup & Wasm function (Day 1–3)

### Hardware
- [ ] Flash 64-bit OS onto SD cards for 3+ Raspberry Pis (support up to 11 nodes total)
- [ ] SSH access on each, static IP or hostname
- [ ] Install Node.js (LTS) on all
- [ ] Network stability test (Wi-Fi/Ethernet)
- [ ] Thermal/cooling check under sustained load

### Wasm demo function
- [x] Pick demo task (labyrinth shortest-path, seed-based)
- [x] Implement algorithm (Rust or AssemblyScript) → compile to `.wasm`
- [x] Ensure full determinism (no float, no Date.now, no Math.random)
- [x] Compute SHA-256 hash of the `.wasm` file
- [ ] Host file externally (IPFS/Arweave/HTTPS) for nodes to download
- [x] Write 5–10 known test vectors (input → expected output hash)

---

## Phase 2 — Anchor program skeleton (Day 1–3)

- [x] Anchor project init (`anchor init solcloud`)
- [x] Account struct design:
  - [x] `NodeAccount` (owner, stake_amount, status, reputation)
  - [x] `TaskAccount` (requester, wasm_hash, input, reward, status, **committee_size `N`**, committee[])
  - [x] `CommitAccount` (node, task, hash_commitment, submitted_at)
  - [x] `TaskResult` (task, final_output, output_hash, status: Finalized/Failed/Refunded)
- [x] **Config/constants:** min/max committee size (3..11), odd-only validation, `threshold = N/2 + 1`
- [x] Plan instruction list (see Phase 3)
- [x] Deploy program to devnet (program id `D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ`)

---

## Phase 3 — "Slice #1": Happy path (Day 4–7)

**Goal: a full working path with no error cases.**

### Anchor program
- [x] `register_node(stake_amount)` — node stakes, added to registry
- [x] `request_task(wasm_hash, input, reward, committee_size)` — dApp creates task, reward escrowed
  - [x] Validate `committee_size` is odd and within [3, 11]
  - [x] Require enough registered/available nodes for the chosen `N`
- [ ] Committee selection: pick `N` nodes via slot hash + task ID seed (demo passes an explicit node list)
- [x] `commit_result(task_id, hash_commitment)` — node submits commit
- [x] `reveal_result(task_id, result, nonce)` — node reveals answer
- [x] Finalize logic: **M-of-N majority** check (`threshold = N/2 + 1`), create `TaskResult`
- [x] Reward distribution across the matching (correct) nodes

### Worker node (TypeScript)
- [ ] Solana RPC/WebSocket listener for new tasks
- [ ] Download Wasm file and verify hash
- [ ] Run in Node.js WebAssembly: worker thread + timeout
- [ ] Build and send commit transaction
- [ ] Build and send reveal transaction (after commit window)
- [ ] Logging (task ID, time, result)

### Consumer dApp (mini)
- [ ] Simple Anchor program that calls `request_task` via CPI (with chosen `committee_size`)
- [ ] Reads `TaskResult` and updates its own state based on the result

### Integration test
- [x] One full cycle on devnet by hand (request → N nodes → commit → reveal → finalize → payout)
- [ ] Verify consumer dApp reads the result correctly
- [ ] Test with multiple committee sizes (e.g. N=3 and N=5) (only N=3 has been run)

---

## Phase 4 — Slashing, edge cases, security (Day 8–11)

- [x] Slashing logic: incorrect/non-matching reveal → slash part of stake (task 3, node 3 lost 0.5 SOL)
- [x] Timeout/refund: if commit or reveal missed its window (task 1 commit window; reveal-window path is in the program)
- [x] No majority reached (all answers differ enough) → full refund to requester (task 4)
- [x] Partial slashing parameter (not 100%, e.g. 5–10% per fault) (live config is 50%, `slash_bps = 5000`)
- [ ] "Faulty" flag in worker for the demo (intentionally wrong answer) (done by a script, not a worker)
- [ ] Resource limits: timeout, memory cap, output-size cap in sandbox (output size cap only)
- [x] Reentrancy/double-submit protection (one node commits/reveals once)
- [ ] Pre-flight CLI test for node operators (before staking)
- [ ] Anchor unit tests on core scenarios (happy path, slashing, timeout, refund)
  - [ ] Include tests across committee sizes (N=3, 5, 11) and threshold edge cases
- [ ] Full manual regression on devnet

---

## Phase 5 — Dashboard & consumer dApp UI (Day 12–15)

**⚠️ The site must be highly professional — this is a key judging surface.**

- [x] Init React + Tailwind dashboard (dark theme, devnet landing). `@solana/web3.js` is not a dependency yet; balance is read from RPC directly
- [x] Wallet connect (Phantom/Solflare, devnet)
- [ ] Function registration UI (wasm hash input)
- [x] Task launch UI (input parameters, reward, **committee size selector 3/5/7/9/11**). The connected wallet signs `request_task` on devnet. Only N=3 can be submitted; three nodes are staked
- [x] Live status: Requested → Committed (x/N) → Revealed (x/N) → Finalized/Failed. The home page reads the latest task from devnet and refreshes until it settles
- [x] Node list: stake and status, read from the three devnet node accounts. Last activity is not stored on the node, so it is not shown
- [x] Slashing visual on the hero round (node 3 pulses). Settled rounds, including the slash and the refunds, are read from devnet
- [x] Transaction links (Solana Explorer, devnet)
- [ ] Consumer dApp visualization (e.g. labyrinth map + path)
- [ ] Responsive, polished UI for presentation
- [x] Show committee size + threshold clearly per task (e.g. "3 of 3", need 2). The settled list and the latest-round card both show it

---

## Phase 6 — Polish, README, docs (Day 16–17 / Oct 9–10)

**⚠️ Hard line — all materials must be ready by Oct 10.**

- [ ] README.md: problem, solution, architecture, setup instructions
- [ ] Architecture diagram in README
- [ ] Final code cleanup, comments
- [ ] Pitch deck (slides) — 8–10 slides
- [ ] Live demo link (dashboard deployed on devnet, if hosted)
- [ ] Rehearse all pre-registered test scenarios (so nothing fails on video)
- [ ] Final physical Pi setup and test
- [ ] Backup footage/screen recording in case live demo fails

---

## Phase 7 — Video & submission (Day 18–19 / Oct 11–12)

- [ ] Pitch video (max 2 min) — record + edit
- [ ] Technical demo video (2–3 min) — architecture + live demo
- [ ] Final video export and upload
- [ ] GitHub repo — public, README complete, clean commit history
- [ ] Pitch deck final version (PDF)
- [ ] Final live-demo link test (open from another device)
- [ ] Fill and submit the form (**on Oct 11, not at the last minute**)
- [ ] Verify Telegram handle + Colosseum profile link in the form

---

## Parallel / ongoing

- [ ] Daily git commit (judges see history — consistent progress is good)
- [ ] End-of-day 2–3 sentence log: what got done / what blocked
- [ ] Monitor devnet SOL balance (faucet periodically dries up)
- [ ] At Build Station: ask a mentor to review staking/slashing design

---

## Risks — cut in this order if behind

1. Push callback (dApp reads `TaskResult` by pull — sufficient)
2. Labyrinth visualization on dashboard (text status is enough)
3. Complex committee shuffle logic (fixed selection is fine for the demo)
4. Reputation/decay system (leave in roadmap)
5. Pre-flight CLI polish (minimal version is enough)
6. Configurable committee UI could fall back to a few preset sizes (3/5/11) if time is short

**Never cut:** the live slashing demo — it's the core of the project.
