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
pub mod domain;
pub mod infrastructure;
pub mod interfaces;

use std::net::SocketAddr;

use anyhow::Context as _;
use axum::Router;
use tower_http::trace::TraceLayer;

use crate::interfaces::http::routes;

/// HTTP router を組み立てる。
///
/// この関数はテストから呼ばれることを前提にしているため pub 公開し、
/// `tower::ServiceExt::oneshot` で直接叩けるようにしておく。
pub fn app() -> Router {
    Router::new()
        .merge(routes::health::router())
        .layer(TraceLayer::new_for_http())
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
