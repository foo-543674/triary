//! REST API (`/api/v1`, api-design §2.2-§2.6). Every route needs a session.

mod exercises;

use axum::Router;
use axum::routing::get;

use crate::interfaces::http::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/exercises", get(exercises::list))
        .route("/api/v1/exercises/{exercise_id}", get(exercises::detail))
}
