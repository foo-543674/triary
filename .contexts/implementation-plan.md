# 実装計画

> **この文書の目的**: triary を MVP まで作り切るための作業を、AI
> エージェントが「計画通りに開発して PR を作れ」と言われたときに迷わず
> 着手できる粒度で並べる。垂直スライス (vertical slice) を最小単位とし、
> 各スライスで触るファイル・API 契約・DB 変更・テスト・受け入れ基準を
> 列挙する。
>
> 設計フェーズの上位文書 (`requirements.md` / `specification.md` /
> `architecture.md` / `api-design.md` / `data-model.md`) で確定済みの内容
> はここでは再掲しない。各スライスから該当文書のセクションを参照する。

## 0. この文書の使い方

### 0.1 想定読者

- 「次の作業をやって PR を出して」と指示された AI エージェント
- 同じ作業を引き継ぐ次の人間／AI

### 0.2 着手手順

1. 「§3 MVP の Definition of Done」を読み、ゴール像を確認する。
2. 「§4 リポジトリ運用フロー」を読み、ブランチ・コミット・PR・CI のルールを確認する。
3. 「§5 共通基盤 (Phase 0)」が未完了の項目があれば必ずそこから着手する。共通基盤がないとスライスが書けない。
4. 「§6 スライス順序表」で次に着手するスライスを 1 つ選ぶ。
5. 「§7 スライス詳細」の該当節を読み、「前提」「スコープ」「成果物」「DoD」を把握する。
6. スライス開始時に対応する仕様書セクション (`specification.md` US-x、`api-design.md` のエンドポイント、`data-model.md` のテーブル) を必ず読み直す。
7. TDD で実装する (`backend` は `cargo nextest`、`frontend` は `vitest`、結合は `tests/integration/triary.postman_collection.json`)。
8. すべての品質ゲート (§8) を通してから PR を作成する。
9. PR 作成後、自動レビュー (`AI Review` workflow と `Copilot` review) のコメントを §9 のプロトコルで処理する。

### 0.3 「迷ったら確認」ライン

- 仕様書 (`specification.md`) と本計画が矛盾するとき → 仕様書が真。本計画を更新する。
- API 設計 (`api-design.md`) と本計画が矛盾するとき → API 設計が真。
- 本計画と OpenAPI スキーマが矛盾するとき → OpenAPI が真 (§4.3 schema-first)。
- 上記以外の曖昧さや、設計判断が必要な分岐に当たったら、**実装を止めてユーザーに確認** (`CLAUDE.md` §AI delegation scope の "Stop and confirm first" を順守)。

---

## 1. 着手時点のリポジトリ状況

設計フェーズは完了しており、`backend/` `frontend/` のスケルトンが立った
段階で、ドメインロジック・API・UI はほぼ未着手。

### 1.1 既に存在するもの

- **共通**: `Makefile` (infra / migrate / test 一式)、`docker-compose.yml` (MySQL dev/test)、`.github/workflows/{ci,ai-review,e2e,chromatic}.yml`、`tests/integration/triary.postman_collection.json` (空コレクション)。
- **backend/**: 4 層モジュール宣言 (`domain` / `application` / `infrastructure` / `interfaces`)。`GET /health` のみ実装済み。`config::CorsConfig` あり。`AppError` (単一 `code/message` envelope の暫定実装) あり。アーキテクチャテスト `backend/tests/architecture.rs` あり。プレースホルダ migration 1 本のみ。
- **frontend/**: SolidJS + `@solidjs/router` + TanStack Solid Query + openapi-fetch 用の薄いハーネス、MSW セットアップ、`/` `/(404)` の placeholder ルート、Storybook 1 本。`schema.gen.ts` は空 (OpenAPI が `/health` だけのため)。

### 1.2 これから作るもの (≒ 本計画の対象)

- 認証 (signup / login / logout / me / change-password)
- 種目 (preset 閲覧 / 自分の種目 CRUD / clone / progression tree)
- セッション (start / detail / patch / end / delete) と内部の Block / Set 操作
- 履歴 (日付別 / 種目別)
- PWA shell (manifest + Service Worker)
- レート制限・構造化ログ・E2E のグリーン化

### 1.3 既存スケルトンの取り扱い

- `interfaces/http/error.rs` の `AppError` は単一 envelope なので、§5.1 のスライスで `errors[]` 配列形式に置き換える。
- `openapi/openapi.yaml` は `/health` のみ。共通 schema (`ErrorEnvelope`, `ErrorItem`, `PageInfo` 等) を §5.2 で先に定義してから各エンドポイントを追加する。
- 既存の `_migration_placeholder` テーブルは §5.3 の最初の本物 migration で `DROP TABLE IF EXISTS _migration_placeholder` してから本テーブルを作る。

---

## 2. 開発原則 (実装視点)

設計時の上位原則は `CLAUDE.md` と `architecture.md` に集約済み。実装時に
頻繁に参照する具体ルールだけ抜粋する。

### 2.1 垂直スライス

- 1 スライス = 「1 つのユーザー価値」または「先行スライスを支える共通基盤」。空のページを描くだけでもスライスとして数える。
- 1 スライスは 1 PR に対応させるのが既定。スライスが大きい場合だけ分割し、各 PR は独立してマージできる粒度に保つ (例: スキーマ追加 → ハンドラ追加 → UI を別 PR に)。

### 2.2 スキーマファースト

- API を増やす／変えるときは、**最初に `openapi/openapi.yaml` を更新**してから実装する。
- フロント型は `make api-generate` で常に `openapi.yaml` から再生成する。手書き禁止。
- backend のリクエスト／レスポンス DTO (`interfaces/http/dto/`) は OpenAPI と一致させる。差分が出た場合は OpenAPI を更新するか DTO を直す (常に OpenAPI が真)。

### 2.3 TDD と網羅基準

- 仕様書のユーザーストーリーに対応する境界値テスト (0/1/N-1/N/N+1) を必ず書く。`specification.md` §境界値表 を起点にする。
- ドメイン純粋ロジック (Validator / 値オブジェクト) は単体テスト + `proptest` (バックエンド) / `fast-check` (フロント) を併用。
- 結合テストは `tests/integration/triary.postman_collection.json` に積み上げる (言語非依存方針: `CLAUDE.md` §development-workflow)。

### 2.4 レイヤーとポート

- `backend/tests/architecture.rs` でレイヤー違反を検出する。新しい依存を足したら必ずアーキテクチャテストを追加する。
- 詳細は `architecture.md` §レイヤー定義 / §ポート配置 を参照。本計画では各スライスで「どのレイヤーに何を置くか」だけ列挙する。

### 2.5 エラー envelope

- 常に `{"errors": [{"code": ..., "field": ..., "message": ...}]}` 形式で返す。単一エラーでも配列。
- `code` にフィールド名を埋めない (`name_too_long` ではなく `too_long` + `field: "name"`)。
- 1 フィールド × 複数違反は複数要素に展開する (`api-design.md` §1.6)。

### 2.6 認可と存在露呈防止

- 他ユーザーのリソースは **403 ではなく 404** を返す (`api-design.md` §HTTP ステータス方針)。
- すべての protected endpoint で「リソースの所有者がリクエストユーザーか」を最初に検査する。

### 2.7 タイムゾーン

- サーバーは `DATETIME(3)` UTC 保存。タイムゾーン情報は持たない。
- フロントが `workout_date` (DATE) をブラウザローカル日付で組み立てる。
- 表示時刻はフロントで `Intl.DateTimeFormat` で変換する。

---

## 3. MVP の Definition of Done

以下が同時に成立した時点で MVP 完了とする。

- [ ] US-1 〜 US-10 の受け入れ基準すべてに対応する Postman 結合テストが green (CI で実行)。
- [ ] `make infra-up` → `make db-migrate` → `cd backend && cargo run` → `cd frontend && pnpm dev` の手順で、新規ユーザー登録〜セッション記録〜履歴閲覧まで通せる。
- [ ] `cargo nextest run` / `cargo clippy --all-targets -- -D warnings` / `cargo fmt --all -- --check` がすべて pass。
- [ ] `pnpm run lint:ci` / `pnpm run typecheck` / `pnpm run test:run` / `pnpm run arch:test` / `pnpm run build` がすべて pass。
- [ ] `make arch-test` が両方 pass (アーキテクチャテスト)。
- [ ] PWA として manifest が読まれ、Service Worker がアセットをキャッシュする (オフライン時はスタブ画面)。
- [ ] レート制限 (login: 同一 IP / 1 分 10 回, signup: 同一 IP / 1 時間 5 アカウント) が 429 を返す結合テストあり。
- [ ] README または `docs/` に「ローカル開発で MVP を一通り触る手順」がある。

各境界・上限値は `specification.md` §主要な前提 / §境界値テーブル の値を
唯一の真とする。本計画はそれを引用するだけ。

---

## 4. リポジトリ運用フロー

### 4.1 ブランチ命名

- `feat/<slice-id>-<short-name>` — 機能スライス (例: `feat/s05-exercises-list`)
- `fix/<short-name>` — バグ修正
- `chore/<short-name>` — 依存・環境
- `docs/<short-name>` — ドキュメントのみ
- `refactor/<short-name>` — 振る舞い変更なし

### 4.2 コミット粒度

- 「目的単位」(レビューラウンドや日付ではなく)。`CLAUDE.md` §commit-convention のプレフィックス (`[feat]` `[fix]` `[update]` `[improve]` `[refactor]` `[chore]` `[docs]` `[test]` `[style]`) を必ず付ける。
- 1 コミット = 1 ビルド可能状態。`cargo fmt && cargo clippy && cargo nextest && biome ci . && tsc --noEmit` を通してからコミット。

### 4.3 スキーマ変更の順番 (schema-first 強制)

1. `openapi/openapi.yaml` を更新する。
2. `make api-generate` で `frontend/src/api/schema.gen.ts` を再生成する。
3. backend の DTO (`interfaces/http/dto/`) を OpenAPI に揃える。
4. backend の Axum ルートを足す／変える。
5. frontend の features を足す／変える。
6. 結合テスト (Postman) を追加する。

### 4.4 DB マイグレーション

- ファイル名: `YYYYMMDDHHMMSS_<snake_case_purpose>.sql` (現状の `20260407000000_init.sql` 形式と sqlx-cli の既定 `<timestamp>_<description>.sql` を踏襲し、シングルアンダースコアで区切る)。
- ファイル単位でロールバック不可なので、1 マイグレーション = 1 目的に絞る (例: 「users と user_sessions を作る」「exercises 群を作る」「sessions 集約を作る」「preset シードを入れる」)。
- マイグレーション追加時は `cd backend && cargo sqlx migrate run` の後に `make db-prepare` で sqlx offline metadata を更新する。

### 4.5 PR 作成

- タイトル: `[<prefix>] <slice id> <短い概要>` (例: `[feat] S05 list and detail exercises`)。
- 本文テンプレ:
  ```markdown
  ## Summary
  - <変更点 1>
  - <変更点 2>

  ## User stories / slice
  - <該当するスライス番号と US 番号>

  ## Test plan
  - [ ] cargo nextest run
  - [ ] pnpm run lint:ci && pnpm run typecheck && pnpm run test:run
  - [ ] make arch-test
  - [ ] tests/integration/triary.postman_collection.json (Newman でローカル実行)
  - [ ] 手動で <UI フロー> を確認

  ## Notes
  <既知の制限 / フォローアップ>
  ```
- AI が PR を作る場合は CLAUDE.md の "Creating pull requests" 手順に従う。

### 4.6 自動レビュー

`.github/workflows/ai-review.yml` で `foo-skills` の code-reviewer agent
が自動レビューする。Copilot Coding Agent push の場合は
`trigger-copilot-review` ジョブが workflow_dispatch で再発火する仕組みが
すでに入っているため、AI 実装側からは特別な操作は不要。レビュー結果の
取り扱いは §9。

---

## 5. 共通基盤 (Phase 0)

スライスを書き始める前に必要な土台。**ここを終わらせるまで Phase 1 以降に
着手しない**。

### 5.1 P0-A: エラーレスポンス envelope の正規化

**目的**: 既存 `AppError` の単一 `code/message` 形式を `errors[]` 配列形式
に置き換え、全スライスがこの基盤に乗れる状態にする。

**変更点**:

- `backend/src/interfaces/http/error.rs`:
  - `ErrorBody` を `ErrorEnvelope { errors: Vec<ErrorItem> }` に変更。
  - `ErrorItem { code: &'static str, field: Option<String>, message: String }`。
  - `AppError` の variant を「単一エラー」「複数エラー (`Vec<DomainError>` 由来)」両対応に。`From<DomainError>` と `From<Vec<DomainError>>` を実装。
- `backend/src/interfaces/http/mod.rs` (新規):
  - `pub mod error;` `pub mod dto;` `pub mod routes;` を整理。
- `backend/src/domain/error.rs` (新規):
  - `DomainError` enum を定義 (variant は §7 の各スライスで増える前提だが、初版は `Required { field }`、`TooShort { field, min }`、`TooLong { field, max }`、`InvalidCharset { field }`、`InvalidFormat { field }`、`OutOfRange { field, min, max }` あたりを置く)。
  - `code() -> &'static str`、`field() -> Option<String>`、`message() -> String` を実装。
- `backend/src/application/error.rs` (新規):
  - `UseCaseError` enum を定義。`Domain(Vec<DomainError>)`、`Unauthorized`、`Forbidden`、`NotFound`、`Internal(anyhow::Error)` 等。
  - `From<UseCaseError> for AppError` を実装。
- `backend/src/interfaces/http/dto/error.rs` (新規):
  - JSON シリアライズ用の wire 型。

**OpenAPI**:

- `components.schemas.ErrorItem` と `ErrorEnvelope` を追加。
- 既存 `/health` 以外のすべての `responses` で `4xx` / `5xx` は `application/json` に `$ref: '#/components/schemas/ErrorEnvelope'` を返す。

**テスト**:

- `tests/architecture.rs` にレイヤー違反検出テストを追加 (`domain` が `axum` を import していないこと等は既にあるはず。`DomainError` が `axum` を import していないことも確認)。
- `interfaces/http/error.rs` の単体テストを `errors[]` ベースに書き換え。

**DoD**:

- [ ] `GET /health` 以外の任意のハンドラが `Vec<DomainError>` を返したときに、HTTP レスポンスが `{"errors": [{...},{...}]}` で返ることを単体テストで確認。
- [ ] `AppError::BadRequest("..")` を返した場合も同じ envelope に乗ることを確認。

---

### 5.2 P0-B: OpenAPI 共通 schema 定義

**目的**: 各スライスで使い回す共通 schema を先に置く。

**追加 schema** (`openapi/openapi.yaml` の `components.schemas`):

| 名前 | 形 | 用途 |
|---|---|---|
| `ErrorItem` | `{code: string, field: string?, message: string}` | エラー要素 |
| `ErrorEnvelope` | `{errors: ErrorItem[]}` | 全エラーレスポンス |
| `PageInfo` | `{next_cursor: string?, has_next: boolean}` | カーソルページング共通 |
| `IdString` | `string`、`pattern: ^[a-z]{3}_[0-9A-HJKMNP-TV-Z]{26}$` | ULID プレフィックス付き ID |
| `WorkoutDate` | `string`、`format: date` | `YYYY-MM-DD` |
| `Timestamp` | `string`、`format: date-time` | RFC 3339 UTC |

**OpenAPI 構造**:

- 巨大 1 ファイルでよい (`openapi/openapi.yaml`) — 分割は MVP 後に検討する。
- `tags` を `health / auth / exercises / sessions / blocks / sets / history` で揃える。
- `securitySchemes.cookieAuth = {type: apiKey, in: cookie, name: triary_session}` を追加し、`/api/v1/*` と保護される `/web/v1/*` には `security: [{cookieAuth: []}]` を付ける。

**DoD**:

- [ ] `make api-generate` が成功し、`frontend/src/api/schema.gen.ts` に `ErrorEnvelope` 等の型が含まれている。
- [ ] `npx @redocly/cli lint openapi/openapi.yaml` が pass (CI でも実行する場合は ci.yml に足す)。

---

### 5.3 P0-C: DB スキーマ初版

**目的**: `data-model.md` の DDL を実 migration に落とし込む。プレース
ホルダを置き換える。

**マイグレーションファイル** (順序固定、§4.4 のシングルアンダースコア規則に従う):

1. `20260501000001_drop_placeholder.sql`
   - `DROP TABLE IF EXISTS _migration_placeholder;`
2. `20260501000002_init_users_and_sessions.sql`
   - `users` (`user_id BINARY(16) PK`, `user_handle VARCHAR(32) UK`, `password_hash VARCHAR(255)`, `created_at`, `updated_at`)
   - `user_sessions` (`session_token_hash BINARY(32) PK`, `user_id FK`, `created_at`, `expires_at`, `last_seen_at`)
3. `20260501000003_init_exercises.sql`
   - `exercises` (本計画 §1 / `data-model.md` §exercises 参照)
   - `exercise_measurement_kinds`
4. `20260501000004_init_session_records.sql`
   - `sessions` / `exercise_blocks` / `workout_sets`
5. `20260501000005_seed_preset_exercises.sql`
   - 初版プリセット種目 (§5.4 で定義)

**`data-model.md` の DDL を 1 文字単位で踏襲**する。違いを入れる場合は
事前に `data-model.md` を更新する。

**DoD**:

- [ ] `make infra-reset && make db-migrate` が冪等に通る。
- [ ] `make db-migrate-test` も通り、`cd backend && cargo sqlx prepare -- --tests` が成功する。
- [ ] `cd backend && cargo nextest run` が pass (まだクエリは書かないが、コンパイル可能な状態を維持)。

---

### 5.4 P0-D: プリセット種目 初版リスト

**目的**: US-4 で「サインアップ直後から定番種目を参照できる」を満たす
ためのデータを確定する。

**初版 (案、PR レビューで微調整可)**:

- ベンチプレス (reps 必須, weight 必須)
- バックスクワット (reps 必須, weight 必須)
- デッドリフト (reps 必須, weight 必須)
- オーバーヘッドプレス (reps 必須, weight 必須)
- 懸垂 (reps 必須, weight 任意)
- ディップス (reps 必須, weight 任意)
- プッシュアップ (reps 必須, weight 任意)
- パイクプッシュアップ (reps 必須)
- 倒立腕立て (HSPU) (reps 必須) — parent: パイクプッシュアップ
- ピストルスクワット (reps 必須) — parent: バックスクワット
- フロントレバー (time 必須) — 静止系
- バックレバー (time 必須) — 静止系
- プランク (time 必須)
- ランニング (time 必須)
- バーピー (reps 必須)

**実装ルール**:

- ULID は固定値 (Crockford base32 26 文字) を SQL に直接埋め込む。シードを再実行しても同じ ID が再現されるよう、生成時刻に依存しないハードコード値を使う (時刻プレフィックスは年代依存で揺れるため期待しない)。`exr_` API プレフィックスは付けない (DB は raw)。
- `exercise_measurement_kinds` は `(exercise_id, kind, is_required)` を `INSERT ... SELECT` で展開する。

**DoD**:

- [ ] `make infra-reset && make db-migrate` 後、`SELECT name FROM exercises WHERE owner_user_id IS NULL` で 15 行返る。
- [ ] パイクプッシュアップの子に倒立腕立てが入っていることを SQL で確認できる。

---

### 5.5 P0-E: フロント共通基盤

**目的**: features を増やす前に、共通の infra/state の置き場を作る。

**追加ファイル**:

- `frontend/src/lib/infra/clock.ts` — `Clock` インターフェース + `BrowserClock` 実装 + テスト用 `FakeClock`。
- `frontend/src/lib/infra/local-storage.ts` — `KeyValueStore` 抽象 + `BrowserLocalStorage` + `MemoryStore` (テスト用)。
- `frontend/src/lib/infra/context.tsx` — `<InfraProvider>` で配信、`useInfra()` を提供。
- `frontend/src/lib/dates.ts` — `toLocalWorkoutDate(date: Date): string` (YYYY-MM-DD ローカル)、`formatTimestamp(ts: string, locale)`。
- `frontend/src/lib/i18n.ts` — エラーコード → 日本語メッセージのマップ (UI 表示用)。

**API クライアント整備**:

- `frontend/src/api/client.ts` の `apiClient` に `credentials: 'include'` を渡す (Cookie 必須)。
- `frontend/src/lib/api-error.ts` を追加 — `ErrorEnvelope` を `Result<T, ApiError>` に変換するユーティリティ。`api/` は architecture.md §ディレクトリ構造で「OpenAPI 生成型 + 薄い fetch クライアント」のみと定められているため、変換ロジックは `lib/` に置く。

**ルーティング**:

- `frontend/src/routes/` 配下を `auth/` `exercises/` `sessions/` `history/` で分け、`App.tsx` に lazy import する。
- 認証必要ルートは `<RequireAuth>` でラップ。`/me` を呼び 401 なら `/login` に遷移する。

**DoD**:

- [ ] `pnpm run typecheck` `pnpm run lint:ci` `pnpm run test:run` が pass。
- [ ] `<RequireAuth>` は Container 相当 (薄いグルー) のため単体テストを書かない (`architecture.md` §テスタビリティ戦略)。動作は S02 完了後に Postman で「未認証で保護ルートに 401 が返る」「Cookie 付きで 200 が返る」を確認することで担保する。

---

## 6. スライス順序表

依存関係は「上に書かれたスライス」が「下に書かれたスライス」の前提に
なる。並列実装する場合でも、マージ順は表の通りにする。

| ID | 名称 | US | 主目的 | 前提 |
|---|---|---|---|---|
| **P0** | 共通基盤 | — | error envelope / OpenAPI 共通 / DB / preset / front infra | — |
| **S01** | サインアップ | US-1 | 新規ユーザー登録、自動ログイン | P0 |
| **S02** | ログイン + me | US-2 | Cookie 認証の確立 | S01 |
| **S03** | ログアウト | US-2 | セッション破棄 | S02 |
| **S04** | パスワード変更 | US-3 | 認証ユーザーの更新 | S02 |
| **S05** | 種目一覧 + 詳細 | US-4 | preset + 自分の種目を読む | S02 |
| **S06** | ユーザー種目作成 | US-5 | 自分の種目を増やす | S05 |
| **S07** | ユーザー種目編集 | US-5 | 自分の種目を直す (records 連動制約付き) | S06 |
| **S08** | ユーザー種目削除 | US-5 | カスケード削除 | S06 |
| **S09** | プリセット種目クローン | US-4 | preset → ユーザー種目化 | S06 |
| **S10** | 親付け替え (parent_id) | US-6 | プログレッション編集 | S07 |
| **S11** | サブツリー取得 | US-6 | `GET /exercises/{id}/tree` | S10 |
| **S12** | セッション開始 | US-7 | `POST /sessions` | S05 |
| **S13** | セッション詳細取得 | US-7 / US-8 | `GET /sessions/{id}` (フル集約) | S12 |
| **S14** | ブロック追加 | US-7 | `POST /sessions/{id}/blocks` | S13 |
| **S15** | セット追加 | US-7 | `POST /blocks/{id}/sets` | S14 |
| **S16** | セット編集・削除 | US-8 | `PATCH/DELETE /sets/{id}` | S15 |
| **S17** | ブロック編集・削除・並び替え | US-8 | `PATCH/DELETE /blocks/{id}` | S15 |
| **S18** | セッション編集・終了・削除 | US-7 / US-8 | `PATCH/POST end/DELETE /sessions/{id}` | S13 |
| **S19** | 履歴 (日付別) | US-9 | `GET /history/sessions` カーソルページング | S18 |
| **S20** | 履歴 (種目別 + ツリー集約) | US-10 | `GET /history/exercises/{id}` | S19, S11 |
| **S21** | PWA shell | NF | manifest + Service Worker | S05〜S20 (画面が出揃っていること) |
| **S22** | レート制限 | NF | login / signup の 429 | S01, S02 |
| **S23** | 構造化ログ整備 | NF | tracing で構造化、PII 出さない | S22 |
| **S24** | E2E グリーン化 | NF | Postman / Newman を CI で回す | S21 |
| **S25** | UI 仕上げ + アクセシビリティ | NF | a11y, error UX, empty state | S21 |

**並列化の指針**: S01〜S04 (auth) と S05〜S11 (exercises) は途中から並列化
可能 (S05 は S02 まで進めば前提 OK)。S12 系は exercises がある程度
できてから。詳しくは各スライスの「前提」欄を読む。

---

## 7. スライス詳細

各スライスの記載要素は固定で次の通り:

- **ゴール**: 何が動くと「完了」か (US 受け入れ基準への参照)。
- **前提**: マージ済みであるべきスライス／migration。
- **スコープ in / out**: 今回触る範囲と、意図的に触らない範囲。
- **API 変更**: OpenAPI に追加するパス・スキーマ。
- **DB 変更**: 新規 migration の有無と内容。
- **backend 触点**: 4 層それぞれで追加する型・関数・ファイル。
- **frontend 触点**: features / routes / components の追加。
- **テスト**: 必須テスト一覧。
- **DoD**: マージ前に通すチェックリスト。

### S01 サインアップ (US-1)

**ゴール**: `POST /web/v1/signup` で新規ユーザーが作成され、Cookie が
セットされてログイン状態になる。境界値テストすべて green。

**前提**: P0 完了。

**スコープ**:

- in: `/web/v1/signup` の実装、ユーザー登録 UI、自動ログイン Cookie 発行。
- out: レート制限 (S22)、パスワード変更 (S04)、ログアウト (S03)。

**API 変更** (OpenAPI):

- `POST /web/v1/signup`
  - request: `{user_id: string, password: string}`
  - 201: `{user_id: string}` + `Set-Cookie: triary_session=...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` (`api-design.md` §2.1 と一致)
  - 400: `ErrorEnvelope` — `code` 例: `too_short`/`too_long`/`invalid_charset`/`reserved`/`already_taken` (field: `user_id` または `password`)

**DB 変更**: なし (P0-C で `users` / `user_sessions` 完成済み)。

**backend 触点**:

- `domain/user/` (`data-model.md` §4.1 の `users` テーブルが内部 PK の `user_id` (BINARY(16) ULID) と公開ログイン識別子の `user_handle` (VARCHAR(32)) を分けているのと対応してファイルも分ける):
  - `user_id.rs`: `UserId` newtype (ULID ラッパ、内部 PK)。`UserId::parse(raw) -> Result<Self, DomainError>`。
  - `user_handle.rs`: `UserHandle` newtype (ログイン識別子、長さ 3-32、charset `^[a-z0-9_-]+$`、小文字正規化、予約語拒否)。`UserHandle::try_new(&str) -> Result<Self, DomainError>`。値オブジェクトは単一エラーを返す (`architecture.md` §ドメインロジックの置き場所)。複数フィールドのエラー集約は `CreateUserValidator` 等のバリデータ層で `Vec<DomainError>` に束ねる。
  - `password.rs`: `RawPassword` (12-128 文字、検証成功時は `Validated<RawPassword>` を返す型付きパイプライン §architecture ADR #8 に従う)。
  - `password_hash.rs`: `PasswordHash` newtype (PHC 文字列のラッパ)。
  - `user.rs`: `User` 集約 (`UserId`, `UserHandle`, `PasswordHash`, `created_at`, `updated_at`)。
- `domain/` 直下 (architecture.md §ディレクトリ構造に従い、現実概念のポートは `domain/ports/` ではなく `domain/` 直下に置く):
  - `domain/clock.rs`: `Clock` トレイト (`now() -> DateTime<Utc>`)。
  - `domain/password_hasher.rs`: `PasswordHasher::hash(&self, raw: &RawPassword) -> Result<PasswordHash, DomainError>`、`verify`。
- `application/ports/`:
  - `user_repository.rs`: `UserRepository::insert(&self, user: &User) -> Result<(), UseCaseError>`、`find_by_handle(&self, &UserHandle) -> ...`。
  - `session_store.rs`: `SessionStore::create(&self, user_id: &UserId, expires_at: DateTime<Utc>) -> Result<SessionToken, UseCaseError>`。
- `application/usecases/signup.rs`:
  - `SignupInput { user_id, password }` → `SignupOutput { user, session_token }`。
  - 予約語チェック (定数リスト: `admin`, `api`, `system`, `triary`, `root`)、handle 重複チェック、ハッシュ化、insert、session 発行。
- `infrastructure/`:
  - `repositories/mysql_user_repository.rs`、`repositories/mysql_session_store.rs` (sqlx)。
  - `password_hasher/argon2_password_hasher.rs` (`argon2` crate, m=19456, t=2, p=1 を初期値とし、後から `.contexts/security-overrides.md` に追記して調整)。
  - `clock/system_clock.rs`。
- `interfaces/http/routes/web/signup.rs`:
  - `POST /web/v1/signup` ハンドラ。Cookie 発行は `axum_extra::extract::cookie::CookieJar` を使う。

**frontend 触点**:

- `features/auth/queries/me.ts` (S02 で増えるが、ここでは未着手で OK)。
- `features/auth/mutations/signup.ts` — TanStack Query Mutation。
- `features/auth/state/signup-form.ts` — ユーザー入力 (handle / password) の状態。
- `features/auth/components/SignupForm.tsx` — fully controlled、エラー表示は `errors[]` をそのまま使う (i18n マップで日本語化)。
- `features/auth/containers/SignupContainer.tsx` — mutation + state を結線。
- `routes/auth/signup.tsx` — `/signup`。
- ログイン後の遷移先は `/` (Home はあとで Dashboard に置き換わる)。

**テスト**:

- `domain/user/user_id` の単体テスト (境界値: 2/3/32/33、文字種、予約語、大文字混在)。
- `domain/user/password` の単体テスト (11/12/128/129 文字、文字種制約なし)。
- `interfaces/http/routes/web/signup` の Axum oneshot テスト (Cookie ヘッダ付与確認)。
- Postman: signup 成功・handle 重複・password 短い・不正文字 (4 ケース最低)。
- ユースケース本体 (`application/usecases/signup`) は **単体テストを書かない** (`architecture.md` ADR 10 / §テスタビリティ戦略)。動作担保は infrastructure 統合テスト + Postman 統合テスト。

**DoD**:

- [ ] §8 全コマンド pass。
- [ ] Postman で signup 4 ケース pass。
- [ ] `Set-Cookie` に `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` が含まれる。
- [ ] 認証なしで `/web/v1/signup` を呼べる (`security: []` で OpenAPI 上 override)。

---

### S02 ログイン + me (US-2)

**ゴール**: 既存ユーザーが `POST /web/v1/login` でログインでき、`GET
/web/v1/me` で自分の情報を取得できる。

**前提**: S01。

**スコープ**:

- in: `/web/v1/login`, `/web/v1/me`。Cookie 認証 middleware の確立。`<RequireAuth>` の有効化。
- out: ログアウト (S03)。レート制限 (S22)。

**API 変更**:

- `POST /web/v1/login`: request `{user_id, password}`、200 `{user_id}` + Set-Cookie、401 `invalid_credentials` (`api-design.md` §2.1)。
- `GET /web/v1/me`: 200 `{user_id}`、401 `unauthenticated`。

**DB 変更**: なし。

**backend 触点**:

- `interfaces/http/middleware/auth.rs`:
  - `Cookie: triary_session=<token>` を読み、`SessionStore::find_by_token` で検証、見つからない／expired なら 401。
  - 成功した場合 `Extension<AuthenticatedUser { user_id }>` を request に注入。
- `application/usecases/login.rs`:
  - handle で user 検索 → ハッシュ verify → 失敗時は **`Unauthorized` のみ返す** (ID 存在の有無を露呈しない、`specification.md` US-2)。
  - 成功時 SessionStore::create → token を返す。
- `interfaces/http/routes/web/login.rs`、`me.rs`。
- session トークンは「raw 256bit を生成し、Cookie には raw を送る、DB には SHA-256 ハッシュを保存」(§data-model.md §user_sessions)。

**frontend 触点**:

- `features/auth/queries/me.ts` — `GET /web/v1/me`。401 は `null` に変換。
- `features/auth/mutations/login.ts`。
- `features/auth/components/LoginForm.tsx` / `containers/LoginContainer.tsx`。
- `routes/auth/login.tsx`。
- `<RequireAuth>` を `useMe` ベースで実装し、未ログイン時に `/login` へリダイレクト。

**テスト**:

- 認証 middleware の単体テスト (Cookie 無し / 不正 / 有効の 3 ケース)。
- login 成功 / handle 不一致 / password 不一致 / handle 大文字混在 (`Foo` で登録 → `foo` でログインできる) を Postman に追加。
- frontend: MSW で me が 401 を返すケース → `<RequireAuth>` が `/login` に遷移するテスト。

**DoD**:

- [ ] login 失敗時のレスポンスが「id 存在の有無で見分けられない」(レスポンス body / status / 経過時間が同じ。タイミング差は §S22 で別途対処メモ)。
- [ ] §8 全コマンド pass。

---

### S03 ログアウト (US-2)

**ゴール**: `POST /web/v1/logout` で session が即座に破棄される (`/web/v1/me`
が 401 を返す)。

**前提**: S02。

**スコープ**:

- in: `/web/v1/logout`、UI ログアウトボタン。
- out: 他端末セッション一括破棄 (US-3 で MVP 対象外)。

**API 変更**:

- `POST /web/v1/logout`: 204 + `Set-Cookie: triary_session=; Max-Age=0` (`api-design.md` §2.1)。401 unauthenticated 時はそのまま 401。

**backend**:

- `application/usecases/logout.rs` — `SessionStore::delete_by_token`。
- `interfaces/http/routes/web/logout.rs`。

**frontend**:

- `features/auth/mutations/logout.ts`。
- ヘッダの「ログアウト」ボタン (`components/HeaderUserMenu.tsx`)。

**テスト**:

- logout 後に `/me` が 401 を返す Postman ケース。
- frontend: ログアウト後に Home が `<RequireAuth>` でブロックされるか (e2e 寄り、可能なら Playwright で)。

**DoD**:

- [ ] Cookie 失効後、過去のトークンが DB に残っていないこと (`SELECT COUNT(*) FROM user_sessions WHERE session_token_hash = SHA2(?, 256)` が 0)。

---

### S04 パスワード変更 (US-3)

**ゴール**: `POST /web/v1/change-password` で本人がパスワードを更新できる。
他端末セッションは無効化しない (MVP 仕様)。

**前提**: S02。

**API 変更**:

- request `{current_password, new_password}`、204、400 (新パスワード長違反)、401 (現パスワード一致せず → `invalid_credentials`) (`api-design.md` §2.1)。

**backend**:

- `application/usecases/change_password.rs`。

**frontend**:

- `routes/auth/change-password.tsx`、`features/auth/{mutations,containers,components}`。

**テスト**:

- current 不一致 / new 短い / 同じパスワードに変更 (許可) を Postman に。

**DoD**:

- [ ] 新ハッシュで再ログインできる。
- [ ] 既存セッションが残ったまま (削除されていない) ことを SQL で確認。

---

### S05 種目一覧 + 詳細 (US-4)

**ゴール**: ログイン直後の画面で preset 種目一覧と詳細が表示される。

**前提**: S02、P0-D (preset シード) 完了。

**API 変更**:

- `GET /api/v1/exercises`: 200 `{items: Exercise[]}` (preset + 自分の種目混在、ページング無し)。
- `GET /api/v1/exercises/{exercise_id}`: 200 `Exercise`。404 `not_found` (パスの ID 不存在 or 他人のユーザー種目)。
- `Exercise` schema (`api-design.md` §exercises 参照): `{id: IdString, owner: 'preset'|'user', name, measurement_kinds: [{kind: 'reps'|'weight'|'time', is_required: bool}], parent_id: IdString?}`。

**backend**:

- `domain/exercise/`: `Exercise` 集約 (`ExerciseId`, `Owner` enum, `ExerciseName`, `MeasurementKindSet`, `ParentId: Option<ExerciseId>`)、`ExerciseName::try_new` (1-64、ユーザー内一意のチェックは Repository 側)、`MeasurementKindSet::try_new` (空セット禁止)。
- `application/ports/exercise_repository.rs`: `find_visible_to(&self, user_id) -> Vec<Exercise>`、`find_by_id(&self, id, viewer: user_id) -> Option<Exercise>` (preset または所有者一致のときのみ Some)。
- `application/usecases/list_exercises.rs`、`get_exercise.rs`。
- `infrastructure/repositories/mysql_exercise_repository.rs`。
- `interfaces/http/routes/api/exercises.rs`: GET 2 本。

**frontend**:

- `features/exercises/queries/list.ts`、`detail.ts` (TanStack Query)。
- `features/exercises/components/ExerciseListItem.tsx`、`ExerciseBadge.tsx` (preset / user バッジ)、`MeasurementKindList.tsx`。
- `features/exercises/containers/ExercisesPage.tsx`。
- `routes/exercises/index.tsx` → `/exercises`、`routes/exercises/[id].tsx` → `/exercises/:id`。
- ナビに「種目」リンクを追加。

**テスト**:

- preset 種目が 15 行返ることを Postman で確認。
- 他人のユーザー種目を `/api/v1/exercises/{id}` で叩くと 404 (S07 以降で複数ユーザー fixtures が必要なら、それと一緒に整備)。

**DoD**:

- [ ] 認証なしで叩くと 401 unauthenticated。
- [ ] `make api-generate` 後、frontend で `Exercise` 型が import できる。

---

### S06 ユーザー種目作成 (US-5)

**ゴール**: 自分の種目を新規作成できる。

**前提**: S05。

**API 変更**:

- `POST /api/v1/exercises`: request `{name, measurement_kinds: [...], parent_id?: IdString}`。
- 400 codes: `empty` (name の空文字 / measurement_kinds の空配列)、`too_long` (name)、`invalid_charset` (name)、`already_taken` (name、ユーザー内 + プリセット重複)、`not_found` (parent_id)、`creates_cycle`/`exceeds_max_depth`/`exceeds_max_children` は parent_id 指定時のみ (S10 で完全対応するが、ここでも検査する) (`api-design.md` §2.2)。
- 201: `Exercise` (`api-design.md` §2.2)。

**backend**:

- `domain/exercise/factories.rs`: `CreateExerciseInput → Validated → Exercise`。
- `application/usecases/create_exercise.rs`。
- 名前重複は Repository が検査する (DB の UNIQUE で確実に防ぐが、ユーザーフレンドリーなエラーのために事前 SELECT も)。

**frontend**:

- `features/exercises/mutations/create.ts`、`features/exercises/components/ExerciseForm.tsx` (name + measurement_kinds の checkbox + 任意 parent select)、`routes/exercises/new.tsx`。

**テスト**:

- 境界値: name 0/1/64/65 文字、measurement_kinds 0/1/3 個。
- 名前重複 (preset 名と衝突 / 自分のユーザー種目と衝突)。

**DoD**:

- [ ] 作成成功後、`/exercises` 一覧に出る (TanStack Query invalidate 確認)。

---

### S07 ユーザー種目編集 (US-5)

**ゴール**: name / measurement_kinds を更新できる。記録が存在する場合
`measurement_kinds` の変更は拒否 (`locked_by_existing_records`)。

**前提**: S06。

**API 変更**:

- `PATCH /api/v1/exercises/{exercise_id}`: request `{name?, measurement_kinds?}` (`parent_id` は S10 で対応)。
- 403 `preset_not_modifiable` (パス非依存) / 404 (他人 or 不存在) / 400 `locked_by_existing_records` (records 紐付き ありの状態で kinds 変更要求)。

**backend**:

- 「records 紐付き」の判定: `SELECT EXISTS (SELECT 1 FROM exercise_blocks WHERE exercise_id = ?)`。
- `application/usecases/patch_exercise.rs` (parent 付け替えは S10)。

**frontend**:

- `features/exercises/mutations/patch.ts`、`features/exercises/components/ExerciseForm.tsx` を作成・編集兼用に。

**テスト**:

- preset を編集 → 403。
- 自分の種目で records なし → kinds 変更 OK。
- 自分の種目で records あり → kinds 変更 400。

**DoD**:

- [ ] records 有無の判定がトランザクション内で行われる (kinds 更新と矛盾なく)。

---

### S08 ユーザー種目削除 (US-5)

**ゴール**: 自分の種目を削除できる。配下の records はカスケード削除、
子種目は parent NULL で孤立。

**前提**: S06。

**API 変更**:

- `DELETE /api/v1/exercises/{exercise_id}`: 204、403 preset、404 不存在 / 他人。

**backend**:

- DB の `ON DELETE CASCADE` (blocks/sets/measurement_kinds) と `ON DELETE SET NULL` (parent_exercise_id) の組み合わせを使う。usecase は事前確認なし。

**frontend**:

- 種目詳細画面に「削除」ボタン。確認ダイアログ表示後に DELETE。
- 確認テキストに「関連する記録もすべて削除されます」を出す (US-5 受け入れ基準)。

**テスト**:

- 子種目を持つ親を削除 → 子は parent_id NULL になる。
- records ありの種目を削除 → records も消える。

---

### S09 プリセット種目クローン (US-4)

**ゴール**: preset を「複製」してユーザー種目化できる。

**前提**: S06。

**API 変更**:

- `POST /api/v1/exercises/{exercise_id}/clones`: request `{name?: string}` (省略時は自動命名)、201 `Exercise` (新規ユーザー種目) (`api-design.md` §2.2)。
- このエンドポイントは **preset 種目専用**。preset でない (= ユーザー種目) を path に指定した場合は 404 `not_found` を返す (`api-design.md` §2.2 の 404 と同じ扱いに揃え、preset/user の区別を path セマンティクスに露呈させない)。
- 自動命名: `{元の名前} (コピー)` から始まり、衝突する場合は `(コピー 2)`、`(コピー 3)`... と suffix を増やす。
- 改名指定: `name` を渡したときはその値で作成し、既存と衝突したら 400 `already_taken` on `name`。
- measurement_kinds は preset と同じ。parent は preset 自身。

**backend**:

- `application/usecases/clone_preset_exercise.rs`。
- 名前 suffix の決定とリトライポリシーは usecase が持つ (Repository は永続化能力のみを表現する純粋なポートにする、`architecture.md` §application)。
  - usecase 内で `ExerciseRepository::name_taken(&self, name: &ExerciseName, owner: &UserId) -> Result<bool, _>` を呼び、衝突していなければ `insert` する。
  - DB の UNIQUE 制約違反 (race) が出た場合は usecase 内で suffix 番号を `+1` して最大 5 回までリトライ。
  - 5 回超えても insert に成功しない場合は `UseCaseError::Internal` を返す (MVP のスケールでは事実上ヒットしない想定)。

**frontend**:

- 詳細ページの「複製」ボタン。クローン成功時に `/exercises/:newId/edit` へ遷移。

**テスト**:

- 連続 3 回クローン → `(コピー)` `(コピー 2)` `(コピー 3)`。

---

### S10 親付け替え (US-6)

**ゴール**: `PATCH /api/v1/exercises/{id}` で `parent_id` を設定／変更／
NULL 化できる。循環・深さ・子数の検査が動く。

**前提**: S07。

**API 変更**:

- `PATCH .../exercises/{id}` の request に `parent_id?: IdString | null`。null は明示的に「親を外す」。省略は「変更しない」。
- 400 codes: `creates_cycle`、`exceeds_max_depth` (深さ 8 超)、`exceeds_max_children` (子数 16 超)、`not_found` (`parent_id` 指定先が不存在 or 他人のユーザー種目)。

**backend**:

- 循環検出: `WITH RECURSIVE` で `parent_id` の祖先列を辿り、自分自身に当たれば cycle。
- 深さ: 自分のサブツリーの最大深さ + (新親の深さ + 1) <= 8。
- 子数: 新親の直下の子数 + 1 <= 16 (自分が既にその親の子だった場合は + 0)。
- 1 トランザクションで「祖先取得 → 子数取得 → UPDATE」を実行 (`SELECT ... FOR UPDATE` まではかけずに、一意制約と再試行で十分。ただし「子数 16 超」を突破する race は MVP では許容、コメントを残す)。

**frontend**:

- `ExerciseForm.tsx` に親種目セレクト (検索可能なドロップダウン、自分のサブツリーは選択肢から除外)。
- 親変更プレビュー (現親 → 新親) を表示。

**テスト**:

- 循環: A → B → C で C を A の子に → 400 creates_cycle。
- 深さ 8: 8 段ツリーの末尾に新規子を追加 → 400 exceeds_max_depth。
- 子数 16: 16 子を持つ親に 17 個目 → 400 exceeds_max_children。

---

### S11 サブツリー取得 (US-6)

**ゴール**: `GET /api/v1/exercises/{id}/tree` で当該種目を根にした
サブツリーをフラット配列 + `children_order` で取得できる。

**前提**: S10。

**API 変更**:

- 200: `{root_id: IdString, nodes: (Exercise & {children_order: IdString[]})[]}` (`api-design.md` §2.2 GET .../tree)。各ノードに自身の子を `children_order` 配列で持たせて兄弟順序を表現する (順序情報は children ネストではなく正規化)。

**backend**:

- `application/usecases/get_subtree.rs`、Repository に `find_subtree(&self, root_id, viewer_user_id) -> Vec<Exercise>` を追加 (`WITH RECURSIVE` で深さ 8 まで)。

**frontend**:

- `features/exercises/queries/tree.ts`。
- `features/exercises/components/TreeView.tsx` (折りたたみ可能、子は indent で表現)。
- `routes/exercises/[id]/tree.tsx`。

**テスト**:

- preset (パイクプッシュアップ → 倒立腕立て) でツリーが返ること。
- 自分のサブツリーに preset を含めた場合の混在表示。

---

### S12 セッション開始 (US-7)

**ゴール**: `POST /api/v1/sessions` でセッションを作成できる。

**前提**: S05 (種目が引ける状態)。

**API 変更**:

- request `{workout_date: WorkoutDate}` (フロントが組み立てたローカル日付)。`note` は任意。
- 201: `Session` (空 blocks) (`api-design.md` §2.3)。
- 400 codes: `required` workout_date、`invalid_format`、`in_future`。

**backend**:

- `domain/session/`: `Session`, `WorkoutDate` (in_future 検査は `Clock` 注入で行う)、`SessionNote` newtype (任意、最大長は本実装フェーズで決め、`design-component` ではなく本計画 §11 のうち「`note` の最大長」で 2000 と仮置きする)。
- `application/usecases/start_session.rs`、`application/ports/session_repository.rs`。
- `interfaces/http/routes/api/sessions.rs`。

**frontend**:

- `features/sessions/mutations/start.ts`、`routes/sessions/new.tsx`。

**テスト**:

- 未来日 → 400 in_future。
- workout_date 不正フォーマット → 400 invalid_format。

---

### S13 セッション詳細取得 (US-7 / US-8)

**ゴール**: `GET /api/v1/sessions/{id}` で blocks + sets を含むフル集約を
取得できる。

**前提**: S12。

**API 変更**:

- 200: `Session { id, workout_date, started_at, ended_at?, note?, blocks: Block[] }`。
- `Block { id, exercise: Exercise, order, sets: Set[] }`。
- `Set { id, order, reps?, weight_kg?, duration_seconds?, interval_seconds? }`。

**backend**:

- 1 リクエスト = 4 SQL (sessions / blocks / sets / 関連 exercises) を join なしで取り、メモリで組み立てる (集約構築の責務は application/usecases に置く)。
- N+1 回避: 関連 `exercises` は `WHERE id IN (block.exercise_id の集合)` で一括取得する。ブロックごとに個別 SELECT しない。同様に `sets` も `WHERE block_id IN (...)` で一括取得し、`block_id` でメモリ上で grouping する。

**frontend**:

- `features/sessions/queries/detail.ts`、`features/sessions/components/SessionView.tsx` (read-only ビュー、編集は S14〜S18 で別画面)、`routes/sessions/[id].tsx`。

**テスト**:

- 他人のセッションへのアクセス → 404。
- blocks も sets もないセッション → `blocks: []`。

---

### S14 ブロック追加 (US-7)

**ゴール**: セッションに種目ブロックを追加できる。

**前提**: S13。

**API 変更**:

- `POST /api/v1/sessions/{session_id}/blocks`: request `{exercise_id}`。
- 201: `Block` (空 sets, order は末尾) (`api-design.md` §2.3)。
- 400: `not_found` (exercise_id)、`already_taken` は **使わない** (同じ種目を 2 回入れるのは仕様で許可)。

**backend**:

- `application/usecases/add_block.rs`。所有権チェック (session.user_id == viewer)。
- `block_order` は `MAX(block_order) + 1` (1 トランザクション内で実施、`SELECT ... FOR UPDATE`)。

**frontend**:

- `features/sessions/components/AddBlockButton.tsx` + 種目ピッカ (`ExercisePicker`)、`features/sessions/mutations/add_block.ts`。

**テスト**:

- 50 個目までは OK、51 個目で 400 `exceeds_max_blocks` on `blocks` (`api-design.md` §1.6 / §2.3)。

---

### S15 セット追加 (US-7)

**ゴール**: ブロックにセットを追加できる。計測項目セットに整合する値を
保存できる。

**前提**: S14。

**API 変更**:

- `POST /api/v1/blocks/{block_id}/sets`: request `{reps?, weight_kg?, duration_seconds?, interval_seconds?}`。
- バリデーション: 種目の必須計測項目すべてに値があること、必須でない項目は省略可。値の範囲は §specification §境界値表。
- 201: `Set` (`api-design.md` §2.4)。
- 400 codes: `missing_required_measurement` on `reps` / `weight_kg` / `duration_seconds` (該当する欠落フィールドを field に入れる、複数欠落時は `errors[]` を複数要素)、`out_of_range` on 各値フィールド、`empty` (全フィールド NULL は不可)。

**backend**:

- `domain/session/workout_set.rs`: 値オブジェクト群 (`Reps`, `WeightKg`, `DurationSeconds`, `IntervalSeconds`) に範囲検査。
- `application/usecases/add_set.rs`。

**frontend**:

- `features/sessions/components/SetEditor.tsx` (種目の measurement_kinds に応じてフィールドを生やす)、`AddSetButton.tsx`。
- `weight_kg` は加重 / 補助トグル + 絶対値入力に分割 (UI のみ。送信時に符号を組み立てる)。

**テスト**:

- 各値の境界値 (0/1/N-1/N/N+1) を Postman に。
- 必須計測項目欠落 → 400 `missing_required_measurement`。

---

### S16 セット編集・削除 (US-8)

**ゴール**: セット単位で値・並び順を直せる、削除できる。

**前提**: S15。

**API 変更**:

- `PATCH /api/v1/sets/{set_id}`: 値の更新、`order` の変更も可。
- `DELETE /api/v1/sets/{set_id}`: 204。
- 400: `out_of_range`、`incompatible_with_existing_sets` は本スライス対象外 (それは S17 でブロックの種目差し替え時に使う)。

**backend**:

- 並び順変更: `swap` 形式 (request に `order: number` を渡す → 同一ブロック内で詰め直し) を採用。実装は「変更後の order 配列を組んで全行 UPDATE」(`data-model.md` §再採番戦略 を参照)。

**frontend**:

- `SetEditor.tsx` をインライン編集対応に。ドラッグ並び替えは `dnd` ライブラリを使わず、上下ボタンで実装 (依存追加は §AI-delegation で確認事項のため)。

**テスト**:

- 3 セット中 2 番目を 1 番目に移動 → order が `0,1,2` で詰まっている。

---

### S17 ブロック編集・削除・並び替え (US-8)

**ゴール**: ブロックの並び替え、種目差し替え (互換性チェック付き)、削除。

**前提**: S15。

**API 変更**:

- `PATCH /api/v1/blocks/{block_id}`: `{exercise_id?, order?}`。種目差し替え時、新種目の measurement_kinds が既存 sets の値と非互換ならば 400 `incompatible_with_existing_sets`。
- `DELETE /api/v1/blocks/{block_id}`: 204 (sets はカスケード)。

**backend**:

- 互換性チェック: 既存 sets が「新種目で必須でない計測項目に値を持っている」場合は OK、「新種目で禁止されている計測項目に値を持っている」場合は NG。MVP では measurement_kinds の `kind` enum が既存値を全部許容する場合のみ OK と判定する (シンプル実装)。

**frontend**:

- ブロックヘッダに「種目を変える」「並び順を変える」「削除」UI。

**テスト**:

- 互換性のない差し替えで 400。

---

### S18 セッション編集・終了・削除 (US-7 / US-8)

**ゴール**: セッション本体のメタ情報 (workout_date / note) 編集、終了
(`ended_at`)、削除。

**前提**: S13。

**API 変更**:

- `PATCH /api/v1/sessions/{id}`: `{workout_date?, note?, ended_at?}`。`ended_at` 渡しでも OK だが、フロントは `/end` を使う。
- `POST /api/v1/sessions/{id}/end`: `ended_at` を `Clock::now()` にする。
- `DELETE /api/v1/sessions/{id}`: 204。
- 400 codes: `in_future` (workout_date)、`before_start` (`ended_at < started_at`)。

**frontend**:

- 「セッション終了」ボタン、編集モーダル、削除確認。

**テスト**:

- ended_at < started_at → 400。
- 未来日 → 400。

---

### S19 履歴 (日付別) (US-9)

**ゴール**: `GET /api/v1/history/sessions` で `workout_date DESC,
session_id DESC` 順のカーソルページングが動く。

**前提**: S18。

**API 変更**:

- `GET /api/v1/history/sessions?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>&cursor=<base64url>&limit=<1..100>` (`api-design.md` §2.6)。
- `from` / `to` はいずれも任意。両方未指定なら全期間、`from` のみなら以降、`to` のみなら以前。
- 200: `{items: Session[], page_info: PageInfo}`。
- 400: `invalid_format` (cursor / from / to デコード失敗)。

**backend**:

- カーソル: base64url(JSON `{"w": "2026-04-08", "s": "01HZ..."}`)。
- インデックス `sessions(user_id, workout_date DESC, session_id DESC)` を使う SQL。
- `from` / `to` は WHERE 句に追加 (`workout_date >= ? AND workout_date <= ?`)。
- ページサイズ既定 30、最大 100。

**frontend**:

- `features/history/queries/sessions.ts` (`useInfiniteQuery`、`from` / `to` をクエリキーに含める)。
- `routes/history/index.tsx` で日付降順リスト、無限スクロール or 「もっと見る」ボタン。
- 日付選択 (date picker) で `from` / `to` を指定して特定日 / 特定期間に絞り込む。日付 1 日選択 = `from` と `to` を同じ値に設定。

**テスト**:

- 100 件 fixture を作って 30 / 30 / 30 / 10 でカーソルが正しく動くこと。
- `from` / `to` で期間絞り込み (片側指定 / 両側指定 / 同日指定)。
- limit=0 / limit=101 / cursor が壊れている / `from` の format が不正 → 400。

---

### S20 履歴 (種目別 + ツリー集約) (US-10)

**ゴール**: `GET /api/v1/history/exercises/{id}` で種目別履歴と「ツリー
集約」モードが動く。`previous_summary` で前回値を返す。

**前提**: S19、S11。

**API 変更**:

- `GET /api/v1/history/exercises/{id}?include_descendants=bool&cursor=...&limit=...`。
- 200: `{items: BlockHistoryItem[], page_info: PageInfo, previous_summary?: ...}`。
- `BlockHistoryItem`: `{block_id, session_id, workout_date, exercise: {id, name}, sets: SetSummary[]}`。

**backend**:

- `include_descendants=true` のとき: `WITH RECURSIVE` で子孫 ID を取り、`exercise_blocks.exercise_id IN (...)` で絞る。
- `previous_summary`: 直近のブロックのセット概要 (sets 数・最大 weight 等) を返す。MVP では「sets 数と最初のセットの値」を返す簡易版で開始。

**frontend**:

- `routes/exercises/[id]/history.tsx`、`features/history/queries/exercise.ts`、`features/history/components/PreviousSummary.tsx`。
- ツリー集約モードは toggle で切り替え。

**テスト**:

- 単一種目 / ツリー集約 (子孫含む) でアイテム数差が出ること。
- 末端種目 (子なし) で `include_descendants=true` でも単一種目と同じ結果になること。

---

### S21 PWA shell (NF)

**ゴール**: `manifest.json` が読まれ、Service Worker がアセットをキャッシュ
する。オフライン時はオフラインスタブを表示する。

**前提**: 主要画面 (S05〜S20) が出揃う。

**変更点**:

- `frontend/vite.config.ts` の `vite-plugin-pwa` 設定を有効化する (`architecture.md` §コンテキスト で導入済み、`frontend/package.json` / `vite.config.ts` 既存)。
- `frontend/public/manifest.webmanifest`、アイコン (`512x512`, `192x192`)。
- Service Worker 戦略: アセット (JS / CSS / fonts) は `CacheFirst`、API は **キャッシュしない** (オンライン必須)。

**テスト**:

- Lighthouse PWA カテゴリ score >= 90 を CI でチェックするか、最低限 manifest が parseable であることを確認する単体テスト。

---

### S22 レート制限 (NF)

**ゴール**: `/web/v1/login` 同一 IP / 1 分 10 回、`/web/v1/signup` 同一
IP / 1 時間 5 アカウント を 429 で返す。

**前提**: S01, S02。

**変更点**:

- `tower::Layer` で簡易のメモリ内レート制限 (MVP のスケールが小さいので問題ない)。永続化は不要。
- IP は `X-Forwarded-For` を見るか直 socket addr を見るか。MVP は 直 socket addr。

**テスト**:

- Postman でループして 11 回目に 429 (login) / 6 回目に 429 (signup)。

---

### S23 構造化ログ整備 (NF)

**ゴール**: `tracing` で JSON 構造化ログを stdout に出す。PII (handle /
password / Cookie) は出さない。

**前提**: 全 API スライス完了。

**変更点**:

- `tracing-subscriber` の `fmt::layer().json()` に切り替える。
- リクエスト ID を `tower-http::request_id` で発番。
- `password` フィールドの redaction は `serde` で `#[serde(skip)]` を徹底。

**DoD**:

- [ ] `cargo run` 後、`POST /web/v1/signup` が 1 行 JSON で出る。
- [ ] grep してパスワードがログに残っていないこと。

---

### S24 E2E グリーン化 (NF)

**ゴール**: `tests/integration/triary.postman_collection.json` を CI で
回し、すべてのスライスの代表ケースが green。

**前提**: 全機能スライス完了。

**変更点**:

- `.github/workflows/e2e.yml` に Newman 実行ジョブ。MySQL を docker-compose で立て、backend を `cargo run` で起動して fixture user を作ったあと Newman を回す。
- 既存 e2e.yml にあるならそこに統合。

---

### S25 UI 仕上げ (NF)

**ゴール**: アクセシビリティ (`role`, `aria-*`)、空状態、ローディング、
エラーメッセージの統一。

**変更点**:

- 各 features/components/ で empty state / loading state を共通コンポーネント化。
- フォームは `<label>` 必須、エラーは `aria-describedby` で読み上げ可。

---

## 8. 品質ゲート

PR を出す前 / マージ前に以下が同時に green であること。

| カテゴリ | コマンド | 補足 |
|---|---|---|
| backend fmt | `cd backend && cargo fmt --all -- --check` | |
| backend lint | `cd backend && cargo clippy --all-targets -- -D warnings` | |
| backend test | `cd backend && cargo nextest run` | architecture テストも含む |
| backend offline metadata | `cd backend && cargo sqlx prepare --check -- --tests` | スキーマ変更時 |
| frontend lint/format | `cd frontend && pnpm run lint:ci` | Biome のみ |
| frontend type | `cd frontend && pnpm run typecheck` | |
| frontend unit | `cd frontend && pnpm run test:run` | |
| frontend arch | `cd frontend && pnpm run arch:test` | dependency-cruiser |
| frontend build | `cd frontend && pnpm run build` | |
| arch tests (両方) | `make arch-test` | |
| openapi lint | `npx @redocly/cli lint openapi/openapi.yaml` | |
| 結合テスト (任意) | `npx newman run tests/integration/triary.postman_collection.json --env-var ...` | ローカルで infra 起動時 |

---

## 9. レビュー対応プロトコル

PR 作成後、`AI Review` workflow と Copilot Code Review が走る。指摘への
対応手順は次の通り。

> **Note**: 過去の main 上のコミットメッセージ (`da709f46`, `36dead00`)
> に "Seijo" という語が出るが、これは IME 誤変換の名残で固有名詞ではない
> (本来 "正常" 等を意図していたものが "成城 / Seijo" として残った)。
> レビュアーエージェントの呼称は `code-reviewer agent` で統一する。

### 9.1 自動レビューの確認

```
gh pr view <PR#> --comments
gh api repos/foo-543674/triary/pulls/<PR#>/comments
```

レビューコメントを `code-reviewer agent` 由来と Copilot 由来に分類する。
コミットは **観点単位** で分ける (§4.2、`CLAUDE.md` §commit-convention の
"Stage by intent, not by file. One commit, one purpose.")。ラウンド番号
で 1 コミットにまとめない。

メッセージ例:

- `[fix] tighten error envelope mapping per review on PR #<PR#>`
- `[fix] correct boundary value tests on PR #<PR#>`
- `[fix] address Copilot review on PR #<PR#>` (Copilot 由来をまとめる場合)

### 9.2 受け入れ／却下の判断

- **コードの正しさに関わる指摘**: 受け入れて修正する。
- **設計判断 (`.contexts/*.md`) に踏み込む指摘**: 必ずユーザーに確認してから対応する (`CLAUDE.md` §AI delegation scope の "Stop and confirm first")。
- **スタイル指摘 (Biome / clippy が拾えるもの)**: 受け入れる。Biome / clippy が拾わない好みは PR 上で reply して却下する。
- **誤検出**: PR コメントで「ここは仕様/設計上意図的にこうしている」と返信し、対応しない。

### 9.3 修正コミットの分け方

- レビュー指摘の「観点単位」で分ける。例: 「型安全性 5 件、エラーメッセージ 2 件、テスト追加 3 件」なら 3 コミット。
- レビューラウンドを単位にしない (`CLAUDE.md` §commit-convention)。複数ラウンドを跨いでも、観点が同じなら 1 コミットにまとめてよいし、観点が違えば同じラウンドでも分ける。
- 全件をすぐに返せない場合は PR 説明欄に「次回対応する観点」を明示する。

### 9.4 マージ判定

- すべての必須 CI が green。
- コメントへの reply / 修正がすべて済んでいる。
- ユーザー (foo-543674) の最終 LGTM (本人が押すまで AI はマージしない)。

---

## 10. ADR 候補

本計画レベルで決めた／確認した判断。

1. **垂直スライス × 1 PR 既定** — 大きい場合のみ分割。スキーマ追加 → ハンドラ → UI を別 PR にしてもよい。
2. **共通基盤 (P0) を先に終わらせる** — 後から横断改修するコストが大きいため。
3. **エラー envelope は単一・複数共に `errors[]` 配列** — 既存 `AppError` を S5.1 で置換。
4. **OpenAPI 1 ファイル維持** (MVP) — 分割は MVP 後に検討。
5. **DB マイグレーションは「目的単位」** — ファイル名で意図を表現。
6. **依存追加は本計画レベルでは確定しない** — 各スライスで必要になったら個別にユーザーに確認 (例: ドラッグ並び替え lib 等)。`vite-plugin-pwa` は `architecture.md` §コンテキスト で既に導入済みのため対象外。
7. **note の最大長は仮 2000 文字** — 本計画 §11 で正式化候補。
8. **レート制限は MVP ではメモリ内** — Redis 等の外部依存は追加しない。
9. **PWA は CacheFirst (assets) + Network Only (API)** — オンライン前提仕様の踏襲。

---

## 11. 設計フェーズ後段 (本計画) で確定すべき残課題

ここから先は実装スライス着手時にユーザーへ最終確認するもの。

| 項目 | 検討先 | 暫定値 |
|---|---|---|
| プリセット種目正式リスト | S0-D 着手時にレビュー | §5.4 の 15 種目 |
| 予約語の正式リスト | S01 着手時 | `admin / api / system / triary / root` |
| Argon2id パラメータ | S01 着手時 | m=19456, t=2, p=1 (`OWASP-2024` 準拠) |
| `note` の最大長 | S12 着手時 | 2000 文字 (TEXT) |
| `block_order` 再採番の SQL | S16 / S17 着手時 | 「全行 UPDATE」を採用、トランザクション内 |
| ~~ブロック上限超過の error code~~ | 確定済み (`api-design.md` §1.6 / §2.3) | `exceeds_max_blocks` on `blocks` を採用 |
| ~~履歴の日付フィルタ仕様~~ | 確定済み (`api-design.md` §2.6) | `from` / `to` クエリパラメータで実装する (S19) |
| ドラッグ並び替えの依存追加 | S16 / S17 着手時 | 既定は不採用 (上下ボタン) |
| ~~PWA プラグイン (`vite-plugin-pwa`)~~ | 確定済み (`architecture.md` §コンテキスト) | 既に `frontend/package.json` / `vite.config.ts` で導入済み |
| Postman 結合テストの fixture 投入方法 | S24 着手時 | Newman pre-request スクリプトで signup 経由 |

---

## 12. 参照マップ (本計画から)

| 文書 | 主に参照する場面 |
|---|---|
| `concept.md` | プロジェクト全体感を再確認したいとき |
| `requirements.md` | スコープ判定 (Should / Could / Out of scope) |
| `specification.md` | 受け入れ基準 / 境界値表 / 主要な前提 |
| `architecture.md` | レイヤー / 集約 / ポート配置 / ADR / 型付きパイプライン |
| `api-design.md` | エンドポイント仕様 / エラーコード / Cookie 属性 / ページング |
| `data-model.md` | DDL / インデックス / 再採番 / カスケード規則 |
| `setup-plan.md` | 環境構築 (新規 PC / 新規 contributor 向け) |
| `bootstrap-decisions.md` | AI コンテキスト基盤の決定理由 |
| `security-overrides.md` | npm overrides の理由台帳 |

---

## 付録 A: 「次に着手するスライス」を決めるショート手順

1. `git log --oneline origin/main` で直近マージ済みのスライスを確認。
2. 本計画 §6 の表で「直近の次の行」を 1 つ取る。
3. 「前提」が満たされていない場合は前提のスライスを優先。
4. 該当スライスの §7 詳細を読み、ブランチを切る (§4.1)。
5. 実装 → §8 全 green → PR (§4.5) → 自動レビュー対応 (§9) → ユーザー LGTM → マージ。

## 付録 B: スライス見積りメモ (参考、コミットしない判断材料)

実装ボリュームの肌感:

- S01 / S02 / S03 / S04 (auth)：それぞれ 1 〜 2 日
- S05 〜 S11 (exercises)：合計 1.5 〜 2 週
- S12 〜 S18 (sessions)：合計 2 〜 3 週
- S19 / S20 (history)：合計 1 〜 1.5 週
- S21 〜 S25 (NF)：合計 1 週

上記は AI 作業時間ではなくレビュー含む実時間の参考値。
