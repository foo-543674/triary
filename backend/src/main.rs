//! triary-backend binary entry point.
//!
//! All real logic lives in the [`triary_backend`] library crate. This file is
//! intentionally a thin wrapper that only owns process startup and shutdown.

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    triary_backend::run().await
}
