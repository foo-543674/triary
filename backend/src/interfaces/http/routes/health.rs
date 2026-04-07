//! `GET /health` ヘルスチェック。
//!
//! 本体プロセスが生きていることを確認するためのエンドポイント。
//! 現状は DB 等の下位層に触れない liveness probe として実装している。
//! 将来的に readiness probe が必要になったら `/ready` を別途追加する方針。

use axum::{Json, Router, routing::get};
use serde::Serialize;

use crate::interfaces::http::error::AppError;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
}

pub fn router() -> Router {
    Router::new().route("/health", get(health))
}

async fn health() -> Result<Json<HealthResponse>, AppError> {
    Ok(Json(HealthResponse { status: "ok" }))
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
