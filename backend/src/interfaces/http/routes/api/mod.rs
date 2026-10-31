//! REST API (`/api/v1`, api-design §2.2-§2.6). Every route needs a session.

mod edit;
mod exercises;
mod history;
mod sessions;

use axum::Router;
use axum::routing::{get, post};

use crate::interfaces::http::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/exercises", get(exercises::list))
        .route("/api/v1/exercises/{exercise_id}", get(exercises::detail))
        .route("/api/v1/history/sessions", get(history::sessions))
        .route("/api/v1/sessions", post(sessions::start))
        .route(
            "/api/v1/sessions/{session_id}",
            get(sessions::show)
                .patch(edit::update_session)
                .delete(edit::remove_session),
        )
        .route("/api/v1/sessions/{session_id}/end", post(edit::end))
        .route(
            "/api/v1/blocks/{block_id}",
            axum::routing::patch(edit::update_block).delete(edit::remove_block),
        )
        .route(
            "/api/v1/sets/{set_id}",
            axum::routing::patch(edit::update_set).delete(edit::remove_set),
        )
        .route(
            "/api/v1/sessions/{session_id}/blocks",
            post(sessions::add_block),
        )
        .route("/api/v1/blocks/{block_id}/sets", post(sessions::add_set))
}
