//! Domain layer.
//!
//! ビジネスルールの中心。エンティティ・値オブジェクト・ドメインサービス・
//! ドメインイベント・リポジトリ trait を置く。
//!
//! # 原則
//! - ここから `axum` / `sqlx` / `tower` などの infrastructure 依存を一切 import しない。
//! - 純粋な Rust として書き、プロパティベーステストを積極導入する。
//! - `thiserror` で宣言的なエラー型を定義する。
//! - ID は `uuid::Uuid` を基本とし、ラッパー型で型安全に扱う。
//! - 時刻は `chrono::DateTime<chrono::Utc>` を基本とする。
//!
//! サブモジュールは機能単位 (例: `workout`, `exercise`, `user`) で切る。
