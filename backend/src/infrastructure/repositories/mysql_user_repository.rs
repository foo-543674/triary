//! `users` table.

use sqlx::MySqlPool;

use crate::application::ports::BoxFuture;
use crate::application::ports::user_repository::{InsertUserError, UserRepository};
use crate::domain::user::{PasswordHash, User, UserHandle, UserId};
use crate::infrastructure::db::{from_db_time, id_bytes, to_db_time};

pub struct MysqlUserRepository {
    pool: MySqlPool,
}

impl MysqlUserRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

struct UserRow {
    user_id: Vec<u8>,
    user_handle: String,
    password_hash: String,
    created_at: chrono::NaiveDateTime,
}

impl UserRow {
    fn into_user(self) -> anyhow::Result<User> {
        Ok(User::restore(
            UserId::from_bytes(id_bytes(self.user_id)?),
            UserHandle::from_stored(self.user_handle),
            PasswordHash::new(self.password_hash),
            from_db_time(self.created_at),
        ))
    }
}

impl UserRepository for MysqlUserRepository {
    fn handle_exists<'a>(&'a self, handle: &'a UserHandle) -> BoxFuture<'a, anyhow::Result<bool>> {
        Box::pin(async move {
            let found = sqlx::query_scalar!(
                "SELECT EXISTS(SELECT 1 FROM users WHERE user_handle = ?) AS found",
                handle.as_str()
            )
            .fetch_one(&self.pool)
            .await?;
            Ok(found != 0)
        })
    }

    fn insert<'a>(&'a self, user: &'a User) -> BoxFuture<'a, Result<(), InsertUserError>> {
        Box::pin(async move {
            let created_at = to_db_time(user.created_at());
            let id = user.id();
            sqlx::query!(
                "INSERT INTO users (user_id, user_handle, password_hash, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?)",
                id.as_bytes().as_slice(),
                user.handle().as_str(),
                user.password_hash().as_str(),
                created_at,
                created_at,
            )
            .execute(&self.pool)
            .await
            .map(|_| ())
            .map_err(|error| match &error {
                sqlx::Error::Database(db) if db.is_unique_violation() => {
                    InsertUserError::HandleTaken
                }
                _ => InsertUserError::Other(error.into()),
            })
        })
    }

    fn find_by_handle<'a>(
        &'a self,
        handle: &'a UserHandle,
    ) -> BoxFuture<'a, anyhow::Result<Option<User>>> {
        Box::pin(async move {
            sqlx::query_as!(
                UserRow,
                "SELECT user_id, user_handle, password_hash, created_at FROM users WHERE user_handle = ?",
                handle.as_str()
            )
            .fetch_optional(&self.pool)
            .await?
            .map(UserRow::into_user)
            .transpose()
        })
    }

    fn find_by_id<'a>(&'a self, id: &'a UserId) -> BoxFuture<'a, anyhow::Result<Option<User>>> {
        Box::pin(async move {
            sqlx::query_as!(
                UserRow,
                "SELECT user_id, user_handle, password_hash, created_at FROM users WHERE user_id = ?",
                id.as_bytes().as_slice()
            )
            .fetch_optional(&self.pool)
            .await?
            .map(UserRow::into_user)
            .transpose()
        })
    }
}
