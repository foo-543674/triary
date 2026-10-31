//! The `triary_session` cookie (api-design §1.3). Written and read by hand:
//! the attributes are fixed, and a cookie crate would be one more
//! dependency for two string operations.

use axum::http::header::{COOKIE, HeaderMap, HeaderValue};

use crate::application::auth::SESSION_LIFETIME;
use crate::application::ports::secrets::SessionToken;

pub const COOKIE_NAME: &str = "triary_session";

/// `Set-Cookie` value that stores the session in the browser.
pub fn set(token: &SessionToken) -> HeaderValue {
    HeaderValue::from_str(&format!(
        "{COOKIE_NAME}={}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age={}",
        token.to_hex(),
        SESSION_LIFETIME.num_seconds()
    ))
    .expect("hex token and fixed attributes are a valid header value")
}

/// `Set-Cookie` value that removes the session cookie.
pub fn clear() -> HeaderValue {
    HeaderValue::from_static("triary_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0")
}

/// The session token from the request's `Cookie` headers, if any is
/// well-formed.
pub fn read(headers: &HeaderMap) -> Option<SessionToken> {
    headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(name, _)| *name == COOKIE_NAME)
        .and_then(|(_, value)| SessionToken::from_hex(value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn headers(cookies: &[&str]) -> HeaderMap {
        cookies
            .iter()
            .map(|c| (COOKIE, HeaderValue::from_str(c).unwrap()))
            .collect()
    }

    #[test]
    fn set_cookie_has_the_contract_attributes() {
        let value = set(&SessionToken::from_bytes([0xab; 32]));
        assert_eq!(
            value.to_str().unwrap(),
            format!(
                "triary_session={}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000",
                "ab".repeat(32)
            )
        );
    }

    #[test]
    fn reads_the_token_among_other_cookies() {
        let token = SessionToken::from_bytes([7; 32]);
        let found = read(&headers(&[&format!(
            "theme=dark; triary_session={}; x=1",
            token.to_hex()
        )]));
        assert_eq!(found, Some(token));
    }

    #[test]
    fn ignores_missing_or_malformed_cookies() {
        assert_eq!(read(&headers(&[])), None);
        assert_eq!(read(&headers(&["triary_session=nothex"])), None);
        assert_eq!(read(&headers(&["other_triary_session=00"])), None);
    }
}
