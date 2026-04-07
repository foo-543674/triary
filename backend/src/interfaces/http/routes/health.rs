//! `GET /health` health check endpoint.
//!
//! Confirms that the process itself is alive. Currently implemented as a
//! liveness probe that does not touch downstream layers (DB, etc.). When a
//! readiness probe is needed, add a separate `/ready` route.

use axum::{Json, Router, routing::get};
use serde::Serialize;

use crate::interfaces::http::error::AppError;

/// Status value reported by `/health`.
///
/// Modelled as an enum (instead of a bare string) so that adding values like
/// `degraded` later forces every consumer to handle the new variant via the
/// type system.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Ok,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: HealthStatus,
}

pub fn router() -> Router {
    Router::new().route("/health", get(health))
}

async fn health() -> Result<Json<HealthResponse>, AppError> {
    Ok(Json(HealthResponse {
        status: HealthStatus::Ok,
    }))
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use http_body_util::BodyExt as _;
    use pretty_assertions::assert_eq;
    use serde_json::Value;
    use tower::ServiceExt as _;

    use crate::app;

    #[tokio::test]
    async fn get_health_returns_ok() {
        let response = app()
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
    }
}
