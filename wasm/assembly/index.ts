// SolCloud demo function — deterministic labyrinth shortest-path.
//
// Determinism guarantees (CRITICAL for 2-of-N consensus):
//   * Integer-only arithmetic (u32 / u64). No f32/f64, no NaN bit patterns.
//   * No Date, no Math.random, no host imports for time/network/files.
//   * All integer ops are well-defined wrapping arithmetic in Wasm, so the
//     result is identical on x86, ARM (Raspberry Pi), etc.
//
// Problem: generate a "perfect" maze (spanning tree) from a 64-bit seed on a
// `size` x `size` grid, then BFS the unique shortest path from the top-left
// (0,0) cell to the bottom-right (size-1, size-1) cell.
//
// Output (small, fits in a Solana transaction):
//   * pathLength : u32  — number of steps on the shortest path
//   * pathHash   : u64  — FNV-1a hash over the ordered path cell indices
//
// ABI (raw bindings, no runtime glue):
//   solve(seed: u64, size: u32): void   — run the computation
//   getPathLength(): u32                — read result after solve()
//   getPathHash(): u64                  — read result after solve()

// ---- Wall bit flags (which sides of a cell are OPEN / passable) ----
const DIR_N: u8 = 1; // north  (y - 1)
const DIR_E: u8 = 2; // east   (x + 1)
const DIR_S: u8 = 4; // south  (y + 1)
const DIR_W: u8 = 8; // west   (x - 1)

// ---- Module state / results ----
let W: u32 = 0; // grid width (== height)
let walls: Uint8Array = new Uint8Array(0); // per-cell open-side bitmask
let gPathLength: u32 = 0;
let gPathHash: u64 = 0;

// Reusable scratch for neighbour direction picking (avoids per-cell alloc).
const dirBuf = new StaticArray<u32>(4);

// ---- Deterministic PRNG: SplitMix64 ----
let rngState: u64 = 0;

function rngSeed(seed: u64): void {
  rngState = seed;
}

function rngNext(): u64 {
  rngState += 0x9e3779b97f4a7c15;
  let z: u64 = rngState;
  z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9;
  z = (z ^ (z >> 27)) * 0x94d049bb133111eb;
  return z ^ (z >> 31);
}

// Unbiased-enough modulo reduction for the small bounds used here (<= 4).
function rngBelow(bound: u32): u32 {
  return <u32>(rngNext() % <u64>bound);
}

// @inline
function idx(x: u32, y: u32): u32 {
  return y * W + x;
}

// ---- Maze generation: iterative randomized DFS (recursive backtracker) ----
function generate(size: u32, seed: u64): void {
  W = size;
  const n = size * size;
  walls = new Uint8Array(n); // 0 = all four walls closed
  rngSeed(seed);

  const visited = new Uint8Array(n);
  const stack = new Int32Array(n); // explicit stack of cell indices
  let sp = 0;

  visited[0] = 1;
  stack[sp++] = 0;

  while (sp > 0) {
    const cur = <u32>stack[sp - 1];
    const cx = cur % W;
    const cy = cur / W;

    let cnt = 0;
    // Collect unvisited neighbours (fixed order: N, E, S, W).
    if (cy > 0 && !visited[idx(cx, cy - 1)]) dirBuf[cnt++] = 0;
    if (cx + 1 < W && !visited[idx(cx + 1, cy)]) dirBuf[cnt++] = 1;
    if (cy + 1 < W && !visited[idx(cx, cy + 1)]) dirBuf[cnt++] = 2;
    if (cx > 0 && !visited[idx(cx - 1, cy)]) dirBuf[cnt++] = 3;

    if (cnt == 0) {
      sp--; // dead end: backtrack
      continue;
    }

    const pick = dirBuf[rngBelow(<u32>cnt)];
    let nx = cx;
    let ny = cy;

    if (pick == 0) {
      ny = cy - 1;
      walls[cur] |= DIR_N;
      walls[idx(nx, ny)] |= DIR_S;
    } else if (pick == 1) {
      nx = cx + 1;
      walls[cur] |= DIR_E;
      walls[idx(nx, ny)] |= DIR_W;
    } else if (pick == 2) {
      ny = cy + 1;
      walls[cur] |= DIR_S;
      walls[idx(nx, ny)] |= DIR_N;
    } else {
      nx = cx - 1;
      walls[cur] |= DIR_W;
      walls[idx(nx, ny)] |= DIR_E;
    }

    const nIdx = idx(nx, ny);
    visited[nIdx] = 1;
    stack[sp++] = <i32>nIdx;
  }
}

// ---- FNV-1a (64-bit), feeding 4 bytes of a cell index at a time ----
// @inline
function fnv1aStep(h: u64, value: u32): u64 {
  const prime: u64 = 0x100000001b3;
  let v = <u64>value;
  for (let b = 0; b < 4; b++) {
    const byte = (v >> (<u64>(b * 8))) & 0xff;
    h = (h ^ byte) * prime;
  }
  return h;
}

// ---- BFS shortest path (0,0) -> (W-1,W-1) + unique-path hash ----
function bfs(): void {
  const n = W * W;
  const goal = n - 1;

  const dist = new Int32Array(n);
  for (let i = 0; i < <i32>n; i++) dist[i] = -1;

  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  dist[0] = 0;
  queue[tail++] = 0;

  while (head < tail) {
    const cur = <u32>queue[head++];
    if (cur == goal) break;
    const cx = cur % W;
    const cy = cur / W;
    const wmask = walls[cur];
    const d = dist[cur];

    if ((wmask & DIR_N) && cy > 0) {
      const nb = idx(cx, cy - 1);
      if (dist[nb] < 0) { dist[nb] = d + 1; queue[tail++] = <i32>nb; }
    }
    if ((wmask & DIR_E) && cx + 1 < W) {
      const nb = idx(cx + 1, cy);
      if (dist[nb] < 0) { dist[nb] = d + 1; queue[tail++] = <i32>nb; }
    }
    if ((wmask & DIR_S) && cy + 1 < W) {
      const nb = idx(cx, cy + 1);
      if (dist[nb] < 0) { dist[nb] = d + 1; queue[tail++] = <i32>nb; }
    }
    if ((wmask & DIR_W) && cx > 0) {
      const nb = idx(cx - 1, cy);
      if (dist[nb] < 0) { dist[nb] = d + 1; queue[tail++] = <i32>nb; }
    }
  }

  gPathLength = <u32>dist[goal];

  // Backtrack the unique path (perfect maze => exactly one shortest path),
  // hashing the ordered cell indices from goal back to start.
  let hash: u64 = 0xcbf29ce484222325; // FNV offset basis
  let cur = goal;
  hash = fnv1aStep(hash, cur);

  while (cur != 0) {
    const cx = cur % W;
    const cy = cur / W;
    const wmask = walls[cur];
    const d = dist[cur];
    let prev: i32 = -1;

    if ((wmask & DIR_N) && cy > 0) {
      const nb = idx(cx, cy - 1);
      if (dist[nb] == d - 1) prev = <i32>nb;
    }
    if (prev < 0 && (wmask & DIR_E) && cx + 1 < W) {
      const nb = idx(cx + 1, cy);
      if (dist[nb] == d - 1) prev = <i32>nb;
    }
    if (prev < 0 && (wmask & DIR_S) && cy + 1 < W) {
      const nb = idx(cx, cy + 1);
      if (dist[nb] == d - 1) prev = <i32>nb;
    }
    if (prev < 0 && (wmask & DIR_W) && cx > 0) {
      const nb = idx(cx - 1, cy);
      if (dist[nb] == d - 1) prev = <i32>nb;
    }

    cur = <u32>prev;
    hash = fnv1aStep(hash, cur);
  }

  gPathHash = hash;
}

// ---- Public ABI ----
export function solve(seed: u64, size: u32): void {
  generate(size, seed);
  bfs();
}

export function getPathLength(): u32 {
  return gPathLength;
}

export function getPathHash(): u64 {
  return gPathHash;
}
