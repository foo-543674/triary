//! Argon2id password hashing (architecture.md "認証・セッション方針").

use argon2::password_hash::phc::PasswordHash as PhcString;
use argon2::password_hash::{PasswordHasher as _, PasswordVerifier as _};
use argon2::{Algorithm, Argon2, Params, Version};

use crate::domain::password_hasher::{PasswordHasher, PasswordHashingFailed};
use crate::domain::user::{Password, PasswordHash};

/// Parameters: m = 19 MiB, t = 2, p = 1 (OWASP Password Storage Cheat
/// Sheet). Provisional until the owner confirms them in #69. The PHC string
/// records them, so hashes made with other parameters still verify.
const MEMORY_KIB: u32 = 19_456;
const ITERATIONS: u32 = 2;
const PARALLELISM: u32 = 1;

pub struct Argon2idHasher {
    argon2: Argon2<'static>,
}

impl Argon2idHasher {
    pub fn new() -> Self {
        let params = Params::new(MEMORY_KIB, ITERATIONS, PARALLELISM, None)
            .expect("constant Argon2 parameters are valid");
        Self {
            argon2: Argon2::new(Algorithm::Argon2id, Version::V0x13, params),
        }
    }
}

impl Default for Argon2idHasher {
    fn default() -> Self {
        Self::new()
    }
}

impl PasswordHasher for Argon2idHasher {
    fn hash(&self, password: &Password) -> Result<PasswordHash, PasswordHashingFailed> {
        self.argon2
            .hash_password(password.expose().as_bytes())
            .map(|phc| PasswordHash::new(phc.to_string()))
            .map_err(|error| PasswordHashingFailed(error.to_string()))
    }

    fn verify(&self, password: &Password, hash: &PasswordHash) -> bool {
        PhcString::new(hash.as_str())
            .map(|parsed| {
                self.argon2
                    .verify_password(password.expose().as_bytes(), &parsed)
                    .is_ok()
            })
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn password(raw: &str) -> Password {
        Password::unchecked(raw.to_owned())
    }

    #[test]
    fn verifies_its_own_hash_and_rejects_others() {
        let hasher = Argon2idHasher::new();
        let hash = hasher.hash(&password("correct horse battery")).unwrap();
        assert!(hash.as_str().starts_with("$argon2id$v=19$m=19456,t=2,p=1$"));
        assert!(hasher.verify(&password("correct horse battery"), &hash));
        assert!(!hasher.verify(&password("correct horse batterz"), &hash));
    }

    #[test]
    fn salts_every_hash() {
        let hasher = Argon2idHasher::new();
        let first = hasher.hash(&password("same password")).unwrap();
        let second = hasher.hash(&password("same password")).unwrap();
        assert_ne!(first, second);
    }

    /// login checks unknown users against `DUMMY_HASH` so they cost a real
    /// Argon2id run. A malformed constant would fail to parse and make
    /// `verify` return at once, bringing the timing difference back.
    #[test]
    fn the_login_dummy_hash_is_a_real_hash_with_these_parameters() {
        use crate::application::auth::login::DUMMY_HASH;
        assert!(DUMMY_HASH.starts_with(&format!(
            "$argon2id$v=19$m={MEMORY_KIB},t={ITERATIONS},p={PARALLELISM}$"
        )));
        assert!(PhcString::new(DUMMY_HASH).is_ok());
        let hasher = Argon2idHasher::new();
        assert!(!hasher.verify(
            &password("any password"),
            &PasswordHash::new(DUMMY_HASH.into())
        ));
    }

    #[test]
    fn a_malformed_stored_hash_is_a_mismatch() {
        let hasher = Argon2idHasher::new();
        assert!(!hasher.verify(&password("x"), &PasswordHash::new("not a hash".into())));
    }
}
