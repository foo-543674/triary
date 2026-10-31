//! Persistence of workout sessions with their blocks and sets.

use super::BoxFuture;
use crate::domain::exercise::Measurement;
use crate::domain::session::{BlockId, ExerciseBlock, Session, SessionId, SetId, WorkoutSet};
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

    /// The whole session that contains the block, if it is `owner`'s.
    fn find_session_of_block<'a>(
        &'a self,
        owner: UserId,
        block: BlockId,
    ) -> BoxFuture<'a, anyhow::Result<Option<Session>>>;

    /// The whole session that contains the set, if it is `owner`'s.
    fn find_session_of_set<'a>(
        &'a self,
        owner: UserId,
        set: SetId,
    ) -> BoxFuture<'a, anyhow::Result<Option<Session>>>;

    /// Writes the session's own attributes (date, note, end) and copies the
    /// date to its blocks (data-model §4.6), in one transaction.
    fn update_session<'a>(&'a self, session: &'a Session) -> BoxFuture<'a, anyhow::Result<()>>;

    /// Deletes the session with its blocks and sets.
    fn delete_session<'a>(&'a self, id: SessionId) -> BoxFuture<'a, anyhow::Result<()>>;

    /// Writes each block's exercise and order (`blocks` in their new order)
    /// in one transaction, after deleting `removed` if given.
    fn save_blocks<'a>(
        &'a self,
        session: SessionId,
        blocks: &'a [ExerciseBlock],
        removed: Option<BlockId>,
    ) -> BoxFuture<'a, anyhow::Result<()>>;

    /// Writes each set's values and order (`sets` in their new order) in one
    /// transaction, after deleting `removed` if given.
    fn save_sets<'a>(
        &'a self,
        block: BlockId,
        sets: &'a [WorkoutSet],
        removed: Option<SetId>,
    ) -> BoxFuture<'a, anyhow::Result<()>>;
}
