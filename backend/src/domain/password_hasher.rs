//! Turning a password into something that can be stored and checked later.
//! A real-world concept (a secret is never written down as is), so the port
//! lives in domain; the Argon2id implementation is in infrastructure.

use crate::domain::user::{Password, PasswordHash};

pub trait PasswordHasher: Send + Sync {
    /// Hashes with a fresh random salt. Fails only on an internal error of
    /// the algorithm, never because of the password.
    fn hash(&self, password: &Password) -> Result<PasswordHash, PasswordHashingFailed>;

    /// True when `password` is the one `hash` was made from. A malformed
    /// stored hash counts as a mismatch.
    fn verify(&self, password: &Password, hash: &PasswordHash) -> bool;
}

#[derive(Debug, thiserror::Error)]
#[error("password hashing failed: {0}")]
pub struct PasswordHashingFailed(pub String);
