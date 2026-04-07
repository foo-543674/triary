-- Initial placeholder migration.
--
-- このファイルはマイグレーションパイプラインと sqlx-cli の動作確認のために
-- 置いているだけで、ドメインモデルとは無関係。本格的なスキーマがドメイン
-- 確定後に追加されたら、この placeholder テーブルは続くマイグレーションで
-- DROP されるべきもの (テーブル名にアンダースコア prefix を付けて
-- "ユーザ向けではない / 過渡的" であることを名前で示している)。

CREATE TABLE IF NOT EXISTS _migration_placeholder (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    bootstrapped_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
