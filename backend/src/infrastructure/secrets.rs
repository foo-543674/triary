//! Randomness-backed IDs and secrets.

use crate::application::ports::secrets::{IdSource, SecretSource, SessionToken};
use crate::domain::user::UserId;

/// Session tokens from the operating system's CSPRNG (`getrandom`).
pub struct OsSecrets;

impl SecretSource for OsSecrets {
    fn session_token(&self) -> anyhow::Result<SessionToken> {
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes)
            .map_err(|error| anyhow::anyhow!("no randomness for a session token: {error}"))?;
        Ok(SessionToken::from_bytes(bytes))
    }
}

/// IDs as UUIDv7: a 48-bit millisecond timestamp followed by random bits,
/// so they sort by creation time like the ULIDs of data-model §3 and render
/// as ULID text (`IdString`).
pub struct TimeOrderedIds;

impl IdSource for TimeOrderedIds {
    fn user_id(&self) -> UserId {
        UserId::from_bytes(*uuid::Uuid::now_v7().as_bytes())
    }
}
