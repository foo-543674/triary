//! Application error type for the HTTP layer.
//!
//! Domain and application layers define their own error types using
//! `thiserror`. This module provides [`AppError`], which collects them and
//! maps them to HTTP responses. When adding a new variant, always update both
//! of the following at the same time:
//!
//! 1. Add the variant to `AppError`.
//! 2. Map the variant in [`AppError::status_code`] to its HTTP status.
//! 3. Map the variant in [`AppError::error_code`] to the public error code.
//!
//! With this in place, handlers only need to return `Result<Json<T>, AppError>`
//! to get a uniform error response shape.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

/// Common error type returned from every HTTP handler.
///
/// Authorisation-related variants (e.g. `Forbidden`) are intentionally absent
/// because there is currently no code path that produces them (YAGNI). When
/// authorisation logic is introduced, add the matching variant in the same
/// commit. (triary's authentication strategy itself is undecided; see
/// `concept.md`.)
#[derive(Debug, Error)]
pub enum AppError {
    /// Malformed request or validation failure.
    #[error("bad request: {0}")]
    BadRequest(String),

    /// Resource not found.
    #[error("not found: {0}")]
    NotFound(String),

    /// Resource conflict (e.g. optimistic locking failure).
    #[error("conflict: {0}")]
    Conflict(String),

    /// Internal server error. Wraps any unclassified failure from lower
    /// layers.
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_code(&self) -> &'static str {
        match self {
            Self::BadRequest(_) => "bad_request",
            Self::NotFound(_) => "not_found",
            Self::Conflict(_) => "conflict",
            Self::Internal(_) => "internal_error",
        }
    }
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    code: &'static str,
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        // NOTE: Internal errors must not leak their inner message to clients,
        //       since it can carry implementation details or secrets. The full
        //       error stays in the tracing log on the server side instead.
        let (code, message) = match &self {
            Self::Internal(err) => {
                tracing::error!(error = ?err, "internal server error");
                (self.error_code(), "internal server error".to_string())
            }
            _ => (self.error_code(), self.to_string()),
        };

        (self.status_code(), Json(ErrorBody { code, message })).into_response()
    }
}
