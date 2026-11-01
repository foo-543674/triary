//! Persistence of users.

use super::BoxFuture;
use crate::domain::user::{User, UserHandle, UserId};

#[derive(Debug, thiserror::Error)]
pub enum InsertUserError {
    /// Another user got the handle first (unique key), e.g. two sign-ups
    /// racing after both checked that it was free.
    #[error("handle already taken")]
    HandleTaken,
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

pub trait UserRepository: Send + Sync {
    fn handle_exists<'a>(&'a self, handle: &'a UserHandle) -> BoxFuture<'a, anyhow::Result<bool>>;

    fn insert<'a>(&'a self, user: &'a User) -> BoxFuture<'a, Result<(), InsertUserError>>;

    fn find_by_handle<'a>(
        &'a self,
        handle: &'a UserHandle,
    ) -> BoxFuture<'a, anyhow::Result<Option<User>>>;

    fn find_by_id<'a>(&'a self, id: &'a UserId) -> BoxFuture<'a, anyhow::Result<Option<User>>>;
}
