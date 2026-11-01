//! Opaque page cursors (api-design §1.5): base64url (no padding) of a
//! small text key, so clients cannot rely on the keyset inside.

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

pub fn encode(bytes: &[u8]) -> String {
    bytes
        .chunks(3)
        .flat_map(|chunk| {
            let b = [
                chunk[0],
                *chunk.get(1).unwrap_or(&0),
                *chunk.get(2).unwrap_or(&0),
            ];
            let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
            let chars = chunk.len() + 1;
            (0..4)
                .take(chars)
                .map(move |i| ALPHABET[((n >> (18 - 6 * i)) & 0x3f) as usize] as char)
        })
        .collect()
}

pub fn decode(text: &str) -> Option<Vec<u8>> {
    if text.len() % 4 == 1 {
        return None;
    }
    let values: Vec<u32> = text
        .bytes()
        .map(|c| ALPHABET.iter().position(|&a| a == c).map(|i| i as u32))
        .collect::<Option<_>>()?;
    Some(
        values
            .chunks(4)
            .flat_map(|chunk| {
                let n = chunk
                    .iter()
                    .chain(std::iter::repeat(&0))
                    .take(4)
                    .fold(0u32, |acc, v| (acc << 6) | v);
                let bytes = chunk.len() - 1;
                (0..bytes).map(move |i| (n >> (16 - 8 * i)) as u8)
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn known_values() {
        // RFC 4648 test vectors, base64url without padding.
        for (plain, encoded) in [
            ("", ""),
            ("f", "Zg"),
            ("fo", "Zm8"),
            ("foo", "Zm9v"),
            ("foob", "Zm9vYg"),
            ("fooba", "Zm9vYmE"),
            ("foobar", "Zm9vYmFy"),
        ] {
            assert_eq!(encode(plain.as_bytes()), encoded);
            assert_eq!(decode(encoded).unwrap(), plain.as_bytes());
        }
        assert_eq!(encode(&[0xfb, 0xff]), "-_8");
    }

    #[test]
    fn rejects_non_alphabet_and_impossible_lengths() {
        assert_eq!(decode("Zm9v+"), None);
        assert_eq!(decode("Z"), None);
    }

    proptest! {
        #[test]
        fn round_trips(bytes in proptest::collection::vec(any::<u8>(), 0..64)) {
            prop_assert_eq!(decode(&encode(&bytes)), Some(bytes));
        }

        #[test]
        fn decode_never_panics(text in ".{0,40}") {
            let _ = decode(&text);
        }
    }
}
