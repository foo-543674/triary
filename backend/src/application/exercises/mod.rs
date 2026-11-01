//! Browsing exercises (US-4).

use std::sync::Arc;

use crate::application::ports::exercise_repository::ExerciseRepository;
use crate::domain::exercise::{Exercise, ExerciseId, Owner, tree_depths};
use crate::domain::user::UserId;

#[derive(Clone)]
pub struct ExerciseDeps {
    pub exercises: Arc<dyn ExerciseRepository>,
}

/// An exercise with its depth in the progression tree (0 = root).
#[derive(Debug, Clone)]
pub struct ExerciseView {
    pub exercise: Exercise,
    pub depth: usize,
}

#[derive(Debug, Clone, Default)]
pub struct ListFilter {
    /// Case-insensitive part of the name.
    pub name_contains: Option<String>,
    /// Only the user's own exercises.
    pub owned_only: bool,
}

impl ListFilter {
    fn keeps(&self, exercise: &Exercise) -> bool {
        let owned = matches!(exercise.owner(), Owner::User(_));
        let name_ok = self.name_contains.as_ref().is_none_or(|part| {
            exercise
                .name()
                .to_lowercase()
                .contains(&part.to_lowercase())
        });
        (!self.owned_only || owned) && name_ok
    }
}

/// Visible exercises, filtered, in a stable order (by name). Depths come
/// from the whole visible set so a filter does not change them.
pub async fn list_exercises(
    deps: &ExerciseDeps,
    user: UserId,
    filter: &ListFilter,
) -> anyhow::Result<Vec<ExerciseView>> {
    let all = deps.exercises.list_visible(user).await?;
    let depths = tree_depths(&all);
    let mut views: Vec<ExerciseView> = all
        .into_iter()
        .filter(|exercise| filter.keeps(exercise))
        .map(|exercise| {
            let depth = depths.get(&exercise.id()).copied().unwrap_or(0);
            ExerciseView { exercise, depth }
        })
        .collect();
    views.sort_by(|a, b| a.exercise.name().cmp(b.exercise.name()));
    Ok(views)
}

/// One visible exercise with its depth, or `None` (missing or someone
/// else's: both are "not found" to the caller).
pub async fn get_exercise(
    deps: &ExerciseDeps,
    user: UserId,
    id: &ExerciseId,
) -> anyhow::Result<Option<ExerciseView>> {
    let Some(exercise) = deps.exercises.find_visible(user, id).await? else {
        return Ok(None);
    };
    let all = deps.exercises.list_visible(user).await?;
    let depth = tree_depths(&all).get(id).copied().unwrap_or(0);
    Ok(Some(ExerciseView { exercise, depth }))
}
