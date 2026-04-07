//! Domain layer.
//!
//! The heart of the business rules. Holds entities, value objects, domain
//! services, domain events, and repository traits.
//!
//! # Rules
//! - Never import infrastructure crates here (`axum`, `sqlx`, `tower`, ...).
//! - Keep this layer pure Rust and lean heavily on property-based tests.
//! - Define error types declaratively with `thiserror`.
//! - Use `uuid::Uuid` (wrapped in newtypes) as the default identifier so IDs
//!   stay type safe across the codebase.
//! - Use `chrono::DateTime<chrono::Utc>` as the default timestamp type.
//!
//! Submodules are split per feature (e.g. `workout`, `exercise`, `user`).
