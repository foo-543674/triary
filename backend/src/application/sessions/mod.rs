//! Recording workouts (US-7): start a session, read it, add blocks and sets.

use std::sync::Arc;

use crate::application::ports::exercise_repository::ExerciseRepository;
use crate::application::ports::secrets::IdSource;
use crate::application::ports::session_repository::SessionRepository;
use crate::domain::clock::Clock;
use crate::domain::exercise::ExerciseId;
use crate::domain::session::record::{
    RawSetValues, StartSessionInput, check_room_for_set, next_set, validate_append_block,
    validate_set, validate_start,
};
use crate::domain::session::{BlockId, ExerciseBlock, Session, SessionId, SetId, WorkoutSet};
use crate::domain::user::UserId;
use crate::domain::validation::{Violation, both};

#[derive(Clone)]
pub struct SessionDeps {
    pub sessions: Arc<dyn SessionRepository>,
    pub exercises: Arc<dyn ExerciseRepository>,
    pub clock: Arc<dyn Clock>,
    pub ids: Arc<dyn IdSource>,
}

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    /// The session or block on the path does not exist or is not the user's.
    #[error("not found")]
    NotFound,
    #[error("rejected: {0:?}")]
    Rejected(Vec<Violation>),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<Vec<Violation>> for SessionError {
    fn from(violations: Vec<Violation>) -> Self {
        Self::Rejected(violations)
    }
}

pub async fn start_session(
    deps: &SessionDeps,
    owner: UserId,
    input: StartSessionInput,
) -> Result<Session, SessionError> {
    let now = deps.clock.now();
    let validated = validate_start(input, now)?;
    let session = Session {
        id: SessionId::from_bytes(deps.ids.next_id()),
        owner,
        workout_date: validated.workout_date,
        started_at: now,
        ended_at: None,
        note: validated.note,
        blocks: Vec::new(),
    };
    deps.sessions.insert_session(&session).await?;
    Ok(session)
}

pub async fn get_session(
    deps: &SessionDeps,
    owner: UserId,
    id: SessionId,
) -> Result<Session, SessionError> {
    deps.sessions
        .find_session(owner, id)
        .await?
        .ok_or(SessionError::NotFound)
}

pub async fn append_block(
    deps: &SessionDeps,
    owner: UserId,
    session_id: SessionId,
    exercise_id: Option<ExerciseId>,
) -> Result<ExerciseBlock, SessionError> {
    let session = get_session(deps, owner, session_id).await?;
    let exercise = match exercise_id {
        Some(id) => deps.exercises.find_visible(owner, &id).await?,
        None => None,
    };
    let exercise = validate_append_block(exercise, owner, session.blocks.len())?;
    let block = ExerciseBlock {
        id: BlockId::from_bytes(deps.ids.next_id()),
        exercise_id: exercise.id(),
        exercise_name: exercise.name().to_owned(),
        measurements: exercise.measurements().to_vec(),
        order: session.blocks.len(),
        sets: Vec::new(),
    };
    deps.sessions.insert_block(&session, &block).await?;
    Ok(block)
}

pub async fn append_set(
    deps: &SessionDeps,
    owner: UserId,
    block_id: BlockId,
    raw: RawSetValues,
) -> Result<WorkoutSet, SessionError> {
    let block = deps
        .sessions
        .find_block(owner, block_id)
        .await?
        .ok_or(SessionError::NotFound)?;
    let values = both(
        check_room_for_set(block.set_count),
        validate_set(raw, &block.measurements),
    )
    .map(|((), values)| values)?;
    let set = next_set(
        SetId::from_bytes(deps.ids.next_id()),
        block.set_count,
        values,
    );
    deps.sessions.insert_set(block.id, &set).await?;
    Ok(set)
}
