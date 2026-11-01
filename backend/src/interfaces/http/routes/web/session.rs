//! `POST /web/v1/login`, `GET /web/v1/me`, `POST /web/v1/logout` (US-2).

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::SET_COOKIE;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;

use super::signup::SignedInResponse;
use crate::application::auth::login::{LoginError, login as run_login};
use crate::application::auth::logout::logout as run_logout;
use crate::interfaces::http::error::{AppError, JsonBody};
use crate::interfaces::http::middleware::auth::CurrentUser;
use crate::interfaces::http::session_cookie;
use crate::interfaces::http::state::AppState;

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub user_id: String,
    pub password: String,
}

impl From<LoginError> for AppError {
    fn from(error: LoginError) -> Self {
        match error {
            LoginError::InvalidCredentials => Self::InvalidCredentials,
            LoginError::Internal(error) => Self::Internal(error),
        }
    }
}

pub async fn login(
    State(state): State<AppState>,
    JsonBody(request): JsonBody<LoginRequest>,
) -> Result<Response, AppError> {
    let signed_in = run_login(&state.auth, request.user_id, request.password).await?;
    Ok((
        StatusCode::OK,
        [(SET_COOKIE, session_cookie::set(&signed_in.token))],
        Json(SignedInResponse {
            user_id: signed_in.handle.as_str().to_owned(),
        }),
    )
        .into_response())
}

pub async fn me(current: CurrentUser) -> Json<SignedInResponse> {
    Json(SignedInResponse {
        user_id: current.user.handle().as_str().to_owned(),
    })
}

pub async fn logout(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Response, AppError> {
    run_logout(&state.auth, &current.token).await?;
    Ok((
        StatusCode::NO_CONTENT,
        [(SET_COOKIE, session_cookie::clear())],
    )
        .into_response())
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use axum::body::Body;
    use axum::http::{Request, StatusCode, header};
    use chrono::Duration;
    use http_body_util::BodyExt as _;
    use pretty_assertions::assert_eq;
    use serde_json::{Value, json};
    use tower::ServiceExt as _;

    use crate::application::ports::secrets::SessionToken;
    use crate::domain::user::UserId;
    use crate::testing::{Fakes, fakes, now};

    struct Reply {
        status: StatusCode,
        cookie: Option<String>,
        body: Value,
    }

    fn router(fakes: &Fakes) -> Router {
        crate::app(fakes.state())
    }

    async fn send(
        router: &Router,
        method: &str,
        uri: &str,
        cookie: Option<&str>,
        body: Option<Value>,
    ) -> Reply {
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
        let body = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        };
        Reply {
            status,
            cookie,
            body,
        }
    }

    /// `name=value` part of a Set-Cookie header, ready for a Cookie header.
    fn cookie_pair(set_cookie: &str) -> String {
        set_cookie.split(';').next().unwrap().to_owned()
    }

    async fn sign_up(router: &Router) -> String {
        let reply = send(
            router,
            "POST",
            "/web/v1/signup",
            None,
            Some(json!({ "user_id": "alice", "password": "correcthorsebattery" })),
        )
        .await;
        assert_eq!(reply.status, StatusCode::CREATED);
        cookie_pair(&reply.cookie.unwrap())
    }

    #[tokio::test]
    async fn me_answers_the_signed_in_user() {
        let fakes = fakes();
        let router = router(&fakes);
        let cookie = sign_up(&router).await;
        let reply = send(&router, "GET", "/web/v1/me", Some(&cookie), None).await;
        assert_eq!(reply.status, StatusCode::OK);
        assert_eq!(reply.body, json!({ "user_id": "alice" }));
    }

    #[tokio::test]
    async fn me_without_a_valid_session_is_unauthenticated() {
        let fakes = fakes();
        let router = router(&fakes);
        let unknown = format!(
            "triary_session={}",
            SessionToken::from_bytes([9; 32]).to_hex()
        );
        for cookie in [None, Some("triary_session=garbage"), Some(unknown.as_str())] {
            let reply = send(&router, "GET", "/web/v1/me", cookie, None).await;
            assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "cookie {cookie:?}");
            assert_eq!(
                reply.body,
                json!({ "errors": [ { "reasons": [ { "code": "unauthenticated", "message": "Authentication required" } ] } ] })
            );
        }
    }

    #[tokio::test]
    async fn an_expired_session_is_unauthenticated() {
        let fakes = fakes();
        let router = router(&fakes);
        let token = SessionToken::from_bytes([42; 32]);
        fakes
            .deps
            .sessions
            .create(
                &token,
                UserId::from_bytes([1; 16]),
                now() - Duration::days(31),
                now(),
            )
            .await
            .unwrap();
        let cookie = format!("triary_session={}", token.to_hex());
        let reply = send(&router, "GET", "/web/v1/me", Some(&cookie), None).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn login_opens_a_new_session() {
        let fakes = fakes();
        let router = router(&fakes);
        sign_up(&router).await;
        let reply = send(
            &router,
            "POST",
            "/web/v1/login",
            None,
            Some(json!({ "user_id": "ALICE", "password": "correcthorsebattery" })),
        )
        .await;
        assert_eq!(reply.status, StatusCode::OK);
        assert_eq!(reply.body, json!({ "user_id": "alice" }));
        let cookie = cookie_pair(&reply.cookie.unwrap());
        assert_eq!(fakes.sessions.count(), 2);
        let me = send(&router, "GET", "/web/v1/me", Some(&cookie), None).await;
        assert_eq!(me.status, StatusCode::OK);
    }

    #[tokio::test]
    async fn wrong_password_and_unknown_user_get_the_same_answer() {
        let fakes = fakes();
        let router = router(&fakes);
        sign_up(&router).await;
        let attempts = [
            json!({ "user_id": "alice", "password": "wrongpassword!!" }),
            json!({ "user_id": "nobody", "password": "correcthorsebattery" }),
            json!({ "user_id": "a", "password": "x" }),
        ];
        for attempt in attempts {
            let reply = send(
                &router,
                "POST",
                "/web/v1/login",
                None,
                Some(attempt.clone()),
            )
            .await;
            assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "{attempt}");
            assert_eq!(reply.cookie, None);
            assert_eq!(
                reply.body,
                json!({ "errors": [ { "reasons": [ { "code": "invalid_credentials", "message": "Invalid user ID or password" } ] } ] })
            );
        }
    }

    #[tokio::test]
    async fn logout_ends_the_session_and_clears_the_cookie() {
        let fakes = fakes();
        let router = router(&fakes);
        let cookie = sign_up(&router).await;
        let reply = send(&router, "POST", "/web/v1/logout", Some(&cookie), None).await;
        assert_eq!(reply.status, StatusCode::NO_CONTENT);
        assert_eq!(
            reply.cookie.as_deref(),
            Some("triary_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0")
        );
        assert_eq!(fakes.sessions.count(), 0);
        let me = send(&router, "GET", "/web/v1/me", Some(&cookie), None).await;
        assert_eq!(me.status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn logout_without_a_session_is_unauthenticated() {
        let fakes = fakes();
        let reply = send(&router(&fakes), "POST", "/web/v1/logout", None, None).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    }
}
