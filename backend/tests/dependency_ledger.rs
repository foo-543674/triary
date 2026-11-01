//! Supply-chain guardrail: every direct dependency must have an entry in the
//! ledger of `docs/dependency-policy.md` ("直接依存の台帳"), and the ledger must
//! not list crates that are gone. The entry records how the crate was vetted;
//! adding a crate without one fails here.
//!
//! Direct dependencies come from `cargo metadata` rather than from parsing
//! `Cargo.toml`, so every manifest form counts: `[dependencies.<name>]`
//! tables, `[target.'cfg(..)'.dependencies]`, dotted keys, and renames
//! (`foo = { package = "bar" }` is recorded as `bar`, the crate that is
//! actually downloaded).

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::process::Command;

use serde_json::Value;

const LEDGER: &str = "../docs/dependency-policy.md";
const LEDGER_HEADING: &str = "## 直接依存の台帳";
const PACKAGE: &str = "triary-backend";

/// Real crate names of the package's direct dependencies, from
/// `cargo metadata` output (`packages[].dependencies[].name` is the name on
/// crates.io even when the manifest renames it).
fn direct_dependencies(metadata: &Value) -> BTreeSet<String> {
    metadata["packages"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|package| package["name"] == PACKAGE)
        .flat_map(|package| package["dependencies"].as_array().into_iter().flatten())
        .filter_map(|dependency| dependency["name"].as_str())
        .map(str::to_owned)
        .collect()
}

/// Crate names in the first column of the ledger table (`` | `name` | ``).
fn ledger_crates(policy: &str) -> BTreeSet<String> {
    policy
        .lines()
        .skip_while(|line| line.trim() != LEDGER_HEADING)
        .skip(1)
        .take_while(|line| !line.starts_with("## "))
        .filter_map(|line| line.strip_prefix("| `"))
        .filter_map(|rest| rest.split('`').next())
        .map(str::to_owned)
        .collect()
}

fn cargo_metadata() -> Value {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let output = Command::new(env!("CARGO"))
        .args([
            "metadata",
            "--format-version",
            "1",
            "--no-deps",
            "--locked",
            "--offline",
        ])
        .current_dir(manifest_dir)
        .output()
        .expect("cannot run cargo metadata");
    assert!(
        output.status.success(),
        "cargo metadata failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).expect("cargo metadata printed invalid JSON")
}

#[test]
fn every_direct_dependency_is_in_the_ledger_and_nothing_else() {
    let declared = direct_dependencies(&cargo_metadata());
    let ledger_path = Path::new(env!("CARGO_MANIFEST_DIR")).join(LEDGER);
    let ledger = ledger_crates(
        &fs::read_to_string(&ledger_path)
            .unwrap_or_else(|e| panic!("cannot read {}: {e}", ledger_path.display())),
    );
    assert!(
        !declared.is_empty(),
        "cargo metadata listed no dependencies"
    );

    let unvetted: Vec<_> = declared.difference(&ledger).collect();
    let stale: Vec<_> = ledger.difference(&declared).collect();
    assert!(
        unvetted.is_empty() && stale.is_empty(),
        "{LEDGER} ledger out of date. Not in the ledger (vet and record them per the policy): {unvetted:?}. In the ledger but not a dependency: {stale:?}"
    );
}

#[test]
fn metadata_reader_takes_real_names_of_this_package_only() {
    let metadata = serde_json::json!({
        "packages": [
            {
                "name": PACKAGE,
                "dependencies": [
                    { "name": "a", "kind": null },
                    { "name": "bar", "rename": "foo", "kind": null },
                    { "name": "d", "kind": "dev" },
                    { "name": "t", "kind": null, "target": "cfg(unix)" }
                ]
            },
            { "name": "other", "dependencies": [ { "name": "z" } ] }
        ]
    });
    let names: Vec<_> = direct_dependencies(&metadata).into_iter().collect();
    assert_eq!(names, ["a", "bar", "d", "t"]);
}

#[test]
fn ledger_parser_reads_only_the_ledger_table() {
    let policy = "| `outside` | x |\n## 直接依存の台帳\n\n| crate | 区分 |\n|---|---|\n| `a` | dependencies |\n| `b-c` | dev-dependencies |\n## next\n| `after` | x |\n";
    let names: Vec<_> = ledger_crates(policy).into_iter().collect();
    assert_eq!(names, ["a", "b-c"]);
}
