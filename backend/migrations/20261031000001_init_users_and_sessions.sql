-- Users and their login sessions. Design: .contexts/data-model.md §3, §4.1,
-- §4.2. IDs are ULIDs stored as BINARY(16); times are UTC DATETIME(3).

-- The bootstrap placeholder has served its purpose (see the init migration).
DROP TABLE IF EXISTS _migration_placeholder;

CREATE TABLE users (
  user_id         BINARY(16)   NOT NULL,
  user_handle     VARCHAR(32)  NOT NULL,  -- lower-cased before saving
  password_hash   VARCHAR(255) NOT NULL,  -- Argon2id PHC string
  created_at      DATETIME(3)  NOT NULL,
  updated_at      DATETIME(3)  NOT NULL,
  PRIMARY KEY (user_id),
  UNIQUE KEY uk_users_handle (user_handle),
  -- REGEXP_LIKE with 'c': a plain REGEXP follows the column's _ci collation
  -- and let 'ABC' through (observed on MySQL 8.0.46, 2026-10-31).
  CONSTRAINT ck_users_handle CHECK (
    CHAR_LENGTH(user_handle) BETWEEN 3 AND 32
    AND REGEXP_LIKE(user_handle, '^[a-z0-9_-]+$', 'c')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_sessions (
  session_token_hash  BINARY(32)   NOT NULL,  -- SHA-256 of the raw token
  user_id             BINARY(16)   NOT NULL,
  created_at          DATETIME(3)  NOT NULL,
  expires_at          DATETIME(3)  NOT NULL,
  last_seen_at        DATETIME(3)  NOT NULL,
  PRIMARY KEY (session_token_hash),
  KEY ix_user_sessions_user_id_expires (user_id, expires_at),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
