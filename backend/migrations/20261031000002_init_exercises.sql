-- Exercises (presets have no owner) and the measurements each one records.
-- Design: .contexts/data-model.md §4.3, §4.4.

CREATE TABLE exercises (
  exercise_id             BINARY(16)  NOT NULL,
  owner_user_id           BINARY(16)  NULL,  -- NULL = preset
  name                    VARCHAR(64) NOT NULL,
  name_normalized         VARCHAR(64) GENERATED ALWAYS AS (LOWER(name)) STORED,
  -- Only presets have a value here, so the unique key below applies to
  -- presets alone (NULLs never collide). VIRTUAL, not STORED as sketched in
  -- data-model.md §4.3: MySQL refused fk_exercises_owner (ON DELETE CASCADE)
  -- with error 1215 while this column was STORED, because owner_user_id is
  -- its base column; as VIRTUAL it is accepted (both observed on MySQL 8.0.46,
  -- 2026-10-31). A unique index on a virtual column is still enforced.
  -- Name comparisons use utf8mb4_0900_ai_ci: case-insensitive, and hiragana
  -- and katakana compare equal (observed: 'べンチプレス' collided with
  -- 'ベンチプレス').
  preset_name_normalized  VARCHAR(64)
    GENERATED ALWAYS AS (CASE WHEN owner_user_id IS NULL THEN LOWER(name) END) VIRTUAL,
  parent_exercise_id      BINARY(16)  NULL,  -- progression parent
  created_at              DATETIME(3) NOT NULL,
  updated_at              DATETIME(3) NOT NULL,
  PRIMARY KEY (exercise_id),
  KEY ix_exercises_owner (owner_user_id),
  KEY ix_exercises_parent (parent_exercise_id),
  UNIQUE KEY uk_exercises_user_name (owner_user_id, name_normalized),
  UNIQUE KEY uk_exercises_preset_name (preset_name_normalized),
  CONSTRAINT ck_exercises_name CHECK (CHAR_LENGTH(name) BETWEEN 1 AND 64),
  CONSTRAINT fk_exercises_owner
    FOREIGN KEY (owner_user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_exercises_parent
    FOREIGN KEY (parent_exercise_id) REFERENCES exercises (exercise_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE exercise_measurement_kinds (
  exercise_id   BINARY(16) NOT NULL,
  kind          ENUM('reps', 'weight', 'time') NOT NULL,
  is_required   BOOLEAN    NOT NULL,
  PRIMARY KEY (exercise_id, kind),
  CONSTRAINT fk_emk_exercise
    FOREIGN KEY (exercise_id) REFERENCES exercises (exercise_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
