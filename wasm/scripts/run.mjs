// Ad-hoc runner: execute the demo function for each canonical input and print
// the result. Useful for eyeballing output during development.

import { loadModule, runOne } from "./load.mjs";
import { INPUTS } from "./inputs.mjs";

const exports = await loadModule();

for (const input of INPUTS) {
  const out = runOne(exports, input.seed, input.size);
  console.log(
    `seed=${input.seed.padStart(20)} size=${String(input.size).padStart(4)} ` +
      `=> pathLength=${String(out.pathLength).padStart(7)} pathHash=${out.pathHash}`
  );
}
