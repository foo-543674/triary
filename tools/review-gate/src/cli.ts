// The remote verifier's classification steps (acceptance.sh, run by the
// protected .github/workflows/acceptance.yml). The review ledger, its verdict
// and the PR snapshot are not here: they live in gate.sh, which needs only git
// and a POSIX shell, so the git hooks, the reviewer and this verifier share
// one implementation (.contexts/bootstrap-decisions.md "2026-11-01 再実行 (3.1.0)").
//
// Usage (in CI): node tools/review-gate/src/cli.ts <command> [options]
//
//   classify-dependency --pr-author <login> --head <sha> --compare-file <f>
//                                                        remote verifier: is this a Dependabot
//                                                        dependency update (#43)? prints JSON
//   classify-ai-change --pr-file <f> --default-branch <b> --changed-file <f> --added-file <f>
//             [--base-files "a,b"] [--ui-reviewed-by <login>]
//                                                        remote verifier: is this an AI change
//                                                        that merges without a human? prints JSON
//   check-dependencies --from <sha> --to <sha>           remote verifier: manifest parts touched and
//                                                        release age of new package versions
//                                                        (reads crates.io / npm); prints JSON
//
// The rules live in docs/review-contract.md and docs/remote-acceptance.md.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { classifyAiChange, type PullRequest } from "./ai-change.ts";
import { classifyDependencyUpdate, type CompareResponse } from "./dependency.ts";
import { CARGO_TOML, cargoTomlFindings, PACKAGE_JSON, packageJsonFindings } from "./manifest.ts";
import {
  addedVersions,
  fetchPublishedAt,
  MAX_CHECKED_VERSIONS,
  newPackageNames,
  parseCargoLock,
  parsePnpmLock,
  releaseAgeProblems,
} from "./release-age.ts";
const required = (value: string | undefined, name: string): string => {
  if (value === undefined || value === "") throw new Error(`--${name} is required`);
  return value;
};

// File content at a revision, or undefined when the file does not exist there.
const fileAt = (rev: string, path: string): string | undefined => {
  try {
    return execFileSync("git", ["show", `${rev}:${path}`], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
};

const checkDependencies = async (from: string, to: string): Promise<number> => {
  const npm = packageJsonFindings(fileAt(from, PACKAGE_JSON), fileAt(to, PACKAGE_JSON));
  const cargo = cargoTomlFindings(fileAt(from, CARGO_TOML), fileAt(to, CARGO_TOML));
  const lockAt = (rev: string, path: string, parse: typeof parseCargoLock) => parse(fileAt(rev, path) ?? "");
  const cargoBase = lockAt(from, "backend/Cargo.lock", parseCargoLock);
  const cargoHead = lockAt(to, "backend/Cargo.lock", parseCargoLock);
  const npmBase = lockAt(from, "frontend/pnpm-lock.yaml", parsePnpmLock);
  const npmHead = lockAt(to, "frontend/pnpm-lock.yaml", parsePnpmLock);
  const changes = [...addedVersions(cargoBase, cargoHead), ...addedVersions(npmBase, npmHead)];
  // A changed lockfile the parser reads nothing from (a new format) must not
  // pass as "nothing new": fail closed.
  const unreadable = [
    ["backend/Cargo.lock", cargoHead] as const,
    ["frontend/pnpm-lock.yaml", npmHead] as const,
  ].flatMap(([path, parsed]) => {
    const [before, after] = [fileAt(from, path), fileAt(to, path)];
    return before !== after && after !== undefined && parsed.length === 0 ? [`cannot read any package from ${path}`] : [];
  });
  // New npm packages anywhere in the lockfile, not only the ones package.json
  // names: a new transitive package or an alias (`"a": "npm:b@1"`) brings its
  // own install scripts too (R106).
  const newNpm = [...new Set([...npm.newNpmPackages, ...newPackageNames(npmBase, npmHead, "npm")])].sort();
  const publishedAt = await fetchPublishedAt(changes.length > MAX_CHECKED_VERSIONS ? [] : changes);
  const reasons = [
    ...unreadable,
    ...npm.problems,
    ...cargo.problems,
    // npm has no install-script guardrail yet (docs/dependency-policy.md).
    ...newNpm.map((name) => `adds the npm package ${name}`),
    ...releaseAgeProblems(changes, publishedAt, new Date()),
  ];
  console.log(JSON.stringify({ ok: reasons.length === 0, reasons, checkedVersions: changes.length }));
  return 0;
};

const commands: Record<string, (values: Record<string, string | undefined>) => number | Promise<number>> = {
  "check-dependencies": (v) => checkDependencies(required(v.from, "from"), required(v.to, "to")),
  "classify-dependency": (v) => {
    const compare = JSON.parse(readFileSync(required(v["compare-file"], "compare-file"), "utf8")) as CompareResponse;
    const result = classifyDependencyUpdate({
      prAuthor: required(v["pr-author"], "pr-author"),
      headSha: required(v.head, "head"),
      compare,
    });
    console.log(JSON.stringify(result));
    return 0;
  },
  "classify-ai-change": (v) => {
    const pr = JSON.parse(readFileSync(required(v["pr-file"], "pr-file"), "utf8")) as PullRequest;
    const result = classifyAiChange({
      pr,
      defaultBranch: required(v["default-branch"], "default-branch"),
      baseFiles: (v["base-files"] ?? "").split(",").filter((f) => f !== ""),
      changedFiles: readFileSync(required(v["changed-file"], "changed-file"), "utf8")
        .split("\n")
        .filter((f) => f !== ""),
      addedFiles: readFileSync(required(v["added-file"], "added-file"), "utf8")
        .split("\n")
        .filter((f) => f !== ""),
      ...(v["ui-reviewed-by"] ? { uiReviewedBy: v["ui-reviewed-by"] } : {}),
    });
    console.log(JSON.stringify(result));
    return 0;
  },
};

const main = async (argv: readonly string[]): Promise<number> => {
  const [command, ...rest] = argv;
  const run = command === undefined ? undefined : commands[command];
  if (run === undefined) {
    console.error(`usage: cli.ts <${Object.keys(commands).join("|")}> [options]`);
    return 2;
  }
  const { values } = parseArgs({
    args: [...rest],
    strict: true,
    options: Object.fromEntries(
      [
        "head",
        "from",
        "to",
        "pr-author",
        "compare-file",
        "pr-file",
        "default-branch",
        "base-files",
        "changed-file",
        "added-file",
        "ui-reviewed-by",
      ].map((name) => [name, { type: "string" as const }]),
    ),
  });
  try {
    return await run(values as Record<string, string | undefined>);
  } catch (error) {
    // A broken invocation is a failure, never a pass.
    console.error(`review-gate: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
};

process.exitCode = await main(process.argv.slice(2));
