import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_AUTHOR, classifyAiChange, HOLD_LABEL, type PullRequest } from "../src/ai-change.ts";

const aiPr: PullRequest = {
  user: { login: AI_AUTHOR },
  base: { ref: "main" },
  draft: false,
  labels: [{ name: "enhancement" }],
};

const classify = (
  pr: PullRequest,
  baseFiles: readonly string[] = [],
  changedFiles: readonly string[] = ["backend/src/main.rs"],
) => classifyAiChange({ pr, defaultBranch: "main", baseFiles, changedFiles });

describe("classifyAiChange: accepted", () => {
  it("accepts a ready PR by the AI against the default branch that changes no base file", () => {
    assert.deepEqual(classify(aiPr), { aiChange: true, reasons: [] });
  });
});

describe("classifyAiChange: rejected", () => {
  const rejects = (
    pr: PullRequest,
    reason: RegExp,
    baseFiles: readonly string[] = [],
    changedFiles: readonly string[] = ["backend/src/main.rs"],
  ) => {
    const result = classify(pr, baseFiles, changedFiles);
    assert.equal(result.aiChange, false);
    assert.ok(
      result.reasons.some((r) => reason.test(r)),
      `expected a reason matching ${reason}, got ${JSON.stringify(result.reasons)}`,
    );
  };

  it("rejects a PR opened by the owner", () => {
    rejects({ ...aiPr, user: { login: "foo-543674" } }, /author is foo-543674,/);
  });

  it("rejects a Dependabot PR (it has its own class)", () => {
    rejects({ ...aiPr, user: { login: "dependabot[bot]" } }, /author is dependabot\[bot\]/);
  });

  it("rejects a PR whose author is unknown", () => {
    const { user: _, ...withoutUser } = aiPr;
    rejects(withoutUser, /author is \(unknown\)/);
  });

  it("rejects a PR against another branch", () => {
    rejects({ ...aiPr, base: { ref: "feat/x" } }, /base is feat\/x, not main/);
  });

  it("rejects a draft PR", () => {
    rejects({ ...aiPr, draft: true }, /draft/);
  });

  it("rejects a PR whose draft state is missing", () => {
    const { draft: _, ...withoutDraft } = aiPr;
    rejects(withoutDraft, /draft/);
  });

  it("rejects a PR the owner put on hold", () => {
    rejects({ ...aiPr, labels: [{ name: HOLD_LABEL }] }, /hold-merge label/);
  });

  it("rejects a PR that changes one base file", () => {
    rejects(aiPr, /changes base file Makefile/, ["Makefile"]);
  });

  it("leaves the manifests to check-dependencies", () => {
    assert.deepEqual(classify(aiPr, [], ["frontend/package.json", "backend/Cargo.toml"]), {
      aiChange: true,
      reasons: [],
    });
  });

  it("rejects a PR that adds a lint configuration the CI would pick up", () => {
    rejects(aiPr, /\.spectral\.yaml, which configures/, [], [".spectral.yaml"]);
  });

  it("lists every base file it changes", () => {
    const result = classify(aiPr, ["AGENTS.md", ".github/workflows/ci.yml"]);
    assert.equal(result.reasons.length, 2);
  });
});
