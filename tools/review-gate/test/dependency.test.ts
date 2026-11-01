import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type CompareCommit,
  type CompareFile,
  type CompareResponse,
  classifyDependencyUpdate,
  DEPENDENCY_BOT,
} from "../src/dependency.ts";

const HEAD = "c".repeat(40);

const botCommit = (sha: string, overrides: Partial<CompareCommit> = {}): CompareCommit => ({
  sha,
  author: { login: DEPENDENCY_BOT },
  committer: { login: "web-flow" },
  commit: { verification: { verified: true } },
  ...overrides,
});

const compare = (files: readonly CompareFile[], commits: readonly CompareCommit[]): CompareResponse => ({
  total_commits: commits.length,
  files,
  commits,
});

const lockfileUpdate = compare(
  [{ filename: "backend/Cargo.toml" }, { filename: "backend/Cargo.lock" }],
  [botCommit(HEAD)],
);

const classify = (prAuthor: string, response: CompareResponse) =>
  classifyDependencyUpdate({ prAuthor, headSha: HEAD, compare: response });

describe("classifyDependencyUpdate: accepted", () => {
  it("accepts a Dependabot PR that only changes manifests and lockfiles", () => {
    assert.deepEqual(classify(DEPENDENCY_BOT, lockfileUpdate), {
      dependencyUpdate: true,
      dependabotAuthored: true,
      reasons: [],
    });
  });

  it("accepts several Dependabot commits (a rebased update)", () => {
    const result = classify(
      DEPENDENCY_BOT,
      compare([{ filename: "frontend/pnpm-lock.yaml" }], [botCommit("a".repeat(40)), botCommit(HEAD)]),
    );
    assert.equal(result.dependencyUpdate, true);
  });
});

describe("classifyDependencyUpdate: rejected", () => {
  const rejects = (response: CompareResponse, reason: RegExp, prAuthor = DEPENDENCY_BOT) => {
    const result = classify(prAuthor, response);
    assert.equal(result.dependencyUpdate, false);
    // A reason about the files alone leaves the PR Dependabot's own; any
    // other reason means it is not.
    assert.equal(result.dependabotAuthored, result.reasons.every((r) => r.startsWith("changes ")));
    assert.ok(
      result.reasons.some((r) => reason.test(r)),
      `expected a reason matching ${reason}, got ${JSON.stringify(result.reasons)}`,
    );
  };

  it("rejects a PR opened by someone other than Dependabot", () => {
    rejects(lockfileUpdate, /author is foo-543674-ai-agent\[bot\]/, "foo-543674-ai-agent[bot]");
  });

  it("rejects one file outside the allowed set", () => {
    rejects(
      compare([{ filename: "backend/Cargo.lock" }, { filename: "backend/src/main.rs" }], [botCommit(HEAD)]),
      /changes backend\/src\/main\.rs/,
    );
  });

  it("rejects a workflow change (GitHub Actions updates still need approval)", () => {
    rejects(compare([{ filename: ".github/workflows/ci.yml" }], [botCommit(HEAD)]), /changes \.github/);
  });

  it("still marks a GitHub Actions update as Dependabot's own (no snapshot needed)", () => {
    const result = classify(DEPENDENCY_BOT, compare([{ filename: ".github/workflows/ci.yml" }], [botCommit(HEAD)]));
    assert.equal(result.dependencyUpdate, false);
    assert.equal(result.dependabotAuthored, true);
  });

  it("rejects a rename whose old path is outside the allowed set", () => {
    rejects(
      compare([{ filename: "backend/Cargo.lock", previous_filename: "backend/build.rs" }], [botCommit(HEAD)]),
      /changes backend\/build\.rs/,
    );
  });

  it("rejects a PR with no changed files", () => {
    rejects(compare([], [botCommit(HEAD)]), /no changed files/);
  });

  it("rejects a commit pushed by someone else onto a Dependabot branch", () => {
    rejects(
      compare([{ filename: "backend/Cargo.lock" }], [botCommit("a".repeat(40)), botCommit(HEAD, { author: { login: "someone" } })]),
      /not authored by dependabot/,
    );
  });

  it("rejects a commit with Dependabot as author but another committer (R51)", () => {
    rejects(
      compare([{ filename: "backend/Cargo.lock" }], [botCommit(HEAD, { committer: { login: "someone" } })]),
      /not committed by web-flow/,
    );
  });

  it("rejects an unsigned Dependabot commit", () => {
    rejects(
      compare([{ filename: "backend/Cargo.lock" }], [botCommit(HEAD, { commit: { verification: { verified: false } } })]),
      /no verified signature/,
    );
  });

  it("rejects a commit with no GitHub user attached", () => {
    rejects(compare([{ filename: "backend/Cargo.lock" }], [botCommit(HEAD, { author: null })]), /not authored/);
  });

  it("rejects a range that does not end at the judged head (R52)", () => {
    rejects(compare([{ filename: "backend/Cargo.lock" }], [botCommit("a".repeat(40))]), /does not end at the judged head/);
  });

  it("rejects a compare response that does not list every commit", () => {
    rejects({ ...lockfileUpdate, total_commits: 2 }, /does not list every commit/);
  });

  it("rejects a response with no commits", () => {
    rejects(compare([{ filename: "backend/Cargo.lock" }], []), /no commits/);
  });

  it("rejects a response at the file limit, which may be truncated", () => {
    const files = Array.from({ length: 300 }, () => ({ filename: "backend/Cargo.lock" }));
    rejects(compare(files, [botCommit(HEAD)]), /too many changed files/);
  });

  it("rejects an empty response (API failure output)", () => {
    rejects({}, /no changed files/);
  });
});
