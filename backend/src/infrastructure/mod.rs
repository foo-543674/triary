//! Infrastructure layer.
//!
//! Holds everything that touches the outside world: persistence, external
//! service calls, system clock, file IO, and so on.
//!
//! # Rules
//! - This is where `sqlx`, HTTP clients, and similar crates live.
//! - Provide concrete implementations of the repository traits declared in
//!   `domain`.
//! - Keep DB schema mapping (e.g. `FromRow`) confined to this layer.
//! - Migrations are SQL based (`backend/migrations/`); ORM model-based
//!   generation is intentionally not used (per CLAUDE.md).
