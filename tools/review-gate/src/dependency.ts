// Decides whether a pull request is a Dependabot dependency update that may
// merge without human approval (owner decision in #43; contract:
// docs/remote-acceptance.md "人間の承認なしでマージしてよい変更").
//
// Pure: the input is the PR author and the GitHub compare API response for
// `<merge-base>...<judged head>`, so the answer is about that exact head.
// Every condition must hold; the reasons list says which ones did not.

export const DEPENDENCY_BOT = "dependabot[bot]";
// Commits Dependabot creates are committed and signed by GitHub ("web-flow").
// The author alone can be set by anyone who pushes, and `verified` alone only
// says the committer's signature is valid, so both are required (R51).
export const DEPENDENCY_COMMITTER = "web-flow";
export const DEPENDENCY_FILES: ReadonlySet<string> = new Set([
  "backend/Cargo.toml",
  "backend/Cargo.lock",
  "frontend/package.json",
  "frontend/pnpm-lock.yaml",
]);
// The compare API returns at most 300 files and 250 commits; a response at
// those limits may be truncated, so it is not trusted.
const MAX_FILES = 300;
const MAX_COMMITS = 250;

interface Login {
  readonly login?: string;
}

export interface CompareFile {
  readonly filename: string;
  readonly previous_filename?: string;
}

export interface CompareCommit {
  readonly sha: string;
  readonly author: Login | null;
  readonly committer: Login | null;
  readonly commit: { readonly verification?: { readonly verified?: boolean } };
}

export interface CompareResponse {
  readonly total_commits?: number;
  readonly commits?: readonly CompareCommit[];
  readonly files?: readonly CompareFile[];
}

export interface DependencyInput {
  readonly prAuthor: string;
  readonly headSha: string;
  readonly compare: CompareResponse;
}

export interface DependencyClassification {
  // Merges without human approval: Dependabot's own commits, and only the
  // manifests and lockfiles in DEPENDENCY_FILES.
  readonly dependencyUpdate: boolean;
  // Every commit is Dependabot's own (authored by Dependabot, committed and
  // signed by GitHub), whatever files it touches (e.g. GitHub Actions pins).
  // Such a PR needs no review ledger snapshot: no AI wrote it, so there is no
  // AI review to bind. It does not by itself merge without approval.
  readonly dependabotAuthored: boolean;
  readonly reasons: readonly string[];
}

const touchedPaths = (files: readonly CompareFile[]): readonly string[] =>
  files.flatMap((f) => (f.previous_filename === undefined ? [f.filename] : [f.filename, f.previous_filename]));

const commitProblems = (commit: CompareCommit): readonly string[] => {
  const short = commit.sha.slice(0, 7);
  return [
    ...(commit.author?.login === DEPENDENCY_BOT ? [] : [`commit ${short} is not authored by ${DEPENDENCY_BOT}`]),
    ...(commit.committer?.login === DEPENDENCY_COMMITTER
      ? []
      : [`commit ${short} is not committed by ${DEPENDENCY_COMMITTER}`]),
    ...(commit.commit.verification?.verified === true ? [] : [`commit ${short} has no verified signature`]),
  ];
};

export const classifyDependencyUpdate = (input: DependencyInput): DependencyClassification => {
  const files = input.compare.files ?? [];
  const commits = input.compare.commits ?? [];
  const paths = touchedPaths(files);
  const originReasons = [
    ...(input.prAuthor === DEPENDENCY_BOT ? [] : [`author is ${input.prAuthor}, not ${DEPENDENCY_BOT}`]),
    ...(files.length === 0 ? ["no changed files"] : []),
    ...(files.length >= MAX_FILES ? ["too many changed files to trust the compare response"] : []),
    ...(commits.length === 0 ? ["no commits"] : []),
    ...(commits.length >= MAX_COMMITS || commits.length !== input.compare.total_commits
      ? ["the compare response does not list every commit"]
      : []),
    ...(commits.at(-1)?.sha === input.headSha ? [] : ["the compared range does not end at the judged head"]),
    ...commits.flatMap(commitProblems),
  ];
  const fileReasons = paths.filter((p) => !DEPENDENCY_FILES.has(p)).map((p) => `changes ${p}`);
  const reasons = [...originReasons, ...fileReasons];
  return { dependencyUpdate: reasons.length === 0, dependabotAuthored: originReasons.length === 0, reasons };
};
