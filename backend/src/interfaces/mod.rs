//! Interfaces layer.
//!
//! Adapters that face the outside world (HTTP API, CLI, etc.). Currently
//! HTTP only.
//!
//! # Rules
//! - HTTP DTOs live in `interfaces::http` and never expose raw domain or
//!   application types in responses.
//! - Errors are mapped to [`http::error::AppError`], which becomes an HTTP
//!   status code via `IntoResponse`.
//! - The OpenAPI spec at `openapi/openapi.yaml` is the source of truth.
//!   Handlers and DTOs here must satisfy that contract; the language-agnostic
//!   Postman collection under `tests/integration/` enforces the contract from
//!   the outside.

pub mod http;
