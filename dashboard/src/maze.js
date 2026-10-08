// Same integer maze as wasm/assembly/index.ts. BigInt stays inside 64 bits
// so the path matches the nodes byte for byte.

const MASK = (1n << 64n) - 1n;
const DIR_N = 1;
const DIR_E = 2;
const DIR_S = 4;
const DIR_W = 8;

function mul(left, right) {
  return (left * right) & MASK;
}

function rngNext(state) {
  let next = (state + 0x9e3779b97f4a7c15n) & MASK;
  let z = next;
  z = mul(z ^ (z >> 30n), 0xbf58476d1ce4e5b9n);
  z = mul(z ^ (z >> 27n), 0x94d049bb133111ebn);
  return { state: next, value: z ^ (z >> 31n) };
}

function fnv1aStep(hash, value) {
  const prime = 0x100000001b3n;
  let current = BigInt(value);
  for (let byte = 0; byte < 4; byte += 1) {
    hash = mul(hash ^ ((current >> BigInt(byte * 8)) & 0xffn), prime);
  }
  return hash;
}

export function solveMaze(seed, size) {
  const width = size;
  const cells = width * width;
  const walls = new Uint8Array(cells);
  const visited = new Uint8Array(cells);
  const stack = new Int32Array(cells);
  const dirs = new Uint32Array(4);
  let rng = BigInt(seed) & MASK;
  let top = 0;

  visited[0] = 1;
  stack[top] = 0;
  top += 1;

  while (top > 0) {
    const current = stack[top - 1];
    const x = current % width;
    const y = Math.floor(current / width);
    let count = 0;
    if (y > 0 && !visited[(y - 1) * width + x]) dirs[count++] = 0;
    if (x + 1 < width && !visited[y * width + x + 1]) dirs[count++] = 1;
    if (y + 1 < width && !visited[(y + 1) * width + x]) dirs[count++] = 2;
    if (x > 0 && !visited[y * width + x - 1]) dirs[count++] = 3;

    if (count === 0) {
      top -= 1;
      continue;
    }

    const rolled = rngNext(rng);
    rng = rolled.state;
    const pick = dirs[Number(rolled.value % BigInt(count))];
    let nextX = x;
    let nextY = y;
    if (pick === 0) {
      nextY = y - 1;
      walls[current] |= DIR_N;
      walls[nextY * width + nextX] |= DIR_S;
    } else if (pick === 1) {
      nextX = x + 1;
      walls[current] |= DIR_E;
      walls[nextY * width + nextX] |= DIR_W;
    } else if (pick === 2) {
      nextY = y + 1;
      walls[current] |= DIR_S;
      walls[nextY * width + nextX] |= DIR_N;
    } else {
      nextX = x - 1;
      walls[current] |= DIR_W;
      walls[nextY * width + nextX] |= DIR_E;
    }
    const next = nextY * width + nextX;
    visited[next] = 1;
    stack[top] = next;
    top += 1;
  }

  const dist = new Int32Array(cells);
  dist.fill(-1);
  const queue = new Int32Array(cells);
  let head = 0;
  let tail = 0;
  dist[0] = 0;
  queue[tail] = 0;
  tail += 1;
  const goal = cells - 1;

  while (head < tail) {
    const current = queue[head];
    head += 1;
    if (current === goal) break;
    const x = current % width;
    const y = Math.floor(current / width);
    const open = walls[current];
    const step = dist[current];
    if (open & DIR_N && y > 0) {
      const next = (y - 1) * width + x;
      if (dist[next] < 0) {
        dist[next] = step + 1;
        queue[tail] = next;
        tail += 1;
      }
    }
    if (open & DIR_E && x + 1 < width) {
      const next = y * width + x + 1;
      if (dist[next] < 0) {
        dist[next] = step + 1;
        queue[tail] = next;
        tail += 1;
      }
    }
    if (open & DIR_S && y + 1 < width) {
      const next = (y + 1) * width + x;
      if (dist[next] < 0) {
        dist[next] = step + 1;
        queue[tail] = next;
        tail += 1;
      }
    }
    if (open & DIR_W && x > 0) {
      const next = y * width + x - 1;
      if (dist[next] < 0) {
        dist[next] = step + 1;
        queue[tail] = next;
        tail += 1;
      }
    }
  }

  const length = dist[goal];
  const path = new Uint32Array(length + 1);
  let hash = 0xcbf29ce484222325n;
  let current = goal;
  let index = length;
  path[index] = current;
  hash = fnv1aStep(hash, current);

  while (current !== 0) {
    const x = current % width;
    const y = Math.floor(current / width);
    const open = walls[current];
    const step = dist[current];
    let previous = -1;
    if (open & DIR_N && y > 0 && dist[(y - 1) * width + x] === step - 1) previous = (y - 1) * width + x;
    else if (open & DIR_E && x + 1 < width && dist[y * width + x + 1] === step - 1) previous = y * width + x + 1;
    else if (open & DIR_S && y + 1 < width && dist[(y + 1) * width + x] === step - 1) previous = (y + 1) * width + x;
    else if (open & DIR_W && x > 0 && dist[y * width + x - 1] === step - 1) previous = y * width + x - 1;
    current = previous;
    index -= 1;
    path[index] = current;
    hash = fnv1aStep(hash, current);
  }

  return { length, hash, path, walls };
}
