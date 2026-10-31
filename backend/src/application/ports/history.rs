//! Read side for history views (architecture.md "CQRS の適用判断": queries
//! are kept apart from the write path).

use chrono::{DateTime, NaiveDate, Utc};

use super::BoxFuture;
use crate::domain::exercise::ExerciseId;
use crate::domain::session::SessionId;
use crate::domain::user::UserId;

/// One session in the by-date list, without its sets.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionSummary {
    pub id: SessionId,
    pub workout_date: NaiveDate,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub block_count: usize,
    pub set_count: usize,
    /// Exercises in block order, each once.
    pub exercises: Vec<(ExerciseId, String)>,
}

/// Where a page starts: strictly after this (date, session) in descending
/// order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DateKey {
    pub workout_date: NaiveDate,
    pub session: SessionId,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct DateRange {
    pub from: Option<NaiveDate>,
    pub to: Option<NaiveDate>,
}

pub trait HistoryQueries: Send + Sync {
    /// Up to `limit` of `owner`'s sessions within `range`, newest date first
    /// (then newest session), starting after `after`.
    fn sessions_by_date<'a>(
        &'a self,
        owner: UserId,
        range: DateRange,
        after: Option<DateKey>,
        limit: usize,
    ) -> BoxFuture<'a, anyhow::Result<Vec<SessionSummary>>>;
}
