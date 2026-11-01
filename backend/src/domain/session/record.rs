//! Recording a workout (US-7): starting a session, adding an exercise block,
//! adding a set. Each is input → validator → validated value; the
//! validated values are what the application stores.

use chrono::{DateTime, Utc};

use super::values::{
    DURATION_MAX_SECONDS, INTERVAL_MAX_SECONDS, Note, REPS_MAX, WorkoutDate, in_range,
    weight_tenths,
};
use super::{SetValues, WorkoutSet};
use crate::domain::exercise::{Exercise, Measurement, MeasurementKind};
use crate::domain::user::UserId;
use crate::domain::validation::{FieldPath, Violation, ViolationCode, both, collect};

/// A session may hold at most this many blocks (api-design §1.6 / §2.3).
pub const MAX_BLOCKS: usize = 50;
/// A block may hold at most this many sets (specification US-7 境界条件).
pub const MAX_SETS: usize = 50;

/// Room for one more set in a block that has `set_count` sets.
pub fn check_room_for_set(set_count: usize) -> Result<(), Vec<Violation>> {
    if set_count >= MAX_SETS {
        Err(vec![Violation::new(
            FieldPath::new("sets"),
            ViolationCode::ExceedsMaxSets,
        )])
    } else {
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct StartSessionInput {
    pub workout_date: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedStartSession {
    pub workout_date: WorkoutDate,
    pub note: Option<Note>,
}

/// `workout_date` is required: the server keeps no time zone, so "today"
/// is the client's to say (api-design §2.3).
pub fn validate_start(
    input: StartSessionInput,
    now: DateTime<Utc>,
) -> Result<ValidatedStartSession, Vec<Violation>> {
    let date_field = FieldPath::new("workout_date");
    let date = match input.workout_date.as_deref() {
        None | Some("") => Err(vec![Violation::new(date_field, ViolationCode::Required)]),
        Some(raw) => WorkoutDate::parse(raw, now, &date_field),
    };
    let note = input
        .note
        .map(|raw| Note::parse(raw, &FieldPath::new("note")))
        .transpose();
    both(date, note).map(|(workout_date, note)| ValidatedStartSession { workout_date, note })
}

/// Adding a block of `exercise` (as visible to the session's owner; `None`
/// when missing or not theirs) to a session that has `block_count` blocks.
pub fn validate_append_block(
    exercise: Option<Exercise>,
    owner: UserId,
    block_count: usize,
) -> Result<Exercise, Vec<Violation>> {
    let exercise = exercise.filter(|e| e.is_visible_to(owner)).ok_or_else(|| {
        vec![Violation::new(
            FieldPath::new("exercise_id"),
            ViolationCode::NotFound,
        )]
    });
    let room = if block_count >= MAX_BLOCKS {
        Err(vec![Violation::new(
            FieldPath::new("blocks"),
            ViolationCode::ExceedsMaxBlocks,
        )])
    } else {
        Ok(())
    };
    both(exercise, room).map(|(exercise, ())| exercise)
}

/// A set as sent, values not checked yet.
#[derive(Debug, Clone, Copy, Default)]
pub struct RawSetValues {
    pub reps: Option<i64>,
    pub weight_kg: Option<f64>,
    pub duration_seconds: Option<i64>,
    pub interval_seconds: Option<i64>,
}

fn field_of(kind: MeasurementKind) -> &'static str {
    match kind {
        MeasurementKind::Reps => "reps",
        MeasurementKind::Weight => "weight_kg",
        MeasurementKind::Time => "duration_seconds",
    }
}

/// Checks a set against the exercise's measurements: every value in range,
/// every required measurement present, no value for a measurement the
/// exercise does not record (`invalid_format`, it could not be read back
/// meaningfully; US-8 "解釈不能な項目"), and not entirely empty. Every
/// violation is reported.
pub fn validate_set(
    raw: RawSetValues,
    measurements: &[Measurement],
) -> Result<SetValues, Vec<Violation>> {
    let f = FieldPath::new;
    let present = [
        (MeasurementKind::Reps, raw.reps.is_some()),
        (MeasurementKind::Weight, raw.weight_kg.is_some()),
        (MeasurementKind::Time, raw.duration_seconds.is_some()),
    ];
    if present.iter().all(|(_, given)| !given) {
        return Err(vec![Violation::new(f("set"), ViolationCode::Empty)]);
    }
    let recorded = |kind| measurements.iter().find(|m| m.kind == kind);
    let shape: Vec<Violation> = present
        .iter()
        .filter_map(|&(kind, given)| match (recorded(kind), given) {
            (Some(m), false) if m.required => Some(Violation::new(
                f(field_of(kind)),
                ViolationCode::MissingRequiredMeasurement,
            )),
            (None, true) => Some(Violation::new(
                f(field_of(kind)),
                ViolationCode::InvalidFormat,
            )),
            _ => None,
        })
        .collect();
    let reps = raw
        .reps
        .map(|v| in_range(v, 0, REPS_MAX, &f("reps")))
        .transpose();
    let weight = raw
        .weight_kg
        .map(|kg| weight_tenths(kg, &f("weight_kg")))
        .transpose();
    let duration = raw
        .duration_seconds
        .map(|v| in_range(v, 0, DURATION_MAX_SECONDS, &f("duration_seconds")))
        .transpose();
    let interval = raw
        .interval_seconds
        .map(|v| in_range(v, 0, INTERVAL_MAX_SECONDS, &f("interval_seconds")))
        .transpose();
    let values = both(both(reps, weight), both(duration, interval)).map(
        |((reps, weight_tenths), (duration_seconds, interval_seconds))| SetValues {
            reps,
            weight_tenths,
            duration_seconds,
            interval_seconds,
        },
    );
    match values {
        Ok(values) => collect(values, shape),
        Err(mut range) => {
            range.extend(shape);
            Err(range)
        }
    }
}

/// Order a new set gets: after the existing ones.
pub fn next_set(id: super::SetId, existing: usize, values: SetValues) -> WorkoutSet {
    WorkoutSet {
        id,
        order: existing,
        values,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::exercise::{ExerciseId, Owner};
    use pretty_assertions::assert_eq;

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-31T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    fn pairs(violations: Vec<Violation>) -> Vec<(String, ViolationCode)> {
        violations
            .into_iter()
            .map(|v| (v.field.to_string(), v.code))
            .collect()
    }

    fn reps_weight_optional() -> Vec<Measurement> {
        vec![
            Measurement {
                kind: MeasurementKind::Reps,
                required: true,
            },
            Measurement {
                kind: MeasurementKind::Weight,
                required: false,
            },
        ]
    }

    #[test]
    fn start_needs_a_date_and_checks_the_note() {
        let violations = validate_start(
            StartSessionInput {
                workout_date: None,
                note: Some("x".repeat(2001)),
            },
            now(),
        )
        .unwrap_err();
        assert_eq!(
            pairs(violations),
            [
                ("workout_date".to_owned(), ViolationCode::Required),
                ("note".to_owned(), ViolationCode::TooLong),
            ]
        );
        let ok = validate_start(
            StartSessionInput {
                workout_date: Some("2026-10-31".into()),
                note: None,
            },
            now(),
        )
        .unwrap();
        assert_eq!(ok.workout_date.date().to_string(), "2026-10-31");
    }

    #[test]
    fn a_set_with_required_values_in_range_is_accepted() {
        let values = validate_set(
            RawSetValues {
                reps: Some(8),
                weight_kg: Some(-10.5),
                interval_seconds: Some(120),
                ..Default::default()
            },
            &reps_weight_optional(),
        )
        .unwrap();
        assert_eq!(
            values,
            SetValues {
                reps: Some(8),
                weight_tenths: Some(-105),
                duration_seconds: None,
                interval_seconds: Some(120)
            }
        );
    }

    #[test]
    fn a_block_holds_at_most_50_sets() {
        assert_eq!(check_room_for_set(49), Ok(()));
        assert_eq!(
            pairs(check_room_for_set(50).unwrap_err()),
            [("sets".to_owned(), ViolationCode::ExceedsMaxSets)]
        );
    }

    #[test]
    fn an_empty_set_is_refused() {
        let violations = validate_set(
            RawSetValues {
                interval_seconds: Some(60),
                ..Default::default()
            },
            &reps_weight_optional(),
        )
        .unwrap_err();
        assert_eq!(
            pairs(violations),
            [("set".to_owned(), ViolationCode::Empty)]
        );
    }

    #[test]
    fn reports_range_missing_and_unrecorded_values_together() {
        let violations = validate_set(
            RawSetValues {
                reps: None,
                weight_kg: Some(1000.0),
                duration_seconds: Some(30),
                interval_seconds: Some(3601),
            },
            &reps_weight_optional(),
        )
        .unwrap_err();
        assert_eq!(
            pairs(violations),
            [
                ("weight_kg".to_owned(), ViolationCode::OutOfRange),
                ("interval_seconds".to_owned(), ViolationCode::OutOfRange),
                ("reps".to_owned(), ViolationCode::MissingRequiredMeasurement),
                ("duration_seconds".to_owned(), ViolationCode::InvalidFormat),
            ]
        );
    }

    #[test]
    fn set_value_bounds() {
        let time = [Measurement {
            kind: MeasurementKind::Time,
            required: true,
        }];
        let reps = [Measurement {
            kind: MeasurementKind::Reps,
            required: true,
        }];
        let check = |raw: RawSetValues, m: &[Measurement]| validate_set(raw, m).err().map(pairs);
        assert_eq!(
            check(
                RawSetValues {
                    reps: Some(0),
                    ..Default::default()
                },
                &reps
            ),
            None
        );
        assert_eq!(
            check(
                RawSetValues {
                    reps: Some(9999),
                    ..Default::default()
                },
                &reps
            ),
            None
        );
        assert_eq!(
            check(
                RawSetValues {
                    reps: Some(10000),
                    ..Default::default()
                },
                &reps
            ),
            Some(vec![("reps".to_owned(), ViolationCode::OutOfRange)])
        );
        assert_eq!(
            check(
                RawSetValues {
                    reps: Some(-1),
                    ..Default::default()
                },
                &reps
            ),
            Some(vec![("reps".to_owned(), ViolationCode::OutOfRange)])
        );
        assert_eq!(
            check(
                RawSetValues {
                    duration_seconds: Some(86400),
                    ..Default::default()
                },
                &time
            ),
            None
        );
        assert_eq!(
            check(
                RawSetValues {
                    duration_seconds: Some(86401),
                    ..Default::default()
                },
                &time
            ),
            Some(vec![(
                "duration_seconds".to_owned(),
                ViolationCode::OutOfRange
            )])
        );
    }

    fn exercise(owner: Owner) -> Exercise {
        Exercise::restore(
            ExerciseId::from_bytes([1; 16]),
            owner,
            "x".into(),
            vec![],
            None,
            now(),
        )
    }

    #[test]
    fn a_block_needs_a_visible_exercise_and_room() {
        let me = UserId::from_bytes([1; 16]);
        let other = UserId::from_bytes([2; 16]);
        assert!(validate_append_block(Some(exercise(Owner::Preset)), me, 49).is_ok());
        assert_eq!(
            pairs(validate_append_block(Some(exercise(Owner::User(other))), me, 0).unwrap_err()),
            [("exercise_id".to_owned(), ViolationCode::NotFound)]
        );
        assert_eq!(
            pairs(validate_append_block(None, me, 50).unwrap_err()),
            [
                ("exercise_id".to_owned(), ViolationCode::NotFound),
                ("blocks".to_owned(), ViolationCode::ExceedsMaxBlocks),
            ]
        );
    }
}
