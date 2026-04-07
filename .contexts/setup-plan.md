# 環境構築計画: triary（筋トレ記録 PWA）

## リポジトリ現状

構築開始前の現状（2026-04-07 時点）。

**✅ できているもの**
- `.devcontainer/devcontainer.json`（base:ubuntu + rust/node/DooD features、基本的な拡張・設定）
- `.contexts/concept.md`（プロジェクトコンセプト）
- Git リポジトリ初期化済み

**❌ できていないもの**
- `.claude/settings.json` / `CLAUDE.md`
- `.gitattributes`（改行コード統一）
- ローカルインフラ（`docker-compose.yml`、MySQL 等）
- CI パイプライン（`.github/workflows/`）
- backend / frontend 実体コード、OpenAPI スキーマ
- マイグレーション構成（`backend/migrations/`, sqlx-cli 導入）
- `postCreateCommand` による Rust/Frontend ツールチェーンのインストール
- ポートフォワーディング設定
- Storybook
- README、API ドキュメント

**⚠️ 改善が必要なもの**
- `devcontainer.json` に `github-cli` feature が未追加
- `devcontainer.json` の拡張に ESLint + Prettier が入っているが、Frontend の lint/format は Biome に統一する方針のため置換が必要
- `devcontainer.json` にローカルインフラとのネットワーク共有設定（`runArgs` + `initializeCommand`）が未設定 → devcontainer とインフラの疎結合化が未実現
- `postCreateCommand` 未設定のため、開発ツール（cargo-nextest、cargo-watch、sqlx-cli、Biome、Vite 等）が自動インストールされない

## プロジェクト概要

- 目的: 筋トレの記録・スコアリングを行う Web アプリケーション（漸進性過負荷の原則に沿ったスコアリング）
- 性質: 個人プロジェクト（プログラミング学習兼用）
- 技術スタック:
  - Backend: Rust + Axum + MySQL
  - Frontend: TypeScript + SolidJS + Tailwind CSS + CSS Modules
  - 配信形態: PWA
- ユーザーデータの方針: 個人情報は収集しない
- 認証方式: 未決定（実装着手時に選定）
- データ管理: リモート（サーバー側）

## 方針サマリ

- TDD で開発を進める。Rust の型システムで保証できる部分のテストは省略し、プロパティベーステストを積極導入
- API はスキーマファースト（OpenAPI 定義先行）。ドキュメント生成は AI を活用
- **統合テストは言語非依存**（Postman / Newman）で記述し、バックエンド言語移行時にもテスト資産を維持できるようにする
- マイグレーションは **SQL ベース**（`sqlx-cli` の SQL マイグレーション機能）で運用し、ORM モデルベースの生成は使わない（稼働中サービスでモデルと DB スキーマが密結合するのを避ける）
- Frontend の lint / format は **Biome に一本化**（ESLint + Prettier は採用しない）
- CI は GitHub Actions。E2E 以外は PR ごと、E2E は main マージ後
- ローカルインフラは MySQL のみ。devcontainer とは Docker ネットワーク共有で疎結合に接続し、必要なときだけ起動する

## devcontainer

### ベースイメージ

`mcr.microsoft.com/devcontainers/base:ubuntu` をベースに、言語ランタイムは features で追加する。Rust + Node の複数ランタイムが必要なため、汎用 base + features 併用とする（`devcontainers/rust:1` 直接使用より宣言的で拡張しやすい）。

### features

| feature | 目的 |
|---|---|
| `ghcr.io/devcontainers/features/rust:1` | Rust ツールチェーン（rustup、cargo、rustfmt、clippy） |
| `ghcr.io/devcontainers/features/node:1` | Node.js（Frontend 開発・Biome・Vite・Vitest） |
| `ghcr.io/devcontainers/features/docker-outside-of-docker:1` | ローカルインフラ・E2E コンテナをホスト Docker 経由で管理（DinD ではなく DooD） |
| `ghcr.io/devcontainers/features/github-cli:1` | GitHub Actions / PR 操作 |

すべて公式 `ghcr.io/devcontainers/*` 配下で、提供元の信頼性は最優先基準を満たす。

### VS Code 拡張

| 拡張 | 目的 |
|---|---|
| `rust-lang.rust-analyzer` | Rust 言語サポート（公式） |
| `tamasfe.even-better-toml` | `Cargo.toml` 等 TOML サポート |
| `biomejs.biome` | Biome 公式拡張（Frontend lint + format） |
| `bradlc.vscode-tailwindcss` | Tailwind CSS IntelliSense |

必要最小限に絞る。個人の好みの拡張は各開発者が自分で追加する。`tobermory.es6-string-html` / `fill-labs.dependi` は発行元の信頼性と「必要最小限」原則から採用しない。

### settings（主要項目）

- `editor.formatOnSave: true`
- Rust: `rust-analyzer` をデフォルトフォーマッタに、`rust-analyzer.check.command: "clippy"`
- TypeScript / JSON / CSS: Biome をデフォルトフォーマッタに
- 保存時 lint / 保存時 format を有効化

### ツールチェーン（postCreateCommand でインストール）

**Rust 側**:
- `cargo fmt`（rustfmt、features に含まれる）
- `cargo clippy`（features に含まれる）
- `cargo-nextest`: テストランナー（並列実行・見やすい出力）
- `cargo-watch`: ファイル変更監視・自動再実行
- `sqlx-cli`: SQL ベースマイグレーション

**Frontend 側**:
- `Biome`: linter + formatter
- `Vite`: ビルド・開発サーバー
- `Vitest`: テストランナー
- `Storybook`: コンポーネントカタログ兼ドキュメント

### ローカルインフラとの接続（疎結合）

`dockerComposeFile` で DB 等を同梱せず、Docker ネットワーク共有で接続する。

```jsonc
{
  "runArgs": ["--network=triary-network"],
  "initializeCommand": "docker network create triary-network 2>/dev/null || true"
}
```

ローカルインフラ側の `docker-compose.yml` は `triary-network` を `external: true` で参照する。これにより devcontainer の起動時に DB が巻き込まれず、起動が速く、必要なときだけインフラを立ち上げられる。

### ポートフォワーディング

| ポート | 用途 |
|---|---|
| 3000 | Frontend 開発サーバー（Vite） |
| 8080 | Backend API サーバー（Axum） |
| 3306 | MySQL |
| 6006 | Storybook |

### クロスプラットフォーム対応

- `.gitattributes` に `* text=auto eol=lf` を設定し、改行コードを統一
- シェルスクリプトは POSIX 互換で記述
- macOS / Windows（WSL2）両方で動作することを前提にする

## ローカルインフラ

### サービス構成

| サービス | イメージ | ポート | 用途 |
|---|---|---|---|
| MySQL（開発用） | `mysql:8.0` | 3306 | 開発用データストア |
| MySQL（テスト用） | `mysql:8.0` | 3307 | 結合テスト用（tmpfs でデータ永続化なし） |

いずれも `triary-network`（`external: true`）に参加し、devcontainer から接続する。

### テスト用インフラ

- 結合テスト用 MySQL は `tmpfs` マウントでディスク I/O を排除し高速化
- テストごとにデータベースをクリーンアップするスクリプトを用意

### 初期データ・マイグレーション

- マイグレーションツール: `sqlx-cli`（**SQL ベースマイグレーションのみ**使用。モデルベース生成は使わない）
- マイグレーションファイルは `backend/migrations/` に配置
- 開発用シードデータ: マイグレーション後に投入するスクリプトを用意

### 操作コマンド

| コマンド | 用途 |
|---|---|
| `make infra-up` | ローカルインフラ起動 |
| `make infra-down` | ローカルインフラ停止 |
| `make infra-reset` | データリセット（ボリューム削除 + 再起動） |
| `make infra-logs` | ログ表示 |
| `make db-migrate` | マイグレーション実行 |
| `make db-seed` | シードデータ投入 |

## CI パイプライン

### トリガー

| トリガー | 対象ジョブ |
|---|---|
| PR（push / synchronize） | lint、型チェック、単体テスト、統合テスト、ビルド |
| main マージ後（push to main） | E2E テスト |

### ジョブ構成

#### PR ごとのジョブ

| ジョブ | 内容 | 備考 |
|---|---|---|
| `backend-lint` | `cargo fmt --check` + `cargo clippy` | 並列実行可 |
| `frontend-lint` | `biome ci`（lint + format チェック） | 並列実行可 |
| `backend-test` | `cargo nextest run`（単体テスト） | プロパティベーステスト含む |
| `frontend-test` | `vitest run` + Storybook のスモークテスト | |
| `integration-test` | MySQL（tmpfs）起動 → マイグレーション → **Postman/Newman** で API テスト | 言語非依存。バックエンド移行時もテスト資産を維持 |
| `backend-build` | `cargo build --release` | lint 後 |
| `frontend-build` | `vite build` | lint 後 |
| `openapi-validate` | OpenAPI スキーマのバリデーション（`spectral` 等） | |
| `security-scan` | Rust / Node の依存脆弱性スキャン（`cargo audit` / `npm audit` 等） | |

#### main マージ後のジョブ

| ジョブ | 内容 | 備考 |
|---|---|---|
| `e2e-test` | Docker Compose でフルインフラ構築 → Playwright で E2E | ユーザーストーリーベース・最小限。CD 導入時に再調整 |

### 成果物のデプロイ（レビュー体験）

| 成果物 | デプロイ先 | タイミング |
|---|---|---|
| Storybook | GitHub Pages（または Chromatic） | PR ごと |
| API ドキュメント（Swagger UI / Redoc） | GitHub Pages | PR ごと |
| テストレポート | GitHub Actions Artifacts + ブラウザ閲覧可能な形式 | PR ごと |

レビュアーが clone せずともブラウザで成果物を確認できる状態を維持する。

### 実行速度の計測

- GitHub Actions の各ジョブに `time` ステップを追加
- Rust のビルドキャッシュ（`sccache` または `actions/cache`）で高速化
- パイプライン全体の所要時間をトラッキングし、継続的に改善

## ドキュメント

### 人間用

- `README.md`: プロジェクト概要、セットアップ手順、開発フロー、主要コマンド
- `docs/api.md`: API 仕様（OpenAPI から自動生成）

### AI 用

- `.contexts/concept.md`: プロジェクトコンセプト（既存）
- `.contexts/setup-plan.md`: 本計画書
- `.contexts/` 配下に今後、設計判断の背景・意図を蓄積

### ツール化ドキュメント

- `openapi/`: OpenAPI スキーマ定義（YAML）。コード生成・バリデーション・API ドキュメント生成のソースとして活用
- Storybook: コンポーネントカタログ兼 UI ドキュメント

## Claude 設定

### `.claude/settings.json`

- Rust 開発に向けた `rust-analyzer` 連携設定
- 許可コマンド（`cargo`, `sqlx`, `make`, `docker compose` 等）の設定
- プロジェクト固有のフック・MCP 設定（必要に応じて）

### `CLAUDE.md`

プロジェクト固有のコンテキストを記載:
- アーキテクチャ概要（Backend / Frontend / DB の役割）
- 開発フロー（TDD、スキーマファースト、SQL ベースマイグレーション）
- 主要コマンド（`make infra-up`、`cargo nextest run`、`biome ci` 等）
- 参照すべき `.contexts/` のドキュメント一覧

## 構築タスク

以下の順序で構築する。各タスクは対応する setup-* スキルに委譲する。
リポジトリ現状調査で「できている」と判定されたタスクはスキップし、「改善が必要」と判定されたものは該当スキルで更新する。

1. [x] devcontainer の改善 → `setup-devcontainer` スキル
   - `github-cli` feature 追加
   - 拡張を Biome 構成に置換（ESLint/Prettier を外し、`biomejs.biome` を追加）
   - ローカルインフラとの Docker ネットワーク共有設定（`runArgs`, `initializeCommand`）
   - `postCreateCommand` で Rust / Frontend ツールチェーンをインストール
   - `forwardPorts` 追加
   - `.gitattributes` 追加
2. [x] ローカルインフラの構築 → `setup-local-infra` スキル
3. [x] CI パイプラインの構築 → `setup-ci` スキル
4. [x] Claude 設定の構築（`.claude/settings.json`, `CLAUDE.md`）
5. [x] ドキュメントの初期構成（`README.md`, `openapi/`, `docs/`）
6. [~] 動作確認（devcontainer 起動 → インフラ起動 → マイグレーション → テスト実行 → CI 実行）
   - 構文検証は完了（devcontainer.json / settings.json / YAML / Makefile / bash）
   - フル起動検証は devcontainer 再起動後に実施
