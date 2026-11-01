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

// Files that configure the required CI jobs but cannot be code-owned
// (R100). The manifests are also changed by Dependabot updates, which merge
// without approval, so CODEOWNERS cannot list them; their scripts and
// `[lints]` decide what `lint:ci`, `arch:test`, `test:run` and clippy check.
// The other names do not exist yet: adding one would change how a required
// job behaves (rustfmt / clippy / nextest / vitest / biome / spectral read
// them when present). The existing configuration files are in CODEOWNERS.
export const GUARDRAIL_CONFIG: ReadonlySet<string> = new Set([
  "frontend/package.json",
  "backend/Cargo.toml",
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
}

export interface AiChangeClassification {
  readonly aiChange: boolean;
  readonly reasons: readonly string[];
}

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
  ];
  return { aiChange: reasons.length === 0, reasons };
};
