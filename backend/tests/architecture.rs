//! Architecture tests.
//!
//! Mechanical guardrails for the rules declared in `CLAUDE.md` and
//! `.contexts/architecture.md`. They are stricter than `cargo clippy` lints
//! but cheaper than a full code review: each test scans `src/` source text
//! and fails if a rule is violated.
//!
//! Rules enforced here:
//! 1. `domain` and `application` must not import infrastructure crates
//!    (`axum`, `axum_extra`, `sqlx`, `tower`, `tower_http`, `tracing`,
//!    `tracing_subscriber`, `hyper`).
//! 2. Forbidden structural vocabulary in declared type names
//!    (`Service`, `Manager`, `Helper`, `Util`, `Utils`, `Processor`,
//!    `Worker`, `Engine`). `Handler` is allowed only inside
//!    `interfaces/http`.
//!
//! When a rule needs to be relaxed, change it here and document the
//! decision in `.contexts/bootstrap-decisions.md`.

use std::fs;
use std::path::{Path, PathBuf};

const SRC_ROOT: &str = "src";

const FORBIDDEN_INFRA_CRATES: &[&str] = &[
    "axum",
    "axum_extra",
    "sqlx",
    "tower",
    "tower_http",
    "tracing",
    "tracing_subscriber",
    "hyper",
];

const FORBIDDEN_TYPE_TOKENS: &[&str] = &[
    "Service",
    "Manager",
    "Helper",
    "Util",
    "Utils",
    "Processor",
    "Worker",
    "Engine",
];

#[test]
fn domain_layer_has_no_infrastructure_imports() {
    assert_no_forbidden_imports("domain");
}

#[test]
fn application_layer_has_no_infrastructure_imports() {
    assert_no_forbidden_imports("application");
}

#[test]
fn no_forbidden_structural_vocabulary_in_type_names() {
    let violations = collect_files(Path::new(SRC_ROOT))
        .into_iter()
        .flat_map(|file| forbidden_type_decl_violations(&file))
        .collect::<Vec<_>>();

    assert!(
        violations.is_empty(),
        "forbidden structural vocabulary found in type names \
         (banned: {:?}). Rename to a verb+object responsibility.\n{}",
        FORBIDDEN_TYPE_TOKENS,
        format_violations(&violations),
    );
}

#[test]
fn handler_suffix_is_confined_to_interfaces_http() {
    let violations = collect_files(Path::new(SRC_ROOT))
        .into_iter()
        .filter(|file| !file.starts_with(Path::new(SRC_ROOT).join("interfaces").join("http")))
        .flat_map(|file| handler_type_decl_violations(&file))
        .collect::<Vec<_>>();

    assert!(
        violations.is_empty(),
        "the `Handler` suffix is reserved for `interfaces::http` types only.\n{}",
        format_violations(&violations),
    );
}

fn assert_no_forbidden_imports(layer: &str) {
    let layer_root = Path::new(SRC_ROOT).join(layer);
    let violations = collect_files(&layer_root)
        .into_iter()
        .flat_map(|file| forbidden_import_violations(&file))
        .collect::<Vec<_>>();

    assert!(
        violations.is_empty(),
        "layer `{layer}` imports infrastructure crates \
         (banned: {:?}). Move the dependency to the `infrastructure` layer \
         and expose it through a port in `domain` / `application`.\n{}",
        FORBIDDEN_INFRA_CRATES,
        format_violations(&violations),
    );
}

#[derive(Debug)]
struct Violation {
    file: PathBuf,
    line: usize,
    text: String,
    reason: String,
}

fn forbidden_import_violations(path: &Path) -> Vec<Violation> {
    let source = fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("failed to read {}: {e}", path.display()));
    source
        .lines()
        .enumerate()
        .filter_map(|(idx, raw_line)| {
            let line = strip_comment(raw_line).trim();
            if !line.starts_with("use ") {
                return None;
            }
            let after_use = line.trim_start_matches("use ").trim();
            FORBIDDEN_INFRA_CRATES
                .iter()
                .find(|crate_name| imports_crate(after_use, crate_name))
                .map(|crate_name| Violation {
                    file: path.to_path_buf(),
                    line: idx + 1,
                    text: raw_line.trim_end().to_string(),
                    reason: format!("forbidden crate `{crate_name}`"),
                })
        })
        .collect()
}

fn imports_crate(use_path: &str, crate_name: &str) -> bool {
    let head = use_path
        .split(|c: char| c == ':' || c == ';' || c == '{' || c.is_whitespace())
        .next()
        .unwrap_or("");
    head == crate_name
}

fn forbidden_type_decl_violations(path: &Path) -> Vec<Violation> {
    let source = fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("failed to read {}: {e}", path.display()));
    source
        .lines()
        .enumerate()
        .filter_map(|(idx, raw_line)| {
            let line = strip_comment(raw_line);
            let name = declared_type_name(line)?;
            FORBIDDEN_TYPE_TOKENS
                .iter()
                .find(|token| contains_token(name, token))
                .map(|token| Violation {
                    file: path.to_path_buf(),
                    line: idx + 1,
                    text: raw_line.trim_end().to_string(),
                    reason: format!("type name contains banned token `{token}`"),
                })
        })
        .collect()
}

fn handler_type_decl_violations(path: &Path) -> Vec<Violation> {
    let source = fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("failed to read {}: {e}", path.display()));
    source
        .lines()
        .enumerate()
        .filter_map(|(idx, raw_line)| {
            let line = strip_comment(raw_line);
            let name = declared_type_name(line)?;
            if contains_token(name, "Handler") {
                Some(Violation {
                    file: path.to_path_buf(),
                    line: idx + 1,
                    text: raw_line.trim_end().to_string(),
                    reason: "type name contains `Handler` outside interfaces::http".to_string(),
                })
            } else {
                None
            }
        })
        .collect()
}

fn declared_type_name(line: &str) -> Option<&str> {
    const KEYWORDS: &[&str] = &["struct ", "enum ", "trait ", "type ", "union "];
    let line = line.trim_start();
    let after_visibility = line
        .strip_prefix("pub ")
        .or_else(|| line.strip_prefix("pub(crate) "))
        .or_else(|| line.strip_prefix("pub(super) "))
        .unwrap_or(line)
        .trim_start();
    let after_unsafe = after_visibility
        .strip_prefix("unsafe ")
        .unwrap_or(after_visibility)
        .trim_start();
    let after_keyword = KEYWORDS
        .iter()
        .find_map(|kw| after_unsafe.strip_prefix(kw))?
        .trim_start();
    let name_end = after_keyword
        .find(|c: char| !c.is_alphanumeric() && c != '_')
        .unwrap_or(after_keyword.len());
    let name = &after_keyword[..name_end];
    if name.is_empty() { None } else { Some(name) }
}

/// Checks whether `name` contains `token` at a PascalCase word boundary.
///
/// Treats `token` as matched when the next character is end-of-string or
/// the start of a new word (uppercase letter or non-ident character).
/// Digits and underscores are treated as continuation characters (not word
/// boundaries), so `"Engine2"` does NOT match `"Engine"`.
/// `prev` is intentionally ignored: `UserService` should match `Service`
/// even though `r` is lowercase.
///
/// Examples:
/// - `"UserService"` matches `"Service"` (next = end-of-string)
/// - `"ServiceImpl"` matches `"Service"` (next = `'I'` uppercase)
/// - `"Engineer"` does NOT match `"Engine"` (next = `'e'` lowercase)
/// - `"Engine2"` does NOT match `"Engine"` (next = `'2'` digit, continuation)
fn contains_token(name: &str, token: &str) -> bool {
    let mut start = 0;
    while let Some(pos) = name[start..].find(token) {
        let abs = start + pos;
        let after = &name[abs + token.len()..];
        let next_ok = after
            .chars()
            .next()
            .map(|c| !(c.is_lowercase() || c.is_ascii_digit() || c == '_'))
            .unwrap_or(true);
        if next_ok {
            return true;
        }
        start = abs + token.len();
    }
    false
}

fn strip_comment(line: &str) -> &str {
    line.split_once("//").map(|(code, _)| code).unwrap_or(line)
}

fn collect_files(root: &Path) -> Vec<PathBuf> {
    // Intentionally return empty rather than panic when the root directory does
    // not exist yet. This lets the tests pass during early project stages before
    // `domain/` and `application/` directories are created, without requiring a
    // separate guard in every caller.
    if !root.exists() {
        return Vec::new();
    }
    let mut out = Vec::new();
    walk(root, &mut out);
    out
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let entries =
        fs::read_dir(dir).unwrap_or_else(|e| panic!("failed to read_dir {}: {e}", dir.display()));
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
            out.push(path);
        }
    }
}

fn format_violations(violations: &[Violation]) -> String {
    violations
        .iter()
        .map(|v| {
            format!(
                "  {}:{} — {}\n    {}",
                v.file.display(),
                v.line,
                v.reason,
                v.text
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod helpers_self_test {
    use super::{contains_token, declared_type_name, imports_crate, strip_comment};

    #[test]
    fn contains_token_matches_pascal_case_boundaries() {
        assert!(contains_token("UserService", "Service"));
        assert!(contains_token("ServiceImpl", "Service"));
        assert!(contains_token("UserServiceImpl", "Service"));
        assert!(contains_token("Engine", "Engine"));
        assert!(contains_token("Manager", "Manager"));
    }

    #[test]
    fn contains_token_skips_legitimate_words() {
        assert!(!contains_token("Engineer", "Engine"));
        assert!(!contains_token("Servicing", "Service"));
        assert!(!contains_token("Helpline", "Helper")); // Helper is not a substring of Helpline
        assert!(contains_token("FormHelper", "Helper")); // FormHelper ends with the banned token
        // Boundary spec: only the character AFTER the token is checked, not
        // the one before. So PascalCase composition matches even when the
        // preceding char is lowercase, but a fully lowercase word does not
        // match an uppercase token.
        assert!(contains_token("XService", "Service"));
        assert!(!contains_token("service", "Service"));
    }

    #[test]
    fn contains_token_treats_digits_as_continuation() {
        // Digits are continuation characters, not word boundaries.
        // "Engine2" does NOT match "Engine" because '2' continues the token.
        assert!(!contains_token("Engine2", "Engine"));
        assert!(!contains_token("Service2", "Service"));
        // Underscores are also continuation characters.
        assert!(!contains_token("Engine_v2", "Engine"));
    }

    #[test]
    fn declared_type_name_extracts_unsafe_trait() {
        assert_eq!(
            declared_type_name("pub unsafe trait FooService {}"),
            Some("FooService")
        );
        assert_eq!(
            declared_type_name("unsafe trait BarManager {}"),
            Some("BarManager")
        );
    }

    #[test]
    fn declared_type_name_extracts_struct_enum_trait() {
        assert_eq!(declared_type_name("pub struct Foo;"), Some("Foo"));
        assert_eq!(declared_type_name("pub(crate) enum Bar { A }"), Some("Bar"));
        assert_eq!(declared_type_name("    trait Baz {}"), Some("Baz"));
        assert_eq!(declared_type_name("pub type Alias = u32;"), Some("Alias"));
        assert_eq!(declared_type_name("fn foo() {}"), None);
        assert_eq!(declared_type_name("// pub struct Foo;"), None);
    }

    #[test]
    fn strip_comment_removes_line_comment_tail() {
        assert_eq!(
            strip_comment("use axum::Router; // re-export"),
            "use axum::Router; "
        );
        assert_eq!(strip_comment("// pub struct Foo"), "");
        assert_eq!(strip_comment("pub struct Foo;"), "pub struct Foo;");
        // Known limitation: a `//` inside a string literal would also be
        // stripped, but `use` lines and type declarations don't carry
        // string literals in practice. Block comments (`/* ... */`) are
        // also out of scope; document any new false positive here.
        assert_eq!(strip_comment("let s = \"a // b\";"), "let s = \"a ");
    }

    #[test]
    fn imports_crate_recognises_use_paths() {
        assert!(imports_crate("axum::Router;", "axum"));
        assert!(imports_crate("sqlx::{MySql, Pool};", "sqlx"));
        assert!(imports_crate(
            "tower_http::trace::TraceLayer;",
            "tower_http"
        ));
        assert!(!imports_crate("crate::domain::User;", "axum"));
        assert!(!imports_crate("self::sub::Foo;", "axum"));
    }
}
