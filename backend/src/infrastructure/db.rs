//! MySQL connection pool and the conversions shared by the repositories.

use anyhow::Context as _;
use chrono::{DateTime, NaiveDateTime, Utc};
use sqlx::mysql::{MySqlPool, MySqlPoolOptions};

/// Connects to `database_url` (`DATABASE_URL`). Migrations are applied
/// separately (`make db-migrate`).
pub async fn connect(database_url: &str) -> anyhow::Result<MySqlPool> {
    MySqlPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
        .context("cannot connect to the database (DATABASE_URL)")
}

/// `DATETIME(3)` columns hold UTC without a zone (data-model §4.5).
pub fn to_db_time(instant: DateTime<Utc>) -> NaiveDateTime {
    instant.naive_utc()
}

pub fn from_db_time(value: NaiveDateTime) -> DateTime<Utc> {
    value.and_utc()
}

/// `BINARY(16)` column → 16 bytes. Any other length means the row is
/// corrupt, which is a bug, not user input.
pub fn id_bytes(value: Vec<u8>) -> anyhow::Result<[u8; 16]> {
    <[u8; 16]>::try_from(value)
        .map_err(|v| anyhow::anyhow!("expected 16 ID bytes, got {}", v.len()))
}
