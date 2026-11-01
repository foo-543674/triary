//! Logout (US-2): end the browser session right away.

use super::AuthDeps;
use crate::application::ports::secrets::SessionToken;

pub async fn logout(deps: &AuthDeps, token: &SessionToken) -> anyhow::Result<()> {
    deps.sessions.delete(token).await
}
