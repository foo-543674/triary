// Impure shell around the review ledger (ledger.ts / snapshot.ts).
//
// Usage: node tools/review-gate/src/cli.ts <command> [options]
//
//   hash      --scope commit|push [--base origin/main]   print the diff hash the gate expects
//   show                                                 print the ledger (reviewers start here)
//   record    --file <round.json>                        reviewer only: append a review round
//   check     --scope commit|push [--base origin/main]   gate: exit 1 unless the contract is met
//   snapshot  --pr <n> [--base origin/main] [--decisions "#1,#2"]
//                                                        print the PR comment body to submit
//   accept    --snapshot-file <f> --repo <r> --pr <n> --head <sha> --base-sha <sha>
//             --merge-base <sha> --diff-hash <h> --contract-version <v>
//                                                        remote verifier: print a JSON verdict
//   range-hash --from <sha> --to <sha>                   hash an explicit diff range
//
// The rules live in docs/review-contract.md and docs/remote-acceptance.md.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  applyRound,
  emptyLedger,
  evaluate,
  type Ledger,
  parseLedger,
  parseSubmission,
  type Scope,
} from "./ledger.ts";
import { buildSnapshot, judgeAcceptance, parseSnapshotComment, renderSnapshotComment } from "./snapshot.ts";

const DEFAULT_BASE = "origin/main";
const CONTRACT_PATH = "docs/review-contract.md";
const VERIFIER_PATH = "tools/review-gate";

// Fixed flags so the hash does not depend on user git config.
const DIFF_FLAGS = [
  "-c",
  "core.quotePath=true",
  "diff",
  "--no-color",
  "--no-ext-diff",
  "--no-renames",
  "--binary",
  "--full-index",
  "--src-prefix=a/",
  "--dst-prefix=b/",
];

const git = (args: readonly string[]): string =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const mergeBaseOf = (base: string): string => git(["merge-base", base, "HEAD"]).trim();

const rangeHash = (from: string, to: string): string => sha256(git([...DIFF_FLAGS, `${from}..${to}`]));

const diffHashFor = (scope: Scope, base: string): string =>
  scope === "commit" ? sha256(git([...DIFF_FLAGS, "--cached"])) : rangeHash(mergeBaseOf(base), "HEAD");

const contractVersionAt = (ref: string): string =>
  `contract=${git(["rev-parse", `${ref}:${CONTRACT_PATH}`]).trim()};verifier=${git(["rev-parse", `${ref}:${VERIFIER_PATH}`]).trim()}`;

const ledgerPath = (): string =>
  join(resolve(git(["rev-parse", "--git-common-dir"]).trim()), "review-ledger", "ledger.json");

// A ledger that exists but cannot be read is a failure, never an empty ledger.
const loadLedger = (): Ledger => {
  const path = ledgerPath();
  if (!existsSync(path)) return emptyLedger();
  const parsed = parseLedger(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.ok) throw new Error(`ledger ${path} is corrupted:\n- ${parsed.errors.join("\n- ")}`);
  return parsed.value;
};

const saveLedger = (ledger: Ledger): void => {
  const path = ledgerPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(tmp, path);
};

const parseScope = (value: string | undefined): Scope => {
  if (value === "commit" || value === "push") return value;
  throw new Error(`--scope must be "commit" or "push" (got ${String(value)})`);
};

const required = (value: string | undefined, name: string): string => {
  if (value === undefined || value === "") throw new Error(`--${name} is required`);
  return value;
};

const NON_DETERMINISM_NOTE =
  "NOTE: review findings are LLM-based and non-deterministic; a finding that does not reappear is not resolved.";

const commands: Record<string, (values: Record<string, string | undefined>) => number> = {
  hash: (v) => {
    console.log(diffHashFor(parseScope(v.scope), v.base ?? DEFAULT_BASE));
    return 0;
  },
  show: () => {
    console.log(JSON.stringify(loadLedger(), null, 2));
    return 0;
  },
  record: (v) => {
    const parsed = parseSubmission(JSON.parse(readFileSync(required(v.file, "file"), "utf8")));
    if (!parsed.ok) {
      console.error(`review-gate: round rejected:\n- ${parsed.errors.join("\n- ")}`);
      return 1;
    }
    const submission = parsed.value;
    const current = diffHashFor(submission.scope, submission.base ?? DEFAULT_BASE);
    if (submission.diffHash !== current) {
      console.error(
        `review-gate: the round reviewed ${submission.diffHash} but the current ${submission.scope} diff is ${current}. Review the current diff.`,
      );
      return 1;
    }
    const result = applyRound(loadLedger(), submission, new Date().toISOString());
    if (!result.ok) {
      console.error(`review-gate: round rejected:\n- ${result.errors.join("\n- ")}`);
      return 1;
    }
    saveLedger(result.value);
    console.log(`review-gate: recorded ${submission.scope} round for ${submission.diffHash}`);
    return 0;
  },
  check: (v) => {
    const scope = parseScope(v.scope);
    const diffHash = diffHashFor(scope, v.base ?? DEFAULT_BASE);
    const verdict = evaluate(loadLedger(), { diffHash, scope, mode: "local" });
    verdict.awaitingDecision.forEach((a) => {
      console.error(`review-gate: ${a.id} awaits a human decision (${a.decisionRef}); acceptance will block on it.`);
    });
    if (verdict.ok) return 0;
    console.error(
      [
        `review-gate: ${scope} blocked by docs/review-contract.md.`,
        ...verdict.reasons.map((r) => `  - ${r}`),
        "Have a reviewer in a separate context review the diff following .agents/skills/code-review/SKILL.md,",
        `then retry. Do not bypass (--no-verify / core.hooksPath) or edit the ledger by hand. ${NON_DETERMINISM_NOTE}`,
      ].join("\n"),
    );
    return 1;
  },
  snapshot: (v) => {
    const base = v.base ?? DEFAULT_BASE;
    const pr = Number(required(v.pr, "pr"));
    const mergeBase = mergeBaseOf(base);
    const repo = git(["config", "--get", "remote.origin.url"])
      .trim()
      .replace(/^.*github\.com[:/]/, "")
      .replace(/\.git$/, "");
    const decisions = (v.decisions ?? "")
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d !== "");
    const snapshot = buildSnapshot(
      loadLedger(),
      {
        repo,
        pr,
        headSha: git(["rev-parse", "HEAD"]).trim(),
        baseSha: git(["rev-parse", base]).trim(),
        mergeBase,
        diffHash: rangeHash(mergeBase, "HEAD"),
        contractVersion: contractVersionAt(base),
      },
      decisions,
    );
    process.stdout.write(renderSnapshotComment(snapshot));
    return 0;
  },
  accept: (v) => {
    const parsed = parseSnapshotComment(readFileSync(required(v["snapshot-file"], "snapshot-file"), "utf8"));
    const verdict = parsed.ok
      ? judgeAcceptance(parsed.value, {
          repo: required(v.repo, "repo"),
          pr: Number(required(v.pr, "pr")),
          headSha: required(v.head, "head"),
          baseSha: required(v["base-sha"], "base-sha"),
          mergeBase: required(v["merge-base"], "merge-base"),
          diffHash: required(v["diff-hash"], "diff-hash"),
          contractVersion: required(v["contract-version"], "contract-version"),
        })
      : { ok: false, reasons: parsed.errors, decisionRefs: [] };
    console.log(JSON.stringify({ ...verdict, contentHash: parsed.ok ? parsed.value.contentHash : null }));
    return verdict.ok ? 0 : 1;
  },
  "range-hash": (v) => {
    console.log(rangeHash(required(v.from, "from"), required(v.to, "to")));
    return 0;
  },
  "contract-version": (v) => {
    console.log(contractVersionAt(v.base ?? "HEAD"));
    return 0;
  },
};

const main = (argv: readonly string[]): number => {
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
        "scope",
        "base",
        "file",
        "pr",
        "decisions",
        "snapshot-file",
        "repo",
        "head",
        "base-sha",
        "merge-base",
        "diff-hash",
        "contract-version",
        "from",
        "to",
      ].map((name) => [name, { type: "string" as const }]),
    ),
  });
  try {
    return run(values as Record<string, string | undefined>);
  } catch (error) {
    // A broken invocation is a failure, never a pass.
    console.error(`review-gate: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
};

process.exitCode = main(process.argv.slice(2));
