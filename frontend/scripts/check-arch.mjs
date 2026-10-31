// Architecture test runner (pnpm run arch:test).
//
// dependency-cruiser silently analyses nothing when it cannot load a
// compatible TypeScript compiler: it then reports "no dependency violations
// found (0 modules, 0 dependencies cruised)" and exits 0. That happened on
// main with dependency-cruiser 16 + TypeScript 6 (observed in CI run
// 41178351899 on 2026-10-31) and with TypeScript 7 (issue #44), so the
// architecture rules were not checked at all. This runner reports the rule
// violations as usual and fails when nothing was analysed.

import { spawnSync } from "node:child_process";

const DEPCRUISE = new URL("../node_modules/.bin/depcruise", import.meta.url).pathname;

const run = (args) =>
  spawnSync(DEPCRUISE, ["--config", ".dependency-cruiser.cjs", ...args, "src"], { encoding: "utf8" });

const report = run([]);
process.stdout.write(report.stdout ?? "");
process.stderr.write(report.stderr ?? "");
if (report.error !== undefined) {
  console.error(`arch:test: could not run dependency-cruiser: ${report.error.message}`);
  process.exit(1);
}
if (report.status !== 0) {
  process.exit(report.status ?? 1);
}

const json = run(["--output-type", "json"]);
const summary = (() => {
  try {
    return JSON.parse(json.stdout).summary;
  } catch {
    return undefined;
  }
})();

// DO NOT REMOVE OR WEAKEN: "0 modules cruised" means the rules were not
// checked, which must fail rather than pass.
if (summary === undefined || summary.totalCruised === 0) {
  console.error(
    "arch:test: dependency-cruiser analysed 0 modules; the architecture rules were not checked. " +
      "Check that the installed TypeScript version is supported by dependency-cruiser.",
  );
  process.exit(1);
}
console.log(`arch:test: ${summary.totalCruised} modules analysed.`);
