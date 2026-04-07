//! 環境変数から取得するアプリ設定。
//!
//! 設定は副作用 (env 読み取り) を伴うため、構築は `from_env` 等の明示的な
//! コンストラクタに集約し、ドメイン層・アプリケーション層からは値型として
//! 受け取る。これによりテストでは `CorsConfig::AllowedOrigins(...)` を直接
//! 渡せて env を汚さずに済む。

/// CORS 許可オリジンの設定。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CorsConfig {
    /// 明示的な許可オリジン無し (同一オリジンからのみアクセス可)。
    Disabled,
    /// 許可するオリジンのリスト。
    AllowedOrigins(Vec<String>),
}

impl CorsConfig {
    /// 環境変数 `CORS_ALLOWED_ORIGINS` (カンマ区切り) から設定を読む。
    ///
    /// - 未設定または空文字列のみ: [`CorsConfig::Disabled`]。
    /// - 1 つ以上の値: [`CorsConfig::AllowedOrigins`]。
    ///
    /// 本番環境ではフロントエンドの URL を明示的に指定する想定。
    /// dev では `http://localhost:3000` を入れるとフロントから直接呼べる。
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
