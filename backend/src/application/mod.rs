//! Application layer.
//!
//! Holds use cases (a.k.a. application services).
//!
//! # Rules
//! - Depend on repository traits defined in `domain`, never on concrete
//!   infrastructure types.
//! - Default shape: one use case = one function or one struct + `execute`
//!   method.
//! - Inputs and outputs are explicit DTOs received from the `interfaces`
//!   layer.
//! - Transaction boundaries are defined here, not in handlers or repositories.
