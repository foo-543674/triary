//! Application configuration loaded from environment variables.
//!
//! Reading env vars is a side effect, so we centralise it in explicit
//! constructors like `from_env`. Domain and application layers receive plain
//! value types instead, which keeps tests free of env-var poking
//! (e.g. `CorsConfig::AllowedOrigins(...)` can be passed in directly).

/// CORS allow-list configuration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CorsConfig {
    /// No explicit allowed origins; only same-origin requests are accepted.
    Disabled,
    /// Explicit list of allowed origins.
    AllowedOrigins(Vec<String>),
}

impl CorsConfig {
    /// Reads `CORS_ALLOWED_ORIGINS` (comma separated) from the environment.
    ///
    /// - Unset or empty string: [`CorsConfig::Disabled`].
    /// - One or more values: [`CorsConfig::AllowedOrigins`].
    ///
    /// Production should always specify the frontend URL explicitly.
    /// In dev, set this to e.g. `http://localhost:3000` so the SPA can call
    /// the API directly.
    pub fn from_env() -> Self {
        match std::env::var("CORS_ALLOWED_ORIGINS") {
            Ok(raw) => Self::parse(&raw),
            Err(_) => Self::Disabled,
        }
    }

    fn parse(raw: &str) -> Self {
        let origins: Vec<String> = raw
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToOwned::to_owned)
            .collect();

        if origins.is_empty() {
            Self::Disabled
        } else {
            Self::AllowedOrigins(origins)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn parse_empty_returns_disabled() {
        assert_eq!(CorsConfig::parse(""), CorsConfig::Disabled);
        assert_eq!(CorsConfig::parse("   "), CorsConfig::Disabled);
        assert_eq!(CorsConfig::parse(",, ,"), CorsConfig::Disabled);
    }

    #[test]
    fn parse_single_origin() {
        assert_eq!(
            CorsConfig::parse("http://localhost:3000"),
            CorsConfig::AllowedOrigins(vec!["http://localhost:3000".to_string()])
        );
    }

    #[test]
    fn parse_multiple_origins_trims_whitespace() {
        assert_eq!(
            CorsConfig::parse("http://a.example.com , http://b.example.com"),
            CorsConfig::AllowedOrigins(vec![
                "http://a.example.com".to_string(),
                "http://b.example.com".to_string(),
            ])
        );
    }
}
