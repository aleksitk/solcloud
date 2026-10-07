// The canonical set of demo inputs used for test vectors and quick runs.
// Keep this small and stable so vectors stay reproducible.

export const INPUTS = [
  { seed: "1", size: 512 },
  { seed: "2", size: 512 },
  { seed: "3", size: 512 },
  { seed: "42", size: 512 },
  { seed: "1337", size: 512 },
  { seed: "123456789", size: 256 },
  { seed: "987654321", size: 128 },
  { seed: "18446744073709551615", size: 64 },
];
