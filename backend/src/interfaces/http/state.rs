//! What the HTTP handlers share.

use crate::application::auth::AuthDeps;

#[derive(Clone)]
pub struct AppState {
    pub auth: AuthDeps,
}
