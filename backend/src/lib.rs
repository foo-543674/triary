//! triary-backend library crate.
//!
//! The binary (`src/main.rs`) is a thin entry point into this crate; router
//! assembly, server bootstrap, and all domain logic live here so that
//! integration tests under `tests/*.rs` and any future binaries (CLI, etc.)
//! can import the same implementation.
//!
//! Layer layout:
//! - [`domain`][]: entities, value objects, domain services
//! - [`application`][]: use cases / application services
//! - [`infrastructure`][]: persistence and external service implementations
//! - [`interfaces`][]: HTTP handlers, DTOs, and routing

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

/// Builds the HTTP router.
///
/// Made `pub` so tests can drive it directly via `tower::ServiceExt::oneshot`
/// without spinning up an actual server.
///
/// CORS is configured from environment variables via [`CorsConfig::from_env`].
/// Development and tests default to no explicit allowed origin (i.e. only
/// same-origin requests pass), and production must always set
/// `CORS_ALLOWED_ORIGINS` explicitly.
pub fn app() -> Router {
    app_with_cors(CorsConfig::from_env())
}

/// Same as [`app`] but takes an explicit [`CorsConfig`] for tests that need to
/// override the env-driven default.
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

/// Starts the HTTP server. Called from `main.rs` and is the only public
/// entry point that owns the runtime.
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
