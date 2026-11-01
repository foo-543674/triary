// Release age of the package versions a change brings in (supply-chain
// guardrail, docs/dependency-policy.md). A hijacked release is usually found
// and yanked within days, so versions younger than the cooldown do not merge
// without a human. This mirrors the Dependabot cooldown (7 days, 14 for a
// major update) for every version a lockfile change adds, including
// transitive ones and the ones the AI adds by hand.
//
// Pure except `fetchPublishedAt`, which reads the public registries.

export type Ecosystem = "crates.io" | "npm";

export interface PackageVersion {
  readonly ecosystem: Ecosystem;
  readonly name: string;
  readonly version: string;
}

export interface VersionChange extends PackageVersion {
  // Highest version of the same package before the change, if any.
  readonly previous?: string;
}

export const COOLDOWN_DAYS = 7;
export const MAJOR_COOLDOWN_DAYS = 14;
// More new versions than this are not looked up one by one; such a change
// goes to a human instead.
export const MAX_CHECKED_VERSIONS = 150;
const DAY_MS = 24 * 60 * 60 * 1000;

const CRATES_IO_SOURCES = [
  "registry+https://github.com/rust-lang/crates.io-index",
  "sparse+https://index.crates.io/",
];

/** Registry packages in a Cargo.lock (path and git packages are left out; cargo-deny allows crates.io only). */
export const parseCargoLock = (text: string): readonly PackageVersion[] =>
  text
    .split(/^\[\[package\]\]\s*$/m)
    .slice(1)
    .flatMap((block) => {
      const field = (key: string) => new RegExp(`^${key} = "([^"]*)"`, "m").exec(block)?.[1];
      const name = field("name");
      const version = field("version");
      const source = field("source");
      return name !== undefined && version !== undefined && source !== undefined && CRATES_IO_SOURCES.includes(source)
        ? [{ ecosystem: "crates.io" as const, name, version }]
        : [];
    });

/** Packages of a pnpm lockfile (v9: keys of the top-level `packages:` map, `name@version`). */
export const parsePnpmLock = (text: string): readonly PackageVersion[] => {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === "packages:");
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\S/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).flatMap((line) => {
    const match = /^ {2}(?:'([^']+)'|([^\s'][^:]*)):\s*$/.exec(line);
    const key = match?.[1] ?? match?.[2];
    if (key === undefined) return [];
    const at = key.lastIndexOf("@");
    return at > 0 ? [{ ecosystem: "npm" as const, name: key.slice(0, at), version: key.slice(at + 1) }] : [];
  });
};

const numbers = (version: string): readonly number[] =>
  version
    .split(/[-+]/)[0]!
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isNaN(n) ? 0 : n));

const compareVersions = (a: string, b: string): number => {
  const [x, y] = [numbers(a), numbers(b)];
  const length = Math.max(x.length, y.length);
  const diff = Array.from({ length }, (_, i) => (x[i] ?? 0) - (y[i] ?? 0)).find((d) => d !== 0);
  return diff ?? 0;
};

/**
 * Whether `next` is a breaking update of `previous` by semver as cargo and
 * npm read it: the first non-zero component changes (0.6 -> 0.7 is major).
 */
export const isMajorUpdate = (previous: string, next: string): boolean => {
  const [a, b] = [numbers(previous), numbers(next)];
  const lead = a.findIndex((n) => n !== 0);
  const index = lead < 0 ? a.length - 1 : lead;
  return a.slice(0, index + 1).some((n, i) => n !== (b[i] ?? 0));
};

const key = (p: PackageVersion): string => `${p.ecosystem}:${p.name}@${p.version}`;

/** Versions present at head but not at the base, with the version they replace. */
export const addedVersions = (
  base: readonly PackageVersion[],
  head: readonly PackageVersion[],
): readonly VersionChange[] => {
  const before = new Set(base.map(key));
  return head
    .filter((p) => !before.has(key(p)))
    .map((p) => {
      const previous = base
        .filter((b) => b.ecosystem === p.ecosystem && b.name === p.name)
        .map((b) => b.version)
        .sort(compareVersions)
        .at(-1);
      return previous === undefined ? p : { ...p, previous };
    });
};

/** Package names of one ecosystem present at head but not at the base (transitive and aliased ones included). */
export const newPackageNames = (
  base: readonly PackageVersion[],
  head: readonly PackageVersion[],
  ecosystem: Ecosystem,
): readonly string[] => {
  const before = new Set(base.filter((p) => p.ecosystem === ecosystem).map((p) => p.name));
  return [...new Set(head.filter((p) => p.ecosystem === ecosystem && !before.has(p.name)).map((p) => p.name))].sort();
};

export const requiredDays = (change: VersionChange): number =>
  change.previous !== undefined && isMajorUpdate(change.previous, change.version)
    ? MAJOR_COOLDOWN_DAYS
    : COOLDOWN_DAYS;

/** Reasons the changes may not merge without a human; empty when all are old enough. */
export const releaseAgeProblems = (
  changes: readonly VersionChange[],
  publishedAt: ReadonlyMap<string, Date | undefined>,
  now: Date,
): readonly string[] => {
  if (changes.length > MAX_CHECKED_VERSIONS) {
    return [`${changes.length} new package versions; more than ${MAX_CHECKED_VERSIONS} are not checked one by one`];
  }
  return changes.flatMap((change) => {
    const label = `${change.ecosystem} ${change.name}@${change.version}`;
    const published = publishedAt.get(key(change));
    if (published === undefined) return [`${label}: publish date unknown`];
    const days = requiredDays(change);
    const age = (now.getTime() - published.getTime()) / DAY_MS;
    return age >= days ? [] : [`${label} was published ${age.toFixed(1)} days ago (needs ${days})`];
  });
};

export const versionKey = key;

const registryUrl = (p: PackageVersion): string =>
  p.ecosystem === "crates.io"
    ? `https://crates.io/api/v1/crates/${encodeURIComponent(p.name)}/${encodeURIComponent(p.version)}`
    : `https://registry.npmjs.org/${p.name.replace("/", "%2F")}`;

const readDate = (p: PackageVersion, body: unknown): Date | undefined => {
  const record = body as Record<string, Record<string, unknown> | undefined>;
  const raw = p.ecosystem === "crates.io" ? record.version?.created_at : record.time?.[p.version];
  if (typeof raw !== "string") return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Publish dates from crates.io and the npm registry; undefined when a lookup fails. */
export const fetchPublishedAt = async (
  versions: readonly PackageVersion[],
): Promise<ReadonlyMap<string, Date | undefined>> => {
  const entries = await Promise.all(
    versions.map(async (p): Promise<[string, Date | undefined]> => {
      try {
        const response = await fetch(registryUrl(p), {
          // crates.io refuses requests without a User-Agent.
          headers: { "User-Agent": "triary-acceptance-verifier (github.com/foo-543674/triary)" },
        });
        return [key(p), response.ok ? readDate(p, await response.json()) : undefined];
      } catch {
        return [key(p), undefined];
      }
    }),
  );
  return new Map(entries);
};
