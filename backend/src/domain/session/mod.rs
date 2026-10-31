//! Workout sessions (US-7): one training occasion with its exercise blocks
//! and their sets. Blocks and sets live inside the session aggregate
//! (architecture.md "境界定義").

pub mod record;
pub mod values;

use chrono::{DateTime, Utc};

use crate::domain::exercise::{ExerciseId, Measurement};
use crate::domain::user::UserId;
use values::{Note, WorkoutDate};

macro_rules! id_type {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
        pub struct $name([u8; 16]);

        impl $name {
            pub fn from_bytes(bytes: [u8; 16]) -> Self {
                Self(bytes)
            }

            pub fn as_bytes(&self) -> &[u8; 16] {
                &self.0
            }
        }
    };
}

id_type!(SessionId);
id_type!(BlockId);
id_type!(SetId);

/// What one set recorded. Weight is in tenths of a kilogram (signed:
/// positive = added load, negative = assistance).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SetValues {
    pub reps: Option<i64>,
    pub weight_tenths: Option<i64>,
    pub duration_seconds: Option<i64>,
    pub interval_seconds: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkoutSet {
    pub id: SetId,
    pub order: usize,
    pub values: SetValues,
}

/// One exercise done in a session, with its sets in order. The exercise's
/// name and measurements are kept as they were read, for display.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExerciseBlock {
    pub id: BlockId,
    pub exercise_id: ExerciseId,
    pub exercise_name: String,
    pub measurements: Vec<Measurement>,
    pub order: usize,
    pub sets: Vec<WorkoutSet>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Session {
    pub id: SessionId,
    pub owner: UserId,
    pub workout_date: WorkoutDate,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub note: Option<Note>,
    pub blocks: Vec<ExerciseBlock>,
}
