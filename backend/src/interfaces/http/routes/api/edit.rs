//! Correcting a recorded workout (US-7 / US-8, api-design §2.3-§2.5):
//! PATCH / end / DELETE a session, PATCH / DELETE a block or a set.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde::Deserialize;

use super::sessions::{BlockDto, SessionDto, SetDto, block_dto, path_id, session_dto, set_dto};
use crate::application::sessions::edit::{
    SetPatch, delete_block, delete_session, delete_set, end_session, patch_block, patch_session,
    patch_set,
};
use crate::domain::exercise::ExerciseId;
use crate::domain::session::edit::SessionPatch;
use crate::domain::session::{BlockId, SessionId, SetId};
use crate::domain::validation::{FieldPath, Violation, ViolationCode};
use crate::interfaces::http::dto::patch_field;
use crate::interfaces::http::error::{AppError, JsonBody};
use crate::interfaces::http::id::{self, prefix};
use crate::interfaces::http::middleware::auth::CurrentUser;
use crate::interfaces::http::state::AppState;

#[derive(Debug, Deserialize)]
pub struct SessionPatchRequest {
    #[serde(default)]
    pub workout_date: Option<String>,
    #[serde(default, deserialize_with = "patch_field")]
    pub note: Option<Option<String>>,
    #[serde(default, deserialize_with = "patch_field")]
    pub ended_at: Option<Option<String>>,
}

fn parse_time(raw: &str, field: &str) -> Result<DateTime<Utc>, AppError> {
    DateTime::parse_from_rfc3339(raw)
        .map(|t| t.with_timezone(&Utc))
        .map_err(|_| {
            AppError::Validation(vec![Violation::new(
                FieldPath::new(field),
                ViolationCode::InvalidFormat,
            )])
        })
}

pub async fn update_session(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(session_id): Path<String>,
    JsonBody(request): JsonBody<SessionPatchRequest>,
) -> Result<Json<SessionDto>, AppError> {
    let id = SessionId::from_bytes(path_id(prefix::SESSION, &session_id)?);
    let ended_at = match request.ended_at {
        Some(Some(raw)) => Some(Some(parse_time(&raw, "ended_at")?)),
        Some(None) => Some(None),
        None => None,
    };
    let patch = SessionPatch {
        workout_date: request.workout_date,
        note: request.note,
        ended_at,
    };
    let session = patch_session(&state.sessions, current.user.id(), id, patch).await?;
    Ok(Json(session_dto(&session)))
}

pub async fn end(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(session_id): Path<String>,
) -> Result<Json<SessionDto>, AppError> {
    let id = SessionId::from_bytes(path_id(prefix::SESSION, &session_id)?);
    let session = end_session(&state.sessions, current.user.id(), id).await?;
    Ok(Json(session_dto(&session)))
}

pub async fn remove_session(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(session_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let id = SessionId::from_bytes(path_id(prefix::SESSION, &session_id)?);
    delete_session(&state.sessions, current.user.id(), id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct BlockPatchRequest {
    #[serde(default)]
    pub exercise_id: Option<String>,
    #[serde(default)]
    pub order: Option<usize>,
}

pub async fn update_block(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(block_id): Path<String>,
    JsonBody(request): JsonBody<BlockPatchRequest>,
) -> Result<Json<BlockDto>, AppError> {
    let id = BlockId::from_bytes(path_id(prefix::BLOCK, &block_id)?);
    // An ID that does not parse names no exercise (400 not_found on exercise_id).
    let exercise = request
        .exercise_id
        .map(|raw| id::parse(prefix::EXERCISE, &raw).map(ExerciseId::from_bytes));
    let (session, block) = patch_block(
        &state.sessions,
        current.user.id(),
        id,
        exercise,
        request.order,
    )
    .await?;
    Ok(Json(block_dto(session, &block)))
}

pub async fn remove_block(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(block_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let id = BlockId::from_bytes(path_id(prefix::BLOCK, &block_id)?);
    delete_block(&state.sessions, current.user.id(), id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct SetPatchRequest {
    #[serde(default, deserialize_with = "patch_field")]
    pub reps: Option<Option<i64>>,
    #[serde(default, deserialize_with = "patch_field")]
    pub weight_kg: Option<Option<f64>>,
    #[serde(default, deserialize_with = "patch_field")]
    pub duration_seconds: Option<Option<i64>>,
    #[serde(default, deserialize_with = "patch_field")]
    pub interval_seconds: Option<Option<i64>>,
    #[serde(default)]
    pub order: Option<usize>,
}

pub async fn update_set(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(set_id): Path<String>,
    JsonBody(request): JsonBody<SetPatchRequest>,
) -> Result<Json<SetDto>, AppError> {
    let id = SetId::from_bytes(path_id(prefix::SET, &set_id)?);
    let set = patch_set(
        &state.sessions,
        current.user.id(),
        id,
        SetPatch {
            reps: request.reps,
            weight_kg: request.weight_kg,
            duration_seconds: request.duration_seconds,
            interval_seconds: request.interval_seconds,
            order: request.order,
        },
    )
    .await?;
    Ok(Json(set_dto(&set)))
}

pub async fn remove_set(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(set_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let id = SetId::from_bytes(path_id(prefix::SET, &set_id)?);
    delete_set(&state.sessions, current.user.id(), id).await?;
    Ok(StatusCode::NO_CONTENT)
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

    fn exercise(id: u8, name: &str, kinds: &[(MeasurementKind, bool)]) -> Exercise {
        Exercise::restore(
            ExerciseId::from_bytes([id; 16]),
            Owner::Preset,
            name.into(),
            kinds
                .iter()
                .map(|&(kind, required)| Measurement { kind, required })
                .collect(),
            None,
            DateTime::<Utc>::from_timestamp(0, 0).unwrap(),
        )
    }

    fn exr(id: u8) -> String {
        id::format(prefix::EXERCISE, &[id; 16])
    }

    struct Recorded {
        router: Router,
        alice: String,
        session: String,
        blocks: Vec<String>,
        sets: Vec<String>,
    }

    /// alice's session with a bench press block (3 sets) and a pull-up block.
    async fn recorded() -> Recorded {
        use MeasurementKind::{Reps, Time, Weight};
        let fakes = fakes();
        fakes.exercises.add(exercise(
            100,
            "ベンチプレス",
            &[(Reps, true), (Weight, true)],
        ));
        fakes
            .exercises
            .add(exercise(101, "懸垂", &[(Reps, true), (Weight, false)]));
        fakes
            .exercises
            .add(exercise(102, "プランク", &[(Time, true)]));
        let router = crate::app(fakes.state());
        let (_, _, cookie) = call(
            &router,
            "POST",
            "/web/v1/signup",
            None,
            Some(json!({ "user_id": "alice", "password": "correcthorsebattery" })),
        )
        .await;
        let alice = cookie.unwrap().split(';').next().unwrap().to_owned();
        let (_, session, _) = call(
            &router,
            "POST",
            "/api/v1/sessions",
            Some(&alice),
            Some(json!({ "workout_date": "2027-01-15" })),
        )
        .await;
        let session = session["id"].as_str().unwrap().to_owned();
        let mut blocks = Vec::new();
        for exercise in [exr(100), exr(101)] {
            let (_, block, _) = call(
                &router,
                "POST",
                &format!("/api/v1/sessions/{session}/blocks"),
                Some(&alice),
                Some(json!({ "exercise_id": exercise })),
            )
            .await;
            blocks.push(block["id"].as_str().unwrap().to_owned());
        }
        let mut sets = Vec::new();
        for reps in [5, 6, 7] {
            let (_, set, _) = call(
                &router,
                "POST",
                &format!("/api/v1/blocks/{}/sets", blocks[0]),
                Some(&alice),
                Some(json!({ "reps": reps, "weight_kg": 60.0 })),
            )
            .await;
            sets.push(set["id"].as_str().unwrap().to_owned());
        }
        Recorded {
            router,
            alice,
            session,
            blocks,
            sets,
        }
    }

    impl Recorded {
        async fn session(&self) -> Value {
            call(
                &self.router,
                "GET",
                &format!("/api/v1/sessions/{}", self.session),
                Some(&self.alice),
                None,
            )
            .await
            .1
        }
    }

    fn reps(session: &Value) -> Vec<i64> {
        session["blocks"][0]["sets"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["reps"].as_i64().unwrap())
            .collect()
    }

    #[tokio::test]
    async fn edits_reorders_and_deletes_sets() {
        let r = recorded().await;
        let (status, set, _) = call(
            &r.router,
            "PATCH",
            &format!("/api/v1/sets/{}", r.sets[0]),
            Some(&r.alice),
            Some(json!({ "reps": 10, "order": 2 })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            (
                set["reps"].as_i64(),
                set["order"].as_i64(),
                set["weight_kg"].as_f64()
            ),
            (Some(10), Some(2), Some(60.0))
        );
        assert_eq!(reps(&r.session().await), [6, 7, 10]);
        let (status, _, _) = call(
            &r.router,
            "DELETE",
            &format!("/api/v1/sets/{}", r.sets[1]),
            Some(&r.alice),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NO_CONTENT);
        let session = r.session().await;
        assert_eq!(reps(&session), [7, 10]);
        let orders: Vec<i64> = session["blocks"][0]["sets"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["order"].as_i64().unwrap())
            .collect();
        assert_eq!(orders, [0, 1]);
    }

    #[tokio::test]
    async fn an_edited_set_is_checked_like_a_new_one() {
        let r = recorded().await;
        let (status, body, _) = call(
            &r.router,
            "PATCH",
            &format!("/api/v1/sets/{}", r.sets[0]),
            Some(&r.alice),
            Some(json!({ "weight_kg": null, "reps": 10000 })),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let codes = crate::testing::error_pairs(&body);
        assert_eq!(
            codes,
            [
                ("reps", "out_of_range"),
                ("weight_kg", "missing_required_measurement")
            ]
            .map(|(f, c)| (f.to_owned(), c.to_owned()))
        );
        assert_eq!(reps(&r.session().await), [5, 6, 7]);
    }

    #[tokio::test]
    async fn reorders_swaps_and_deletes_blocks() {
        let r = recorded().await;
        let (status, block, _) = call(
            &r.router,
            "PATCH",
            &format!("/api/v1/blocks/{}", r.blocks[1]),
            Some(&r.alice),
            Some(json!({ "order": 0 })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(block["order"], 0);
        // The bench press sets (reps + weight) also fit pull-ups (weight optional).
        let (status, block, _) = call(
            &r.router,
            "PATCH",
            &format!("/api/v1/blocks/{}", r.blocks[0]),
            Some(&r.alice),
            Some(json!({ "exercise_id": exr(101) })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(block["exercise_name"], "懸垂");
        // But not the plank (time only).
        let (status, body, _) = call(
            &r.router,
            "PATCH",
            &format!("/api/v1/blocks/{}", r.blocks[0]),
            Some(&r.alice),
            Some(json!({ "exercise_id": exr(102) })),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            body["errors"][0]["reasons"][0]["code"],
            "incompatible_with_existing_sets"
        );
        let (status, _, _) = call(
            &r.router,
            "DELETE",
            &format!("/api/v1/blocks/{}", r.blocks[1]),
            Some(&r.alice),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NO_CONTENT);
        let session = r.session().await;
        assert_eq!(session["blocks"].as_array().unwrap().len(), 1);
        assert_eq!(session["blocks"][0]["order"], 0);
    }

    #[tokio::test]
    async fn edits_ends_and_deletes_the_session() {
        let r = recorded().await;
        let uri = format!("/api/v1/sessions/{}", r.session);
        let (status, session, _) = call(
            &r.router,
            "PATCH",
            &uri,
            Some(&r.alice),
            Some(json!({ "workout_date": "2027-01-10", "note": "胸" })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            (session["workout_date"].as_str(), session["note"].as_str()),
            (Some("2027-01-10"), Some("胸"))
        );
        let (_, body, _) = call(
            &r.router,
            "PATCH",
            &uri,
            Some(&r.alice),
            Some(json!({ "ended_at": "2027-01-15T07:00:00Z" })),
        )
        .await;
        assert_eq!(body["errors"][0]["reasons"][0]["code"], "before_start");
        let (status, ended, _) = call(
            &r.router,
            "POST",
            &format!("{uri}/end"),
            Some(&r.alice),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(ended["ended_at"], "2027-01-15T08:00:00Z");
        let (_, again, _) = call(
            &r.router,
            "POST",
            &format!("{uri}/end"),
            Some(&r.alice),
            None,
        )
        .await;
        assert_eq!(again["ended_at"], ended["ended_at"]);
        let (_, cleared, _) = call(
            &r.router,
            "PATCH",
            &uri,
            Some(&r.alice),
            Some(json!({ "note": null })),
        )
        .await;
        assert_eq!(cleared["note"], Value::Null);
        assert_eq!(cleared["workout_date"], "2027-01-10");
        let (status, _, _) = call(&r.router, "DELETE", &uri, Some(&r.alice), None).await;
        assert_eq!(status, StatusCode::NO_CONTENT);
        let (status, _, _) = call(&r.router, "GET", &uri, Some(&r.alice), None).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn another_user_cannot_edit_anything() {
        let r = recorded().await;
        let (_, _, cookie) = call(
            &r.router,
            "POST",
            "/web/v1/signup",
            None,
            Some(json!({ "user_id": "bobby", "password": "correcthorsebattery" })),
        )
        .await;
        let bob = cookie.unwrap().split(';').next().unwrap().to_owned();
        let attempts = [
            (
                "PATCH",
                format!("/api/v1/sessions/{}", r.session),
                Some(json!({ "note": "x" })),
            ),
            ("POST", format!("/api/v1/sessions/{}/end", r.session), None),
            ("DELETE", format!("/api/v1/sessions/{}", r.session), None),
            (
                "PATCH",
                format!("/api/v1/blocks/{}", r.blocks[0]),
                Some(json!({ "order": 1 })),
            ),
            ("DELETE", format!("/api/v1/blocks/{}", r.blocks[0]), None),
            (
                "PATCH",
                format!("/api/v1/sets/{}", r.sets[0]),
                Some(json!({ "reps": 1 })),
            ),
            ("DELETE", format!("/api/v1/sets/{}", r.sets[0]), None),
        ];
        for (method, uri, body) in attempts {
            let (status, _, _) = call(&r.router, method, &uri, Some(&bob), body).await;
            assert_eq!(status, StatusCode::NOT_FOUND, "{method} {uri}");
        }
        assert_eq!(reps(&r.session().await), [5, 6, 7]);
    }
}
