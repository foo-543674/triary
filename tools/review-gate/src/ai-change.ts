// Decides whether a pull request is a change by the AI that may merge without
// human approval once the verdict passed (owner decision, 2026-11-01; contract:
// docs/remote-acceptance.md "人間の承認なしでマージしてよい変更").
//
// Pure: the input is the pulls API response for the PR and the base files the
// verifier found among the changed paths. The verdict itself (CI, review
// ledger snapshot bound to the head, no open decision) is judged elsewhere;
// this only answers "is this the class that merges without a human".
// Every condition must hold; the reasons list says which ones did not.

export const AI_AUTHOR = "foo-543674-ai-agent[bot]";
// A label the owner puts on a PR to keep it from merging automatically.
export const HOLD_LABEL = "hold-merge";
// UI review (owner decision 2026-11-01): the owner looks at new screens and
// large layout changes only. A new screen is detected here; whether a change
// is a large layout change is judged by the AI, which then puts
// NEEDS_UI_REVIEW_LABEL on the PR. Either waits until the owner adds
// UI_REVIEWED_LABEL (only the owner's label counts; the verifier reads who
// added it). A missed review is acceptable: it is fixed afterwards.
export const NEEDS_UI_REVIEW_LABEL = "needs-ui-review";
export const UI_REVIEWED_LABEL = "ui-reviewed";
export const OWNER = "foo-543674";

/** A screen: a route module the change adds (tests and stories are not screens). */
export const isNewScreen = (path: string): boolean =>
  path.startsWith("frontend/src/routes/") && path.endsWith(".tsx") && !/\.(test|stories)\.tsx$/.test(path);

// Files that would configure the required CI jobs but cannot be code-owned
// because they do not exist yet (R100): adding one changes how a required job
// behaves (rustfmt / clippy / nextest / vitest / biome / spectral read them
// when present). The existing configuration files are in CODEOWNERS. The
// manifests (frontend/package.json, backend/Cargo.toml) are judged by part
// instead: `check-dependencies` (manifest.ts) lets dependency changes through
// and sends every other part (scripts, [lints], [patch], ...) to the owner.
export const GUARDRAIL_CONFIG: ReadonlySet<string> = new Set([
  "backend/rustfmt.toml",
  "backend/.rustfmt.toml",
  "backend/clippy.toml",
  "backend/.clippy.toml",
  "backend/.config/nextest.toml",
  "frontend/biome.jsonc",
  "frontend/vitest.config.ts",
  "frontend/vitest.config.mts",
  "frontend/vitest.workspace.ts",
  ".spectral.yaml",
  ".spectral.yml",
  ".spectral.json",
]);

export interface PullRequest {
  readonly user?: { readonly login?: string };
  readonly base?: { readonly ref?: string };
  readonly draft?: boolean;
  readonly labels?: readonly { readonly name?: string }[];
}

export interface AiChangeInput {
  readonly pr: PullRequest;
  readonly defaultBranch: string;
  // Changed paths owned in .github/CODEOWNERS (the verifier's step 4).
  readonly baseFiles: readonly string[];
  // Every changed path of the PR, including rename sources.
  readonly changedFiles: readonly string[];
  // Paths the change adds (merge base to the judged head).
  readonly addedFiles: readonly string[];
  // Who last added UI_REVIEWED_LABEL, if it is on the PR.
  readonly uiReviewedBy?: string;
}

export interface AiChangeClassification {
  readonly aiChange: boolean;
  readonly reasons: readonly string[];
}

const uiReviewProblems = (input: AiChangeInput, labels: readonly (string | undefined)[]): readonly string[] => {
  const reviewed = labels.includes(UI_REVIEWED_LABEL) && input.uiReviewedBy === OWNER;
  if (reviewed) return [];
  const screens = input.addedFiles.filter(isNewScreen);
  return [
    ...screens.map((f) => `adds the screen ${f} (waits for the owner's ${UI_REVIEWED_LABEL} label)`),
    ...(labels.includes(NEEDS_UI_REVIEW_LABEL)
      ? [`the PR has the ${NEEDS_UI_REVIEW_LABEL} label (waits for the owner's ${UI_REVIEWED_LABEL} label)`]
      : []),
  ];
};

export const classifyAiChange = (input: AiChangeInput): AiChangeClassification => {
  const author = input.pr.user?.login ?? "(unknown)";
  const base = input.pr.base?.ref ?? "(unknown)";
  const labels = (input.pr.labels ?? []).map((l) => l.name);
  const reasons = [
    ...(author === AI_AUTHOR ? [] : [`author is ${author}, not ${AI_AUTHOR}`]),
    ...(base === input.defaultBranch ? [] : [`base is ${base}, not ${input.defaultBranch}`]),
    ...(input.pr.draft === false ? [] : ["the PR is a draft (or its draft state is unknown)"]),
    ...(labels.includes(HOLD_LABEL) ? [`the PR has the ${HOLD_LABEL} label`] : []),
    ...input.baseFiles.map((f) => `changes base file ${f} (code owner approval required)`),
    ...input.changedFiles
      .filter((f) => GUARDRAIL_CONFIG.has(f))
      .map((f) => `changes ${f}, which configures the required CI jobs`),
    ...uiReviewProblems(input, labels),
  ];
  return { aiChange: reasons.length === 0, reasons };
};
