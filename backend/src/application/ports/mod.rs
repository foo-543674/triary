//! What the application needs from the outside world to persist and secure
//! things (architecture.md: persistence is the application's concern, so
//! these ports live here; infrastructure implements them).
//!
//! The traits return boxed futures so they can be used as trait objects
//! (`Arc<dyn UserRepository>`) without an extra crate.

pub mod exercise_repository;
pub mod secrets;
pub mod session_repository;
pub mod session_store;
pub mod user_repository;

use std::future::Future;
use std::pin::Pin;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;
