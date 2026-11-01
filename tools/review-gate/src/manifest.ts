// Which parts of a dependency manifest a change touches (owner decision
// 2026-11-01: dependency changes merge without approval once they pass the
// supply-chain guardrails; everything else in a manifest configures the gates
// and stays with the owner). Pure: the inputs are the file contents at the
// merge base and at the judged head (undefined when the file is absent).
// contract: docs/remote-acceptance.md "人間の承認なしでマージしてよい変更".

export const PACKAGE_JSON = "frontend/package.json";
export const CARGO_TOML = "backend/Cargo.toml";

// package.json fields that only declare dependencies. Everything else
// (scripts, pnpm.overrides, packageManager, engines, ...) is configuration.
const NPM_DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

export interface ManifestFindings {
  // Changes outside the dependency parts: these need the owner's approval.
  readonly problems: readonly string[];
  // npm package names declared at head but not at the base.
  readonly newNpmPackages: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  }
  return value;
};

const parseJson = (text: string): Record<string, unknown> | undefined => {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const withoutDependencies = (manifest: Record<string, unknown>): unknown =>
  canonical(Object.fromEntries(Object.entries(manifest).filter(([k]) => !NPM_DEPENDENCY_FIELDS.includes(k))));

const npmNames = (manifest: Record<string, unknown>): ReadonlySet<string> =>
  new Set(
    NPM_DEPENDENCY_FIELDS.flatMap((field) => {
      const deps = manifest[field];
      return isRecord(deps) ? Object.keys(deps) : [];
    }),
  );

export const packageJsonFindings = (base: string | undefined, head: string | undefined): ManifestFindings => {
  if (base === head) return { problems: [], newNpmPackages: [] };
  if (base === undefined || head === undefined) {
    return { problems: [`${PACKAGE_JSON} is added or removed`], newNpmPackages: [] };
  }
  const before = parseJson(base);
  const after = parseJson(head);
  if (before === undefined || after === undefined) {
    return { problems: [`${PACKAGE_JSON} cannot be read as a JSON object`], newNpmPackages: [] };
  }
  const changedOutside =
    JSON.stringify(withoutDependencies(before)) !== JSON.stringify(withoutDependencies(after));
  const known = npmNames(before);
  return {
    problems: changedOutside ? [`${PACKAGE_JSON} changes fields other than the dependency lists`] : [],
    newNpmPackages: [...npmNames(after)].filter((name) => !known.has(name)).sort(),
  };
};

// Cargo.toml table headers that only declare dependencies:
// [dependencies], [dev-dependencies], [build-dependencies], their
// `.<name>` sub-tables, the `target.<cfg>.` forms, and [workspace.dependencies].
// [patch.*] and [replace] redirect where crates come from: configuration.
const CARGO_DEPENDENCY_TABLE =
  /^(?:target\..+\.|workspace\.)?(?:dev-|build-)?dependencies(?:\..+)?$/;

const headerOf = (line: string): string | undefined => {
  const match = /^\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/.exec(line);
  return match?.[1];
};

// The manifest without its dependency tables: the header and the meaningful
// lines of every other table, in order. Blank and comment-only lines are
// dropped so moving a comment does not count.
const cargoConfiguration = (toml: string): readonly string[] =>
  toml
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .reduce<{ readonly inDependencies: boolean; readonly kept: readonly string[] }>(
      (acc, line) => {
        const header = headerOf(line);
        if (header !== undefined) {
          const inDependencies = CARGO_DEPENDENCY_TABLE.test(header.replace(/\s+/g, ""));
          return { inDependencies, kept: inDependencies ? acc.kept : [...acc.kept, line] };
        }
        return acc.inDependencies ? acc : { ...acc, kept: [...acc.kept, line] };
      },
      { inDependencies: false, kept: [] },
    ).kept;

export const cargoTomlFindings = (base: string | undefined, head: string | undefined): ManifestFindings => {
  if (base === head) return { problems: [], newNpmPackages: [] };
  if (base === undefined || head === undefined) {
    return { problems: [`${CARGO_TOML} is added or removed`], newNpmPackages: [] };
  }
  const same = JSON.stringify(cargoConfiguration(base)) === JSON.stringify(cargoConfiguration(head));
  return {
    problems: same ? [] : [`${CARGO_TOML} changes tables other than the dependency tables`],
    newNpmPackages: [],
  };
};
