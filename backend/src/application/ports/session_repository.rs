//! Persistence of workout sessions with their blocks and sets.

use super::BoxFuture;
use crate::domain::exercise::Measurement;
use crate::domain::session::{BlockId, ExerciseBlock, Session, SessionId, WorkoutSet};
use crate::domain::user::UserId;

/// What adding a set to a block needs to know about the block.
#[derive(Debug, Clone)]
pub struct BlockForSets {
    pub id: BlockId,
    pub measurements: Vec<Measurement>,
    pub set_count: usize,
}

pub trait SessionRepository: Send + Sync {
    /// Stores a new session (without blocks).
    fn insert_session<'a>(&'a self, session: &'a Session) -> BoxFuture<'a, anyhow::Result<()>>;

    /// The whole aggregate, if the session exists and belongs to `owner`.
    fn find_session<'a>(
        &'a self,
        owner: UserId,
        id: SessionId,
    ) -> BoxFuture<'a, anyhow::Result<Option<Session>>>;

    /// Appends a block (its `order` already set) to the session.
    fn insert_block<'a>(
        &'a self,
        session: &'a Session,
        block: &'a ExerciseBlock,
    ) -> BoxFuture<'a, anyhow::Result<()>>;

    /// The block, if it exists in a session of `owner`.
    fn find_block<'a>(
        &'a self,
        owner: UserId,
        id: BlockId,
    ) -> BoxFuture<'a, anyhow::Result<Option<BlockForSets>>>;

    /// Appends a set (its `order` already set) to the block.
    fn insert_set<'a>(
        &'a self,
        block: BlockId,
        set: &'a WorkoutSet,
    ) -> BoxFuture<'a, anyhow::Result<()>>;
}
