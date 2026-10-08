// Shown in the function editor. Integer-only, same alloc/run shape as the maze.
export const STARTER = `// Add one to a little-endian u32. Input and output are 4 bytes.
const inputBuf = new StaticArray<u8>(64);
const outputBuf = new StaticArray<u8>(64);

export function alloc(size: u32): usize {
  if (size == 0 || size > 64) return 0;
  return changetype<usize>(inputBuf);
}

export function run(inputPtr: usize, inputLen: u32): u64 {
  if (inputLen != 4) return 0;
  const value = load<u32>(inputPtr);
  const out = changetype<usize>(outputBuf);
  store<u32>(out, value + 1);
  return (u64(4) << 32) | u64(out);
}
`;
