import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyLedger, parseLedger, parseSubmission } from "../src/ledger.ts";

const validSubmission = {
  diffHash: "h1",
  scope: "commit",
  reviewer: "code-reviewer",
  outputOk: true,
  newFindings: [{ id: "R1", severity: "critical", paths: ["a.rs"], basis: "rule", evidence: "line 3" }],
  updates: [{ id: "R0", status: "resolved", resolution: "fixed" }],
};

describe("parseSubmission", () => {
  it("accepts a well-formed round", () => {
    assert.equal(parseSubmission(validSubmission).ok, true);
  });

  it("rejects a severity with the wrong case instead of downgrading it", () => {
    const bad = { ...validSubmission, newFindings: [{ ...validSubmission.newFindings[0], severity: "Critical" }] };
    assert.equal(parseSubmission(bad).ok, false);
  });

  it("rejects outputOk given as a string", () => {
    assert.equal(parseSubmission({ ...validSubmission, outputOk: "false" }).ok, false);
  });

  it("rejects an unknown status and an unknown scope", () => {
    assert.equal(parseSubmission({ ...validSubmission, updates: [{ id: "R0", status: "done" }] }).ok, false);
    assert.equal(parseSubmission({ ...validSubmission, scope: "pr" }).ok, false);
  });

  it("rejects non-objects and missing arrays", () => {
    assert.equal(parseSubmission(null).ok, false);
    assert.equal(parseSubmission({ ...validSubmission, newFindings: undefined }).ok, false);
  });
});

describe("parseLedger", () => {
  it("accepts an empty ledger", () => {
    assert.equal(parseLedger(emptyLedger()).ok, true);
  });

  it("rejects a corrupted ledger instead of treating it as empty", () => {
    assert.equal(parseLedger({ version: 1, findings: [{ id: "R1", severity: "Critical" }], rounds: [] }).ok, false);
    assert.equal(parseLedger({ version: 2, findings: [], rounds: [] }).ok, false);
    assert.equal(parseLedger({ version: 1, findings: [], rounds: [{ diffHash: "h", scope: "commit", outputOk: "yes" }] }).ok, false);
  });
});
