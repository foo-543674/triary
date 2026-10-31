import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRound,
  emptyLedger,
  evaluate,
  type Ledger,
  type RoundSubmission,
} from "../src/ledger.ts";

const NOW = "2026-10-31T00:00:00.000Z";

const submission = (overrides: Partial<RoundSubmission> = {}): RoundSubmission => ({
  diffHash: "h1",
  scope: "commit",
  reviewer: "code-reviewer",
  outputOk: true,
  newFindings: [],
  updates: [],
  ...overrides,
});

const mustApply = (ledger: Ledger, s: RoundSubmission): Ledger => {
  const result = applyRound(ledger, s, NOW);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("\n"));
  return result.ok ? result.value : ledger;
};

const critical = (id: string) => ({
  id,
  severity: "critical" as const,
  paths: ["backend/src/domain/x.rs"],
  basis: "AGENTS.md layer rules: domain must not import sqlx",
  evidence: "use sqlx::Row; at line 3",
});

const important = (id: string) => ({ ...critical(id), severity: "important" as const });

describe("evaluate: review presence", () => {
  it("blocks when no round was recorded for the current diff", () => {
    const verdict = evaluate(emptyLedger(), { diffHash: "h1", scope: "commit", mode: "local" });
    assert.equal(verdict.ok, false);
    assert.match(verdict.reasons.join("\n"), /no review recorded/);
  });

  it("blocks when the only round for the diff produced no usable output (case 5)", () => {
    const ledger = mustApply(emptyLedger(), submission({ outputOk: false }));
    const verdict = evaluate(ledger, { diffHash: "h1", scope: "commit", mode: "local" });
    assert.equal(verdict.ok, false);
    assert.match(verdict.reasons.join("\n"), /output missing or broken/);
  });

  it("blocks when the recorded round reviewed a different diff", () => {
    const ledger = mustApply(emptyLedger(), submission({ diffHash: "old" }));
    const verdict = evaluate(ledger, { diffHash: "h1", scope: "commit", mode: "local" });
    assert.equal(verdict.ok, false);
  });

  it("does not accept a commit-scope round for a push-scope check", () => {
    const ledger = mustApply(emptyLedger(), submission({ scope: "commit" }));
    const verdict = evaluate(ledger, { diffHash: "h1", scope: "push", mode: "local" });
    assert.equal(verdict.ok, false);
  });

  it("passes when the diff was reviewed and no finding is pending", () => {
    const ledger = mustApply(emptyLedger(), submission());
    assert.equal(evaluate(ledger, { diffHash: "h1", scope: "commit", mode: "local" }).ok, true);
  });
});

describe("evaluate: completion by ledger state", () => {
  it("keeps blocking when an earlier Critical simply does not reappear (case 1)", () => {
    const first = mustApply(emptyLedger(), submission({ newFindings: [critical("R1")] }));
    const second = mustApply(first, submission({ diffHash: "h2" }));
    const verdict = evaluate(second, { diffHash: "h2", scope: "commit", mode: "local" });
    assert.equal(verdict.ok, false);
    assert.match(verdict.reasons.join("\n"), /R1/);
  });

  it("blocks a Critical that is fixed but not yet verified by the reviewer", () => {
    const first = mustApply(emptyLedger(), submission({ newFindings: [critical("R1")] }));
    const second = mustApply(
      first,
      submission({
        diffHash: "h2",
        updates: [{ id: "R1", status: "fixed_unverified", resolution: "removed import" }],
      }),
    );
    assert.equal(evaluate(second, { diffHash: "h2", scope: "commit", mode: "local" }).ok, false);
  });

  it("passes once the reviewer confirms the Critical is resolved", () => {
    const first = mustApply(emptyLedger(), submission({ newFindings: [critical("R1")] }));
    const second = mustApply(
      first,
      submission({
        diffHash: "h2",
        updates: [{ id: "R1", status: "resolved", resolution: "import removed; arch test passes" }],
      }),
    );
    assert.equal(evaluate(second, { diffHash: "h2", scope: "commit", mode: "local" }).ok, true);
  });

  it("does not block an Important rejected with evidence (case 2)", () => {
    const ledger = mustApply(
      emptyLedger(),
      submission({ newFindings: [important("R2")] }),
    );
    const rejected = mustApply(
      ledger,
      submission({
        diffHash: "h2",
        updates: [{ id: "R2", status: "rejected", resolution: "spec §3 allows this; see test x" }],
      }),
    );
    assert.equal(evaluate(rejected, { diffHash: "h2", scope: "commit", mode: "local" }).ok, true);
  });

  it("blocks again when a resolved Critical is reopened with new evidence (case 3)", () => {
    const first = mustApply(emptyLedger(), submission({ newFindings: [critical("R1")] }));
    const resolved = mustApply(
      first,
      submission({ diffHash: "h2", updates: [{ id: "R1", status: "resolved", resolution: "fixed" }] }),
    );
    const reopened = mustApply(
      resolved,
      submission({
        diffHash: "h3",
        updates: [{ id: "R1", status: "open", evidence: "regressed in fix for R4" }],
      }),
    );
    assert.equal(evaluate(reopened, { diffHash: "h3", scope: "commit", mode: "local" }).ok, false);
  });

  it("treats Minor findings as optional", () => {
    const ledger = mustApply(
      emptyLedger(),
      submission({ newFindings: [{ ...critical("R3"), severity: "minor" }] }),
    );
    assert.equal(evaluate(ledger, { diffHash: "h1", scope: "commit", mode: "local" }).ok, true);
  });
});

describe("evaluate: escalation (case 4)", () => {
  const escalated = (decisionRef?: string) =>
    mustApply(
      mustApply(emptyLedger(), submission({ newFindings: [critical("R1")] })),
      submission({
        diffHash: "h2",
        updates: [
          {
            id: "R1",
            status: "escalated",
            resolution: "intent conflict between spec §2 and api-design §4",
            ...(decisionRef === undefined ? {} : { decisionRef }),
          },
        ],
      }),
    );

  it("lets local commit/push continue when a decision request is filed", () => {
    const verdict = evaluate(escalated("#123"), { diffHash: "h2", scope: "commit", mode: "local" });
    assert.equal(verdict.ok, true);
    assert.deepEqual(verdict.awaitingDecision, [{ id: "R1", decisionRef: "#123" }]);
  });

  it("blocks local commit/push when no decision request is referenced", () => {
    const verdict = evaluate(escalated(), { diffHash: "h2", scope: "commit", mode: "local" });
    assert.equal(verdict.ok, false);
  });

  it("blocks acceptance until the decision is made", () => {
    const verdict = evaluate(escalated("#123"), { diffHash: "h2", scope: "commit", mode: "acceptance" });
    assert.equal(verdict.ok, false);
    assert.deepEqual(verdict.awaitingDecision, [{ id: "R1", decisionRef: "#123" }]);
  });
});

describe("applyRound: ledger integrity", () => {
  it("rejects deferring a Critical", () => {
    const ledger = mustApply(emptyLedger(), submission({ newFindings: [critical("R1")] }));
    const result = applyRound(
      ledger,
      submission({ diffHash: "h2", updates: [{ id: "R1", status: "deferred", resolution: "later" }] }),
      NOW,
    );
    assert.equal(result.ok, false);
  });

  it("rejects a disposition without a recorded reason", () => {
    const ledger = mustApply(emptyLedger(), submission({ newFindings: [important("R2")] }));
    const result = applyRound(
      ledger,
      submission({ diffHash: "h2", updates: [{ id: "R2", status: "rejected" }] }),
      NOW,
    );
    assert.equal(result.ok, false);
  });

  it("rejects updates to unknown findings and duplicate new IDs", () => {
    const unknown = applyRound(
      emptyLedger(),
      submission({ updates: [{ id: "nope", status: "resolved", resolution: "x" }] }),
      NOW,
    );
    assert.equal(unknown.ok, false);
    const ledger = mustApply(emptyLedger(), submission({ newFindings: [critical("R1")] }));
    const duplicate = applyRound(ledger, submission({ newFindings: [critical("R1")] }), NOW);
    assert.equal(duplicate.ok, false);
  });

  it("keeps the history of every state change", () => {
    const first = mustApply(emptyLedger(), submission({ newFindings: [critical("R1")] }));
    const second = mustApply(
      first,
      submission({ diffHash: "h2", updates: [{ id: "R1", status: "resolved", resolution: "fixed" }] }),
    );
    const finding = second.findings.find((f) => f.id === "R1");
    assert.deepEqual(
      finding?.history.map((h) => h.status),
      ["open", "resolved"],
    );
  });

  it("does not mutate the input ledger", () => {
    const ledger = emptyLedger();
    mustApply(ledger, submission({ newFindings: [critical("R1")] }));
    assert.equal(ledger.findings.length, 0);
    assert.equal(ledger.rounds.length, 0);
  });
});
