//! In-memory stand-ins for the ports, for unit and handler tests. They keep
//! the same observable behavior as the MySQL implementations where tests
//! rely on it (unique handles, session expiry).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};

use crate::application::auth::AuthDeps;
use crate::application::exercises::ExerciseDeps;
use crate::application::ports::BoxFuture;
use crate::application::ports::exercise_repository::ExerciseRepository;
use crate::application::ports::secrets::{IdSource, SecretSource, SessionToken};
use crate::application::ports::session_store::SessionStore;
use crate::application::ports::user_repository::{InsertUserError, UserRepository};
use crate::domain::clock::Clock;
use crate::domain::exercise::{Exercise, ExerciseId};
use crate::domain::password_hasher::{PasswordHasher, PasswordHashingFailed};
use crate::domain::user::{Password, PasswordHash, User, UserHandle, UserId};
use crate::interfaces::http::state::AppState;

#[derive(Default)]
pub struct MemoryUsers(Mutex<Vec<User>>);

impl MemoryUsers {
    pub fn all(&self) -> Vec<User> {
        self.0.lock().unwrap().clone()
    }
}

impl UserRepository for MemoryUsers {
    fn handle_exists<'a>(&'a self, handle: &'a UserHandle) -> BoxFuture<'a, anyhow::Result<bool>> {
        let found = self.0.lock().unwrap().iter().any(|u| u.handle() == handle);
        Box::pin(async move { Ok(found) })
    }

    fn insert<'a>(&'a self, user: &'a User) -> BoxFuture<'a, Result<(), InsertUserError>> {
        let mut users = self.0.lock().unwrap();
        let result = if users.iter().any(|u| u.handle() == user.handle()) {
            Err(InsertUserError::HandleTaken)
        } else {
            users.push(user.clone());
            Ok(())
        };
        Box::pin(async move { result })
    }

    fn find_by_handle<'a>(
        &'a self,
        handle: &'a UserHandle,
    ) -> BoxFuture<'a, anyhow::Result<Option<User>>> {
        let found = self
            .0
            .lock()
            .unwrap()
            .iter()
            .find(|u| u.handle() == handle)
            .cloned();
        Box::pin(async move { Ok(found) })
    }

    fn find_by_id<'a>(&'a self, id: &'a UserId) -> BoxFuture<'a, anyhow::Result<Option<User>>> {
        let found = self
            .0
            .lock()
            .unwrap()
            .iter()
            .find(|u| u.id() == *id)
            .cloned();
        Box::pin(async move { Ok(found) })
    }
}

type SessionRows = HashMap<[u8; 32], (UserId, DateTime<Utc>)>;

#[derive(Default)]
pub struct MemorySessions(Mutex<SessionRows>);

impl MemorySessions {
    pub fn count(&self) -> usize {
        self.0.lock().unwrap().len()
    }
}

impl SessionStore for MemorySessions {
    fn create<'a>(
        &'a self,
        token: &'a SessionToken,
        user: UserId,
        _now: DateTime<Utc>,
        expires_at: DateTime<Utc>,
    ) -> BoxFuture<'a, anyhow::Result<()>> {
        self.0
            .lock()
            .unwrap()
            .insert(*token.as_bytes(), (user, expires_at));
        Box::pin(async { Ok(()) })
    }

    fn touch<'a>(
        &'a self,
        token: &'a SessionToken,
        now: DateTime<Utc>,
    ) -> BoxFuture<'a, anyhow::Result<Option<UserId>>> {
        let found = self
            .0
            .lock()
            .unwrap()
            .get(token.as_bytes())
            .filter(|(_, expires_at)| *expires_at > now)
            .map(|(user, _)| *user);
        Box::pin(async move { Ok(found) })
    }

    fn delete<'a>(&'a self, token: &'a SessionToken) -> BoxFuture<'a, anyhow::Result<()>> {
        self.0.lock().unwrap().remove(token.as_bytes());
        Box::pin(async { Ok(()) })
    }
}

/// "Hashes" by prefixing, so tests stay fast; never use outside tests.
pub struct PlainHasher;

impl PasswordHasher for PlainHasher {
    fn hash(&self, password: &Password) -> Result<PasswordHash, PasswordHashingFailed> {
        Ok(PasswordHash::new(format!("plain:{}", password.expose())))
    }

    fn verify(&self, password: &Password, hash: &PasswordHash) -> bool {
        hash.as_str() == format!("plain:{}", password.expose())
    }
}

pub struct FixedClock(pub DateTime<Utc>);

impl Clock for FixedClock {
    fn now(&self) -> DateTime<Utc> {
        self.0
    }
}

/// Counts up: IDs and tokens are distinct and predictable.
#[derive(Default)]
pub struct Sequence(AtomicU8);

impl IdSource for Sequence {
    fn user_id(&self) -> UserId {
        UserId::from_bytes([self.0.fetch_add(1, Ordering::Relaxed); 16])
    }
}

impl SecretSource for Sequence {
    fn session_token(&self) -> anyhow::Result<SessionToken> {
        Ok(SessionToken::from_bytes(
            [self.0.fetch_add(1, Ordering::Relaxed); 32],
        ))
    }
}

pub fn now() -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(1_800_000_000, 0).expect("valid timestamp")
}

#[derive(Default)]
pub struct MemoryExercises(Mutex<Vec<Exercise>>);

impl MemoryExercises {
    pub fn add(&self, exercise: Exercise) {
        self.0.lock().unwrap().push(exercise);
    }
}

impl ExerciseRepository for MemoryExercises {
    fn list_visible<'a>(&'a self, user: UserId) -> BoxFuture<'a, anyhow::Result<Vec<Exercise>>> {
        let found = self
            .0
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e.is_visible_to(user))
            .cloned()
            .collect();
        Box::pin(async move { Ok(found) })
    }

    fn find_visible<'a>(
        &'a self,
        user: UserId,
        id: &'a ExerciseId,
    ) -> BoxFuture<'a, anyhow::Result<Option<Exercise>>> {
        let found = self
            .0
            .lock()
            .unwrap()
            .iter()
            .find(|e| e.id() == *id && e.is_visible_to(user))
            .cloned();
        Box::pin(async move { Ok(found) })
    }
}

/// Fakes with handles kept so tests can look inside.
pub struct Fakes {
    pub users: Arc<MemoryUsers>,
    pub sessions: Arc<MemorySessions>,
    pub exercises: Arc<MemoryExercises>,
    pub deps: AuthDeps,
}

impl Fakes {
    pub fn state(&self) -> AppState {
        AppState {
            auth: self.deps.clone(),
            exercises: ExerciseDeps {
                exercises: self.exercises.clone(),
            },
        }
    }
}

pub fn fakes() -> Fakes {
    let users = Arc::new(MemoryUsers::default());
    let sessions = Arc::new(MemorySessions::default());
    let sequence = Arc::new(Sequence::default());
    let deps = AuthDeps {
        users: users.clone(),
        sessions: sessions.clone(),
        hasher: Arc::new(PlainHasher),
        clock: Arc::new(FixedClock(now())),
        ids: sequence.clone(),
        secrets: sequence,
    };
    Fakes {
        users,
        sessions,
        exercises: Arc::new(MemoryExercises::default()),
        deps,
    }
}

pub fn state() -> AppState {
    fakes().state()
}
