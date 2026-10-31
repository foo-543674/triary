import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyRound, emptyLedger, type Ledger } from "../src/ledger.ts";
import {
  buildSnapshot,
  judgeAcceptance,
  parseSnapshotComment,
  renderSnapshotComment,
  type SnapshotContext,
} from "../src/snapshot.ts";

const context: SnapshotContext = {
  repo: "foo-543674/triary",
  pr: 42,
  headSha: "head1",
  baseSha: "base1",
  mergeBase: "mb1",
  diffHash: "d1",
  contractVersion: "c1",
};

const reviewed = (diffHash = "d1"): Ledger => {
  const result = applyRound(
    emptyLedger(),
    { diffHash, scope: "push", reviewer: "code-reviewer", outputOk: true, newFindings: [], updates: [] },
    "2026-10-31T00:00:00.000Z",
  );
  assert.equal(result.ok, true);
  return result.ok ? result.value : emptyLedger();
};

const withCriticalOpen = (): Ledger => {
  const result = applyRound(
    emptyLedger(),
    {
      diffHash: "d1",
      scope: "push",
      reviewer: "code-reviewer",
      outputOk: true,
      newFindings: [
        { id: "R1", severity: "critical", paths: ["a.rs"], basis: "layer rule", evidence: "use sqlx" },
      ],
      updates: [],
    },
    "2026-10-31T00:00:00.000Z",
  );
  return result.ok ? result.value : emptyLedger();
};

const roundTrip = (ledger: Ledger, decisions: readonly string[] = []) =>
  parseSnapshotComment(renderSnapshotComment(buildSnapshot(ledger, context, decisions)));

describe("snapshot comment round trip", () => {
  it("parses what it renders", () => {
    const parsed = roundTrip(reviewed());
    assert.equal(parsed.ok, true);
  });

  it("fails on a comment without a snapshot (case 1)", () => {
    assert.equal(parseSnapshotComment("LGTM").ok, false);
  });

  it("fails on a tampered snapshot whose content hash no longer matches (case 1)", () => {
    const body = renderSnapshotComment(buildSnapshot(reviewed(), context, []));
    const tampered = body.replace('"pr": 42', '"pr": 43');
    assert.equal(parseSnapshotComment(tampered).ok, false);
  });

  it("fails on broken JSON (case 1)", () => {
    const body = renderSnapshotComment(buildSnapshot(reviewed(), context, []));
    assert.equal(parseSnapshotComment(body.replace("{", "{{")).ok, false);
  });
});

describe("judgeAcceptance", () => {
  const judge = (ledger: Ledger, expected: Partial<SnapshotContext> = {}, decisions: readonly string[] = []) => {
    const parsed = roundTrip(ledger, decisions);
    assert.equal(parsed.ok, true);
    return parsed.ok ? judgeAcceptance(parsed.value, { ...context, ...expected }) : undefined;
  };

  it("accepts a snapshot that matches the target version and satisfies the contract", () => {
    const verdict = judge(reviewed());
    assert.equal(verdict?.ok, true);
  });

  it("rejects a stale snapshot after HEAD moved (case 2)", () => {
    assert.equal(judge(reviewed(), { headSha: "head2" })?.ok, false);
  });

  it("rejects a snapshot whose reviewed diff differs from the PR diff", () => {
    assert.equal(judge(reviewed(), { diffHash: "d2" })?.ok, false);
  });

  it("rejects a snapshot made against an older contract or verifier (case 9)", () => {
    assert.equal(judge(reviewed(), { contractVersion: "c2" })?.ok, false);
  });

  it("rejects a snapshot that was taken against a different base (case 9)", () => {
    assert.equal(judge(reviewed(), { mergeBase: "mb2" })?.ok, false);
  });

  it("rejects a snapshot with an open Critical (case 4)", () => {
    const verdict = judge(withCriticalOpen());
    assert.equal(verdict?.ok, false);
    assert.match(verdict?.reasons.join("\n") ?? "", /R1/);
  });

  it("surfaces dependent decision requests so the workflow can check them (case 10)", () => {
    const verdict = judge(reviewed(), {}, ["#7"]);
    assert.deepEqual(verdict?.decisionRefs, ["#7"]);
  });
});
