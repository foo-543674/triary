//! `POST /web/v1/signup` (US-1).

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::SET_COOKIE;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};

use crate::application::auth::signup::{SignupError, signup as run_signup};
use crate::domain::user::create::CreateUserInput;
use crate::interfaces::http::error::{AppError, JsonBody};
use crate::interfaces::http::session_cookie;
use crate::interfaces::http::state::AppState;

#[derive(Debug, Deserialize)]
pub struct SignupRequest {
    pub user_id: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct SignedInResponse {
    pub user_id: String,
}

impl From<SignupError> for AppError {
    fn from(error: SignupError) -> Self {
        match error {
            SignupError::Rejected(violations) => Self::Validation(violations),
            SignupError::Internal(error) => Self::Internal(error),
        }
    }
}

pub async fn signup(
    State(state): State<AppState>,
    JsonBody(request): JsonBody<SignupRequest>,
) -> Result<Response, AppError> {
    let signed_in = run_signup(
        &state.auth,
        CreateUserInput {
            user_id: request.user_id,
            password: request.password,
        },
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        [(SET_COOKIE, session_cookie::set(&signed_in.token))],
        Json(SignedInResponse {
            user_id: signed_in.handle.as_str().to_owned(),
        }),
    )
        .into_response())
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode, header};
    use http_body_util::BodyExt as _;
    use pretty_assertions::assert_eq;
    use serde_json::{Value, json};
    use tower::ServiceExt as _;

    use crate::interfaces::http::state::AppState;
    use crate::testing::{Fakes, fakes};

    async fn post(fakes: &Fakes, body: Value) -> (StatusCode, Option<String>, Value) {
        let state = AppState {
            auth: fakes.deps.clone(),
        };
        let response = crate::app(state)
            .oneshot(
                Request::post("/web/v1/signup")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .map(|v| v.to_str().unwrap().to_owned());
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (status, cookie, serde_json::from_slice(&bytes).unwrap())
    }

    fn codes(body: &Value) -> Vec<(String, String)> {
        body["errors"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| {
                (
                    e["field"].as_str().unwrap_or("").to_owned(),
                    e["code"].as_str().unwrap().to_owned(),
                )
            })
            .collect()
    }

    #[tokio::test]
    async fn creates_the_user_and_signs_them_in() {
        let fakes = fakes();
        let (status, cookie, body) = post(
            &fakes,
            json!({ "user_id": "Alice", "password": "correcthorsebattery" }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(body, json!({ "user_id": "alice" }));
        let cookie = cookie.expect("a session cookie");
        assert!(cookie.starts_with("triary_session="));
        assert!(cookie.ends_with("; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000"));
        assert_eq!(fakes.sessions.count(), 1);
        let users = fakes.users.all();
        assert_eq!(users.len(), 1);
        // Never stored in plain text (the fake hasher marks what it hashed).
        assert_eq!(
            users[0].password_hash().as_str(),
            "plain:correcthorsebattery"
        );
    }

    #[tokio::test]
    async fn reports_every_problem_and_creates_nothing() {
        let fakes = fakes();
        let (status, cookie, body) =
            post(&fakes, json!({ "user_id": "a!", "password": "short" })).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(cookie, None);
        assert_eq!(
            codes(&body),
            [
                ("user_id".to_owned(), "too_short".to_owned()),
                ("user_id".to_owned(), "invalid_charset".to_owned()),
                ("password".to_owned(), "too_short".to_owned()),
            ]
        );
        assert!(fakes.users.all().is_empty());
        assert_eq!(fakes.sessions.count(), 0);
    }

    #[tokio::test]
    async fn a_taken_handle_differing_only_in_case_is_rejected() {
        let fakes = fakes();
        post(
            &fakes,
            json!({ "user_id": "alice", "password": "correcthorsebattery" }),
        )
        .await;
        let (status, _, body) = post(
            &fakes,
            json!({ "user_id": "ALICE", "password": "anotherpassword1" }),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            codes(&body),
            [("user_id".to_owned(), "already_taken".to_owned())]
        );
        assert_eq!(fakes.users.all().len(), 1);
    }

    #[tokio::test]
    async fn a_reserved_handle_is_rejected() {
        let (status, _, body) = post(
            &fakes(),
            json!({ "user_id": "admin", "password": "correcthorsebattery" }),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            codes(&body),
            [("user_id".to_owned(), "reserved".to_owned())]
        );
    }

    #[tokio::test]
    async fn a_body_missing_fields_is_invalid_format() {
        let (status, _, body) = post(&fakes(), json!({ "user_id": "alice" })).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["errors"][0]["code"], "invalid_format");
    }
}
