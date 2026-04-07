# triary プロジェクト固有ガイド

筋トレ記録・スコアリングを行う PWA。個人プロジェクト兼プログラミング学習。

## アーキテクチャ概要

- **Backend**: Rust + Axum + MySQL（`backend/`）
- **Frontend**: TypeScript + SolidJS + Tailwind CSS + CSS Modules、PWA 配信（`frontend/`）
- **DB**: MySQL 8.0。マイグレーションは **SQL ベース**（`sqlx-cli`）。ORM モデルベース生成は使わない
- **API**: スキーマファースト。`openapi/` 配下に OpenAPI 定義を置き、そこからドキュメント・型を派生させる
- **認証**: ユーザー ID は任意文字列（個人情報収集なし）

## 開発フロー

- **TDD で進める**。ただし Rust の型システムで保証できる部分のテストは省略する。プロパティベーステストを積極導入
- **API はスキーマファースト**（OpenAPI 定義先行）
- **統合テストは言語非依存**（Postman / Newman）で書く。バックエンド言語移行時にもテスト資産を維持できるようにするため
- **Frontend の lint / format は Biome に一本化**。ESLint / Prettier は使わない
- **マイグレーションは SQL ベース**。稼働中サービスでモデルと DB スキーマが密結合するのを避ける

## 主要コマンド

| コマンド | 用途 |
|---|---|
| `make help` | 利用可能なコマンド一覧 |
| `make infra-up` | ローカルインフラ（MySQL dev/test）を起動 |
| `make infra-down` | ローカルインフラを停止 |
| `make infra-reset` | データボリュームごとリセットして再起動 |
| `make db-migrate` | 開発 DB にマイグレーション適用 |
| `make db-migrate-test` | テスト DB にマイグレーション適用 |
| `make db-seed` | 開発 DB にシード投入 |
| `cd backend && cargo nextest run` | Rust の単体テスト |
| `cd backend && cargo clippy --all-targets` | Rust の lint |
| `cd backend && cargo fmt --all` | Rust の format |
| `cd frontend && npx biome ci .` | Frontend の lint + format チェック |
| `cd frontend && npx vitest run` | Frontend の単体テスト |
| `cd frontend && npx vite dev` | Frontend 開発サーバー起動 |

## devcontainer とローカルインフラの関係

devcontainer とローカルインフラは **疎結合**。devcontainer は単独で起動し、
`triary-network`（`external: true`）経由で MySQL に接続する。DB が不要な作業では
`make infra-up` を実行しなくてよい。

## 参照すべきドキュメント

- `.contexts/concept.md`: プロジェクトコンセプト・プロダクトの背景
- `.contexts/setup-plan.md`: 環境構築計画書（方針の根拠）
- `docs/api.md`: API 仕様（OpenAPI から生成）
- `openapi/`: OpenAPI スキーマ（API の一次情報）

## 設計判断の原則

- 迷ったら `.contexts/setup-plan.md` の「方針サマリ」に戻る
- 技術選定の変更を検討する場合は、`.contexts/` に判断の背景を追記する
- コミット前に `cargo fmt` / `cargo clippy` / `biome ci` が通ることを確認する
