//! Web UI BFF (`/web/v1`, api-design §2.1): browser session lifecycle.

mod session;
mod signup;

use axum::Router;
use axum::routing::{get, post};

use crate::interfaces::http::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/web/v1/signup", post(signup::signup))
        .route("/web/v1/login", post(session::login))
        .route("/web/v1/me", get(session::me))
        .route("/web/v1/logout", post(session::logout))
}
