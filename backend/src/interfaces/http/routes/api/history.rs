//! `GET /api/v1/history/sessions` (US-9, api-design §2.6, §1.5).

use axum::Json;
use axum::extract::State;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::application::history::sessions_by_date;
use crate::application::ports::history::{DateKey, DateRange, SessionSummary};
use crate::domain::session::SessionId;
use crate::domain::validation::{FieldPath, Violation, ViolationCode, both};
use crate::interfaces::http::cursor;
use crate::interfaces::http::dto::timestamp;
use crate::interfaces::http::error::{AppError, QueryParams};
use crate::interfaces::http::id::{self, prefix};
use crate::interfaces::http::middleware::auth::CurrentUser;
use crate::interfaces::http::state::AppState;

pub const DEFAULT_LIMIT: usize = 30;
pub const MAX_LIMIT: usize = 100;

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub from: Option<String>,
    pub to: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ExerciseRef {
    pub exercise_id: String,
    pub exercise_name: String,
}

#[derive(Debug, Serialize)]
pub struct SessionSummaryDto {
    pub id: String,
    pub workout_date: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub block_count: usize,
    pub set_count: usize,
    pub exercise_summary: Vec<ExerciseRef>,
}

#[derive(Debug, Serialize)]
pub struct PageInfo {
    pub next_cursor: Option<String>,
    pub has_next: bool,
}

#[derive(Debug, Serialize)]
pub struct HistoryPage {
    pub items: Vec<SessionSummaryDto>,
    pub page_info: PageInfo,
}

fn summary(s: &SessionSummary) -> SessionSummaryDto {
    SessionSummaryDto {
        id: id::format(prefix::SESSION, s.id.as_bytes()),
        workout_date: s.workout_date.to_string(),
        started_at: timestamp(s.started_at),
        ended_at: s.ended_at.map(timestamp),
        block_count: s.block_count,
        set_count: s.set_count,
        exercise_summary: s
            .exercises
            .iter()
            .map(|(id, name)| ExerciseRef {
                exercise_id: id::format(prefix::EXERCISE, id.as_bytes()),
                exercise_name: name.clone(),
            })
            .collect(),
    }
}

/// Cursor text: base64url of `YYYY-MM-DD|<session id hex>`.
pub fn encode_cursor(key: DateKey) -> String {
    let hex: String = key
        .session
        .as_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    cursor::encode(format!("{}|{hex}", key.workout_date).as_bytes())
}

pub fn decode_cursor(text: &str) -> Option<DateKey> {
    let raw = String::from_utf8(cursor::decode(text)?).ok()?;
    let (date, hex) = raw.split_once('|')?;
    let workout_date = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    if hex.len() != 32 {
        return None;
    }
    let mut bytes = [0u8; 16];
    for (slot, pair) in bytes.iter_mut().zip(hex.as_bytes().chunks(2)) {
        *slot = u8::from_str_radix(std::str::from_utf8(pair).ok()?, 16).ok()?;
    }
    Some(DateKey {
        workout_date,
        session: SessionId::from_bytes(bytes),
    })
}

fn date(raw: Option<String>, field: &str) -> Result<Option<NaiveDate>, Vec<Violation>> {
    raw.map(|text| {
        NaiveDate::parse_from_str(&text, "%Y-%m-%d")
            .ok()
            .filter(|_| text.len() == 10)
            .ok_or_else(|| {
                vec![Violation::new(
                    FieldPath::new(field),
                    ViolationCode::InvalidFormat,
                )]
            })
    })
    .transpose()
}

pub async fn sessions(
    State(state): State<AppState>,
    current: CurrentUser,
    QueryParams(query): QueryParams<HistoryQuery>,
) -> Result<Json<HistoryPage>, AppError> {
    let range = both(date(query.from, "from"), date(query.to, "to"));
    let after = query
        .cursor
        .map(|text| {
            decode_cursor(&text).ok_or_else(|| {
                vec![Violation::new(
                    FieldPath::new("cursor"),
                    ViolationCode::InvalidFormat,
                )]
            })
        })
        .transpose();
    let limit = query.limit.map_or(Ok(DEFAULT_LIMIT), |limit| {
        usize::try_from(limit)
            .ok()
            .filter(|l| (1..=MAX_LIMIT).contains(l))
            .ok_or_else(|| {
                vec![Violation::new(
                    FieldPath::new("limit"),
                    ViolationCode::OutOfRange,
                )]
            })
    });
    let ((from, to), (after, limit)) = both(range, both(after, limit))?;
    let page = sessions_by_date(
        &state.history,
        current.user.id(),
        DateRange { from, to },
        after,
        limit,
    )
    .await?;
    Ok(Json(HistoryPage {
        items: page.items.iter().map(summary).collect(),
        page_info: PageInfo {
            has_next: page.next.is_some(),
            next_cursor: page.next.map(encode_cursor),
        },
    }))
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use axum::body::Body;
    use axum::http::{Request, StatusCode, header};
    use chrono::{DateTime, NaiveDate, Utc};
    use http_body_util::BodyExt as _;
    use pretty_assertions::assert_eq;
    use proptest::prelude::*;
    use serde_json::{Value, json};
    use tower::ServiceExt as _;

    use super::{decode_cursor, encode_cursor};
    use crate::application::ports::history::DateKey;
    use crate::domain::exercise::{Exercise, ExerciseId, Measurement, MeasurementKind, Owner};
    use crate::domain::session::SessionId;
    use crate::interfaces::http::id::{self, prefix};
    use crate::testing::fakes;

    async fn call(
        router: &Router,
        method: &str,
        uri: &str,
        cookie: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Value, Option<String>) {
        let mut request = Request::builder().method(method).uri(uri);
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        let body = match body {
            Some(json) => {
                request = request.header(header::CONTENT_TYPE, "application/json");
                Body::from(json.to_string())
            }
            None => Body::empty(),
        };
        let response = router
            .clone()
            .oneshot(request.body(body).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .map(|v| v.to_str().unwrap().to_owned());
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            if bytes.is_empty() {
                Value::Null
            } else {
                serde_json::from_slice(&bytes).unwrap()
            },
            cookie,
        )
    }

    /// alice with sessions on the given dates (one block of bench press with
    /// one set in each), and bob with one session.
    async fn world(dates: &[&str]) -> (Router, String) {
        let fakes = fakes();
        fakes.exercises.add(Exercise::restore(
            ExerciseId::from_bytes([100; 16]),
            Owner::Preset,
            "ベンチプレス".into(),
            vec![Measurement {
                kind: MeasurementKind::Reps,
                required: true,
            }],
            None,
            DateTime::<Utc>::from_timestamp(0, 0).unwrap(),
        ));
        let router = crate::app(fakes.state());
        let sign_up = |handle: &'static str| {
            let router = router.clone();
            async move {
                let (_, _, cookie) = call(
                    &router,
                    "POST",
                    "/web/v1/signup",
                    None,
                    Some(json!({ "user_id": handle, "password": "correcthorsebattery" })),
                )
                .await;
                cookie.unwrap().split(';').next().unwrap().to_owned()
            }
        };
        let alice = sign_up("alice").await;
        let bob = sign_up("bobby").await;
        for date in dates {
            let (_, session, _) = call(
                &router,
                "POST",
                "/api/v1/sessions",
                Some(&alice),
                Some(json!({ "workout_date": date })),
            )
            .await;
            let (_, block, _) = call(
                &router,
                "POST",
                &format!(
                    "/api/v1/sessions/{}/blocks",
                    session["id"].as_str().unwrap()
                ),
                Some(&alice),
                Some(json!({ "exercise_id": id::format(prefix::EXERCISE, &[100; 16]) })),
            )
            .await;
            call(
                &router,
                "POST",
                &format!("/api/v1/blocks/{}/sets", block["id"].as_str().unwrap()),
                Some(&alice),
                Some(json!({ "reps": 5 })),
            )
            .await;
        }
        call(
            &router,
            "POST",
            "/api/v1/sessions",
            Some(&bob),
            Some(json!({ "workout_date": "2027-01-01" })),
        )
        .await;
        (router, alice)
    }

    fn dates(body: &Value) -> Vec<String> {
        body["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["workout_date"].as_str().unwrap().to_owned())
            .collect()
    }

    #[tokio::test]
    async fn lists_own_sessions_newest_date_first_with_summaries() {
        let (router, alice) = world(&["2027-01-10", "2027-01-12", "2027-01-11"]).await;
        let (status, body, _) = call(
            &router,
            "GET",
            "/api/v1/history/sessions",
            Some(&alice),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(dates(&body), ["2027-01-12", "2027-01-11", "2027-01-10"]);
        let first = &body["items"][0];
        assert_eq!(
            (first["block_count"].as_u64(), first["set_count"].as_u64()),
            (Some(1), Some(1))
        );
        assert_eq!(
            first["exercise_summary"][0]["exercise_name"],
            "ベンチプレス"
        );
        assert_eq!(
            body["page_info"],
            json!({ "next_cursor": null, "has_next": false })
        );
    }

    #[tokio::test]
    async fn pages_through_with_the_cursor() {
        let (router, alice) = world(&[
            "2027-01-10",
            "2027-01-11",
            "2027-01-11",
            "2027-01-12",
            "2027-01-13",
        ])
        .await;
        let mut seen = Vec::new();
        let mut uri = "/api/v1/history/sessions?limit=2".to_owned();
        loop {
            let (status, body, _) = call(&router, "GET", &uri, Some(&alice), None).await;
            assert_eq!(status, StatusCode::OK);
            assert!(body["items"].as_array().unwrap().len() <= 2);
            seen.extend(
                body["items"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|i| i["id"].as_str().unwrap().to_owned()),
            );
            if !body["page_info"]["has_next"].as_bool().unwrap() {
                break;
            }
            uri = format!(
                "/api/v1/history/sessions?limit=2&cursor={}",
                body["page_info"]["next_cursor"].as_str().unwrap()
            );
        }
        assert_eq!(seen.len(), 5);
        let unique: std::collections::HashSet<_> = seen.iter().collect();
        assert_eq!(unique.len(), 5);
    }

    #[tokio::test]
    async fn filters_by_date_range() {
        let (router, alice) = world(&["2027-01-10", "2027-01-11", "2027-01-12"]).await;
        let (_, body, _) = call(
            &router,
            "GET",
            "/api/v1/history/sessions?from=2027-01-11&to=2027-01-11",
            Some(&alice),
            None,
        )
        .await;
        assert_eq!(dates(&body), ["2027-01-11"]);
    }

    #[tokio::test]
    async fn rejects_unreadable_parameters_all_at_once() {
        let (router, alice) = world(&[]).await;
        let (status, body, _) = call(
            &router,
            "GET",
            "/api/v1/history/sessions?from=2027-1-1&cursor=%21%21&limit=101",
            Some(&alice),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let pairs: Vec<(&str, &str)> = body["errors"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| (e["field"].as_str().unwrap(), e["code"].as_str().unwrap()))
            .collect();
        assert_eq!(
            pairs,
            [
                ("from", "invalid_format"),
                ("cursor", "invalid_format"),
                ("limit", "out_of_range")
            ]
        );
        let (status, _, _) = call(
            &router,
            "GET",
            "/api/v1/history/sessions?limit=0",
            Some(&alice),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn needs_a_session_and_shows_nothing_of_other_users() {
        let (router, _) = world(&[]).await;
        let (status, _, _) = call(&router, "GET", "/api/v1/history/sessions", None, None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        let (_, _, cookie) = call(
            &router,
            "POST",
            "/web/v1/signup",
            None,
            Some(json!({ "user_id": "carol", "password": "correcthorsebattery" })),
        )
        .await;
        let carol = cookie.unwrap().split(';').next().unwrap().to_owned();
        let (_, body, _) = call(
            &router,
            "GET",
            "/api/v1/history/sessions",
            Some(&carol),
            None,
        )
        .await;
        assert_eq!(body["items"], json!([]));
    }

    proptest! {
        #[test]
        fn cursors_round_trip(days in 0i64..100_000, bytes in proptest::array::uniform16(any::<u8>())) {
            let key = DateKey {
                workout_date: NaiveDate::from_ymd_opt(1900, 1, 1).unwrap() + chrono::Duration::days(days),
                session: SessionId::from_bytes(bytes),
            };
            prop_assert_eq!(decode_cursor(&encode_cursor(key)), Some(key));
        }

        #[test]
        fn decoding_garbage_never_panics(text in ".{0,60}") {
            let _ = decode_cursor(&text);
        }
    }
}
