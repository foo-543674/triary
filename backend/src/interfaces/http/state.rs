//! What the HTTP handlers share.

use crate::application::auth::AuthDeps;
use crate::application::exercises::ExerciseDeps;
use crate::application::history::HistoryDeps;
use crate::application::sessions::SessionDeps;

#[derive(Clone)]
pub struct AppState {
    pub auth: AuthDeps,
    pub exercises: ExerciseDeps,
    pub sessions: SessionDeps,
    pub history: HistoryDeps,
}
