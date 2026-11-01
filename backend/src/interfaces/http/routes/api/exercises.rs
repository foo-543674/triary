//! `GET /api/v1/exercises`, `GET /api/v1/exercises/{exercise_id}` (US-4).

use axum::Json;
use axum::extract::{Path, State};
use serde::{Deserialize, Serialize};

use crate::application::exercises::{ExerciseView, ListFilter, get_exercise, list_exercises};
use crate::domain::exercise::{ExerciseId, Measurement, MeasurementKind, Owner};
use crate::interfaces::http::dto::timestamp;
use crate::interfaces::http::error::{AppError, QueryParams};
use crate::interfaces::http::id::{self, prefix};
use crate::interfaces::http::middleware::auth::CurrentUser;
use crate::interfaces::http::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub q: Option<String>,
    #[serde(default)]
    pub owned_only: bool,
}

#[derive(Debug, Serialize)]
pub struct MeasurementDto {
    pub kind: &'static str,
    pub required: bool,
}

#[derive(Debug, Serialize)]
pub struct ExerciseDto {
    pub id: String,
    pub name: String,
    pub owner: &'static str,
    pub measurement_kinds: Vec<MeasurementDto>,
    pub parent_id: Option<String>,
    pub depth: usize,
}

#[derive(Debug, Serialize)]
pub struct ExerciseDetailDto {
    #[serde(flatten)]
    pub exercise: ExerciseDto,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ExerciseListDto {
    pub items: Vec<ExerciseDto>,
}

fn kind_name(kind: MeasurementKind) -> &'static str {
    match kind {
        MeasurementKind::Reps => "reps",
        MeasurementKind::Weight => "weight",
        MeasurementKind::Time => "time",
    }
}

impl From<&Measurement> for MeasurementDto {
    fn from(m: &Measurement) -> Self {
        Self {
            kind: kind_name(m.kind),
            required: m.required,
        }
    }
}

impl From<&ExerciseView> for ExerciseDto {
    fn from(view: &ExerciseView) -> Self {
        let exercise = &view.exercise;
        Self {
            id: id::format(prefix::EXERCISE, exercise.id().as_bytes()),
            name: exercise.name().to_owned(),
            owner: match exercise.owner() {
                Owner::Preset => "preset",
                Owner::User(_) => "user",
            },
            measurement_kinds: exercise
                .measurements()
                .iter()
                .map(MeasurementDto::from)
                .collect(),
            parent_id: exercise
                .parent()
                .map(|parent| id::format(prefix::EXERCISE, parent.as_bytes())),
            depth: view.depth,
        }
    }
}

pub async fn list(
    State(state): State<AppState>,
    current: CurrentUser,
    QueryParams(query): QueryParams<ListQuery>,
) -> Result<Json<ExerciseListDto>, AppError> {
    let filter = ListFilter {
        // Surrounding spaces are not part of a name search; blank means no filter.
        name_contains: query
            .q
            .map(|q| q.trim().to_owned())
            .filter(|q| !q.is_empty()),
        owned_only: query.owned_only,
    };
    let views = list_exercises(&state.exercises, current.user.id(), &filter).await?;
    Ok(Json(ExerciseListDto {
        items: views.iter().map(ExerciseDto::from).collect(),
    }))
}

pub async fn detail(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(exercise_id): Path<String>,
) -> Result<Json<ExerciseDetailDto>, AppError> {
    // A malformed ID names no exercise: the same 404 as a missing one.
    let id = id::parse(prefix::EXERCISE, &exercise_id)
        .map(ExerciseId::from_bytes)
        .ok_or(AppError::NotFound("Exercise"))?;
    let view = get_exercise(&state.exercises, current.user.id(), &id)
        .await?
        .ok_or(AppError::NotFound("Exercise"))?;
    Ok(Json(ExerciseDetailDto {
        created_at: timestamp(view.exercise.created_at()),
        exercise: ExerciseDto::from(&view),
    }))
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
    use crate::domain::user::UserId;
    use crate::interfaces::http::id::{self, prefix};
    use crate::testing::{Fakes, fakes};

    fn exercise(id: u8, owner: Owner, name: &str, parent: Option<u8>) -> Exercise {
        Exercise::restore(
            ExerciseId::from_bytes([id; 16]),
            owner,
            name.to_owned(),
            vec![
                Measurement {
                    kind: MeasurementKind::Reps,
                    required: true,
                },
                Measurement {
                    kind: MeasurementKind::Weight,
                    required: false,
                },
            ],
            parent.map(|p| ExerciseId::from_bytes([p; 16])),
            DateTime::<Utc>::from_timestamp(1_800_000_000, 0).unwrap(),
        )
    }

    fn exr(id: u8) -> String {
        id::format(prefix::EXERCISE, &[id; 16])
    }

    /// Signs up "alice" and returns her cookie and user ID; adds two presets
    /// (one a child of the other), one exercise of alice's under a preset,
    /// and one of another user.
    async fn setup(fakes: &Fakes, router: &Router) -> (String, UserId) {
        let reply = router
            .clone()
            .oneshot(
                Request::post("/web/v1/signup")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        r#"{"user_id":"alice","password":"correcthorsebattery"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let cookie = reply.headers()[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_owned();
        let alice = fakes.users.all()[0].id();
        fakes
            .exercises
            .add(exercise(1, Owner::Preset, "ベンチプレス", None));
        fakes
            .exercises
            .add(exercise(2, Owner::Preset, "パイクプッシュアップ", None));
        fakes
            .exercises
            .add(exercise(3, Owner::Preset, "倒立腕立て", Some(2)));
        fakes
            .exercises
            .add(exercise(4, Owner::User(alice), "壁倒立腕立て", Some(3)));
        fakes.exercises.add(exercise(
            5,
            Owner::User(UserId::from_bytes([200; 16])),
            "他人の種目",
            None,
        ));
        (cookie, alice)
    }

    async fn get(router: &Router, uri: &str, cookie: Option<&str>) -> (StatusCode, Value) {
        let mut request = Request::get(uri);
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        let response = router
            .clone()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap())
    }

    fn names(body: &Value) -> Vec<String> {
        body["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["name"].as_str().unwrap().to_owned())
            .collect()
    }

    #[tokio::test]
    async fn listing_needs_a_session() {
        let fakes = fakes();
        let (status, body) = get(&crate::app(fakes.state()), "/api/v1/exercises", None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["errors"][0]["reasons"][0]["code"], "unauthenticated");
    }

    #[tokio::test]
    async fn lists_presets_and_own_exercises_with_depths() {
        let fakes = fakes();
        let router = crate::app(fakes.state());
        let (cookie, _) = setup(&fakes, &router).await;
        let (status, body) = get(&router, "/api/v1/exercises", Some(&cookie)).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            names(&body),
            [
                "パイクプッシュアップ",
                "ベンチプレス",
                "倒立腕立て",
                "壁倒立腕立て"
            ]
        );
        let own = body["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["id"] == exr(4))
            .unwrap();
        assert_eq!(
            own,
            &json!({
                "id": exr(4),
                "name": "壁倒立腕立て",
                "owner": "user",
                "measurement_kinds": [ { "kind": "reps", "required": true }, { "kind": "weight", "required": false } ],
                "parent_id": exr(3),
                "depth": 2
            })
        );
    }

    #[tokio::test]
    async fn filters_by_name_and_ownership_without_changing_depth() {
        let fakes = fakes();
        let router = crate::app(fakes.state());
        let (cookie, _) = setup(&fakes, &router).await;
        let (_, body) = get(
            &router,
            "/api/v1/exercises?q=%E5%80%92%E7%AB%8B",
            Some(&cookie),
        )
        .await;
        assert_eq!(names(&body), ["倒立腕立て", "壁倒立腕立て"]);
        let (_, body) = get(&router, "/api/v1/exercises?owned_only=true", Some(&cookie)).await;
        assert_eq!(names(&body), ["壁倒立腕立て"]);
        assert_eq!(body["items"][0]["depth"], 2);
    }

    #[tokio::test]
    async fn an_unreadable_query_is_invalid_format_in_the_envelope() {
        let fakes = fakes();
        let router = crate::app(fakes.state());
        let (cookie, _) = setup(&fakes, &router).await;
        let (status, body) = get(&router, "/api/v1/exercises?owned_only=yes", Some(&cookie)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["errors"][0]["reasons"][0]["code"], "invalid_format");
        assert_eq!(body["errors"][0].get("field"), None);
    }

    #[tokio::test]
    async fn the_name_filter_ignores_surrounding_spaces() {
        let fakes = fakes();
        let router = crate::app(fakes.state());
        let (cookie, _) = setup(&fakes, &router).await;
        let (_, body) = get(
            &router,
            "/api/v1/exercises?q=%20%E5%80%92%E7%AB%8B%20",
            Some(&cookie),
        )
        .await;
        assert_eq!(names(&body), ["倒立腕立て", "壁倒立腕立て"]);
        let (_, body) = get(&router, "/api/v1/exercises?q=%20%20", Some(&cookie)).await;
        assert_eq!(names(&body).len(), 4);
    }

    #[tokio::test]
    async fn detail_adds_created_at() {
        let fakes = fakes();
        let router = crate::app(fakes.state());
        let (cookie, _) = setup(&fakes, &router).await;
        let (status, body) = get(
            &router,
            &format!("/api/v1/exercises/{}", exr(1)),
            Some(&cookie),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["name"], "ベンチプレス");
        assert_eq!(body["owner"], "preset");
        assert_eq!(body["depth"], 0);
        assert_eq!(body["created_at"], "2027-01-15T08:00:00Z");
    }

    #[tokio::test]
    async fn someone_elses_missing_or_malformed_ids_are_not_found() {
        let fakes = fakes();
        let router = crate::app(fakes.state());
        let (cookie, _) = setup(&fakes, &router).await;
        for id in [
            exr(5),
            exr(99),
            "exr_nope".to_owned(),
            id::format(prefix::SESSION, &[1; 16]),
        ] {
            let (status, body) =
                get(&router, &format!("/api/v1/exercises/{id}"), Some(&cookie)).await;
            assert_eq!(status, StatusCode::NOT_FOUND, "{id}");
            assert_eq!(body["errors"][0]["reasons"][0]["code"], "not_found");
            assert_eq!(body["errors"][0].get("field"), None);
        }
    }
}
