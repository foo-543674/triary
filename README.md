# triary

筋トレの記録・スコアリングを行う Web アプリケーション（PWA）。漸進性過負荷の原則に沿って、
回数・重量・セット数からワークアウトをスコアリングし、トレーニングの進捗を可視化する。

個人プロジェクト兼プログラミング学習用リポジトリ。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| Backend | Rust + Axum |
| DB | MySQL 8.0（マイグレーションは SQL ベースの `sqlx-cli`） |
| Frontend | TypeScript + SolidJS + Tailwind CSS + CSS Modules |
| 配信形態 | PWA |
| Lint / Format (Rust) | `rustfmt` + `clippy` |
| Lint / Format (Frontend) | Biome |
| テスト (Backend) | `cargo nextest` + プロパティベーステスト |
| テスト (Frontend) | Vitest + Storybook |
| 統合テスト | Postman / Newman（言語非依存） |
| E2E | Playwright |
| CI | GitHub Actions |

詳しい方針の根拠は `.contexts/setup-plan.md` を参照。

## セットアップ

### 前提

- Docker（Docker Desktop / Rancher Desktop 等）
- VS Code + Dev Containers 拡張

### 手順

```sh
# 1. clone
git clone <this-repo>
cd triary

# 2. 環境変数を用意
cp .env.example .env

# 3. VS Code で開き、"Reopen in Container" を選ぶ
#    devcontainer が Rust / Node / 各種ツールをセットアップする

# 4. ローカルインフラ（MySQL dev + test）を起動
make infra-up

# 5. マイグレーション
make db-migrate

# 6. 以降はそれぞれ開発サーバー起動
cd backend  && cargo run
cd frontend && npx vite dev
```

## 主要コマンド

```sh
make help            # 利用可能なコマンド一覧
make infra-up        # ローカルインフラ起動
make infra-down      # 停止
make infra-reset     # データごとリセット
make db-migrate      # DB マイグレーション
make db-seed         # シード投入
```

backend / frontend の個別コマンドは `CLAUDE.md` の「主要コマンド」を参照。

## ディレクトリ構成

```
.
├── .contexts/          # プロジェクトの背景・設計判断・構築計画
├── .devcontainer/      # devcontainer 設定（Rust + Node + Biome + DooD）
├── .github/workflows/  # CI / E2E パイプライン
├── backend/            # Rust + Axum のバックエンド
│   └── migrations/     # sqlx の SQL マイグレーション
├── frontend/           # SolidJS + Tailwind のフロントエンド
├── openapi/            # OpenAPI スキーマ（API の一次情報）
├── docs/               # 人間向けドキュメント
├── tests/integration/  # Postman コレクション（言語非依存の統合テスト）
├── docker-compose.yml  # ローカルインフラ（MySQL dev/test）
├── Makefile            # 開発タスク集約
└── CLAUDE.md           # Claude Code / AI 向けのプロジェクトガイド
```

## 開発方針

- **TDD**: Red → Green → Refactor。Rust の型で保証できる部分はテストを省略し、プロパティベーステストを積極活用
- **スキーマファースト**: API は OpenAPI 定義を先に書き、そこから実装・ドキュメント・型を派生させる
- **SQL マイグレーション**: ORM モデル生成は使わない。稼働中サービスでモデルと DB スキーマが密結合するのを避けるため
- **言語非依存の統合テスト**: バックエンドを将来的に別言語へ移植しても、テスト資産が維持されるよう Newman で書く
- **devcontainer とインフラの疎結合**: devcontainer は単独で起動し、`triary-network` 経由で必要なときだけインフラに接続する

## ライセンス

個人プロジェクトのため未定。
