//! `exercises` and `exercise_measurement_kinds` tables.

use std::collections::BTreeMap;

use sqlx::MySqlPool;

use crate::application::ports::BoxFuture;
use crate::application::ports::exercise_repository::ExerciseRepository;
use crate::domain::exercise::{Exercise, ExerciseId, Measurement, MeasurementKind, Owner};
use crate::domain::user::UserId;
use crate::infrastructure::db::{from_db_time, id_bytes};

pub struct MysqlExerciseRepository {
    pool: MySqlPool,
}

impl MysqlExerciseRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

/// One exercise × measurement row of the join below.
struct Row {
    exercise_id: Vec<u8>,
    owner_user_id: Option<Vec<u8>>,
    name: String,
    parent_exercise_id: Option<Vec<u8>>,
    created_at: chrono::NaiveDateTime,
    kind: Option<String>,
    is_required: Option<i8>,
}

fn kind(value: &str) -> anyhow::Result<MeasurementKind> {
    match value {
        "reps" => Ok(MeasurementKind::Reps),
        "weight" => Ok(MeasurementKind::Weight),
        "time" => Ok(MeasurementKind::Time),
        other => Err(anyhow::anyhow!("unknown measurement kind {other:?}")),
    }
}

/// Folds joined rows into exercises, keeping the rows' order of first
/// appearance per ID.
fn assemble(rows: Vec<Row>) -> anyhow::Result<Vec<Exercise>> {
    let mut grouped: BTreeMap<Vec<u8>, (Row, Vec<Measurement>)> = BTreeMap::new();
    for mut row in rows {
        let measurement = match (row.kind.take(), row.is_required) {
            (Some(k), Some(required)) => Some(Measurement {
                kind: kind(&k)?,
                required: required != 0,
            }),
            _ => None,
        };
        let entry = grouped
            .entry(row.exercise_id.clone())
            .or_insert_with(|| (row, Vec::new()));
        entry.1.extend(measurement);
    }
    grouped
        .into_values()
        .map(|(row, measurements)| {
            Ok(Exercise::restore(
                ExerciseId::from_bytes(id_bytes(row.exercise_id)?),
                match row.owner_user_id {
                    None => Owner::Preset,
                    Some(owner) => Owner::User(UserId::from_bytes(id_bytes(owner)?)),
                },
                row.name,
                measurements,
                row.parent_exercise_id
                    .map(|p| id_bytes(p).map(ExerciseId::from_bytes))
                    .transpose()?,
                from_db_time(row.created_at),
            ))
        })
        .collect()
}

impl ExerciseRepository for MysqlExerciseRepository {
    fn list_visible<'a>(&'a self, user: UserId) -> BoxFuture<'a, anyhow::Result<Vec<Exercise>>> {
        Box::pin(async move {
            let rows = sqlx::query_as!(
                Row,
                r#"SELECT e.exercise_id, e.owner_user_id, e.name, e.parent_exercise_id, e.created_at,
                          k.kind AS "kind?", k.is_required AS "is_required?: i8"
                     FROM exercises e
                     LEFT JOIN exercise_measurement_kinds k ON k.exercise_id = e.exercise_id
                    WHERE e.owner_user_id IS NULL OR e.owner_user_id = ?"#,
                user.as_bytes().as_slice()
            )
            .fetch_all(&self.pool)
            .await?;
            assemble(rows)
        })
    }

    fn find_visible<'a>(
        &'a self,
        user: UserId,
        id: &'a ExerciseId,
    ) -> BoxFuture<'a, anyhow::Result<Option<Exercise>>> {
        Box::pin(async move {
            let rows = sqlx::query_as!(
                Row,
                r#"SELECT e.exercise_id, e.owner_user_id, e.name, e.parent_exercise_id, e.created_at,
                          k.kind AS "kind?", k.is_required AS "is_required?: i8"
                     FROM exercises e
                     LEFT JOIN exercise_measurement_kinds k ON k.exercise_id = e.exercise_id
                    WHERE e.exercise_id = ? AND (e.owner_user_id IS NULL OR e.owner_user_id = ?)"#,
                id.as_bytes().as_slice(),
                user.as_bytes().as_slice()
            )
            .fetch_all(&self.pool)
            .await?;
            Ok(assemble(rows)?.into_iter().next())
        })
    }
}
