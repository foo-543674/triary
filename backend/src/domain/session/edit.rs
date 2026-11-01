//! Correcting a recorded workout (US-8): change a set, reorder sets and
//! blocks, change the session's date, note or end time, end it.

use chrono::{DateTime, Utc};

use super::record::{RawSetValues, validate_set};
use super::values::{Note, WorkoutDate};
use super::{SetValues, WorkoutSet};
use crate::domain::exercise::Exercise;
use crate::domain::user::UserId;
use crate::domain::validation::{FieldPath, Violation, ViolationCode, both};

/// Stored values in the shape a client sends (kilograms, not tenths), so
/// they can be checked again by [`validate_set`].
pub fn as_raw(values: SetValues) -> RawSetValues {
    RawSetValues {
        reps: values.reps,
        weight_kg: values.weight_tenths.map(|t| t as f64 / 10.0),
        duration_seconds: values.duration_seconds,
        interval_seconds: values.interval_seconds,
    }
}

/// A block may switch to `exercise` (visible to `owner`; `None` when
/// missing) only if every recorded set is a valid set of the new exercise:
/// nothing required missing, nothing it cannot read (US-8).
pub fn validate_exercise_swap(
    exercise: Option<Exercise>,
    owner: UserId,
    sets: &[WorkoutSet],
) -> Result<Exercise, Vec<Violation>> {
    let field = FieldPath::new("exercise_id");
    let exercise = exercise
        .filter(|e| e.is_visible_to(owner))
        .ok_or_else(|| vec![Violation::new(field.clone(), ViolationCode::NotFound)])?;
    if sets
        .iter()
        .all(|set| validate_set(as_raw(set.values), exercise.measurements()).is_ok())
    {
        Ok(exercise)
    } else {
        Err(vec![Violation::new(
            field,
            ViolationCode::IncompatibleWithExistingSets,
        )])
    }
}

/// Moves `moving` to `position` (clamped to the end) and returns the new
/// order. Items keep their relative order otherwise. `None` when `moving`
/// is not in `items`.
pub fn move_to<T: PartialEq + Copy>(items: &[T], moving: T, position: usize) -> Option<Vec<T>> {
    let from = items.iter().position(|item| *item == moving)?;
    let mut reordered: Vec<T> = items.to_vec();
    reordered.remove(from);
    let to = position.min(reordered.len());
    reordered.insert(to, moving);
    Some(reordered)
}

/// A session's editable attributes as sent; `None` = leave unchanged.
/// For `note` and `ended_at`, `Some(None)` clears the value.
#[derive(Debug, Clone, Default)]
pub struct SessionPatch {
    pub workout_date: Option<String>,
    pub note: Option<Option<String>>,
    pub ended_at: Option<Option<DateTime<Utc>>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedSessionPatch {
    pub workout_date: Option<WorkoutDate>,
    pub note: Option<Option<Note>>,
    pub ended_at: Option<Option<DateTime<Utc>>>,
}

/// Checks a patch against the session's `started_at`: date format and no
/// future, note length, and `ended_at` not before the start
/// (data-model ck_sessions_end_after_start).
pub fn validate_session_patch(
    patch: SessionPatch,
    started_at: DateTime<Utc>,
    now: DateTime<Utc>,
) -> Result<ValidatedSessionPatch, Vec<Violation>> {
    let date = patch
        .workout_date
        .map(|raw| WorkoutDate::parse(&raw, now, &FieldPath::new("workout_date")))
        .transpose();
    let note = patch
        .note
        .map(|note| {
            note.map(|raw| Note::parse(raw, &FieldPath::new("note")))
                .transpose()
        })
        .transpose();
    let ended_at = match patch.ended_at {
        Some(Some(end)) if end < started_at => Err(vec![Violation::new(
            FieldPath::new("ended_at"),
            ViolationCode::BeforeStart,
        )]),
        other => Ok(other),
    };
    both(both(date, note), ended_at).map(|((workout_date, note), ended_at)| ValidatedSessionPatch {
        workout_date,
        note,
        ended_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    use crate::domain::exercise::{ExerciseId, Measurement, MeasurementKind, Owner};
    use crate::domain::session::SetId;

    fn exercise(kinds: &[(MeasurementKind, bool)]) -> Exercise {
        Exercise::restore(
            ExerciseId::from_bytes([1; 16]),
            Owner::Preset,
            "x".into(),
            kinds
                .iter()
                .map(|&(kind, required)| Measurement { kind, required })
                .collect(),
            None,
            DateTime::<Utc>::from_timestamp(0, 0).unwrap(),
        )
    }

    fn set(reps: Option<i64>, weight_tenths: Option<i64>) -> WorkoutSet {
        WorkoutSet {
            id: SetId::from_bytes([1; 16]),
            order: 0,
            values: SetValues {
                reps,
                weight_tenths,
                ..Default::default()
            },
        }
    }

    #[test]
    fn a_swap_must_fit_every_recorded_set() {
        use MeasurementKind::{Reps, Time, Weight};
        let me = UserId::from_bytes([9; 16]);
        let sets = [set(Some(8), Some(800)), set(Some(5), None)];
        // Reps required, weight optional: both sets fit.
        assert!(
            validate_exercise_swap(Some(exercise(&[(Reps, true), (Weight, false)])), me, &sets)
                .is_ok()
        );
        // Weight required: the second set lacks it.
        let code = |e| validate_exercise_swap(Some(e), me, &sets).unwrap_err()[0].code;
        assert_eq!(
            code(exercise(&[(Reps, true), (Weight, true)])),
            ViolationCode::IncompatibleWithExistingSets
        );
        // Time only: the reps and weights could not be read.
        assert_eq!(
            code(exercise(&[(Time, true)])),
            ViolationCode::IncompatibleWithExistingSets
        );
        // An empty block fits anything.
        assert!(validate_exercise_swap(Some(exercise(&[(Time, true)])), me, &[]).is_ok());
        assert_eq!(
            validate_exercise_swap(None, me, &[]).unwrap_err()[0].code,
            ViolationCode::NotFound
        );
    }

    #[test]
    fn move_to_reorders_and_clamps() {
        assert_eq!(move_to(&[1, 2, 3, 4], 4, 0), Some(vec![4, 1, 2, 3]));
        assert_eq!(move_to(&[1, 2, 3, 4], 1, 2), Some(vec![2, 3, 1, 4]));
        assert_eq!(move_to(&[1, 2, 3], 2, 99), Some(vec![1, 3, 2]));
        assert_eq!(move_to(&[1, 2, 3], 9, 0), None);
    }

    fn at(s: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc)
    }

    #[test]
    fn patch_rules() {
        let start = at("2026-10-31T09:00:00Z");
        let now = at("2026-10-31T10:00:00Z");
        let ok = validate_session_patch(
            SessionPatch {
                workout_date: Some("2026-10-30".into()),
                note: Some(None),
                ended_at: Some(Some(at("2026-10-31T09:30:00Z"))),
            },
            start,
            now,
        )
        .unwrap();
        assert_eq!(ok.note, Some(None));
        let violations = validate_session_patch(
            SessionPatch {
                workout_date: Some("2027-01-01".into()),
                note: Some(Some("x".repeat(2001))),
                ended_at: Some(Some(at("2026-10-31T08:59:59Z"))),
            },
            start,
            now,
        )
        .unwrap_err();
        assert_eq!(
            violations
                .into_iter()
                .map(|v| (v.field.to_string(), v.code))
                .collect::<Vec<_>>(),
            [
                ("workout_date".to_owned(), ViolationCode::InFuture),
                ("note".to_owned(), ViolationCode::TooLong),
                ("ended_at".to_owned(), ViolationCode::BeforeStart),
            ]
        );
    }
}
