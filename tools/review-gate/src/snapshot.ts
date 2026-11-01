// Review ledger snapshot submitted to a PR and checked by the protected
// acceptance workflow. Rules: docs/remote-acceptance.md ("証跡の対応付け").
//
// Pure module apart from deterministic hashing.

import { createHash } from "node:crypto";
import { evaluate, type Ledger, parseLedger, type Result } from "./ledger.ts";

export const SNAPSHOT_MARKER = "<!-- triary-review-snapshot -->";

export interface SnapshotContext {
  readonly repo: string;
  readonly pr: number;
  readonly headSha: string;
  readonly baseSha: string;
  readonly mergeBase: string;
  readonly diffHash: string;
  readonly contractVersion: string;
}

export interface SnapshotBody extends SnapshotContext {
  readonly kind: "triary-review-snapshot";
  readonly version: 1;
  readonly diffRange: "merge-base..head";
  readonly decisions: readonly string[];
  readonly ledger: Ledger;
}

export interface Snapshot extends SnapshotBody {
  readonly contentHash: string;
}

export interface AcceptanceVerdict {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly decisionRefs: readonly string[];
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
};

export const hashContent = (body: SnapshotBody): string =>
  createHash("sha256").update(JSON.stringify(canonicalize(body))).digest("hex");

// The ledger is shared by every branch of the clone and keeps growing; with
// every finding it outgrew the PR comment size limit (2026-11-01: a 263,298
// character comment was refused, 251,810 had been accepted). A resolved
// finding passes in every mode (`judgeFinding` in ledger.ts), so leaving it
// out cannot change the verdict. Every other status stays, including
// rejected and deferred ones, whose reasons a reader should still see.
// Likewise only the rounds of the submitted diff count (`evaluate` filters
// rounds by diff hash). The full ledger stays in the clone (`cli.ts show`).
export const submittedLedger = (ledger: Ledger, diffHash: string): Ledger => ({
  ...ledger,
  rounds: ledger.rounds.filter((r) => r.diffHash === diffHash),
  findings: ledger.findings.filter((f) => f.status !== "resolved"),
});

export const buildSnapshot = (
  ledger: Ledger,
  context: SnapshotContext,
  decisions: readonly string[],
): Snapshot => {
  const body: SnapshotBody = {
    kind: "triary-review-snapshot",
    version: 1,
    diffRange: "merge-base..head",
    ...context,
    decisions,
    ledger: submittedLedger(ledger, context.diffHash),
  };
  return { ...body, contentHash: hashContent(body) };
};

export const renderSnapshotComment = (snapshot: Snapshot): string =>
  [
    SNAPSHOT_MARKER,
    "Review ledger snapshot (see docs/remote-acceptance.md). Do not edit by hand.",
    "",
    "```json",
    JSON.stringify(snapshot, null, 2),
    "```",
    "",
  ].join("\n");

const extractJson = (comment: string): string | undefined => {
  if (!comment.includes(SNAPSHOT_MARKER)) return undefined;
  const match = /```json\n([\s\S]*?)\n```/.exec(comment);
  return match?.[1];
};

const isSnapshotShape = (value: unknown): value is Snapshot => {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.kind === "triary-review-snapshot" &&
    v.version === 1 &&
    typeof v.contentHash === "string" &&
    typeof v.headSha === "string" &&
    typeof v.diffHash === "string" &&
    Array.isArray(v.decisions) &&
    v.ledger !== null &&
    typeof v.ledger === "object"
  );
};

export const parseSnapshotComment = (comment: string): Result<Snapshot> => {
  const json = extractJson(comment);
  if (json === undefined) return { ok: false, errors: ["no review ledger snapshot found"] };
  const parsed = ((): unknown => {
    try {
      return JSON.parse(json);
    } catch {
      return undefined;
    }
  })();
  if (!isSnapshotShape(parsed)) return { ok: false, errors: ["review ledger snapshot is broken"] };
  const ledger = parseLedger(parsed.ledger);
  if (!ledger.ok) return { ok: false, errors: ["review ledger snapshot is broken", ...ledger.errors] };
  const { contentHash, ...body } = parsed;
  return hashContent(body) === contentHash
    ? { ok: true, value: parsed }
    : { ok: false, errors: ["review ledger snapshot content hash mismatch (edited or corrupted)"] };
};

const FIELDS_TO_MATCH: readonly (keyof SnapshotContext)[] = [
  "repo",
  "pr",
  "headSha",
  "mergeBase",
  "diffHash",
  "contractVersion",
];

export const judgeAcceptance = (snapshot: Snapshot, expected: SnapshotContext): AcceptanceVerdict => {
  const mismatches = FIELDS_TO_MATCH.filter((field) => snapshot[field] !== expected[field]).map(
    (field) => `snapshot ${field} is ${String(snapshot[field])}, expected ${String(expected[field])}`,
  );
  const ledgerVerdict = evaluate(snapshot.ledger, {
    diffHash: expected.diffHash,
    scope: "push",
    mode: "acceptance",
  });
  const decisionRefs = [
    ...new Set([...snapshot.decisions, ...ledgerVerdict.awaitingDecision.map((a) => a.decisionRef)]),
  ];
  const reasons = [...mismatches, ...ledgerVerdict.reasons];
  return { ok: reasons.length === 0, reasons, decisionRefs };
};
