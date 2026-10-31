//! Browser session lifecycle: sign-up and, in later slices, login, logout
//! and the current user (api-design §2.1).

pub mod signup;

use std::sync::Arc;

use chrono::{DateTime, Duration, Utc};

use crate::application::ports::secrets::{IdSource, SecretSource, SessionToken};
use crate::application::ports::session_store::SessionStore;
use crate::application::ports::user_repository::UserRepository;
use crate::domain::clock::Clock;
use crate::domain::password_hasher::PasswordHasher;
use crate::domain::user::{UserHandle, UserId};

/// How long a browser session lasts (cookie `Max-Age=2592000`, api-design
/// §1.3).
pub const SESSION_LIFETIME: Duration = Duration::days(30);

/// Everything the auth use cases need, as trait objects so infrastructure
/// and tests can plug in.
#[derive(Clone)]
pub struct AuthDeps {
    pub users: Arc<dyn UserRepository>,
    pub sessions: Arc<dyn SessionStore>,
    pub hasher: Arc<dyn PasswordHasher>,
    pub clock: Arc<dyn Clock>,
    pub ids: Arc<dyn IdSource>,
    pub secrets: Arc<dyn SecretSource>,
}

/// A user who now has a browser session.
#[derive(Debug)]
pub struct SignedIn {
    pub handle: UserHandle,
    pub token: SessionToken,
    pub expires_at: DateTime<Utc>,
}

/// Opens a session for `user` and returns its secret.
async fn open_session(
    deps: &AuthDeps,
    user: UserId,
    handle: UserHandle,
) -> anyhow::Result<SignedIn> {
    let token = deps.secrets.session_token()?;
    let now = deps.clock.now();
    let expires_at = now + SESSION_LIFETIME;
    deps.sessions.create(&token, user, now, expires_at).await?;
    Ok(SignedIn {
        handle,
        token,
        expires_at,
    })
}
