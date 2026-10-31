// Review ledger: the pure core of the review gate.
//
// The rules implemented here are defined in docs/review-contract.md
// ("完了の判定" / "作業の継続と受け入れ"). This module only encodes them; when
// the contract changes, change the contract first and then this file.
//
// Everything in this module is pure: no I/O, no clock, no git. The CLI
// (cli.ts) is the impure shell that feeds it.

export type Severity = "critical" | "important" | "minor";

export type Status =
  | "open"
  | "fixed_unverified"
  | "resolved"
  | "rejected"
  | "deferred"
  | "escalated";

export type Scope = "commit" | "push";

export type OriginKind = "pre_existing" | "caused_by_fix" | "unknown";
export type Confidence = "confirmed" | "inferred" | "unknown";

export interface Origin {
  readonly kind: OriginKind;
  readonly confidence: Confidence;
  readonly causedBy?: string;
}

export interface HistoryEntry {
  readonly at: string;
  readonly diffHash: string;
  readonly status: Status;
  readonly note?: string | undefined;
}

export interface Finding {
  readonly id: string;
  readonly severity: Severity;
  readonly paths: readonly string[];
  readonly reviewedDiffHash: string;
  readonly basis: string;
  readonly evidence: string;
  readonly status: Status;
  readonly resolution?: string | undefined;
  readonly decisionRef?: string | undefined;
  readonly origin: Origin;
  readonly history: readonly HistoryEntry[];
}

export interface Round {
  readonly diffHash: string;
  readonly scope: Scope;
  readonly base?: string;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly outputOk: boolean;
}

export interface Ledger {
  readonly version: 1;
  readonly findings: readonly Finding[];
  readonly rounds: readonly Round[];
}

export interface NewFinding {
  readonly id: string;
  readonly severity: Severity;
  readonly paths: readonly string[];
  readonly basis: string;
  readonly evidence: string;
  readonly origin?: Origin;
}

export interface FindingUpdate {
  readonly id: string;
  readonly status: Status;
  readonly resolution?: string;
  readonly evidence?: string;
  readonly decisionRef?: string;
  readonly severity?: Severity;
}

export interface RoundSubmission {
  readonly diffHash: string;
  readonly scope: Scope;
  readonly base?: string;
  readonly reviewer: string;
  readonly outputOk: boolean;
  readonly newFindings: readonly NewFinding[];
  readonly updates: readonly FindingUpdate[];
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export type Mode = "local" | "acceptance";

export interface EvaluateInput {
  readonly diffHash: string;
  readonly scope: Scope;
  readonly mode: Mode;
}

export interface AwaitingDecision {
  readonly id: string;
  readonly decisionRef: string;
}

export interface Verdict {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly awaitingDecision: readonly AwaitingDecision[];
}

const DISPOSITIONS_NEEDING_REASON: readonly Status[] = [
  "fixed_unverified",
  "resolved",
  "rejected",
  "deferred",
  "escalated",
];

export const emptyLedger = (): Ledger => ({ version: 1, findings: [], rounds: [] });

// ---- runtime validation at the JSON boundary ---------------------------------
// Reviewer output and the ledger file come from outside the type system. A
// malformed value must be rejected, never coerced (e.g. "Critical" silently
// becoming a non-critical finding, or outputOk: "false" being truthy).

const SEVERITIES: readonly string[] = ["critical", "important", "minor"];
const STATUSES: readonly string[] = ["open", "fixed_unverified", "resolved", "rejected", "deferred", "escalated"];
const SCOPES: readonly string[] = ["commit", "push"];

type Fields = Readonly<Record<string, unknown>>;

const isRecord = (v: unknown): v is Fields => v !== null && typeof v === "object" && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isOptionalString = (v: unknown): boolean => v === undefined || isString(v);
const isStringArray = (v: unknown): boolean => Array.isArray(v) && v.every(isString);
const isOneOf = (allowed: readonly string[]) => (v: unknown): boolean => isString(v) && allowed.includes(v);

const check = (ok: boolean, message: string): readonly string[] => (ok ? [] : [message]);

const checkArray = (v: unknown, label: string, item: (x: unknown, label: string) => readonly string[]) =>
  Array.isArray(v) ? v.flatMap((x, i) => item(x, `${label}[${i}]`)) : [`${label} must be an array`];

const checkNewFinding = (v: unknown, label: string): readonly string[] =>
  !isRecord(v)
    ? [`${label} must be an object`]
    : [
        ...check(isString(v.id), `${label}.id must be a string`),
        ...check(isOneOf(SEVERITIES)(v.severity), `${label}.severity must be one of ${SEVERITIES.join("/")}`),
        ...check(isStringArray(v.paths), `${label}.paths must be a string array`),
        ...check(isString(v.basis) && isString(v.evidence), `${label}.basis and .evidence must be strings`),
        ...check(v.origin === undefined || isRecord(v.origin), `${label}.origin must be an object`),
      ];

const checkUpdate = (v: unknown, label: string): readonly string[] =>
  !isRecord(v)
    ? [`${label} must be an object`]
    : [
        ...check(isString(v.id), `${label}.id must be a string`),
        ...check(isOneOf(STATUSES)(v.status), `${label}.status must be one of ${STATUSES.join("/")}`),
        ...check(v.severity === undefined || isOneOf(SEVERITIES)(v.severity), `${label}.severity is invalid`),
        ...check(
          [v.resolution, v.evidence, v.decisionRef].every(isOptionalString),
          `${label}.resolution / .evidence / .decisionRef must be strings`,
        ),
      ];

const checkRoundFields = (v: Fields, label: string): readonly string[] => [
  ...check(isString(v.diffHash), `${label}.diffHash must be a string`),
  ...check(isOneOf(SCOPES)(v.scope), `${label}.scope must be commit or push`),
  ...check(isString(v.reviewer), `${label}.reviewer must be a string`),
  ...check(typeof v.outputOk === "boolean", `${label}.outputOk must be a boolean`),
  ...check(isOptionalString(v.base), `${label}.base must be a string`),
];

const checkStoredFinding = (v: unknown, label: string): readonly string[] =>
  !isRecord(v)
    ? [`${label} must be an object`]
    : [
        ...checkNewFinding(v, label),
        ...check(isOneOf(STATUSES)(v.status), `${label}.status is invalid`),
        ...check(isString(v.reviewedDiffHash), `${label}.reviewedDiffHash must be a string`),
        ...check(Array.isArray(v.history), `${label}.history must be an array`),
      ];

const toResult = <T>(errors: readonly string[], value: unknown): Result<T> =>
  errors.length === 0 ? { ok: true, value: value as T } : { ok: false, errors };

export const parseSubmission = (v: unknown): Result<RoundSubmission> =>
  !isRecord(v)
    ? { ok: false, errors: ["round must be a JSON object"] }
    : toResult<RoundSubmission>(
        [
          ...checkRoundFields(v, "round"),
          ...checkArray(v.newFindings, "round.newFindings", checkNewFinding),
          ...checkArray(v.updates, "round.updates", checkUpdate),
        ],
        v,
      );

export const parseLedger = (v: unknown): Result<Ledger> =>
  !isRecord(v)
    ? { ok: false, errors: ["ledger must be a JSON object"] }
    : toResult<Ledger>(
        [
          ...check(v.version === 1, "ledger.version must be 1"),
          ...checkArray(v.findings, "ledger.findings", checkStoredFinding),
          ...checkArray(v.rounds, "ledger.rounds", (r, label) =>
            isRecord(r) ? checkRoundFields(r, label) : [`${label} must be an object`],
          ),
        ],
        v,
      );

const validateUpdate = (
  update: FindingUpdate,
  existing: Finding | undefined,
): readonly string[] => {
  if (existing === undefined) {
    return [`update refers to unknown finding ${update.id}`];
  }
  const severity = update.severity ?? existing.severity;
  const missingReason =
    DISPOSITIONS_NEEDING_REASON.includes(update.status) &&
    (update.resolution ?? "").trim() === "";
  return [
    ...(missingReason ? [`${update.id}: status "${update.status}" requires a resolution reason`] : []),
    ...(severity === "critical" && update.status === "deferred"
      ? [`${update.id}: a Critical finding cannot be deferred`]
      : []),
    ...(update.status === "open" && (update.evidence ?? "").trim() === ""
      ? [`${update.id}: reopening requires new evidence`]
      : []),
  ];
};

const validateNewFindings = (
  ledger: Ledger,
  newFindings: readonly NewFinding[],
): readonly string[] => {
  const known = new Set(ledger.findings.map((f) => f.id));
  return newFindings.flatMap((f, index) => [
    ...(known.has(f.id) || newFindings.findIndex((g) => g.id === f.id) !== index
      ? [`duplicate finding id ${f.id}; restate an existing finding by updating it instead`]
      : []),
    ...(f.basis.trim() === "" || f.evidence.trim() === ""
      ? [`${f.id}: a finding needs both basis and evidence`]
      : []),
  ]);
};

const applyUpdate = (finding: Finding, update: FindingUpdate, diffHash: string, at: string): Finding => ({
  ...finding,
  severity: update.severity ?? finding.severity,
  status: update.status,
  resolution: update.resolution ?? finding.resolution,
  evidence: update.evidence ?? finding.evidence,
  decisionRef: update.decisionRef ?? finding.decisionRef,
  history: [
    ...finding.history,
    { at, diffHash, status: update.status, note: update.resolution ?? update.evidence },
  ],
});

const createFinding = (f: NewFinding, diffHash: string, at: string): Finding => ({
  id: f.id,
  severity: f.severity,
  paths: f.paths,
  reviewedDiffHash: diffHash,
  basis: f.basis,
  evidence: f.evidence,
  status: "open",
  origin: f.origin ?? { kind: "unknown", confidence: "unknown" },
  history: [{ at, diffHash, status: "open" }],
});

export const applyRound = (ledger: Ledger, submission: RoundSubmission, at: string): Result<Ledger> => {
  const byId = new Map(ledger.findings.map((f) => [f.id, f]));
  const errors = [
    ...validateNewFindings(ledger, submission.newFindings),
    ...submission.updates.flatMap((u) => validateUpdate(u, byId.get(u.id))),
  ];
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const updatesById = new Map(submission.updates.map((u) => [u.id, u]));
  const updated = ledger.findings.map((f) => {
    const update = updatesById.get(f.id);
    return update === undefined ? f : applyUpdate(f, update, submission.diffHash, at);
  });
  const round: Round = {
    diffHash: submission.diffHash,
    scope: submission.scope,
    reviewer: submission.reviewer,
    reviewedAt: at,
    outputOk: submission.outputOk,
    ...(submission.base === undefined ? {} : { base: submission.base }),
  };
  return {
    ok: true,
    value: {
      version: 1,
      findings: [...updated, ...submission.newFindings.map((f) => createFinding(f, submission.diffHash, at))],
      rounds: [...ledger.rounds, round],
    },
  };
};

type FindingOutcome =
  | { readonly kind: "pass" }
  | { readonly kind: "block"; readonly reason: string }
  | { readonly kind: "awaiting"; readonly decisionRef: string; readonly blocks: boolean };

const judgeEscalation = (finding: Finding, mode: Mode): FindingOutcome => {
  if (finding.decisionRef === undefined || finding.decisionRef.trim() === "") {
    return {
      kind: "block",
      reason: `${finding.id} (${finding.severity}) is escalated but no decision request is referenced`,
    };
  }
  return { kind: "awaiting", decisionRef: finding.decisionRef, blocks: mode === "acceptance" };
};

const judgeFinding = (finding: Finding, mode: Mode): FindingOutcome => {
  if (finding.severity === "minor") {
    return { kind: "pass" };
  }
  if (finding.status === "escalated") {
    return judgeEscalation(finding, mode);
  }
  const passing: readonly Status[] =
    finding.severity === "critical" ? ["resolved", "rejected"] : ["resolved", "rejected", "deferred"];
  return passing.includes(finding.status)
    ? { kind: "pass" }
    : { kind: "block", reason: `${finding.id} (${finding.severity}) is ${finding.status}` };
};

export const evaluate = (ledger: Ledger, input: EvaluateInput): Verdict => {
  const rounds = ledger.rounds.filter((r) => r.diffHash === input.diffHash && r.scope === input.scope);
  if (rounds.length === 0) {
    return {
      ok: false,
      reasons: [`no review recorded for the current ${input.scope} diff (${input.diffHash})`],
      awaitingDecision: [],
    };
  }
  if (!rounds.some((r) => r.outputOk)) {
    return {
      ok: false,
      reasons: ["review output missing or broken for the current diff; this is a failure, not 'no findings'"],
      awaitingDecision: [],
    };
  }
  const outcomes = ledger.findings.map((f) => ({ finding: f, outcome: judgeFinding(f, input.mode) }));
  const reasons = outcomes.flatMap(({ finding, outcome }) => {
    if (outcome.kind === "block") return [outcome.reason];
    if (outcome.kind === "awaiting" && outcome.blocks) {
      return [`${finding.id} awaits a human decision (${outcome.decisionRef})`];
    }
    return [];
  });
  const awaitingDecision = outcomes.flatMap(({ finding, outcome }) =>
    outcome.kind === "awaiting" ? [{ id: finding.id, decisionRef: outcome.decisionRef }] : [],
  );
  return { ok: reasons.length === 0, reasons, awaitingDecision };
};
