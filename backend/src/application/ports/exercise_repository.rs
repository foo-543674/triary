//! Persistence of exercises.

use super::BoxFuture;
use crate::domain::exercise::{Exercise, ExerciseId};
use crate::domain::user::UserId;

pub trait ExerciseRepository: Send + Sync {
    /// Every exercise `user` may see: all presets and their own.
    fn list_visible<'a>(&'a self, user: UserId) -> BoxFuture<'a, anyhow::Result<Vec<Exercise>>>;

    /// The exercise if it exists and `user` may see it.
    fn find_visible<'a>(
        &'a self,
        user: UserId,
        id: &'a ExerciseId,
    ) -> BoxFuture<'a, anyhow::Result<Option<Exercise>>>;
}
