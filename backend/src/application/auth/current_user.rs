//! Who is behind a browser session (`GET /web/v1/me` and every protected
//! endpoint).

use super::AuthDeps;
use crate::application::ports::secrets::SessionToken;
use crate::domain::user::User;

/// The user of a live session, or `None` for a missing, expired or unknown
/// session. Records the use of the session.
pub async fn current_user(deps: &AuthDeps, token: &SessionToken) -> anyhow::Result<Option<User>> {
    match deps.sessions.touch(token, deps.clock.now()).await? {
        Some(id) => deps.users.find_by_id(&id).await,
        None => Ok(None),
    }
}
