//! Error responses of the HTTP layer.
//!
//! Every error response has the same body (`.contexts/api-design.md` §1.6,
//! `ErrorEnvelope` in `openapi/openapi.yaml`):
//!
//! ```json
//! { "errors": [ { "code": "too_long", "field": "name", "message": "..." } ] }
//! ```
//!
//! `errors` always has at least one item. `field` is present only for
//! field-dependent codes. HTTP status is a protocol concern; the kind of
//! domain violation lives in `code`.
//!
//! Handlers return `Result<_, AppError>`; use cases map their own errors into
//! [`AppError`] at this boundary.

use axum::{
    Json,
    extract::{
        FromRequest, FromRequestParts, Query, Request,
        rejection::{JsonRejection, QueryRejection},
    },
    http::StatusCode,
    http::request::Parts,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use serde::de::DeserializeOwned;
use thiserror::Error;

use crate::domain::validation::{Violation, ViolationCode};

/// Every error an HTTP handler can return.
#[derive(Debug, Error)]
pub enum AppError {
    /// One or more domain validation violations (400). Never empty.
    #[error("validation failed: {0:?}")]
    Validation(Vec<Violation>),

    /// The request could not be read at all, e.g. a body that is not the
    /// expected JSON (400, `invalid_format` without `field`). Structural
    /// errors stop at the first one (`api-design.md` §1.6).
    #[error("bad request: {0}")]
    BadRequest(String),

    /// The request was refused at the protocol level before any input was
    /// read: wrong method (405), unsupported content type (415), body too
    /// large (413). Keeps that status; `invalid_format` without `field`.
    #[error("rejected ({status}): {detail}")]
    Rejected { status: StatusCode, detail: String },

    /// No valid session cookie (401).
    #[error("unauthenticated")]
    Unauthenticated,

    /// Wrong user ID or password. Says nothing about which one (401).
    #[error("invalid credentials")]
    InvalidCredentials,

    /// The path target is visible but may not be changed: preset exercises
    /// (403).
    #[error("preset not modifiable")]
    PresetNotModifiable,

    /// The path target does not exist or belongs to someone else (404). The
    /// argument names the resource for the message, e.g. `"Exercise"`.
    #[error("{0} not found")]
    NotFound(&'static str),

    /// Anything unexpected (500). The cause is logged, never returned.
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// Body of every error response.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ErrorEnvelope {
    pub errors: Vec<ErrorItem>,
}

/// One error in [`ErrorEnvelope`].
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ErrorItem {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    pub message: String,
}

impl ErrorItem {
    fn general(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            field: None,
            message: message.into(),
        }
    }
}

impl From<&Violation> for ErrorItem {
    fn from(violation: &Violation) -> Self {
        Self {
            code: violation_code(violation.code),
            field: Some(violation.field.to_string()),
            message: violation_message(violation.code).to_owned(),
        }
    }
}

/// Public spelling of a violation code.
pub fn violation_code(code: ViolationCode) -> &'static str {
    match code {
        ViolationCode::Required => "required",
        ViolationCode::TooShort => "too_short",
        ViolationCode::TooLong => "too_long",
        ViolationCode::InvalidCharset => "invalid_charset",
        ViolationCode::InvalidFormat => "invalid_format",
        ViolationCode::Empty => "empty",
        ViolationCode::OutOfRange => "out_of_range",
        ViolationCode::InFuture => "in_future",
        ViolationCode::BeforeStart => "before_start",
        ViolationCode::Reserved => "reserved",
        ViolationCode::AlreadyTaken => "already_taken",
        ViolationCode::NotFound => "not_found",
        ViolationCode::LockedByExistingRecords => "locked_by_existing_records",
        ViolationCode::IncompatibleWithExistingSets => "incompatible_with_existing_sets",
        ViolationCode::CreatesCycle => "creates_cycle",
        ViolationCode::ExceedsMaxDepth => "exceeds_max_depth",
        ViolationCode::ExceedsMaxChildren => "exceeds_max_children",
        ViolationCode::ExceedsMaxBlocks => "exceeds_max_blocks",
        ViolationCode::MissingRequiredMeasurement => "missing_required_measurement",
    }
}

/// Short English text for debugging. Clients show their own wording based on
/// `(code, field)`.
fn violation_message(code: ViolationCode) -> &'static str {
    match code {
        ViolationCode::Required => "Required",
        ViolationCode::TooShort => "Too short",
        ViolationCode::TooLong => "Too long",
        ViolationCode::InvalidCharset => "Contains characters that are not allowed",
        ViolationCode::InvalidFormat => "Invalid format",
        ViolationCode::Empty => "Must not be empty",
        ViolationCode::OutOfRange => "Out of range",
        ViolationCode::InFuture => "Must not be in the future",
        ViolationCode::BeforeStart => "Must not be before the start",
        ViolationCode::Reserved => "Reserved",
        ViolationCode::AlreadyTaken => "Already in use",
        ViolationCode::NotFound => "Not found",
        ViolationCode::LockedByExistingRecords => "Cannot change because records exist",
        ViolationCode::IncompatibleWithExistingSets => "Incompatible with the existing sets",
        ViolationCode::CreatesCycle => "Would create a cycle",
        ViolationCode::ExceedsMaxDepth => "Exceeds the maximum depth",
        ViolationCode::ExceedsMaxChildren => "Exceeds the maximum number of children",
        ViolationCode::ExceedsMaxBlocks => "Exceeds the maximum number of blocks",
        ViolationCode::MissingRequiredMeasurement => "A required measurement is missing",
    }
}

impl AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            Self::Validation(_) | Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Rejected { status, .. } => *status,
            Self::Unauthenticated | Self::InvalidCredentials => StatusCode::UNAUTHORIZED,
            Self::PresetNotModifiable => StatusCode::FORBIDDEN,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn envelope(&self) -> ErrorEnvelope {
        let errors = match self {
            Self::Validation(violations) if !violations.is_empty() => {
                violations.iter().map(ErrorItem::from).collect()
            }
            // An empty violation list is a bug in the caller; still answer
            // with a well-formed envelope.
            Self::Validation(_) => vec![ErrorItem::general("invalid_format", "Invalid request")],
            Self::BadRequest(detail) | Self::Rejected { detail, .. } => {
                vec![ErrorItem::general("invalid_format", detail.clone())]
            }
            Self::Unauthenticated => {
                vec![ErrorItem::general(
                    "unauthenticated",
                    "Authentication required",
                )]
            }
            Self::InvalidCredentials => vec![ErrorItem::general(
                "invalid_credentials",
                "Invalid user ID or password",
            )],
            Self::PresetNotModifiable => vec![ErrorItem::general(
                "preset_not_modifiable",
                "Preset exercises cannot be modified",
            )],
            Self::NotFound(resource) => {
                vec![ErrorItem::general(
                    "not_found",
                    format!("{resource} not found"),
                )]
            }
            Self::Internal(_) => vec![ErrorItem::general(
                "internal_error",
                "Internal server error",
            )],
        };
        ErrorEnvelope { errors }
    }
}

impl From<Vec<Violation>> for AppError {
    fn from(violations: Vec<Violation>) -> Self {
        Self::Validation(violations)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        // Internal errors can carry implementation details or secrets: log
        // them and answer with a fixed message.
        match &self {
            Self::Internal(err) => tracing::error!(error = ?err, "internal server error"),
            Self::Validation(violations) if violations.is_empty() => {
                tracing::error!("AppError::Validation with no violations (caller bug)");
            }
            _ => {}
        }
        (self.status_code(), Json(self.envelope())).into_response()
    }
}

/// JSON body extractor whose rejections use the error envelope instead of
/// axum's plain-text responses.
#[derive(Debug, Clone, Copy, Default)]
pub struct JsonBody<T>(pub T);

impl<T, S> FromRequest<S> for JsonBody<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        Json::<T>::from_request(req, state)
            .await
            .map(|Json(value)| Self(value))
            .map_err(|rejection: JsonRejection| from_json_rejection(&rejection))
    }
}

/// Query string extractor whose rejections use the error envelope: a value
/// that does not parse (`owned_only=yes`) is 400 `invalid_format` without
/// field, like an unreadable body.
#[derive(Debug, Clone, Copy, Default)]
pub struct QueryParams<T>(pub T);

impl<T, S> FromRequestParts<S> for QueryParams<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        Query::<T>::from_request_parts(parts, state)
            .await
            .map(|Query(value)| Self(value))
            .map_err(|rejection: QueryRejection| AppError::BadRequest(rejection.body_text()))
    }
}

/// 400 / 422 from axum mean the body is not the expected JSON; other
/// statuses (415 missing JSON content type, 413 body too large) are protocol
/// refusals and keep their status.
fn from_json_rejection(rejection: &JsonRejection) -> AppError {
    match rejection.status() {
        StatusCode::BAD_REQUEST | StatusCode::UNPROCESSABLE_ENTITY => {
            AppError::BadRequest(rejection.body_text())
        }
        status => AppError::Rejected {
            status,
            detail: rejection.body_text(),
        },
    }
}

/// Answer for paths no route matches, in the error envelope.
pub async fn route_not_found() -> AppError {
    AppError::NotFound("Route")
}

/// Answer for a path that exists but not with this method (405), in the
/// error envelope. axum otherwise answers 405 with an empty body (observed
/// 2026-10-31 with `POST /health`).
pub async fn method_not_allowed() -> AppError {
    AppError::Rejected {
        status: StatusCode::METHOD_NOT_ALLOWED,
        detail: "Method not allowed".to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::validation::FieldPath;
    use http_body_util::BodyExt as _;
    use pretty_assertions::assert_eq;
    use serde_json::{Value, json};

    async fn render(error: AppError) -> (StatusCode, Value) {
        let response = error.into_response();
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&body).unwrap())
    }

    #[tokio::test]
    async fn validation_errors_become_one_item_each_with_field() {
        let error = AppError::from(vec![
            Violation::new(FieldPath::new("name"), ViolationCode::TooLong),
            Violation::new(FieldPath::new("name"), ViolationCode::InvalidCharset),
            Violation::new(
                FieldPath::new("sets").index(1).child("reps"),
                ViolationCode::OutOfRange,
            ),
        ]);
        let (status, body) = render(error).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let items: Vec<(&str, &str)> = body["errors"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| {
                (
                    item["code"].as_str().unwrap(),
                    item["field"].as_str().unwrap(),
                )
            })
            .collect();
        assert_eq!(
            items,
            [
                ("too_long", "name"),
                ("invalid_charset", "name"),
                ("out_of_range", "sets[1].reps"),
            ]
        );
    }

    #[tokio::test]
    async fn bad_request_uses_the_same_envelope_without_field() {
        let (status, body) = render(AppError::BadRequest("expected an object".into())).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            body,
            json!({ "errors": [ { "code": "invalid_format", "message": "expected an object" } ] })
        );
    }

    #[tokio::test]
    async fn general_errors_map_to_their_status_and_code() {
        let cases = [
            (
                AppError::Unauthenticated,
                StatusCode::UNAUTHORIZED,
                "unauthenticated",
            ),
            (
                AppError::InvalidCredentials,
                StatusCode::UNAUTHORIZED,
                "invalid_credentials",
            ),
            (
                AppError::PresetNotModifiable,
                StatusCode::FORBIDDEN,
                "preset_not_modifiable",
            ),
            (
                AppError::NotFound("Exercise"),
                StatusCode::NOT_FOUND,
                "not_found",
            ),
        ];
        for (error, expected_status, expected_code) in cases {
            let (status, body) = render(error).await;
            assert_eq!(status, expected_status);
            assert_eq!(body["errors"][0]["code"], expected_code);
            assert_eq!(body["errors"][0].get("field"), None);
            assert_eq!(body["errors"].as_array().unwrap().len(), 1);
        }
    }

    #[tokio::test]
    async fn internal_error_hides_its_cause() {
        let (status, body) =
            render(AppError::from(anyhow::anyhow!("db password is hunter2"))).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(
            body,
            json!({ "errors": [ { "code": "internal_error", "message": "Internal server error" } ] })
        );
    }

    #[tokio::test]
    async fn empty_validation_list_still_yields_one_item() {
        let (status, body) = render(AppError::Validation(vec![])).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["errors"].as_array().unwrap().len(), 1);
    }
}

#[cfg(test)]
mod extractor_tests {
    use super::*;
    use axum::{Router, body::Body, http::Request, routing::post};
    use http_body_util::BodyExt as _;
    use pretty_assertions::assert_eq;
    use serde::Deserialize;
    use serde_json::Value;
    use tower::ServiceExt as _;

    #[derive(Deserialize)]
    struct Input {
        #[allow(dead_code)]
        name: String,
    }

    async fn echo(JsonBody(_): JsonBody<Input>) -> StatusCode {
        StatusCode::NO_CONTENT
    }

    async fn call(router: Router, uri: &str, body: &str) -> (StatusCode, Value) {
        let response = router
            .oneshot(
                Request::post(uri)
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let json = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        };
        (status, json)
    }

    #[tokio::test]
    async fn malformed_json_body_is_answered_in_the_envelope() {
        let router = Router::new().route("/echo", post(echo));
        let (status, body) = call(router, "/echo", "{\"name\": 1}").await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["errors"][0]["code"], "invalid_format");
        assert_eq!(body["errors"][0].get("field"), None);
    }

    #[tokio::test]
    async fn well_formed_json_body_reaches_the_handler() {
        let router = Router::new().route("/echo", post(echo));
        let (status, _) = call(router, "/echo", "{\"name\": \"a\"}").await;
        assert_eq!(status, StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn missing_json_content_type_keeps_415_in_the_envelope() {
        let router = Router::new().route("/echo", post(echo));
        let response = router
            .oneshot(Request::post("/echo").body(Body::from("{}")).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["errors"][0]["code"], "invalid_format");
    }

    #[tokio::test]
    async fn wrong_method_keeps_405_in_the_envelope() {
        let (status, body) = call(crate::app(crate::testing::state()), "/health", "{}").await;
        assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED);
        assert_eq!(body["errors"][0]["code"], "invalid_format");
    }

    #[tokio::test]
    async fn unknown_route_is_answered_in_the_envelope() {
        let (status, body) = call(crate::app(crate::testing::state()), "/nowhere", "{}").await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["errors"][0]["code"], "not_found");
    }
}
