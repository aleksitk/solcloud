# SolCloud demo function — labyrinth shortest-path (Wasm)

A deterministic, integer-only WebAssembly function used to demonstrate SolCloud's
verifiable off-chain compute. It generates a "perfect" maze from a 64-bit seed on
a `size × size` grid and returns the shortest path from the top-left to the
bottom-right cell.

The computation is heavy enough that it would not fit in a single Solana
transaction's compute budget, but its input and output are tiny — which is
exactly the shape of task SolCloud is built for.

## ABI

Raw exports (no runtime glue; instantiate with a single `env.abort` import):

| Export | Signature | Description |
| --- | --- | --- |
| `solve` | `(seed: u64, size: u32) => void` | Run the computation for the given input. |
| `getPathLength` | `() => u32` | Shortest-path length (steps). Read after `solve`. |
| `getPathHash` | `() => u64` | FNV-1a hash of the ordered path cells. Read after `solve`. |

Canonical result bytes (used later for commit/reveal):
`u32LE(pathLength) ‖ u64LE(pathHash)` = 12 bytes.

## Determinism

- Integer-only (`u32` / `u64`). No `f32`/`f64`, no `NaN`, no `Date`, no `Math.random`.
- No host capability imports (time/network/files/randomness).
- Wasm integer arithmetic is fully specified, so results are identical on x86 and
  on ARM (Raspberry Pi).

## Commands

```bash
npm install          # install AssemblyScript
npm run build        # compile assembly/index.ts -> build/solcloud_maze.wasm
npm run hash         # print SHA-256 of the compiled .wasm (registered on-chain)
npm run run          # run the demo inputs and print results
npm run gen-vectors  # write testvectors/vectors.json (pinned known-good outputs)
npm run verify       # re-run and assert no determinism drift (CI gate)
```

The compiled `.wasm` is intentionally git-ignored; it is hosted externally
(HTTPS/IPFS/Arweave) and referenced on-chain only by its SHA-256 hash. The pinned
`testvectors/vectors.json` is committed.
