//! HTTP インターフェース。
//!
//! - [`error`][]: ドメインエラー → HTTP レスポンスへの写像
//! - [`routes`][]: ルーティング (機能単位でサブモジュールに分割)

pub mod error;
pub mod routes;
