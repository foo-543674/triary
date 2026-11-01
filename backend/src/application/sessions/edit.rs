//! Correcting a recorded workout (US-7 / US-8): edit, reorder, end and
//! delete. Each use case loads the whole session (owner checked by the
//! query), applies domain rules, and writes back.

use super::{SessionDeps, SessionError};
use crate::domain::exercise::ExerciseId;
use crate::domain::session::edit::{
    SessionPatch, as_raw, move_to, validate_exercise_swap, validate_session_patch,
};
use crate::domain::session::record::{RawSetValues, validate_set};
use crate::domain::session::{BlockId, ExerciseBlock, Session, SessionId, SetId, WorkoutSet};
use crate::domain::user::UserId;

async fn owned(deps: &SessionDeps, owner: UserId, id: SessionId) -> Result<Session, SessionError> {
    deps.sessions
        .find_session(owner, id)
        .await?
        .ok_or(SessionError::NotFound)
}

pub async fn patch_session(
    deps: &SessionDeps,
    owner: UserId,
    id: SessionId,
    patch: SessionPatch,
) -> Result<Session, SessionError> {
    let mut session = owned(deps, owner, id).await?;
    let valid = validate_session_patch(patch, session.started_at, deps.clock.now())?;
    if let Some(date) = valid.workout_date {
        session.workout_date = date;
    }
    if let Some(note) = valid.note {
        session.note = note;
    }
    if let Some(ended_at) = valid.ended_at {
        session.ended_at = ended_at;
    }
    deps.sessions.update_session(&session).await?;
    Ok(session)
}

/// Ends the session now; a session already ended is returned unchanged
/// (idempotent, api-design §2.3).
pub async fn end_session(
    deps: &SessionDeps,
    owner: UserId,
    id: SessionId,
) -> Result<Session, SessionError> {
    let mut session = owned(deps, owner, id).await?;
    if session.ended_at.is_none() {
        session.ended_at = Some(deps.clock.now().max(session.started_at));
        deps.sessions.update_session(&session).await?;
    }
    Ok(session)
}

pub async fn delete_session(
    deps: &SessionDeps,
    owner: UserId,
    id: SessionId,
) -> Result<(), SessionError> {
    owned(deps, owner, id).await?;
    deps.sessions.delete_session(id).await?;
    Ok(())
}

/// Changes a block's exercise and/or position. A new exercise must be
/// visible to the user and fit every recorded set (US-8: otherwise the
/// change is refused with `incompatible_with_existing_sets`).
pub async fn patch_block(
    deps: &SessionDeps,
    owner: UserId,
    id: BlockId,
    exercise: Option<Option<ExerciseId>>,
    order: Option<usize>,
) -> Result<(SessionId, ExerciseBlock), SessionError> {
    let session = deps
        .sessions
        .find_session_of_block(owner, id)
        .await?
        .ok_or(SessionError::NotFound)?;
    let mut blocks = session.blocks.clone();
    let index = blocks
        .iter()
        .position(|b| b.id == id)
        .ok_or(SessionError::NotFound)?;
    if let Some(choice) = exercise {
        let found = match choice {
            Some(exercise_id) => deps.exercises.find_visible(owner, &exercise_id).await?,
            None => None,
        };
        let exercise = validate_exercise_swap(found, owner, &blocks[index].sets)?;
        let block = &mut blocks[index];
        block.exercise_id = exercise.id();
        block.exercise_name = exercise.name().to_owned();
        block.measurements = exercise.measurements().to_vec();
    }
    if let Some(position) = order {
        let ids: Vec<BlockId> = blocks.iter().map(|b| b.id).collect();
        let reordered = move_to(&ids, id, position).ok_or(SessionError::NotFound)?;
        blocks.sort_by_key(|b| reordered.iter().position(|r| *r == b.id));
    }
    for (position, block) in blocks.iter_mut().enumerate() {
        block.order = position;
    }
    deps.sessions.save_blocks(session.id, &blocks, None).await?;
    let block = blocks
        .into_iter()
        .find(|b| b.id == id)
        .ok_or(SessionError::NotFound)?;
    Ok((session.id, block))
}

pub async fn delete_block(
    deps: &SessionDeps,
    owner: UserId,
    id: BlockId,
) -> Result<(), SessionError> {
    let session = deps
        .sessions
        .find_session_of_block(owner, id)
        .await?
        .ok_or(SessionError::NotFound)?;
    let remaining: Vec<ExerciseBlock> = session
        .blocks
        .into_iter()
        .filter(|b| b.id != id)
        .enumerate()
        .map(|(position, block)| ExerciseBlock {
            order: position,
            ..block
        })
        .collect();
    deps.sessions
        .save_blocks(session.id, &remaining, Some(id))
        .await?;
    Ok(())
}

/// A set's changes; `None` keeps a value, `Some(None)` clears it.
#[derive(Debug, Clone, Default)]
pub struct SetPatch {
    pub reps: Option<Option<i64>>,
    pub weight_kg: Option<Option<f64>>,
    pub duration_seconds: Option<Option<i64>>,
    pub interval_seconds: Option<Option<i64>>,
    pub order: Option<usize>,
}

fn block_of_set(session: &Session, id: SetId) -> Option<&ExerciseBlock> {
    session
        .blocks
        .iter()
        .find(|b| b.sets.iter().any(|s| s.id == id))
}

/// Changes a set's values (checked again against the exercise like a new
/// set) and/or its position in the block.
pub async fn patch_set(
    deps: &SessionDeps,
    owner: UserId,
    id: SetId,
    patch: SetPatch,
) -> Result<WorkoutSet, SessionError> {
    let session = deps
        .sessions
        .find_session_of_set(owner, id)
        .await?
        .ok_or(SessionError::NotFound)?;
    let block = block_of_set(&session, id).ok_or(SessionError::NotFound)?;
    let mut sets = block.sets.clone();
    let index = sets
        .iter()
        .position(|s| s.id == id)
        .ok_or(SessionError::NotFound)?;
    let current = as_raw(sets[index].values);
    let merged = RawSetValues {
        reps: patch.reps.unwrap_or(current.reps),
        weight_kg: patch.weight_kg.unwrap_or(current.weight_kg),
        duration_seconds: patch.duration_seconds.unwrap_or(current.duration_seconds),
        interval_seconds: patch.interval_seconds.unwrap_or(current.interval_seconds),
    };
    sets[index].values = validate_set(merged, &block.measurements)?;
    if let Some(position) = patch.order {
        let ids: Vec<SetId> = sets.iter().map(|s| s.id).collect();
        let reordered = move_to(&ids, id, position).ok_or(SessionError::NotFound)?;
        sets.sort_by_key(|s| reordered.iter().position(|r| *r == s.id));
    }
    for (position, set) in sets.iter_mut().enumerate() {
        set.order = position;
    }
    deps.sessions.save_sets(block.id, &sets, None).await?;
    sets.into_iter()
        .find(|s| s.id == id)
        .ok_or(SessionError::NotFound)
}

pub async fn delete_set(deps: &SessionDeps, owner: UserId, id: SetId) -> Result<(), SessionError> {
    let session = deps
        .sessions
        .find_session_of_set(owner, id)
        .await?
        .ok_or(SessionError::NotFound)?;
    let block = block_of_set(&session, id).ok_or(SessionError::NotFound)?;
    let remaining: Vec<WorkoutSet> = block
        .sets
        .iter()
        .filter(|s| s.id != id)
        .enumerate()
        .map(|(position, set)| WorkoutSet {
            order: position,
            ..set.clone()
        })
        .collect();
    deps.sessions
        .save_sets(block.id, &remaining, Some(id))
        .await?;
    Ok(())
}
