//! `user_sessions` table. Only the SHA-256 of a token is stored
//! (data-model §4.2), so a database dump does not hand out sessions.

use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use sqlx::MySqlPool;

use crate::application::ports::BoxFuture;
use crate::application::ports::secrets::SessionToken;
use crate::application::ports::session_store::SessionStore;
use crate::domain::user::UserId;
use crate::infrastructure::db::{id_bytes, to_db_time};

pub struct MysqlSessionStore {
    pool: MySqlPool,
}

impl MysqlSessionStore {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

fn token_hash(token: &SessionToken) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

impl SessionStore for MysqlSessionStore {
    fn create<'a>(
        &'a self,
        token: &'a SessionToken,
        user: UserId,
        now: DateTime<Utc>,
        expires_at: DateTime<Utc>,
    ) -> BoxFuture<'a, anyhow::Result<()>> {
        Box::pin(async move {
            let now = to_db_time(now);
            sqlx::query!(
                "INSERT INTO user_sessions (session_token_hash, user_id, created_at, expires_at, last_seen_at)
                 VALUES (?, ?, ?, ?, ?)",
                token_hash(token),
                user.as_bytes().as_slice(),
                now,
                to_db_time(expires_at),
                now,
            )
            .execute(&self.pool)
            .await?;
            Ok(())
        })
    }

    fn touch<'a>(
        &'a self,
        token: &'a SessionToken,
        now: DateTime<Utc>,
    ) -> BoxFuture<'a, anyhow::Result<Option<UserId>>> {
        Box::pin(async move {
            let hash = token_hash(token);
            let now = to_db_time(now);
            let user = sqlx::query_scalar!(
                "SELECT user_id FROM user_sessions WHERE session_token_hash = ? AND expires_at > ?",
                hash,
                now
            )
            .fetch_optional(&self.pool)
            .await?;
            let Some(user) = user else {
                return Ok(None);
            };
            sqlx::query!(
                "UPDATE user_sessions SET last_seen_at = ? WHERE session_token_hash = ?",
                now,
                hash
            )
            .execute(&self.pool)
            .await?;
            Ok(Some(UserId::from_bytes(id_bytes(user)?)))
        })
    }

    fn delete<'a>(&'a self, token: &'a SessionToken) -> BoxFuture<'a, anyhow::Result<()>> {
        Box::pin(async move {
            sqlx::query!(
                "DELETE FROM user_sessions WHERE session_token_hash = ?",
                token_hash(token)
            )
            .execute(&self.pool)
            .await?;
            Ok(())
        })
    }
}
