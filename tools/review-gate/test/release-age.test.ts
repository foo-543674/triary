import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addedVersions,
  isMajorUpdate,
  MAX_CHECKED_VERSIONS,
  newPackageNames,
  type PackageVersion,
  parseCargoLock,
  parsePnpmLock,
  releaseAgeProblems,
  requiredDays,
  type VersionChange,
  versionKey,
} from "../src/release-age.ts";

const CRATES = 'source = "registry+https://github.com/rust-lang/crates.io-index"';

describe("parseCargoLock", () => {
  it("reads registry packages and skips the local package", () => {
    const lock = `version = 4

[[package]]
name = "axum"
version = "0.8.4"
${CRATES}
checksum = "abc"

[[package]]
name = "triary-backend"
version = "0.1.0"

[[package]]
name = "forked"
version = "1.0.0"
source = "git+https://example.com/forked#abc"
`;
    assert.deepEqual(parseCargoLock(lock), [{ ecosystem: "crates.io", name: "axum", version: "0.8.4" }]);
  });
});

describe("parsePnpmLock", () => {
  it("reads the keys of the packages map, scoped and quoted ones included", () => {
    const lock = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      solid-js:
        specifier: ^1.9.0
        version: 1.9.5

packages:

  '@babel/core@7.26.0':
    resolution: {integrity: sha512-x}

  solid-js@1.9.5:
    resolution: {integrity: sha512-y}

snapshots:

  solid-js@1.9.5:
    dependencies:
      csstype: 3.1.3
`;
    assert.deepEqual(parsePnpmLock(lock), [
      { ecosystem: "npm", name: "@babel/core", version: "7.26.0" },
      { ecosystem: "npm", name: "solid-js", version: "1.9.5" },
    ]);
  });

  it("returns nothing for a lockfile without packages", () => {
    assert.deepEqual(parsePnpmLock("lockfileVersion: '9.0'\n"), []);
  });
});

describe("isMajorUpdate", () => {
  const cases: readonly [string, string, boolean][] = [
    ["1.2.3", "1.9.0", false],
    ["1.2.3", "2.0.0", true],
    ["0.6.11", "0.7.1", true],
    ["0.6.1", "0.6.9", false],
    ["0.0.3", "0.0.4", true],
  ];
  for (const [from, to, major] of cases) {
    it(`${from} -> ${to} is ${major ? "" : "not "}major`, () => {
      assert.equal(isMajorUpdate(from, to), major);
    });
  }
});

const crate = (name: string, version: string): PackageVersion => ({ ecosystem: "crates.io", name, version });

describe("addedVersions", () => {
  it("lists only new versions, each with the highest version it replaces", () => {
    const result = addedVersions(
      [crate("a", "1.0.0"), crate("a", "1.2.0"), crate("b", "2.0.0")],
      [crate("a", "1.3.0"), crate("b", "2.0.0"), crate("c", "0.1.0")],
    );
    assert.deepEqual(result, [
      { ...crate("a", "1.3.0"), previous: "1.2.0" },
      crate("c", "0.1.0"),
    ]);
  });
});

describe("newPackageNames", () => {
  const npm = (name: string, version: string): PackageVersion => ({ ecosystem: "npm", name, version });
  it("lists names new to the lockfile, transitive ones included, once each", () => {
    const result = newPackageNames(
      [npm("solid-js", "1.9.0")],
      [npm("solid-js", "1.9.5"), npm("csstype", "3.1.3"), npm("csstype", "3.1.4")],
      "npm",
    );
    assert.deepEqual(result, ["csstype"]);
  });

  it("does not mix ecosystems", () => {
    assert.deepEqual(newPackageNames([], [crate("a", "1.0.0")], "npm"), []);
  });
});

describe("releaseAgeProblems", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const judge = (change: VersionChange, published: Date | undefined) =>
    releaseAgeProblems([change], new Map([[versionKey(change), published]]), now);

  it("accepts a version published 7 days ago", () => {
    assert.deepEqual(judge(crate("c", "0.1.0"), daysAgo(7)), []);
  });

  it("rejects a version published 6 days ago", () => {
    assert.equal(judge(crate("c", "0.1.0"), daysAgo(6)).length, 1);
  });

  it("needs 14 days for a major update", () => {
    const change = { ...crate("tower-http", "0.7.1"), previous: "0.6.11" };
    assert.equal(requiredDays(change), 14);
    assert.equal(judge(change, daysAgo(13)).length, 1);
    assert.deepEqual(judge(change, daysAgo(14)), []);
  });

  it("rejects a version whose publish date is unknown", () => {
    assert.match(judge(crate("c", "0.1.0"), undefined)[0] ?? "", /unknown/);
  });

  it("does not check more than the limit one by one", () => {
    const many = Array.from({ length: MAX_CHECKED_VERSIONS + 1 }, (_, i) => crate(`p${i}`, "1.0.0"));
    assert.equal(releaseAgeProblems(many, new Map(), now).length, 1);
  });

  it("accepts no changes", () => {
    assert.deepEqual(releaseAgeProblems([], new Map(), now), []);
  });
});
