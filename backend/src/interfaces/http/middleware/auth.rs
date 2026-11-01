//! Authentication: a handler that takes [`CurrentUser`] only runs for a
//! request with a live session cookie; any other request is answered 401
//! `unauthenticated` (api-design §1.3).

use axum::extract::FromRequestParts;
use axum::http::request::Parts;

use crate::application::auth::current_user::current_user;
use crate::application::ports::secrets::SessionToken;
use crate::domain::user::User;
use crate::interfaces::http::error::AppError;
use crate::interfaces::http::session_cookie;
use crate::interfaces::http::state::AppState;

/// The signed-in user and the session they came with.
pub struct CurrentUser {
    pub user: User,
    pub token: SessionToken,
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = session_cookie::read(&parts.headers).ok_or(AppError::Unauthenticated)?;
        let user = current_user(&state.auth, &token)
            .await?
            .ok_or(AppError::Unauthenticated)?;
        Ok(Self { user, token })
    }
}
