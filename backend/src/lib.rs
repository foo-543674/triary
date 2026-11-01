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
#[cfg(test)]
pub(crate) mod testing;

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Context as _;
use axum::Router;
use axum::http::{HeaderValue, Method, header};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::application::auth::AuthDeps;
use crate::application::exercises::ExerciseDeps;
use crate::application::history::HistoryDeps;
use crate::application::sessions::SessionDeps;
use crate::config::CorsConfig;
use crate::infrastructure::clock::SystemClock;
use crate::infrastructure::password_hasher::Argon2idHasher;
use crate::infrastructure::repositories::mysql_exercise_repository::MysqlExerciseRepository;
use crate::infrastructure::repositories::mysql_history_queries::MysqlHistoryQueries;
use crate::infrastructure::repositories::mysql_session_repository::MysqlSessionRepository;
use crate::infrastructure::repositories::mysql_session_store::MysqlSessionStore;
use crate::infrastructure::repositories::mysql_user_repository::MysqlUserRepository;
use crate::infrastructure::secrets::{OsSecrets, TimeOrderedIds};
use crate::interfaces::http::state::AppState;
use crate::interfaces::http::{error, routes};

/// Builds the HTTP router.
///
/// Made `pub` so tests can drive it directly via `tower::ServiceExt::oneshot`
/// without spinning up an actual server.
///
/// CORS is configured from environment variables via [`CorsConfig::from_env`].
/// Development and tests default to no explicit allowed origin (i.e. only
/// same-origin requests pass), and production must always set
/// `CORS_ALLOWED_ORIGINS` explicitly.
pub fn app(state: AppState) -> Router {
    app_with_cors(state, CorsConfig::from_env())
}

/// Same as [`app`] but takes an explicit [`CorsConfig`] for tests that need to
/// override the env-driven default.
pub fn app_with_cors(state: AppState, cors: CorsConfig) -> Router {
    Router::new()
        .merge(routes::health::router())
        .merge(routes::web::router())
        .merge(routes::api::router())
        .fallback(error::route_not_found)
        .method_not_allowed_fallback(error::method_not_allowed)
        .with_state(state)
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

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL is not set")?;
    let pool = infrastructure::db::connect(&database_url).await?;
    let clock = Arc::new(SystemClock);
    let ids = Arc::new(TimeOrderedIds);
    let exercises = Arc::new(MysqlExerciseRepository::new(pool.clone()));
    let state = AppState {
        auth: AuthDeps {
            users: Arc::new(MysqlUserRepository::new(pool.clone())),
            sessions: Arc::new(MysqlSessionStore::new(pool.clone())),
            hasher: Arc::new(Argon2idHasher::new()),
            clock: clock.clone(),
            ids: ids.clone(),
            secrets: Arc::new(OsSecrets),
        },
        exercises: ExerciseDeps {
            exercises: exercises.clone(),
        },
        history: HistoryDeps {
            queries: Arc::new(MysqlHistoryQueries::new(pool.clone())),
        },
        sessions: SessionDeps {
            sessions: Arc::new(MysqlSessionRepository::new(pool)),
            exercises,
            clock,
            ids,
        },
    };

    tracing::info!(%addr, "triary-backend listening");
    axum::serve(listener, app(state))
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
