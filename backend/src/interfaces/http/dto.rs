//! Wire formats shared by several endpoints.

use chrono::{DateTime, SecondsFormat, Utc};

/// `Timestamp` in openapi.yaml: UTC, whole seconds, ending in `Z`.
pub fn timestamp(instant: DateTime<Utc>) -> String {
    instant.to_rfc3339_opts(SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamps_are_whole_seconds_in_utc() {
        let instant = DateTime::<Utc>::from_timestamp(1_800_000_000, 999_000_000).unwrap();
        assert_eq!(timestamp(instant), "2027-01-15T08:00:00Z");
    }
}
