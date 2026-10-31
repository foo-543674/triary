// Regression cases for the Claude Code PreToolUse hook
// (.claude/hooks/review-gate.sh): bypass attempts must be blocked (exit 2)
// and unrelated commands, or text that merely mentions git, must pass.
// Cases live in hook-cases.jsonl so that writing them never trips the hook.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const hook = join(repoRoot, ".claude/hooks/review-gate.sh");

// Run the hook against a fresh repository with hooks enabled and an empty
// ledger, so "detected as commit/push" always ends in a blocking check and
// the result does not depend on the state of the working repository.
const sandbox = (() => {
  const dir = mkdtempSync(join(tmpdir(), "review-gate-hook-"));
  const git = (...args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "core.hooksPath", ".githooks");
  symlinkSync(join(repoRoot, "tools"), join(dir, "tools"));
  return dir;
})();

interface HookCase {
  readonly expect: 0 | 2;
  readonly command: string;
}

const cases: readonly HookCase[] = readFileSync(join(here, "hook-cases.jsonl"), "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as HookCase);

describe("PreToolUse review-gate hook", () => {
  cases.forEach(({ expect, command }) => {
    it(`${expect === 2 ? "blocks" : "allows"}: ${command.split("\n")[0]}`, () => {
      const result = spawnSync("bash", [hook], {
        input: JSON.stringify({ tool_input: { command } }),
        cwd: sandbox,
        env: { ...process.env, CLAUDE_PROJECT_DIR: sandbox },
        encoding: "utf8",
      });
      assert.equal(result.status, expect, result.stderr);
    });
  });
});

const protectHook = join(repoRoot, ".claude/hooks/protect-git-dir.sh");

describe("PreToolUse protect-git-dir hook", () => {
  const run = (filePath: string) =>
    spawnSync("bash", [protectHook], {
      input: JSON.stringify({ tool_input: { file_path: filePath } }),
      encoding: "utf8",
    }).status;

  it("blocks writes to the git config", () => {
    assert.equal(run(join(repoRoot, ".git/config")), 2);
  });

  it("blocks writes to the review ledger", () => {
    assert.equal(run(join(repoRoot, ".git/review-ledger/ledger.json")), 2);
  });

  it("blocks climbing from the round file path to the ledger with '..'", () => {
    assert.equal(run(join(repoRoot, ".git/review-ledger/round") + "/../ledger.json"), 2);
  });

  it("blocks a round-like file in a subdirectory of the ledger directory", () => {
    assert.equal(run(join(repoRoot, ".git/review-ledger/round/x.json")), 2);
  });

  it("blocks '..' segments anywhere in the path", () => {
    assert.equal(run(join(repoRoot, "frontend") + "/../AGENTS.md"), 2);
  });

  it("allows the reviewer's round file, which record validates", () => {
    assert.equal(run(join(repoRoot, ".git/review-ledger/round.json")), 0);
  });

  it("allows ordinary project files", () => {
    assert.equal(run(join(repoRoot, "AGENTS.md")), 0);
  });
});
