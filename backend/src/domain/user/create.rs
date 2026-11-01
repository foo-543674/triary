//! Registering a new user (specification US-1), as the typed pipeline of
//! architecture.md "Create フローの 4 役割": input → validator → validated
//! input → factory.

use chrono::{DateTime, Utc};

use super::{Password, PasswordHash, User, UserHandle, UserId};
use crate::domain::validation::{FieldPath, Violation, ViolationCode, both};

/// Sign-up form as received; nothing checked yet.
#[derive(Debug, Clone)]
pub struct CreateUserInput {
    pub user_id: String,
    pub password: String,
}

impl CreateUserInput {
    /// The normalized handle to look up before validating, when the raw value
    /// is a well-formed handle at all. The caller asks storage whether it is
    /// taken and passes the answer to [`CreateUserValidator::validate`].
    pub fn handle_to_check(&self) -> Option<UserHandle> {
        UserHandle::parse(&self.user_id).ok()
    }
}

/// A sign-up that passed every rule; only the validator can build one.
#[derive(Debug)]
pub struct ValidatedCreateUser {
    handle: UserHandle,
    password: Password,
}

impl ValidatedCreateUser {
    /// The password to hash before calling [`UserFactory::create`].
    pub fn password(&self) -> &Password {
        &self.password
    }
}

pub struct CreateUserValidator;

impl CreateUserValidator {
    /// Checks the handle and the password together (every violation is
    /// reported) and refuses a handle that is already taken. The taken
    /// check uses the same code as any other unusable handle, so the reply
    /// does not reveal that the user exists (US-1: "使えません").
    pub fn validate(
        input: CreateUserInput,
        handle_taken: bool,
    ) -> Result<ValidatedCreateUser, Vec<Violation>> {
        let handle = UserHandle::parse(&input.user_id).and_then(|handle| {
            if handle_taken {
                Err(vec![Violation::new(
                    FieldPath::new("user_id"),
                    ViolationCode::AlreadyTaken,
                )])
            } else {
                Ok(handle)
            }
        });
        let password = Password::parse(input.password, "password");
        both(handle, password).map(|(handle, password)| ValidatedCreateUser { handle, password })
    }
}

pub struct UserFactory;

impl UserFactory {
    /// Never fails: everything was checked by the validator. The ID, the
    /// hash of [`ValidatedCreateUser::password`] and the time come from the
    /// caller.
    pub fn create(
        validated: ValidatedCreateUser,
        id: UserId,
        password_hash: PasswordHash,
        now: DateTime<Utc>,
    ) -> User {
        User::restore(id, validated.handle, password_hash, now)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn input(user_id: &str, password: &str) -> CreateUserInput {
        CreateUserInput {
            user_id: user_id.into(),
            password: password.into(),
        }
    }

    fn pairs(violations: Vec<Violation>) -> Vec<(String, ViolationCode)> {
        violations
            .into_iter()
            .map(|v| (v.field.to_string(), v.code))
            .collect()
    }

    #[test]
    fn valid_input_creates_a_user_with_the_normalized_handle() {
        let validated =
            CreateUserValidator::validate(input("Alice", "correcthorsebattery"), false).unwrap();
        assert_eq!(validated.password().expose(), "correcthorsebattery");
        let now = DateTime::<Utc>::from_timestamp(1_800_000_000, 0).unwrap();
        let user = UserFactory::create(
            validated,
            UserId::from_bytes([7; 16]),
            PasswordHash::new("hash".into()),
            now,
        );
        assert_eq!(user.handle().as_str(), "alice");
        assert_eq!(user.id(), UserId::from_bytes([7; 16]));
        assert_eq!(user.created_at(), now);
    }

    #[test]
    fn reports_handle_and_password_problems_together() {
        let violations = CreateUserValidator::validate(input("a!", "short"), false).unwrap_err();
        assert_eq!(
            pairs(violations),
            [
                ("user_id".to_owned(), ViolationCode::TooShort),
                ("user_id".to_owned(), ViolationCode::InvalidCharset),
                ("password".to_owned(), ViolationCode::TooShort),
            ]
        );
    }

    #[test]
    fn a_taken_handle_is_already_taken() {
        let violations =
            CreateUserValidator::validate(input("alice", "correcthorsebattery"), true).unwrap_err();
        assert_eq!(
            pairs(violations),
            [("user_id".to_owned(), ViolationCode::AlreadyTaken)]
        );
    }

    #[test]
    fn handle_to_check_is_the_normalized_handle_or_none() {
        assert_eq!(
            input("Alice", "")
                .handle_to_check()
                .map(|h| h.as_str().to_owned()),
            Some("alice".to_owned())
        );
        assert_eq!(input("a", "").handle_to_check(), None);
    }
}
