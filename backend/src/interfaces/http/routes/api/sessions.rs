//! Recording a workout (US-7, api-design §2.3-§2.4): start a session, read
//! it whole, add a block, add a set.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};

use super::exercises::MeasurementDto;
use crate::application::sessions::{
    SessionError, append_block, append_set, get_session, start_session,
};
use crate::domain::exercise::ExerciseId;
use crate::domain::session::record::{RawSetValues, StartSessionInput};
use crate::domain::session::{BlockId, ExerciseBlock, Session, SessionId, WorkoutSet};
use crate::domain::validation::{FieldPath, Violation, ViolationCode};
use crate::interfaces::http::dto::timestamp;
use crate::interfaces::http::error::{AppError, JsonBody};
use crate::interfaces::http::id::{self, prefix};
use crate::interfaces::http::middleware::auth::CurrentUser;
use crate::interfaces::http::state::AppState;

impl From<SessionError> for AppError {
    fn from(error: SessionError) -> Self {
        match error {
            SessionError::NotFound => Self::NotFound("Resource"),
            SessionError::Rejected(violations) => Self::Validation(violations),
            SessionError::Internal(error) => Self::Internal(error),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct SetDto {
    pub id: String,
    pub order: usize,
    pub reps: Option<i64>,
    pub weight_kg: Option<f64>,
    pub duration_seconds: Option<i64>,
    pub interval_seconds: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct BlockDto {
    pub id: String,
    pub session_id: String,
    pub exercise_id: String,
    pub exercise_name: String,
    pub exercise_measurement_kinds: Vec<MeasurementDto>,
    pub order: usize,
    pub sets: Vec<SetDto>,
}

#[derive(Debug, Serialize)]
pub struct SessionDto {
    pub id: String,
    pub workout_date: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub note: Option<String>,
    pub blocks: Vec<BlockDto>,
}

pub fn set_dto(set: &WorkoutSet) -> SetDto {
    let v = set.values;
    SetDto {
        id: id::format(prefix::SET, set.id.as_bytes()),
        order: set.order,
        reps: v.reps,
        // Tenths to kilograms: exact for every value on the 0.1 grid.
        weight_kg: v.weight_tenths.map(|t| t as f64 / 10.0),
        duration_seconds: v.duration_seconds,
        interval_seconds: v.interval_seconds,
    }
}

pub fn block_dto(session: SessionId, block: &ExerciseBlock) -> BlockDto {
    BlockDto {
        id: id::format(prefix::BLOCK, block.id.as_bytes()),
        session_id: id::format(prefix::SESSION, session.as_bytes()),
        exercise_id: id::format(prefix::EXERCISE, block.exercise_id.as_bytes()),
        exercise_name: block.exercise_name.clone(),
        exercise_measurement_kinds: block
            .measurements
            .iter()
            .map(MeasurementDto::from)
            .collect(),
        order: block.order,
        sets: block.sets.iter().map(set_dto).collect(),
    }
}

pub fn session_dto(session: &Session) -> SessionDto {
    SessionDto {
        id: id::format(prefix::SESSION, session.id.as_bytes()),
        workout_date: session.workout_date.date().to_string(),
        started_at: timestamp(session.started_at),
        ended_at: session.ended_at.map(timestamp),
        note: session.note.as_ref().map(|n| n.as_str().to_owned()),
        blocks: session
            .blocks
            .iter()
            .map(|b| block_dto(session.id, b))
            .collect(),
    }
}

/// A malformed path ID names nothing: the same 404 as a missing resource.
pub fn path_id(prefix: &str, raw: &str) -> Result<[u8; 16], AppError> {
    id::parse(prefix, raw).ok_or(AppError::NotFound("Resource"))
}

#[derive(Debug, Deserialize)]
pub struct StartRequest {
    pub workout_date: Option<String>,
    pub note: Option<String>,
}

pub async fn start(
    State(state): State<AppState>,
    current: CurrentUser,
    JsonBody(request): JsonBody<StartRequest>,
) -> Result<(StatusCode, Json<SessionDto>), AppError> {
    let session = start_session(
        &state.sessions,
        current.user.id(),
        StartSessionInput {
            workout_date: request.workout_date,
            note: request.note,
        },
    )
    .await?;
    Ok((StatusCode::CREATED, Json(session_dto(&session))))
}

pub async fn show(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(session_id): Path<String>,
) -> Result<Json<SessionDto>, AppError> {
    let id = SessionId::from_bytes(path_id(prefix::SESSION, &session_id)?);
    let session = get_session(&state.sessions, current.user.id(), id).await?;
    Ok(Json(session_dto(&session)))
}

#[derive(Debug, Deserialize)]
pub struct AppendBlockRequest {
    pub exercise_id: Option<String>,
}

pub async fn add_block(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(session_id): Path<String>,
    JsonBody(request): JsonBody<AppendBlockRequest>,
) -> Result<(StatusCode, Json<BlockDto>), AppError> {
    let session = SessionId::from_bytes(path_id(prefix::SESSION, &session_id)?);
    let exercise = match request.exercise_id.as_deref() {
        None => {
            return Err(AppError::Validation(vec![Violation::new(
                FieldPath::new("exercise_id"),
                ViolationCode::Required,
            )]));
        }
        // An ID that does not parse names no exercise.
        Some(raw) => id::parse(prefix::EXERCISE, raw).map(ExerciseId::from_bytes),
    };
    let block = append_block(&state.sessions, current.user.id(), session, exercise).await?;
    Ok((StatusCode::CREATED, Json(block_dto(session, &block))))
}

#[derive(Debug, Deserialize)]
pub struct SetRequest {
    pub reps: Option<i64>,
    pub weight_kg: Option<f64>,
    pub duration_seconds: Option<i64>,
    pub interval_seconds: Option<i64>,
}

pub async fn add_set(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(block_id): Path<String>,
    JsonBody(request): JsonBody<SetRequest>,
) -> Result<(StatusCode, Json<SetDto>), AppError> {
    let block = BlockId::from_bytes(path_id(prefix::BLOCK, &block_id)?);
    let set = append_set(
        &state.sessions,
        current.user.id(),
        block,
        RawSetValues {
            reps: request.reps,
            weight_kg: request.weight_kg,
            duration_seconds: request.duration_seconds,
            interval_seconds: request.interval_seconds,
        },
    )
    .await?;
    Ok((StatusCode::CREATED, Json(set_dto(&set))))
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use axum::body::Body;
    use axum::http::{Request, StatusCode, header};
    use chrono::{DateTime, Utc};
    use http_body_util::BodyExt as _;
    use pretty_assertions::assert_eq;
    use serde_json::{Value, json};
    use tower::ServiceExt as _;

    use crate::domain::exercise::{Exercise, ExerciseId, Measurement, MeasurementKind, Owner};
    use crate::interfaces::http::id::{self, prefix};
    use crate::testing::{Fakes, fakes};

    struct World {
        fakes: Fakes,
        router: Router,
    }

    impl World {
        async fn new() -> Self {
            let fakes = fakes();
            fakes.exercises.add(Exercise::restore(
                ExerciseId::from_bytes([100; 16]),
                Owner::Preset,
                "ベンチプレス".into(),
                vec![
                    Measurement {
                        kind: MeasurementKind::Reps,
                        required: true,
                    },
                    Measurement {
                        kind: MeasurementKind::Weight,
                        required: true,
                    },
                ],
                None,
                DateTime::<Utc>::from_timestamp(0, 0).unwrap(),
            ));
            let router = crate::app(fakes.state());
            Self { fakes, router }
        }

        async fn sign_up(&self, handle: &str) -> String {
            let (_, _, cookie) = self
                .call(
                    "POST",
                    "/web/v1/signup",
                    None,
                    Some(json!({ "user_id": handle, "password": "correcthorsebattery" })),
                )
                .await;
            cookie.unwrap().split(';').next().unwrap().to_owned()
        }

        async fn call(
            &self,
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
            let response = self
                .router
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
            let json = if bytes.is_empty() {
                Value::Null
            } else {
                serde_json::from_slice(&bytes).unwrap()
            };
            (status, json, cookie)
        }
    }

    fn bench() -> String {
        id::format(prefix::EXERCISE, &[100; 16])
    }

    fn pairs(body: &Value) -> Vec<(String, String)> {
        crate::testing::error_pairs(body)
    }

    #[tokio::test]
    async fn records_a_session_with_a_block_and_sets() {
        let world = World::new().await;
        let alice = world.sign_up("alice").await;
        let (status, session, _) = world
            .call(
                "POST",
                "/api/v1/sessions",
                Some(&alice),
                Some(json!({ "workout_date": "2027-01-15", "note": "脚の日" })),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(session["workout_date"], "2027-01-15");
        assert_eq!(session["started_at"], "2027-01-15T08:00:00Z");
        assert_eq!(session["ended_at"], Value::Null);
        assert_eq!(session["blocks"], json!([]));
        let session_id = session["id"].as_str().unwrap().to_owned();

        let (status, block, _) = world
            .call(
                "POST",
                &format!("/api/v1/sessions/{session_id}/blocks"),
                Some(&alice),
                Some(json!({ "exercise_id": bench() })),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(block["order"], 0);
        assert_eq!(block["exercise_name"], "ベンチプレス");
        assert_eq!(block["session_id"], session_id);
        let block_id = block["id"].as_str().unwrap().to_owned();

        for (reps, weight) in [(8, 80.5), (6, -10.0)] {
            let (status, _, _) = world
                .call(
                    "POST",
                    &format!("/api/v1/blocks/{block_id}/sets"),
                    Some(&alice),
                    Some(json!({ "reps": reps, "weight_kg": weight, "interval_seconds": 120 })),
                )
                .await;
            assert_eq!(status, StatusCode::CREATED);
        }

        let (status, whole, _) = world
            .call(
                "GET",
                &format!("/api/v1/sessions/{session_id}"),
                Some(&alice),
                None,
            )
            .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(whole["note"], "脚の日");
        let sets = &whole["blocks"][0]["sets"];
        assert_eq!(sets[0]["order"], 0);
        assert_eq!(sets[0]["weight_kg"], 80.5);
        assert_eq!(sets[1]["order"], 1);
        assert_eq!(sets[1]["weight_kg"], -10.0);
        assert_eq!(sets[1]["duration_seconds"], Value::Null);
    }

    #[tokio::test]
    async fn starting_needs_a_date_that_is_not_in_the_future() {
        let world = World::new().await;
        let alice = world.sign_up("alice").await;
        let (status, body, _) = world
            .call("POST", "/api/v1/sessions", Some(&alice), Some(json!({})))
            .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            pairs(&body),
            [("workout_date".to_owned(), "required".to_owned())]
        );
        let (_, body, _) = world
            .call(
                "POST",
                "/api/v1/sessions",
                Some(&alice),
                Some(json!({ "workout_date": "2027-01-17" })),
            )
            .await;
        assert_eq!(
            pairs(&body),
            [("workout_date".to_owned(), "in_future".to_owned())]
        );
    }

    #[tokio::test]
    async fn another_users_session_and_block_are_not_found() {
        let world = World::new().await;
        let alice = world.sign_up("alice").await;
        let bob = world.sign_up("bobby").await;
        let (_, session, _) = world
            .call(
                "POST",
                "/api/v1/sessions",
                Some(&alice),
                Some(json!({ "workout_date": "2027-01-15" })),
            )
            .await;
        let session_id = session["id"].as_str().unwrap();
        let (_, block, _) = world
            .call(
                "POST",
                &format!("/api/v1/sessions/{session_id}/blocks"),
                Some(&alice),
                Some(json!({ "exercise_id": bench() })),
            )
            .await;
        let block_id = block["id"].as_str().unwrap();
        let attempts = [
            ("GET", format!("/api/v1/sessions/{session_id}"), None),
            (
                "POST",
                format!("/api/v1/sessions/{session_id}/blocks"),
                Some(json!({ "exercise_id": bench() })),
            ),
            (
                "POST",
                format!("/api/v1/blocks/{block_id}/sets"),
                Some(json!({ "reps": 1, "weight_kg": 1.0 })),
            ),
            ("GET", "/api/v1/sessions/not-an-id".to_owned(), None),
        ];
        for (method, uri, body) in attempts {
            let (status, body, _) = world.call(method, &uri, Some(&bob), body).await;
            assert_eq!(status, StatusCode::NOT_FOUND, "{method} {uri}");
            assert_eq!(body["errors"][0]["reasons"][0]["code"], "not_found");
        }
        assert_eq!(world.fakes.records.blocks_of(session_id), 1);
    }

    #[tokio::test]
    async fn a_block_needs_an_exercise_the_user_can_see() {
        let world = World::new().await;
        let alice = world.sign_up("alice").await;
        let (_, session, _) = world
            .call(
                "POST",
                "/api/v1/sessions",
                Some(&alice),
                Some(json!({ "workout_date": "2027-01-15" })),
            )
            .await;
        let uri = format!(
            "/api/v1/sessions/{}/blocks",
            session["id"].as_str().unwrap()
        );
        for exercise in [
            json!({ "exercise_id": "exr_7ZZZZZZZZZZZZZZZZZZZZZZZZZ" }),
            json!({ "exercise_id": "nope" }),
        ] {
            let (status, body, _) = world.call("POST", &uri, Some(&alice), Some(exercise)).await;
            assert_eq!(status, StatusCode::BAD_REQUEST);
            assert_eq!(
                pairs(&body),
                [("exercise_id".to_owned(), "not_found".to_owned())]
            );
        }
        let (_, body, _) = world
            .call("POST", &uri, Some(&alice), Some(json!({})))
            .await;
        assert_eq!(
            pairs(&body),
            [("exercise_id".to_owned(), "required".to_owned())]
        );
    }

    #[tokio::test]
    async fn sets_are_checked_against_the_exercise() {
        let world = World::new().await;
        let alice = world.sign_up("alice").await;
        let (_, session, _) = world
            .call(
                "POST",
                "/api/v1/sessions",
                Some(&alice),
                Some(json!({ "workout_date": "2027-01-15" })),
            )
            .await;
        let (_, block, _) = world
            .call(
                "POST",
                &format!(
                    "/api/v1/sessions/{}/blocks",
                    session["id"].as_str().unwrap()
                ),
                Some(&alice),
                Some(json!({ "exercise_id": bench() })),
            )
            .await;
        let uri = format!("/api/v1/blocks/{}/sets", block["id"].as_str().unwrap());
        let (status, body, _) = world
            .call("POST", &uri, Some(&alice), Some(json!({ "reps": 8 })))
            .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            pairs(&body),
            [(
                "weight_kg".to_owned(),
                "missing_required_measurement".to_owned()
            )]
        );
        let (_, body, _) = world
            .call(
                "POST",
                &uri,
                Some(&alice),
                Some(json!({ "interval_seconds": 60 })),
            )
            .await;
        assert_eq!(pairs(&body), [("set".to_owned(), "empty".to_owned())]);
        for n in 0..50 {
            let (status, _, _) = world
                .call(
                    "POST",
                    &uri,
                    Some(&alice),
                    Some(json!({ "reps": n, "weight_kg": 20.0 })),
                )
                .await;
            assert_eq!(status, StatusCode::CREATED, "set {n}");
        }
        let (status, body, _) = world
            .call(
                "POST",
                &uri,
                Some(&alice),
                Some(json!({ "reps": 1, "weight_kg": 20.0 })),
            )
            .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            pairs(&body),
            [("sets".to_owned(), "exceeds_max_sets".to_owned())]
        );
    }
}
