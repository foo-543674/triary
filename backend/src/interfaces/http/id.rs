//! Resource IDs in the API: a type prefix and the 16 ID bytes in Crockford
//! base32, 26 characters like a ULID (`IdString` in openapi.yaml,
//! api-design §3). The prefix is an API concern only (data-model §3).

const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Prefixes of the resource types.
pub mod prefix {
    pub const EXERCISE: &str = "exr";
    pub const SESSION: &str = "ses";
    pub const BLOCK: &str = "blk";
    pub const SET: &str = "set";
}

/// `exr` + bytes → `exr_01HZ...`.
pub fn format(prefix: &str, bytes: &[u8; 16]) -> String {
    let value = u128::from_be_bytes(*bytes);
    let text: String = (0..26)
        .rev()
        .map(|position| ALPHABET[((value >> (position * 5)) & 0x1f) as usize] as char)
        .collect();
    format!("{prefix}_{text}")
}

/// Reads an ID of the given type. Lower case is accepted; anything else
/// (wrong prefix, length, characters, or a value above 128 bits) is `None`.
pub fn parse(prefix: &str, text: &str) -> Option<[u8; 16]> {
    let body = text.strip_prefix(prefix)?.strip_prefix('_')?;
    if body.len() != 26 {
        return None;
    }
    // The first character carries only the top 3 bits.
    let first = digit(body.as_bytes()[0])?;
    if first > 7 {
        return None;
    }
    body.bytes()
        .try_fold(0u128, |acc, c| Some((acc << 5) | u128::from(digit(c)?)))
        .map(u128::to_be_bytes)
}

fn digit(c: u8) -> Option<u8> {
    let upper = c.to_ascii_uppercase();
    ALPHABET.iter().position(|&a| a == upper).map(|i| i as u8)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn round_trips(bytes in proptest::array::uniform16(any::<u8>())) {
            let text = format(prefix::EXERCISE, &bytes);
            prop_assert_eq!(text.len(), 30);
            prop_assert_eq!(parse(prefix::EXERCISE, &text), Some(bytes));
            prop_assert_eq!(parse(prefix::EXERCISE, &text.to_lowercase()), Some(bytes));
        }

        #[test]
        fn never_panics(text in ".{0,40}") {
            let _ = parse(prefix::EXERCISE, &text);
        }
    }

    #[test]
    fn matches_the_ulid_text_of_known_bytes() {
        // Seed ID of the first preset (bench press); expected text computed
        // independently with a Python one-liner.
        let bytes = 0x0192_E000_0000_7000_0000_0000_0000_0001_u128.to_be_bytes();
        assert_eq!(
            format(prefix::EXERCISE, &bytes),
            "exr_01JBG00000E000000000000001"
        );
    }

    #[test]
    fn rejects_other_types_and_malformed_text() {
        let text = format(prefix::EXERCISE, &[0; 16]);
        assert_eq!(parse(prefix::SESSION, &text), None);
        assert_eq!(parse(prefix::EXERCISE, "exr_"), None);
        assert_eq!(
            parse(prefix::EXERCISE, "exr_8ZZZZZZZZZZZZZZZZZZZZZZZZZ"),
            None
        );
        assert_eq!(
            parse(prefix::EXERCISE, "exr_0000000000000000000000000U"),
            None
        );
    }
}
