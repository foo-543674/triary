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

/// For partial updates: a missing field stays `None` (keep), `null` becomes
/// `Some(None)` (clear), a value becomes `Some(Some(value))`. Use with
/// `#[serde(default, deserialize_with = "patch_field")]`.
pub fn patch_field<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    <Option<T> as serde::Deserialize>::deserialize(deserializer).map(Some)
}

#[cfg(test)]
mod patch_field_tests {
    use super::patch_field;
    use pretty_assertions::assert_eq;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Patch {
        #[serde(default, deserialize_with = "patch_field")]
        note: Option<Option<String>>,
    }

    #[test]
    fn tells_missing_null_and_value_apart() {
        let read = |json: &str| serde_json::from_str::<Patch>(json).unwrap().note;
        assert_eq!(read("{}"), None);
        assert_eq!(read(r#"{"note": null}"#), Some(None));
        assert_eq!(read(r#"{"note": "x"}"#), Some(Some("x".to_owned())));
    }
}
