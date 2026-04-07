//! triary-backend library crate.
//!
//! バイナリ (`src/main.rs`) はこの crate の薄い entry point であり、
//! 実際の router 組み立て・サーバ起動・ドメインロジックは全てここに集約する。
//! これにより `tests/*.rs` の結合テストや将来の別バイナリ (CLI 等) から
//! 同じ実装を import できる。
//!
//! レイヤー構成:
//! - [`domain`][]: エンティティ・値オブジェクト・ドメインサービス
//! - [`application`][]: ユースケース / アプリケーションサービス
//! - [`infrastructure`][]: DB アクセス・外部サービス実装
//! - [`interfaces`][]: HTTP ハンドラ・DTO・ルーティング

pub mod application;
pub mod config;
pub mod domain;
pub mod infrastructure;
pub mod interfaces;

use std::net::SocketAddr;

use anyhow::Context as _;
use axum::Router;
use axum::http::{HeaderValue, Method, header};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::config::CorsConfig;
use crate::interfaces::http::routes;

/// HTTP router を組み立てる。
///
/// この関数はテストから呼ばれることを前提にしているため pub 公開し、
/// `tower::ServiceExt::oneshot` で直接叩けるようにしておく。
///
/// CORS は環境変数経由 ([`CorsConfig::from_env`]) で設定する。
/// 開発・テスト用にはデフォルトで明示的なオリジン無し (= 同一オリジンのみ許可) とし、
/// 本番では `CORS_ALLOWED_ORIGINS` を必ず設定する運用にする。
pub fn app() -> Router {
    app_with_cors(CorsConfig::from_env())
}

/// CORS 設定を明示的に渡す版。テストから設定を上書きするときに使う。
pub fn app_with_cors(cors: CorsConfig) -> Router {
    Router::new()
        .merge(routes::health::router())
        .layer(build_cors_layer(cors))
        .layer(TraceLayer::new_for_http())
}

fn build_cors_layer(cors: CorsConfig) -> CorsLayer {
    let layer = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .max_age(std::time::Duration::from_secs(600));

    match cors {
        CorsConfig::Disabled => layer,
        CorsConfig::AllowedOrigins(origins) => {
            let parsed: Vec<HeaderValue> = origins
                .into_iter()
                .filter_map(|o| HeaderValue::from_str(&o).ok())
                .collect();
            layer.allow_origin(AllowOrigin::list(parsed))
        }
    }
}

/// サーバを起動する。`main.rs` から呼ばれる唯一の entry point。
pub async fn run() -> anyhow::Result<()> {
    init_tracing();

    let port: u16 = std::env::var("BACKEND_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind {addr}"))?;

    tracing::info!(%addr, "triary-backend listening");
    axum::serve(listener, app())
        .await
        .context("axum server error")?;

    Ok(())
}

fn init_tracing() {
    use tracing_subscriber::EnvFilter;
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
}
