//! The system clock.

use chrono::{DateTime, Utc};

use crate::domain::clock::Clock;

pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}
