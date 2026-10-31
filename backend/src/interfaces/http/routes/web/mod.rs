//! Web UI BFF (`/web/v1`, api-design §2.1): browser session lifecycle.

mod signup;

use axum::Router;
use axum::routing::post;

use crate::interfaces::http::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/web/v1/signup", post(signup::signup))
}
