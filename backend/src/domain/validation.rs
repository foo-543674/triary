//! Input validation results shared by every domain value and validator.
//!
//! Validation does not fail fast (`.contexts/api-design.md` §1.6): a value
//! object or validator collects every violation it finds and returns them
//! together as `Err(Vec<Violation>)`. A violation names the kind of rule that
//! was broken ([`ViolationCode`]) and the input it concerns ([`FieldPath`]);
//! the code never embeds the field name.

use std::fmt;

/// The kind of rule an input broke. The variants are the field-dependent
/// codes of `api-design.md` §1.6; the HTTP layer spells them in snake_case.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ViolationCode {
    Required,
    TooShort,
    TooLong,
    InvalidCharset,
    InvalidFormat,
    Empty,
    OutOfRange,
    InFuture,
    BeforeStart,
    Reserved,
    AlreadyTaken,
    NotFound,
    LockedByExistingRecords,
    IncompatibleWithExistingSets,
    CreatesCycle,
    ExceedsMaxDepth,
    ExceedsMaxChildren,
    ExceedsMaxBlocks,
    MissingRequiredMeasurement,
}

/// Path of the input a violation is about, in the API's notation:
/// `name`, `sets[1].reps`, `blocks[0].sets[2].weight_kg`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FieldPath(String);

impl FieldPath {
    pub fn new(name: &str) -> Self {
        Self(name.to_owned())
    }

    /// `items` → `items[3]`.
    pub fn index(&self, position: usize) -> Self {
        Self(format!("{}[{position}]", self.0))
    }

    /// `sets[1]` → `sets[1].reps`.
    pub fn child(&self, name: &str) -> Self {
        Self(format!("{}.{name}", self.0))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for FieldPath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// One broken rule on one input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Violation {
    pub field: FieldPath,
    pub code: ViolationCode,
}

impl Violation {
    pub fn new(field: FieldPath, code: ViolationCode) -> Self {
        Self { field, code }
    }
}

/// Violations of `field` for the rules that are broken (`true`), in order.
pub fn broken_rules(
    field: &FieldPath,
    rules: impl IntoIterator<Item = (bool, ViolationCode)>,
) -> Vec<Violation> {
    rules
        .into_iter()
        .filter(|(broken, _)| *broken)
        .map(|(_, code)| Violation::new(field.clone(), code))
        .collect()
}

/// Runs every check and keeps every violation, so callers can validate
/// several fields without stopping at the first failure.
///
/// Returns `Ok(value)` when `violations` is empty.
pub fn collect<T>(value: T, violations: Vec<Violation>) -> Result<T, Vec<Violation>> {
    if violations.is_empty() {
        Ok(value)
    } else {
        Err(violations)
    }
}

/// Combines two independent validation results, keeping the violations of
/// both sides when both fail.
pub fn both<A, B>(
    left: Result<A, Vec<Violation>>,
    right: Result<B, Vec<Violation>>,
) -> Result<(A, B), Vec<Violation>> {
    match (left, right) {
        (Ok(a), Ok(b)) => Ok((a, b)),
        (Err(e), Ok(_)) | (Ok(_), Err(e)) => Err(e),
        (Err(mut e1), Err(e2)) => {
            e1.extend(e2);
            Err(e1)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn violation(field: &str, code: ViolationCode) -> Violation {
        Violation::new(FieldPath::new(field), code)
    }

    #[test]
    fn field_path_builds_nested_notation() {
        let path = FieldPath::new("blocks")
            .index(0)
            .child("sets")
            .index(2)
            .child("reps");
        assert_eq!(path.as_str(), "blocks[0].sets[2].reps");
    }

    #[test]
    fn collect_is_ok_without_violations() {
        assert_eq!(collect(5, vec![]), Ok(5));
    }

    #[test]
    fn collect_returns_every_violation() {
        let violations = vec![
            violation("name", ViolationCode::TooLong),
            violation("name", ViolationCode::InvalidCharset),
        ];
        assert_eq!(collect(5, violations.clone()), Err(violations));
    }

    #[test]
    fn both_keeps_violations_from_both_sides() {
        let left: Result<u8, _> = Err(vec![violation("user_id", ViolationCode::TooShort)]);
        let right: Result<u8, _> = Err(vec![violation("password", ViolationCode::TooShort)]);
        assert_eq!(
            both(left, right),
            Err(vec![
                violation("user_id", ViolationCode::TooShort),
                violation("password", ViolationCode::TooShort),
            ])
        );
    }

    #[test]
    fn both_passes_through_a_single_failure_and_success() {
        let ok: Result<u8, Vec<Violation>> = Ok(1);
        let err: Result<u8, _> = Err(vec![violation("password", ViolationCode::TooLong)]);
        assert_eq!(both(ok.clone(), ok.clone()), Ok((1, 1)));
        assert_eq!(
            both(ok, err),
            Err(vec![violation("password", ViolationCode::TooLong)])
        );
    }
}
