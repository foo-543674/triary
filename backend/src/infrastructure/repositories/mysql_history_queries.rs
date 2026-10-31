//! History read model over the session tables (data-model §8.1: the
//! `(user_id, workout_date DESC, session_id DESC)` index serves the keyset).

use std::collections::HashMap;

use sqlx::MySqlPool;

use crate::application::ports::BoxFuture;
use crate::application::ports::history::{DateKey, DateRange, HistoryQueries, SessionSummary};
use crate::domain::exercise::ExerciseId;
use crate::domain::session::SessionId;
use crate::domain::user::UserId;
use crate::infrastructure::db::{from_db_time, id_bytes};

pub struct MysqlHistoryQueries {
    pool: MySqlPool,
}

impl MysqlHistoryQueries {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

impl HistoryQueries for MysqlHistoryQueries {
    fn sessions_by_date<'a>(
        &'a self,
        owner: UserId,
        range: DateRange,
        after: Option<DateKey>,
        limit: usize,
    ) -> BoxFuture<'a, anyhow::Result<Vec<SessionSummary>>> {
        Box::pin(async move {
            let after_date = after.map(|k| k.workout_date);
            let after_id = after.map(|k| k.session.as_bytes().to_vec());
            let rows = sqlx::query!(
                r#"SELECT s.session_id AS "session_id!", s.workout_date AS "workout_date!", s.started_at AS "started_at!", s.ended_at,
                          (SELECT COUNT(*) FROM exercise_blocks b WHERE b.session_id = s.session_id) AS "block_count!: i64",
                          (SELECT COUNT(*) FROM workout_sets ws JOIN exercise_blocks b ON b.block_id = ws.block_id
                            WHERE b.session_id = s.session_id) AS "set_count!: i64"
                     FROM sessions s
                    WHERE s.user_id = ?
                      AND (? IS NULL OR s.workout_date >= ?)
                      AND (? IS NULL OR s.workout_date <= ?)
                      AND (? IS NULL OR s.workout_date < ? OR (s.workout_date = ? AND s.session_id < ?))
                    ORDER BY s.workout_date DESC, s.session_id DESC
                    LIMIT ?"#,
                owner.as_bytes().as_slice(),
                range.from,
                range.from,
                range.to,
                range.to,
                after_date,
                after_date,
                after_date,
                after_id,
                i64::try_from(limit)?,
            )
            .fetch_all(&self.pool)
            .await?;
            if rows.is_empty() {
                return Ok(Vec::new());
            }
            // Exercise names of all listed sessions, in block order.
            let ids: Vec<Vec<u8>> = rows.iter().map(|r| r.session_id.clone()).collect();
            let placeholders = vec!["?"; ids.len()].join(", ");
            let sql = format!(
                "SELECT b.session_id, b.exercise_id, e.name
                   FROM exercise_blocks b JOIN exercises e ON e.exercise_id = b.exercise_id
                  WHERE b.session_id IN ({placeholders})
                  ORDER BY b.session_id, b.block_order"
            );
            let names = ids
                .iter()
                .fold(
                    sqlx::query_as::<_, (Vec<u8>, Vec<u8>, String)>(&sql),
                    |q, id| q.bind(id),
                )
                .fetch_all(&self.pool)
                .await?;
            let mut exercises: HashMap<Vec<u8>, Vec<(ExerciseId, String)>> = HashMap::new();
            for (session, exercise, name) in names {
                let entry = exercises.entry(session).or_default();
                let id = ExerciseId::from_bytes(id_bytes(exercise)?);
                if !entry.iter().any(|(e, _)| *e == id) {
                    entry.push((id, name));
                }
            }
            rows.into_iter()
                .map(|r| {
                    Ok(SessionSummary {
                        exercises: exercises.remove(&r.session_id).unwrap_or_default(),
                        id: SessionId::from_bytes(id_bytes(r.session_id)?),
                        workout_date: r.workout_date,
                        started_at: from_db_time(r.started_at),
                        ended_at: r.ended_at.map(from_db_time),
                        block_count: usize::try_from(r.block_count)?,
                        set_count: usize::try_from(r.set_count)?,
                    })
                })
                .collect()
        })
    }
}
