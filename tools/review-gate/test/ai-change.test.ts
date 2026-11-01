import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_AUTHOR,
  classifyAiChange,
  HOLD_LABEL,
  isNewScreen,
  NEEDS_UI_REVIEW_LABEL,
  OWNER,
  type PullRequest,
  UI_REVIEWED_LABEL,
} from "../src/ai-change.ts";

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
) => classifyAiChange({ pr, defaultBranch: "main", baseFiles, changedFiles, addedFiles: [] });

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

describe("classifyAiChange: UI review", () => {
  const screen = "frontend/src/routes/settings.tsx";
  const judge = (labels: readonly string[], addedFiles: readonly string[], uiReviewedBy?: string) =>
    classifyAiChange({
      pr: { ...aiPr, labels: labels.map((name) => ({ name })) },
      defaultBranch: "main",
      baseFiles: [],
      changedFiles: addedFiles,
      addedFiles,
      ...(uiReviewedBy === undefined ? {} : { uiReviewedBy }),
    });

  it("waits for the owner when the change adds a screen", () => {
    const result = judge([], [screen]);
    assert.equal(result.aiChange, false);
    assert.match(result.reasons.join(), /adds the screen frontend\/src\/routes\/settings\.tsx/);
  });

  it("waits for the owner when the AI marked a large layout change", () => {
    assert.match(judge([NEEDS_UI_REVIEW_LABEL], []).reasons.join(), /needs-ui-review/);
  });

  it("merges once the owner put ui-reviewed on it", () => {
    assert.deepEqual(judge([NEEDS_UI_REVIEW_LABEL, UI_REVIEWED_LABEL], [screen], OWNER), {
      aiChange: true,
      reasons: [],
    });
  });

  it("does not count a ui-reviewed label someone else added", () => {
    assert.equal(judge([UI_REVIEWED_LABEL], [screen], AI_AUTHOR).aiChange, false);
  });

  it("does not count who added ui-reviewed once the label is gone", () => {
    assert.equal(judge([], [screen], OWNER).aiChange, false);
  });

  it("treats only added route modules as screens", () => {
    assert.equal(isNewScreen("frontend/src/routes/history/index.tsx"), true);
    assert.equal(isNewScreen("frontend/src/routes/home.test.tsx"), false);
    assert.equal(isNewScreen("frontend/src/routes/home.stories.tsx"), false);
    assert.equal(isNewScreen("frontend/src/features/auth/components/login-form.tsx"), false);
  });

  it("does not wait when only existing screens change", () => {
    assert.deepEqual(judge([], []), { aiChange: true, reasons: [] });
  });
});
