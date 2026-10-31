//! Login (US-2): check the credentials and open a session.

use super::{AuthDeps, SignedIn, open_session};
use crate::domain::user::{Password, PasswordHash, UserHandle};

#[derive(Debug, thiserror::Error)]
pub enum LoginError {
    /// Unknown handle or wrong password; the reply never says which.
    #[error("invalid credentials")]
    InvalidCredentials,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// An Argon2id hash (same parameters as `Argon2idHasher`) of a random
/// string nobody knows. Checked when the handle does not exist, so an
/// unknown handle costs the same time as a wrong password and the timing
/// does not reveal which handles exist.
pub(crate) const DUMMY_HASH: &str = "$argon2id$v=19$m=19456,t=2,p=1$QQWCN55OusXEYjgMtJQEww$WrOJE3uKbIpdq/ou1OsAPk9D6m8oje+Iz+e2mw53tp0";

pub async fn login(
    deps: &AuthDeps,
    user_id: String,
    password: String,
) -> Result<SignedIn, LoginError> {
    let password = Password::unchecked(password);
    let user = match UserHandle::parse(&user_id) {
        Ok(handle) => deps.users.find_by_handle(&handle).await?,
        Err(_) => None,
    };
    let stored = user
        .as_ref()
        .map(|user| user.password_hash().clone())
        .unwrap_or_else(|| PasswordHash::new(DUMMY_HASH.to_owned()));
    let matches = verify_off_the_runtime(deps, password, stored).await?;
    match user {
        Some(user) if matches => Ok(open_session(deps, user.id(), user.handle().clone()).await?),
        _ => Err(LoginError::InvalidCredentials),
    }
}

/// Verifying costs as much as hashing; keep it off the async workers.
async fn verify_off_the_runtime(
    deps: &AuthDeps,
    password: Password,
    hash: PasswordHash,
) -> anyhow::Result<bool> {
    let hasher = deps.hasher.clone();
    Ok(tokio::task::spawn_blocking(move || hasher.verify(&password, &hash)).await?)
}
