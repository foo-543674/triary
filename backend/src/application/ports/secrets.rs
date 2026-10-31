//! Fresh identifiers and secrets. Randomness and the system clock behind
//! IDs are infrastructure; tests pass deterministic sources.

use std::fmt;

use crate::domain::user::UserId;

/// A browser session's secret: 256 random bits (api-design §1.3). Only its
/// SHA-256 is stored; the raw value lives in the cookie.
#[derive(Clone, PartialEq, Eq)]
pub struct SessionToken([u8; 32]);

impl SessionToken {
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Cookie value: 64 lower-case hex digits.
    pub fn to_hex(&self) -> String {
        self.0.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    /// Reads a cookie value written by [`Self::to_hex`]. Anything else is
    /// `None` (treated like a missing cookie).
    pub fn from_hex(value: &str) -> Option<Self> {
        if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let mut bytes = [0u8; 32];
        for (slot, pair) in bytes.iter_mut().zip(value.as_bytes().chunks(2)) {
            let text = std::str::from_utf8(pair).ok()?;
            *slot = u8::from_str_radix(text, 16).ok()?;
        }
        Some(Self(bytes))
    }
}

impl fmt::Debug for SessionToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("SessionToken(<redacted>)")
    }
}

pub trait SecretSource: Send + Sync {
    fn session_token(&self) -> anyhow::Result<SessionToken>;
}

pub trait IdSource: Send + Sync {
    fn user_id(&self) -> UserId;
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn hex_round_trips(bytes in proptest::array::uniform32(any::<u8>())) {
            let token = SessionToken::from_bytes(bytes);
            prop_assert_eq!(SessionToken::from_hex(&token.to_hex()), Some(token));
        }

        #[test]
        fn from_hex_never_panics(value in ".{0,80}") {
            let _ = SessionToken::from_hex(&value);
        }
    }

    #[test]
    fn from_hex_rejects_wrong_length_and_non_hex() {
        assert_eq!(SessionToken::from_hex(&"a".repeat(63)), None);
        assert_eq!(SessionToken::from_hex(&"g".repeat(64)), None);
        assert_eq!(SessionToken::from_hex(&"é".repeat(32)), None);
    }

    #[test]
    fn debug_output_hides_the_secret() {
        let token = SessionToken::from_bytes([0xab; 32]);
        assert!(!format!("{token:?}").contains("ab"));
    }
}
