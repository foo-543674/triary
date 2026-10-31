//! REST API (`/api/v1`, api-design §2.2-§2.6). Every route needs a session.

mod exercises;
mod sessions;

use axum::Router;
use axum::routing::{get, post};

use crate::interfaces::http::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/exercises", get(exercises::list))
        .route("/api/v1/exercises/{exercise_id}", get(exercises::detail))
        .route("/api/v1/sessions", post(sessions::start))
        .route("/api/v1/sessions/{session_id}", get(sessions::show))
        .route(
            "/api/v1/sessions/{session_id}/blocks",
            post(sessions::add_block),
        )
        .route("/api/v1/blocks/{block_id}/sets", post(sessions::add_set))
}
