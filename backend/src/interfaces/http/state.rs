//! What the HTTP handlers share.

use crate::application::auth::AuthDeps;
use crate::application::exercises::ExerciseDeps;

#[derive(Clone)]
pub struct AppState {
    pub auth: AuthDeps,
    pub exercises: ExerciseDeps,
}
