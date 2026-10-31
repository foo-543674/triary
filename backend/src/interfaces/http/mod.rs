//! HTTP interface.
//!
//! - [`error`][]: maps domain errors to HTTP responses
//! - [`routes`][]: routing, split into per-feature submodules

pub mod dto;
pub mod error;
pub mod id;
pub mod middleware;
pub mod routes;
pub mod session_cookie;
pub mod state;
