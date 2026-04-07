//! Interfaces layer.
//!
//! 外部との接点 (HTTP API / CLI 等) を置く。現状は HTTP のみ。
//!
//! # 原則
//! - HTTP DTO は `interfaces::http` に閉じ込め、domain/application の型を
//!   生のままレスポンスに出さない。
//! - エラーは [`http::error::AppError`] に写像し、`IntoResponse` 経由で
//!   HTTP ステータスに変換する。
//! - OpenAPI 定義 (`openapi/openapi.yaml`) が一次情報。ここの handler / DTO は
//!   その契約を満たすように書く。Postman コレクション (`tests/integration/`) で
//!   言語非依存に契約を検証する。

pub mod http;
