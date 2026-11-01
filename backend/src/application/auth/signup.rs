//! Sign-up (US-1): create the user and sign them in.

use super::{AuthDeps, SignedIn, open_session};
use crate::application::ports::user_repository::InsertUserError;
use crate::domain::user::create::{CreateUserInput, CreateUserValidator, UserFactory};
use crate::domain::user::{Password, PasswordHash};
use crate::domain::validation::{FieldPath, Violation, ViolationCode};

#[derive(Debug, thiserror::Error)]
pub enum SignupError {
    #[error("sign-up input rejected: {0:?}")]
    Rejected(Vec<Violation>),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<Vec<Violation>> for SignupError {
    fn from(violations: Vec<Violation>) -> Self {
        Self::Rejected(violations)
    }
}

impl From<InsertUserError> for SignupError {
    fn from(error: InsertUserError) -> Self {
        match error {
            // Lost a race with another sign-up for the same handle.
            InsertUserError::HandleTaken => Self::Rejected(vec![Violation::new(
                FieldPath::new("user_id"),
                ViolationCode::AlreadyTaken,
            )]),
            InsertUserError::Other(error) => Self::Internal(error),
        }
    }
}

pub async fn signup(deps: &AuthDeps, input: CreateUserInput) -> Result<SignedIn, SignupError> {
    let handle_taken = match input.handle_to_check() {
        Some(handle) => deps.users.handle_exists(&handle).await?,
        None => false,
    };
    let validated = CreateUserValidator::validate(input, handle_taken)?;
    let password_hash = hash_off_the_runtime(deps, validated.password()).await?;
    let user = UserFactory::create(
        validated,
        deps.ids.user_id(),
        password_hash,
        deps.clock.now(),
    );
    deps.users.insert(&user).await?;
    // Not one transaction with the insert: if opening the session fails the
    // account stays and the reply is 500; the user can then sign in (login
    // slice) instead of signing up again.
    Ok(open_session(deps, user.id(), user.handle().clone()).await?)
}

/// Argon2id takes tens of milliseconds of CPU (about 44 ms observed in a
/// release build); run it on the blocking pool so an anonymous endpoint
/// cannot stall the async workers.
async fn hash_off_the_runtime(
    deps: &AuthDeps,
    password: &Password,
) -> anyhow::Result<PasswordHash> {
    let hasher = deps.hasher.clone();
    let password = password.clone();
    let hash = tokio::task::spawn_blocking(move || hasher.hash(&password)).await??;
    Ok(hash)
}
