//! The user: an account identified by a handle the person chose, with a
//! password only they know.
//!
//! Naming: the API calls the handle `user_id` (`api-design.md` §2.1); in the
//! code it is [`UserHandle`], and [`UserId`] is the internal, immutable
//! identifier (`users.user_id`, a ULID).

pub mod create;

use std::fmt;

use chrono::{DateTime, Utc};

use crate::domain::validation::{FieldPath, Violation, ViolationCode, broken_rules, collect};

/// Internal identifier of a user (16 bytes of a ULID / UUIDv7).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct UserId([u8; 16]);

impl UserId {
    pub fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(bytes)
    }

    pub fn as_bytes(&self) -> &[u8; 16] {
        &self.0
    }
}

/// Handle reserved for the system; nobody can sign up with them.
/// Provisional list (implementation-plan §5, owner confirmation in #69).
pub const RESERVED_HANDLES: &[&str] = &["admin", "api", "system", "triary", "root"];

pub const HANDLE_MIN_CHARS: usize = 3;
pub const HANDLE_MAX_CHARS: usize = 32;

/// The name a person signs in with: 3-32 of `a-z 0-9 _ -`, compared and
/// stored in lower case (specification US-1).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UserHandle(String);

impl UserHandle {
    /// Lower-cases `raw` and checks it. Reports every broken rule at once;
    /// `reserved` only when the handle is otherwise valid.
    pub fn parse(raw: &str) -> Result<Self, Vec<Violation>> {
        let field = FieldPath::new("user_id");
        let normalized = raw.to_lowercase();
        let length = normalized.chars().count();
        let rule_violations = broken_rules(
            &field,
            [
                (length < HANDLE_MIN_CHARS, ViolationCode::TooShort),
                (length > HANDLE_MAX_CHARS, ViolationCode::TooLong),
                (
                    !normalized.chars().all(is_handle_char),
                    ViolationCode::InvalidCharset,
                ),
            ],
        );
        let violations =
            if rule_violations.is_empty() && RESERVED_HANDLES.contains(&normalized.as_str()) {
                vec![Violation::new(field, ViolationCode::Reserved)]
            } else {
                rule_violations
            };
        collect(Self(normalized), violations)
    }

    /// A handle read back from storage, where it was checked when saved.
    pub fn from_stored(value: String) -> Self {
        Self(value)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

fn is_handle_char(c: char) -> bool {
    c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-'
}

pub const PASSWORD_MIN_CHARS: usize = 12;
pub const PASSWORD_MAX_CHARS: usize = 128;

/// A password in plain text: 12-128 characters of anything
/// (specification US-1). Never stored, logged or serialized; `Debug` hides it.
#[derive(Clone, PartialEq, Eq)]
pub struct Password(String);

impl Password {
    /// Checks the length. `field` is the input it came from (`password`,
    /// `new_password`, ...).
    pub fn parse(raw: String, field: &str) -> Result<Self, Vec<Violation>> {
        let length = raw.chars().count();
        let field = FieldPath::new(field);
        let violations = broken_rules(
            &field,
            [
                (length < PASSWORD_MIN_CHARS, ViolationCode::TooShort),
                (length > PASSWORD_MAX_CHARS, ViolationCode::TooLong),
            ],
        );
        collect(Self(raw), violations)
    }

    /// For checking a login attempt: no length rule, since a wrong password
    /// must not reveal anything beyond "wrong".
    pub fn unchecked(raw: String) -> Self {
        Self(raw)
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Password {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Password(<redacted>)")
    }
}

/// A stored password hash (Argon2id PHC string).
#[derive(Clone, PartialEq, Eq)]
pub struct PasswordHash(String);

impl PasswordHash {
    pub fn new(phc: String) -> Self {
        Self(phc)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for PasswordHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("PasswordHash(<redacted>)")
    }
}

/// A registered user.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct User {
    id: UserId,
    handle: UserHandle,
    password_hash: PasswordHash,
    created_at: DateTime<Utc>,
}

impl User {
    /// Rebuilds a user read from storage.
    pub fn restore(
        id: UserId,
        handle: UserHandle,
        password_hash: PasswordHash,
        created_at: DateTime<Utc>,
    ) -> Self {
        Self {
            id,
            handle,
            password_hash,
            created_at,
        }
    }

    pub fn id(&self) -> UserId {
        self.id
    }

    pub fn handle(&self) -> &UserHandle {
        &self.handle
    }

    pub fn password_hash(&self) -> &PasswordHash {
        &self.password_hash
    }

    pub fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;
    use proptest::prelude::*;
    use rstest::rstest;

    fn codes(result: Result<impl fmt::Debug, Vec<Violation>>) -> Vec<ViolationCode> {
        result
            .err()
            .unwrap_or_default()
            .into_iter()
            .map(|v| v.code)
            .collect()
    }

    #[rstest]
    #[case("abc")] // 3: lower bound
    #[case("abcdefghijklmnopqrstuvwxyz012345")] // 32: upper bound
    #[case("_a-")]
    #[case("Alice")] // normalized
    fn handle_accepts_valid_input(#[case] raw: &str) {
        assert_eq!(UserHandle::parse(raw).unwrap().as_str(), raw.to_lowercase());
    }

    #[rstest]
    #[case("", vec![ViolationCode::TooShort])]
    #[case("ab", vec![ViolationCode::TooShort])] // 2
    #[case("abcdefghijklmnopqrstuvwxyz0123456", vec![ViolationCode::TooLong])] // 33
    #[case("a b", vec![ViolationCode::InvalidCharset])]
    #[case("あい", vec![ViolationCode::TooShort, ViolationCode::InvalidCharset])]
    #[case("Admin", vec![ViolationCode::Reserved])]
    #[case("root", vec![ViolationCode::Reserved])]
    fn handle_reports_every_broken_rule(#[case] raw: &str, #[case] expected: Vec<ViolationCode>) {
        assert_eq!(codes(UserHandle::parse(raw)), expected);
    }

    #[test]
    fn handle_violations_are_on_user_id() {
        let violations = UserHandle::parse("a").unwrap_err();
        assert!(violations.iter().all(|v| v.field.as_str() == "user_id"));
    }

    #[rstest]
    #[case(11, vec![ViolationCode::TooShort])]
    #[case(12, vec![])]
    #[case(128, vec![])]
    #[case(129, vec![ViolationCode::TooLong])]
    fn password_length_bounds(#[case] length: usize, #[case] expected: Vec<ViolationCode>) {
        assert_eq!(
            codes(Password::parse("x".repeat(length), "password")),
            expected
        );
    }

    #[test]
    fn password_counts_characters_not_bytes() {
        assert!(Password::parse("パ".repeat(12), "password").is_ok());
        assert_eq!(
            codes(Password::parse("パ".repeat(11), "password")),
            vec![ViolationCode::TooShort]
        );
    }

    #[test]
    fn secrets_do_not_show_in_debug_output() {
        let password = Password::parse("correct horse battery".into(), "password").unwrap();
        assert!(!format!("{password:?}").contains("horse"));
        let hash = PasswordHash::new("$argon2id$secret".into());
        assert!(!format!("{hash:?}").contains("secret"));
    }

    proptest! {
        #[test]
        fn valid_handles_are_lowercase_and_in_charset(raw in "[A-Za-z0-9_-]{3,32}") {
            let parsed = UserHandle::parse(&raw);
            let lower = raw.to_lowercase();
            if RESERVED_HANDLES.contains(&lower.as_str()) {
                prop_assert_eq!(codes(parsed), vec![ViolationCode::Reserved]);
            } else {
                let handle = parsed.unwrap();
                prop_assert_eq!(handle.as_str(), lower.as_str());
            }
        }
    }
}
