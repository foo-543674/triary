-- Workout sessions, their exercise blocks and sets.
-- Design: .contexts/data-model.md §4.5, §4.6, §4.7.

CREATE TABLE sessions (
  session_id     BINARY(16)   NOT NULL,
  user_id        BINARY(16)   NOT NULL,
  workout_date   DATE         NOT NULL,
  started_at     DATETIME(3)  NOT NULL,
  ended_at       DATETIME(3)  NULL,  -- NULL = not ended yet
  note           TEXT         NULL,
  created_at     DATETIME(3)  NOT NULL,
  updated_at     DATETIME(3)  NOT NULL,
  PRIMARY KEY (session_id),
  KEY ix_sessions_user_date (user_id, workout_date DESC, session_id DESC),
  KEY ix_sessions_user_started (user_id, started_at),
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT ck_sessions_end_after_start CHECK (
    ended_at IS NULL OR ended_at >= started_at
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE exercise_blocks (
  block_id        BINARY(16)  NOT NULL,
  session_id      BINARY(16)  NOT NULL,
  exercise_id     BINARY(16)  NOT NULL,
  block_order     SMALLINT    NOT NULL,  -- 0 .. blocks in the session - 1
  workout_date    DATE        NOT NULL,  -- copy of sessions.workout_date (§4.6)
  created_at      DATETIME(3) NOT NULL,
  updated_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (block_id),
  UNIQUE KEY uk_blocks_session_order (session_id, block_order),
  KEY ix_blocks_exercise_date (exercise_id, workout_date DESC, block_id DESC),
  CONSTRAINT fk_blocks_session
    FOREIGN KEY (session_id) REFERENCES sessions (session_id) ON DELETE CASCADE,
  CONSTRAINT fk_blocks_exercise
    FOREIGN KEY (exercise_id) REFERENCES exercises (exercise_id) ON DELETE CASCADE,
  CONSTRAINT ck_blocks_order CHECK (block_order >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE workout_sets (
  set_id              BINARY(16)   NOT NULL,
  block_id            BINARY(16)   NOT NULL,
  set_order           SMALLINT     NOT NULL,  -- 0 .. sets in the block - 1
  reps                SMALLINT     NULL,
  weight_kg           DECIMAL(4,1) NULL,      -- signed: + added load, - assistance
  duration_seconds    INT          NULL,
  interval_seconds    INT          NULL,
  created_at          DATETIME(3)  NOT NULL,
  updated_at          DATETIME(3)  NOT NULL,
  PRIMARY KEY (set_id),
  UNIQUE KEY uk_sets_block_order (block_id, set_order),
  CONSTRAINT fk_sets_block
    FOREIGN KEY (block_id) REFERENCES exercise_blocks (block_id) ON DELETE CASCADE,
  CONSTRAINT ck_sets_reps      CHECK (reps IS NULL OR reps BETWEEN 0 AND 9999),
  CONSTRAINT ck_sets_weight    CHECK (weight_kg IS NULL OR weight_kg BETWEEN -500.0 AND 999.9),
  CONSTRAINT ck_sets_duration  CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400),
  CONSTRAINT ck_sets_interval  CHECK (interval_seconds IS NULL OR interval_seconds BETWEEN 0 AND 3600),
  -- interval alone is not a set (§4.7)
  CONSTRAINT ck_sets_not_empty CHECK (
    reps IS NOT NULL OR weight_kg IS NOT NULL OR duration_seconds IS NOT NULL
  ),
  CONSTRAINT ck_sets_order     CHECK (set_order >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
