//! `sessions`, `exercise_blocks` and `workout_sets` tables.
//!
//! `weight_kg` is DECIMAL(4,1); sqlx reads DECIMAL only with an extra
//! decimal crate, so weights cross the boundary as integer tenths
//! (`weight_kg * 10` on read, `? / 10` on write), which is exact.

use std::collections::HashMap;

use sqlx::MySqlPool;

use crate::application::ports::BoxFuture;
use crate::application::ports::session_repository::{BlockForSets, SessionRepository};
use crate::domain::exercise::{ExerciseId, Measurement, MeasurementKind};
use crate::domain::session::values::{Note, WorkoutDate};
use crate::domain::session::{
    BlockId, ExerciseBlock, Session, SessionId, SetId, SetValues, WorkoutSet,
};
use crate::domain::user::UserId;
use crate::infrastructure::db::{from_db_time, id_bytes, to_db_time};

pub struct MysqlSessionRepository {
    pool: MySqlPool,
}

impl MysqlSessionRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

fn measurement(kind: &str, required: i8) -> anyhow::Result<Measurement> {
    let kind = match kind {
        "reps" => MeasurementKind::Reps,
        "weight" => MeasurementKind::Weight,
        "time" => MeasurementKind::Time,
        other => anyhow::bail!("unknown measurement kind {other:?}"),
    };
    Ok(Measurement {
        kind,
        required: required != 0,
    })
}

fn order(value: i16) -> anyhow::Result<usize> {
    usize::try_from(value).map_err(|_| anyhow::anyhow!("negative order {value}"))
}

impl SessionRepository for MysqlSessionRepository {
    fn insert_session<'a>(&'a self, session: &'a Session) -> BoxFuture<'a, anyhow::Result<()>> {
        Box::pin(async move {
            let started_at = to_db_time(session.started_at);
            sqlx::query!(
                "INSERT INTO sessions (session_id, user_id, workout_date, started_at, ended_at, note, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                session.id.as_bytes().as_slice(),
                session.owner.as_bytes().as_slice(),
                session.workout_date.date(),
                started_at,
                session.ended_at.map(to_db_time),
                session.note.as_ref().map(|n| n.as_str()),
                started_at,
                started_at,
            )
            .execute(&self.pool)
            .await?;
            Ok(())
        })
    }

    fn find_session<'a>(
        &'a self,
        owner: UserId,
        id: SessionId,
    ) -> BoxFuture<'a, anyhow::Result<Option<Session>>> {
        Box::pin(async move {
            let Some(row) = sqlx::query!(
                "SELECT session_id, workout_date, started_at, ended_at, note
                   FROM sessions WHERE session_id = ? AND user_id = ?",
                id.as_bytes().as_slice(),
                owner.as_bytes().as_slice()
            )
            .fetch_optional(&self.pool)
            .await?
            else {
                return Ok(None);
            };
            let blocks = sqlx::query!(
                "SELECT b.block_id, b.exercise_id, b.block_order, e.name
                   FROM exercise_blocks b JOIN exercises e ON e.exercise_id = b.exercise_id
                  WHERE b.session_id = ? ORDER BY b.block_order",
                id.as_bytes().as_slice()
            )
            .fetch_all(&self.pool)
            .await?;
            let kinds = sqlx::query!(
                r#"SELECT k.exercise_id, k.kind, k.is_required AS "is_required: i8"
                     FROM exercise_measurement_kinds k
                    WHERE k.exercise_id IN (SELECT b.exercise_id FROM exercise_blocks b WHERE b.session_id = ?)"#,
                id.as_bytes().as_slice()
            )
            .fetch_all(&self.pool)
            .await?;
            let sets = sqlx::query!(
                r#"SELECT s.set_id, s.block_id, s.set_order, s.reps,
                          CAST(ROUND(s.weight_kg * 10) AS SIGNED) AS "weight_tenths?: i64",
                          s.duration_seconds, s.interval_seconds
                     FROM workout_sets s JOIN exercise_blocks b ON b.block_id = s.block_id
                    WHERE b.session_id = ? ORDER BY s.set_order"#,
                id.as_bytes().as_slice()
            )
            .fetch_all(&self.pool)
            .await?;

            let mut measurements: HashMap<Vec<u8>, Vec<Measurement>> = HashMap::new();
            for k in kinds {
                measurements
                    .entry(k.exercise_id)
                    .or_default()
                    .push(measurement(&k.kind, k.is_required)?);
            }
            let mut sets_by_block: HashMap<Vec<u8>, Vec<WorkoutSet>> = HashMap::new();
            for s in sets {
                sets_by_block
                    .entry(s.block_id)
                    .or_default()
                    .push(WorkoutSet {
                        id: SetId::from_bytes(id_bytes(s.set_id)?),
                        order: order(s.set_order)?,
                        values: SetValues {
                            reps: s.reps.map(i64::from),
                            weight_tenths: s.weight_tenths,
                            duration_seconds: s.duration_seconds.map(i64::from),
                            interval_seconds: s.interval_seconds.map(i64::from),
                        },
                    });
            }
            let blocks = blocks
                .into_iter()
                .map(|b| {
                    let mut kinds = measurements
                        .get(&b.exercise_id)
                        .cloned()
                        .unwrap_or_default();
                    kinds.sort_by_key(|m| m.kind);
                    Ok(ExerciseBlock {
                        sets: sets_by_block.remove(&b.block_id).unwrap_or_default(),
                        id: BlockId::from_bytes(id_bytes(b.block_id)?),
                        exercise_id: ExerciseId::from_bytes(id_bytes(b.exercise_id)?),
                        exercise_name: b.name,
                        measurements: kinds,
                        order: order(b.block_order)?,
                    })
                })
                .collect::<anyhow::Result<Vec<_>>>()?;
            Ok(Some(Session {
                id: SessionId::from_bytes(id_bytes(row.session_id)?),
                owner,
                workout_date: WorkoutDate::from_stored(row.workout_date),
                started_at: from_db_time(row.started_at),
                ended_at: row.ended_at.map(from_db_time),
                note: row.note.map(Note::from_stored),
                blocks,
            }))
        })
    }

    fn insert_block<'a>(
        &'a self,
        session: &'a Session,
        block: &'a ExerciseBlock,
    ) -> BoxFuture<'a, anyhow::Result<()>> {
        Box::pin(async move {
            let order = i16::try_from(block.order)?;
            sqlx::query!(
                "INSERT INTO exercise_blocks (block_id, session_id, exercise_id, block_order, workout_date, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
                block.id.as_bytes().as_slice(),
                session.id.as_bytes().as_slice(),
                block.exercise_id.as_bytes().as_slice(),
                order,
                session.workout_date.date(),
            )
            .execute(&self.pool)
            .await?;
            Ok(())
        })
    }

    fn find_block<'a>(
        &'a self,
        owner: UserId,
        id: BlockId,
    ) -> BoxFuture<'a, anyhow::Result<Option<BlockForSets>>> {
        Box::pin(async move {
            let Some(row) = sqlx::query!(
                r#"SELECT b.block_id AS "block_id!", b.exercise_id AS "exercise_id!",
                          (SELECT COUNT(*) FROM workout_sets s WHERE s.block_id = b.block_id) AS "set_count!: i64"
                     FROM exercise_blocks b JOIN sessions se ON se.session_id = b.session_id
                    WHERE b.block_id = ? AND se.user_id = ?"#,
                id.as_bytes().as_slice(),
                owner.as_bytes().as_slice()
            )
            .fetch_optional(&self.pool)
            .await?
            else {
                return Ok(None);
            };
            let kinds = sqlx::query!(
                r#"SELECT kind, is_required AS "is_required: i8" FROM exercise_measurement_kinds WHERE exercise_id = ?"#,
                row.exercise_id
            )
            .fetch_all(&self.pool)
            .await?;
            let mut measurements = kinds
                .into_iter()
                .map(|k| measurement(&k.kind, k.is_required))
                .collect::<anyhow::Result<Vec<_>>>()?;
            measurements.sort_by_key(|m| m.kind);
            Ok(Some(BlockForSets {
                id: BlockId::from_bytes(id_bytes(row.block_id)?),
                measurements,
                set_count: usize::try_from(row.set_count)?,
            }))
        })
    }

    fn insert_set<'a>(
        &'a self,
        block: BlockId,
        set: &'a WorkoutSet,
    ) -> BoxFuture<'a, anyhow::Result<()>> {
        Box::pin(async move {
            let order = i16::try_from(set.order)?;
            let v = set.values;
            sqlx::query!(
                "INSERT INTO workout_sets (set_id, block_id, set_order, reps, weight_kg, duration_seconds, interval_seconds, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ? / 10, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
                set.id.as_bytes().as_slice(),
                block.as_bytes().as_slice(),
                order,
                v.reps,
                v.weight_tenths,
                v.duration_seconds,
                v.interval_seconds,
            )
            .execute(&self.pool)
            .await?;
            Ok(())
        })
    }

    fn find_session_of_block<'a>(
        &'a self,
        owner: UserId,
        block: BlockId,
    ) -> BoxFuture<'a, anyhow::Result<Option<Session>>> {
        Box::pin(async move {
            let session = sqlx::query_scalar!(
                "SELECT b.session_id FROM exercise_blocks b JOIN sessions s ON s.session_id = b.session_id
                  WHERE b.block_id = ? AND s.user_id = ?",
                block.as_bytes().as_slice(),
                owner.as_bytes().as_slice()
            )
            .fetch_optional(&self.pool)
            .await?;
            match session {
                Some(id) => {
                    self.find_session(owner, SessionId::from_bytes(id_bytes(id)?))
                        .await
                }
                None => Ok(None),
            }
        })
    }

    fn find_session_of_set<'a>(
        &'a self,
        owner: UserId,
        set: SetId,
    ) -> BoxFuture<'a, anyhow::Result<Option<Session>>> {
        Box::pin(async move {
            let session = sqlx::query_scalar!(
                "SELECT b.session_id FROM workout_sets ws
                   JOIN exercise_blocks b ON b.block_id = ws.block_id
                   JOIN sessions s ON s.session_id = b.session_id
                  WHERE ws.set_id = ? AND s.user_id = ?",
                set.as_bytes().as_slice(),
                owner.as_bytes().as_slice()
            )
            .fetch_optional(&self.pool)
            .await?;
            match session {
                Some(id) => {
                    self.find_session(owner, SessionId::from_bytes(id_bytes(id)?))
                        .await
                }
                None => Ok(None),
            }
        })
    }

    fn update_session<'a>(&'a self, session: &'a Session) -> BoxFuture<'a, anyhow::Result<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await?;
            sqlx::query!(
                "UPDATE sessions SET workout_date = ?, note = ?, ended_at = ?, updated_at = UTC_TIMESTAMP(3)
                  WHERE session_id = ?",
                session.workout_date.date(),
                session.note.as_ref().map(|n| n.as_str()),
                session.ended_at.map(to_db_time),
                session.id.as_bytes().as_slice(),
            )
            .execute(&mut *tx)
            .await?;
            // Keep the copy of the date on the blocks in step (data-model §4.6).
            sqlx::query!(
                "UPDATE exercise_blocks SET workout_date = ? WHERE session_id = ?",
                session.workout_date.date(),
                session.id.as_bytes().as_slice(),
            )
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            Ok(())
        })
    }

    fn delete_session<'a>(&'a self, id: SessionId) -> BoxFuture<'a, anyhow::Result<()>> {
        Box::pin(async move {
            // Blocks and sets go with it (ON DELETE CASCADE, data-model §7).
            sqlx::query!(
                "DELETE FROM sessions WHERE session_id = ?",
                id.as_bytes().as_slice()
            )
            .execute(&self.pool)
            .await?;
            Ok(())
        })
    }

    fn save_blocks<'a>(
        &'a self,
        session: SessionId,
        blocks: &'a [ExerciseBlock],
        removed: Option<BlockId>,
    ) -> BoxFuture<'a, anyhow::Result<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await?;
            if let Some(removed) = removed {
                sqlx::query!(
                    "DELETE FROM exercise_blocks WHERE block_id = ?",
                    removed.as_bytes().as_slice()
                )
                .execute(&mut *tx)
                .await?;
            }
            // Move every block out of the way first: uk_blocks_session_order
            // would refuse swapping two orders one row at a time.
            sqlx::query!(
                "UPDATE exercise_blocks SET block_order = block_order + 1000 WHERE session_id = ?",
                session.as_bytes().as_slice()
            )
            .execute(&mut *tx)
            .await?;
            for block in blocks {
                sqlx::query!(
                    "UPDATE exercise_blocks SET exercise_id = ?, block_order = ?, updated_at = UTC_TIMESTAMP(3)
                      WHERE block_id = ?",
                    block.exercise_id.as_bytes().as_slice(),
                    i16::try_from(block.order)?,
                    block.id.as_bytes().as_slice(),
                )
                .execute(&mut *tx)
                .await?;
            }
            tx.commit().await?;
            Ok(())
        })
    }

    fn save_sets<'a>(
        &'a self,
        block: BlockId,
        sets: &'a [WorkoutSet],
        removed: Option<SetId>,
    ) -> BoxFuture<'a, anyhow::Result<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await?;
            if let Some(removed) = removed {
                sqlx::query!(
                    "DELETE FROM workout_sets WHERE set_id = ?",
                    removed.as_bytes().as_slice()
                )
                .execute(&mut *tx)
                .await?;
            }
            // Same as for blocks: free the orders before assigning them.
            sqlx::query!(
                "UPDATE workout_sets SET set_order = set_order + 1000 WHERE block_id = ?",
                block.as_bytes().as_slice()
            )
            .execute(&mut *tx)
            .await?;
            for set in sets {
                let v = set.values;
                sqlx::query!(
                    "UPDATE workout_sets
                        SET set_order = ?, reps = ?, weight_kg = ? / 10, duration_seconds = ?, interval_seconds = ?,
                            updated_at = UTC_TIMESTAMP(3)
                      WHERE set_id = ?",
                    i16::try_from(set.order)?,
                    v.reps,
                    v.weight_tenths,
                    v.duration_seconds,
                    v.interval_seconds,
                    set.id.as_bytes().as_slice(),
                )
                .execute(&mut *tx)
                .await?;
            }
            tx.commit().await?;
            Ok(())
        })
    }
}
