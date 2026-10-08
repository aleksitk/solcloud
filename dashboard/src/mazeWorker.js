import { solveMaze } from "./maze.js";

self.onmessage = (event) => {
  const { seed, size } = event.data;
  const result = solveMaze(BigInt(seed), size);
  self.postMessage(
    {
      length: result.length,
      hash: result.hash.toString(16).padStart(16, "0"),
      path: result.path,
      walls: result.walls,
    },
    [result.path.buffer, result.walls.buffer]
  );
};
