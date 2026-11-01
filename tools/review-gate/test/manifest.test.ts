import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cargoTomlFindings, packageJsonFindings } from "../src/manifest.ts";

const pkg = (fields: Record<string, unknown>) =>
  JSON.stringify({ name: "triary-frontend", scripts: { "test:run": "vitest run" }, ...fields }, null, 2);

describe("packageJsonFindings", () => {
  it("accepts a version update of an existing dependency", () => {
    const result = packageJsonFindings(
      pkg({ dependencies: { "solid-js": "^1.9.0" } }),
      pkg({ dependencies: { "solid-js": "^1.9.5" } }),
    );
    assert.deepEqual(result, { problems: [], newNpmPackages: [] });
  });

  it("reports a new package by name without calling it a configuration change", () => {
    const result = packageJsonFindings(
      pkg({ devDependencies: { vitest: "^5.0.0" } }),
      pkg({ devDependencies: { vitest: "^5.0.0", "left-pad": "^1.3.0" } }),
    );
    assert.deepEqual(result, { problems: [], newNpmPackages: ["left-pad"] });
  });

  it("does not count moving a package between dependency lists as new", () => {
    const result = packageJsonFindings(
      pkg({ dependencies: { a: "1" } }),
      pkg({ devDependencies: { a: "1" } }),
    );
    assert.deepEqual(result.newNpmPackages, []);
  });

  it("reports a change to the scripts", () => {
    const result = packageJsonFindings(
      pkg({}),
      JSON.stringify({ name: "triary-frontend", scripts: { "test:run": "true" } }),
    );
    assert.equal(result.problems.length, 1);
  });

  it("reports a change to pnpm.overrides", () => {
    const result = packageJsonFindings(pkg({}), pkg({ pnpm: { overrides: { a: "1" } } }));
    assert.equal(result.problems.length, 1);
  });

  it("ignores formatting and key order", () => {
    const before = JSON.stringify({ scripts: { a: "x" }, name: "n" });
    const after = JSON.stringify({ name: "n", scripts: { a: "x" } }, null, 4);
    assert.deepEqual(packageJsonFindings(before, after).problems, []);
  });

  it("reports a manifest that is not JSON", () => {
    assert.equal(packageJsonFindings(pkg({}), "{").problems.length, 1);
  });

  it("reports a removed manifest", () => {
    assert.equal(packageJsonFindings(pkg({}), undefined).problems.length, 1);
  });
});

const cargo = (deps: string, extra = "") => `[package]
name = "triary-backend"
edition = "2024"

[dependencies]
${deps}

[lints.clippy]
pedantic = "warn"
${extra}`;

describe("cargoTomlFindings", () => {
  it("accepts adding and updating crates in [dependencies]", () => {
    const result = cargoTomlFindings(cargo('axum = "0.8"'), cargo('axum = "0.9"\nsha2 = "0.10"'));
    assert.deepEqual(result.problems, []);
  });

  it("accepts dependency sub-tables and target-specific dependencies", () => {
    const result = cargoTomlFindings(
      cargo('axum = "0.8"'),
      cargo('axum = "0.8"', `
[dependencies.tokio]
version = "1"

[target.'cfg(unix)'.dev-dependencies]
nix = "0.29"
`),
    );
    assert.deepEqual(result.problems, []);
  });

  it("reports a change to [lints]", () => {
    const result = cargoTomlFindings(cargo('axum = "0.8"'), cargo('axum = "0.8"').replace('"warn"', '"allow"'));
    assert.equal(result.problems.length, 1);
  });

  it("reports a [patch] table, which redirects where crates come from", () => {
    const result = cargoTomlFindings(
      cargo('axum = "0.8"'),
      cargo('axum = "0.8"', '\n[patch.crates-io]\naxum = { git = "https://example.com/axum" }\n'),
    );
    assert.equal(result.problems.length, 1);
  });

  it("reports a change to [package]", () => {
    const result = cargoTomlFindings(cargo('axum = "0.8"'), cargo('axum = "0.8"').replace("2024", "2021"));
    assert.equal(result.problems.length, 1);
  });

  it("ignores comments and blank lines", () => {
    const result = cargoTomlFindings(cargo('axum = "0.8"'), `# note\n\n${cargo('axum = "0.8"')}`);
    assert.deepEqual(result.problems, []);
  });
});
