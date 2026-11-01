//! History views (US-9): the user's sessions by date, newest first, a page
//! at a time.

use std::sync::Arc;

use crate::application::ports::history::{DateKey, DateRange, HistoryQueries, SessionSummary};
use crate::domain::user::UserId;

#[derive(Clone)]
pub struct HistoryDeps {
    pub queries: Arc<dyn HistoryQueries>,
}

/// One page and where the next one starts (`None` on the last page).
#[derive(Debug, Clone)]
pub struct Page {
    pub items: Vec<SessionSummary>,
    pub next: Option<DateKey>,
}

/// Reads one more row than asked to know whether another page exists.
pub async fn sessions_by_date(
    deps: &HistoryDeps,
    owner: UserId,
    range: DateRange,
    after: Option<DateKey>,
    limit: usize,
) -> anyhow::Result<Page> {
    let mut items = deps
        .queries
        .sessions_by_date(owner, range, after, limit + 1)
        .await?;
    let has_next = items.len() > limit;
    items.truncate(limit);
    let next = if has_next {
        items.last().map(|last| DateKey {
            workout_date: last.workout_date,
            session: last.id,
        })
    } else {
        None
    };
    Ok(Page { items, next })
}
