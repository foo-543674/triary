//! Server-side browser sessions (`user_sessions`).

use chrono::{DateTime, Utc};

use super::BoxFuture;
use super::secrets::SessionToken;
use crate::domain::user::UserId;

pub trait SessionStore: Send + Sync {
    fn create<'a>(
        &'a self,
        token: &'a SessionToken,
        user: UserId,
        now: DateTime<Utc>,
        expires_at: DateTime<Utc>,
    ) -> BoxFuture<'a, anyhow::Result<()>>;

    /// The user of a session that has not expired at `now`, and records
    /// `now` as its last use.
    fn touch<'a>(
        &'a self,
        token: &'a SessionToken,
        now: DateTime<Utc>,
    ) -> BoxFuture<'a, anyhow::Result<Option<UserId>>>;

    /// Removes the session; removing an unknown one is not an error.
    fn delete<'a>(&'a self, token: &'a SessionToken) -> BoxFuture<'a, anyhow::Result<()>>;
}
