//! HTTP レイヤーのアプリケーションエラー型。
//!
//! ドメイン層 / アプリケーション層は自身のエラー型を `thiserror` で定義する。
//! ここではそれらをまとめて HTTP レスポンスに写像するための [`AppError`] を提供する。
//! 新しいエラー variant を追加するときは以下を必ずペアで行うこと:
//!
//! 1. `AppError` に variant を追加する。
//! 2. [`AppError::status_code`] で対応する HTTP ステータスを返す。
//! 3. [`AppError::error_code`] でクライアントに返すコードを決める。
//!
//! これによりハンドラは `-> Result<Json<T>, AppError>` を返すだけで、
//! 統一フォーマットのエラーレスポンスになる。

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

/// 全ハンドラ共通のエラー型。
///
/// triary は認証を持たないため `Forbidden` 等の認可関連 variant は意図的に
/// 持たない。将来 認可機構を導入する場合は、その実装と同じコミットで variant を
/// 追加すること (使われない variant を先回りして残さない方針)。
#[derive(Debug, Error)]
pub enum AppError {
    /// リクエストの形式 / バリデーションエラー。
    #[error("bad request: {0}")]
    BadRequest(String),

    /// リソースが見つからない。
    #[error("not found: {0}")]
    NotFound(String),

    /// リソース競合 (楽観ロック失敗など)。
    #[error("conflict: {0}")]
    Conflict(String),

    /// 内部サーバエラー (予期せぬ失敗・下位層の未分類エラーを包む)。
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_code(&self) -> &'static str {
        match self {
            Self::BadRequest(_) => "bad_request",
            Self::NotFound(_) => "not_found",
            Self::Conflict(_) => "conflict",
            Self::Internal(_) => "internal_error",
        }
    }
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    code: &'static str,
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        // Internal エラーは中身の message を外部に出さない方針。
        // (実装詳細や機密情報の漏洩を避けるため。詳細は tracing でサーバ側ログに残す。)
        let (code, message) = match &self {
            Self::Internal(err) => {
                tracing::error!(error = ?err, "internal server error");
                (self.error_code(), "internal server error".to_string())
            }
            _ => (self.error_code(), self.to_string()),
        };

        (self.status_code(), Json(ErrorBody { code, message })).into_response()
    }
}
