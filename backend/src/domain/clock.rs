//! The current time, a real-world concept the domain needs (e.g. "today"
//! for workout dates). Implemented in infrastructure; tests pass a fixed
//! clock.

use chrono::{DateTime, Utc};

pub trait Clock: Send + Sync {
    fn now(&self) -> DateTime<Utc>;
}
