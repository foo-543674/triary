//! Values recorded in a workout session, each checked on creation
//! (specification "主要な前提", api-design §1.7).

use chrono::{DateTime, Duration, NaiveDate, Utc};

use crate::domain::validation::{FieldPath, Violation, ViolationCode};

/// The calendar day a session belongs to, as the user's device saw it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct WorkoutDate(NaiveDate);

/// The server keeps no time zone (architecture.md), so "not in the future"
/// is checked against the latest local date anywhere on Earth: UTC+14.
const LATEST_UTC_OFFSET_HOURS: i64 = 14;

impl WorkoutDate {
    /// Parses `YYYY-MM-DD` and refuses a date that is in the future in
    /// every time zone at `now`.
    pub fn parse(raw: &str, now: DateTime<Utc>, field: &FieldPath) -> Result<Self, Vec<Violation>> {
        let date = NaiveDate::parse_from_str(raw, "%Y-%m-%d")
            .ok()
            .filter(|_| raw.len() == 10)
            .ok_or_else(|| vec![Violation::new(field.clone(), ViolationCode::InvalidFormat)])?;
        let latest = (now + Duration::hours(LATEST_UTC_OFFSET_HOURS)).date_naive();
        if date > latest {
            return Err(vec![Violation::new(field.clone(), ViolationCode::InFuture)]);
        }
        Ok(Self(date))
    }

    pub fn from_stored(date: NaiveDate) -> Self {
        Self(date)
    }

    pub fn date(&self) -> NaiveDate {
        self.0
    }
}

pub const NOTE_MAX_CHARS: usize = 2000;

/// Free text about a session; at most 2000 characters (implementation-plan
/// §5 provisional value).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Note(String);

impl Note {
    pub fn parse(raw: String, field: &FieldPath) -> Result<Self, Vec<Violation>> {
        if raw.chars().count() > NOTE_MAX_CHARS {
            Err(vec![Violation::new(field.clone(), ViolationCode::TooLong)])
        } else {
            Ok(Self(raw))
        }
    }

    pub fn from_stored(value: String) -> Self {
        Self(value)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Checks `value` against an inclusive range; `out_of_range` otherwise.
pub fn in_range<T: PartialOrd + Copy>(
    value: T,
    min: T,
    max: T,
    field: &FieldPath,
) -> Result<T, Vec<Violation>> {
    if value < min || value > max {
        Err(vec![Violation::new(
            field.clone(),
            ViolationCode::OutOfRange,
        )])
    } else {
        Ok(value)
    }
}

pub const REPS_MAX: i64 = 9_999;
pub const DURATION_MAX_SECONDS: i64 = 86_400;
pub const INTERVAL_MAX_SECONDS: i64 = 3_600;
/// Weight in tenths of a kilogram: -500.0 .. 999.9 kg in steps of 0.1.
pub const WEIGHT_MIN_TENTHS: i64 = -5_000;
pub const WEIGHT_MAX_TENTHS: i64 = 9_999;

/// Converts kilograms to tenths, refusing values that are not on the 0.1
/// grid (`invalid_format`) or outside the range (`out_of_range`).
pub fn weight_tenths(kg: f64, field: &FieldPath) -> Result<i64, Vec<Violation>> {
    let scaled = kg * 10.0;
    let rounded = scaled.round();
    if !scaled.is_finite() || (scaled - rounded).abs() > 1e-6 {
        return Err(vec![Violation::new(
            field.clone(),
            ViolationCode::InvalidFormat,
        )]);
    }
    // In range of i64 is checked by the range check right after.
    let tenths = rounded as i64;
    in_range(tenths, WEIGHT_MIN_TENTHS, WEIGHT_MAX_TENTHS, field)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;
    use rstest::rstest;

    fn field() -> FieldPath {
        FieldPath::new("x")
    }

    fn now() -> DateTime<Utc> {
        // 2026-10-31 10:00 UTC: the latest date anywhere is 2026-11-01.
        DateTime::parse_from_rfc3339("2026-10-31T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    fn code<T: std::fmt::Debug>(result: Result<T, Vec<Violation>>) -> Option<ViolationCode> {
        result.err().map(|v| v[0].code)
    }

    #[rstest]
    #[case("2026-11-01", None)]
    #[case("1990-01-01", None)]
    #[case("2026-11-02", Some(ViolationCode::InFuture))]
    #[case("2026-1-5", Some(ViolationCode::InvalidFormat))]
    #[case("2026-02-30", Some(ViolationCode::InvalidFormat))]
    #[case("", Some(ViolationCode::InvalidFormat))]
    fn workout_date_rules(#[case] raw: &str, #[case] expected: Option<ViolationCode>) {
        assert_eq!(code(WorkoutDate::parse(raw, now(), &field())), expected);
    }

    #[test]
    fn note_length_bound() {
        assert!(Note::parse("あ".repeat(2000), &field()).is_ok());
        assert_eq!(
            code(Note::parse("あ".repeat(2001), &field())),
            Some(ViolationCode::TooLong)
        );
    }

    #[rstest]
    #[case(80.5, Ok(805))]
    #[case(-500.0, Ok(-5000))]
    #[case(999.9, Ok(9999))]
    #[case(1000.0, Err(ViolationCode::OutOfRange))]
    #[case(-500.1, Err(ViolationCode::OutOfRange))]
    #[case(80.25, Err(ViolationCode::InvalidFormat))]
    #[case(f64::NAN, Err(ViolationCode::InvalidFormat))]
    fn weight_grid_and_range(#[case] kg: f64, #[case] expected: Result<i64, ViolationCode>) {
        assert_eq!(weight_tenths(kg, &field()).map_err(|v| v[0].code), expected);
    }
}
