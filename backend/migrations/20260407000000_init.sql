-- Initial placeholder migration.
-- 本格的なスキーマはドメインモデルが確定したタイミングで追加する。
-- このファイルはマイグレーションパイプラインと sqlx-cli の動作確認のために置いている。

CREATE TABLE IF NOT EXISTS schema_bootstrap (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    bootstrapped_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
