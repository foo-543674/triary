-- Initial placeholder migration.
--
-- NOTE: This file exists only to exercise the migration pipeline and the
--       sqlx-cli wiring; it has nothing to do with the real domain. Once the
--       first real schema lands, the placeholder table below should be
--       dropped in a follow-up migration. The leading underscore in the table
--       name is meant to signal "not user facing / transient".

CREATE TABLE IF NOT EXISTS _migration_placeholder (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    bootstrapped_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
