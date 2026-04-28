# triary 実装計画

## 0. 文書の役割

本書は「**何を、どの順で、どこまで実装するか**」のみを定義する。スライス
順序、Phase 0 共通基盤、各スライスのスコープ・前提・タスク分割案・DoD を
持つ。

仕様の詳細 (HTTP 形・エラーコード・DDL・SQL・バリデーション規則・命名
規約) は requirements / specification / api-design / data-model /
architecture に既出。実装エージェントは本書を入口に該当ドキュメントの
当該章へジャンプして実装する。本書には canonical な仕様を **転記しない**
(整合維持の手間と乖離リスクを避けるため)。

開発プロセス・PR フロー・レビュー対応プロトコル・CI とレビューの責務
分担などのプロジェクト規約は本書には書かない。それらは `CLAUDE.md` と
ブートストラップ元の `foo-skills` プラグインに置く。

---

## 1. スライス順序表

依存関係は「上に書かれたスライス」が「下に書かれたスライス」の前提に
なる。並列実装する場合でも、マージ順は表の通りにする。

| ID | 名称 | US | 主目的 | 前提 |
|---|---|---|---|---|
| **P0** | 共通基盤 | — | error envelope / OpenAPI 共通 / DB / preset / front infra | — |
| **S01** | サインアップ | US-1 | 新規ユーザー登録、自動ログイン | P0 |
| **S02** | ログイン + me | US-2 | Cookie 認証の確立 | S01 |
| **S03** | ログアウト | US-2 | セッション破棄 | S02 |
| **S04** | パスワード変更 | US-3 | 認証ユーザーの更新 | S02 |
| **S05** | 種目一覧 + 詳細 | US-4 | preset + 自分の種目を読む | S02、P0-D |
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

並列化の指針: S01〜S04 (auth) と S05〜S11 (exercises) は途中から並列化
可能 (S05 は S02 まで進めば前提を満たす)。S12 系は exercises がある程度
できてから。

---

## 2. Phase 0 (共通基盤)

スライスを書き始める前に必要な土台。**ここを終わらせるまで Phase 1 以降に
着手しない**。

### 2.1 P0-A エラーレスポンス envelope の正規化

- 触れる: `backend/src/{domain,application,interfaces}/error*.rs`、
  `backend/tests/architecture.rs`、`openapi/openapi.yaml`
  (`ErrorEnvelope` / `ErrorItem`)。
- 主参照: `api-design.md §1.6` (エラーコード表)、`api-design.md §1.3`
  (envelope 形)、`architecture.md §エラー境界の設計` / ADR #7 / ADR #8。
- DoD: 任意ハンドラが `Vec<DomainError>` を返したとき配列形式で返ること
  を単体テストで確認、`AppError::BadRequest("..")` も同 envelope に乗る。

### 2.2 P0-B OpenAPI 共通 schema 定義

- 触れる: `openapi/openapi.yaml` のみ (`ErrorItem`, `ErrorEnvelope`,
  `PageInfo`, `IdString`, `WorkoutDate`, `Timestamp`,
  `securitySchemes.cookieAuth`、`tags`)。
- 主参照: `api-design.md §1.6 / §3 / §認証`。
- DoD: `make api-generate` 成功、`npx @redocly/cli lint openapi/openapi.yaml`
  pass。

### 2.3 P0-C DB スキーマ初版

- 触れる: `backend/migrations/*.sql` (4〜5 ファイル、目的単位)、
  `Makefile` (`db-migrate` の冪等確認)。
- 主参照: `data-model.md §4 (テーブル定義)` / `§6 (インデックス)` /
  `§7 (カスケード)` / `§10 (マイグレーション計画)`。
- 着手時の確認: P0-D のシード値も同じトランザクション群で投入する
  (P0-D を別マイグレーションとして連番末尾に置く)。
- DoD: `make infra-reset && make db-migrate` 冪等、
  `make db-migrate-test` 通過、`cargo sqlx prepare -- --tests` 成功。

### 2.4 P0-D プリセット種目 初版リスト

- 触れる: P0-C と同列の seed migration 1 本のみ。
- 主参照: 確定リストは `data-model.md §10.2` 配下の存在証明 + 本書 §5.4
  に記載 (15 種目案)。最終確定は本タスク着手時にユーザー確認する
  (§5 残課題を参照)。
- DoD: `SELECT name FROM exercises WHERE owner_user_id IS NULL` で 15
  行返る、ツリー親子関係が SQL で確認できる。

### 2.5 P0-E フロント共通基盤

- 触れる: `frontend/src/lib/api-error.ts`、`frontend/src/lib/infra/`
  (Clock, RuntimeMode, ApiClient ラッパ)、`frontend/src/App.tsx`、
  `frontend/src/features/auth/components/RequireAuth.tsx`、
  `frontend/src/routes/`。
- 主参照: `architecture.md §フロントエンドアーキテクチャ` 全節 / ADR #11。
- DoD: `pnpm run lint:ci && pnpm run typecheck && pnpm run test:run &&
  pnpm run arch:test` がすべて green。

---

## 3. 各スライス定義

各スライスは「スコープ / 関連設計書 / 前提 / タスク分割案 / DoD」を
持つ。仕様詳細 (HTTP 形・SQL・エラーコード) は **書かない**。実装
エージェントは「関連設計書」欄からジャンプして読む。

### S01 サインアップ (US-1)

- スコープ: `POST /web/v1/signup` の実装、ユーザー登録 UI、自動ログイン
  Cookie 発行。
- 含まない: レート制限 (S22)、パスワード変更 (S04)、ログアウト (S03)。
- 関連設計書: `api-design.md §2.1`、`data-model.md §4.1 / §4.2`、
  `specification.md US-1 受け入れ基準 / §境界値表`、
  `architecture.md §認証・セッション方針 / §ドメインロジックの置き場所 / ADR #4 / ADR #8`。
- 前提: P0 完了。
- タスク分割案:
  - T01-1 backend ユーザー集約 + signup ユースケース
    (`backend/src/domain/user/`、`application/usecases/signup.rs`、
    `application/ports/user_repository.rs`、
    `infrastructure/repositories/mysql_user_repository.rs`、
    `interfaces/http/routes/web/signup.rs`)
  - T01-2 frontend signup UI + 自動ログイン後の遷移
    (`frontend/src/features/auth/`、`routes/signup.tsx`)
  - T01-3 結合テスト (`tests/integration/triary.postman_collection.json`
    に signup シナリオ追加)
- DoD: US-1 受け入れ基準が Postman で green、パスワード長境界値
  (12 / 128) と handle 長境界値 (3 / 32) が Postman に追加されている。

### S02 ログイン + me (US-2)

- スコープ: `POST /web/v1/login`、`GET /web/v1/me`、Cookie 認証
  middleware、`<RequireAuth>` の有効化。
- 含まない: ログアウト (S03)、レート制限 (S22)。
- 関連設計書: `api-design.md §2.1 / §1.3`、`data-model.md §4.2`、
  `architecture.md §認証・セッション方針`、`specification.md US-2`。
- 前提: S01。
- タスク分割案:
  - T02-1 backend login ユースケース + 認証 middleware
    (`application/usecases/login.rs`、
    `interfaces/http/middleware/auth.rs`、
    `interfaces/http/routes/web/{login,me}.rs`)
  - T02-2 frontend login UI + `<RequireAuth>` 有効化
    (`features/auth/`、`routes/login.tsx`、`App.tsx`)
  - T02-3 結合テスト (login → me → 401 / 200 系)
- DoD: 未認証で `/me` が 401 (errors[] 形式)、ログイン後 200。Postman
  で US-2 受け入れ基準が green。

### S03 ログアウト (US-2)

- スコープ: `POST /web/v1/logout`、UI ログアウトボタン。
- 含まない: 他端末セッション一括破棄 (MVP 対象外)。
- 関連設計書: `api-design.md §2.1`、`specification.md US-2`。
- 前提: S02。
- タスク分割案:
  - T03-1 backend logout (`application/usecases/logout.rs`、
    `interfaces/http/routes/web/logout.rs`) + frontend ボタン
  - T03-2 結合テスト (logout 後の `/me` が 401)
- DoD: ログアウト後 `GET /web/v1/me` が 401。

### S04 パスワード変更 (US-3)

- スコープ: `POST /web/v1/change-password` で本人がパスワード更新。
- 関連設計書: `api-design.md §2.1`、`data-model.md §4.1`、
  `architecture.md §セキュリティ責務マップ`、`specification.md US-3 / §境界値表`。
- 前提: S02。
- タスク分割案:
  - T04-1 backend change-password (`application/usecases/`、
    `interfaces/http/routes/web/change_password.rs`)
  - T04-2 frontend 変更 UI (`features/auth/components/`、
    `routes/settings/password.tsx`)
  - T04-3 結合テスト (旧パスワード不一致 / 新パスワード境界値)
- DoD: 旧パスワード誤り → 400、新パスワード長境界が Postman で検証。

### S05 種目一覧 + 詳細 (US-4)

- スコープ: `GET /api/v1/exercises`、`GET /api/v1/exercises/{id}`、
  種目一覧画面と詳細画面。
- 関連設計書: `api-design.md §2.2`、`data-model.md §4.3 / §6`、
  `specification.md US-4`、`architecture.md §レイヤー構成`。
- 前提: S02、P0-D 完了。
- タスク分割案:
  - T05-1 backend exercise 集約 + list/detail ユースケース
    (`domain/exercise/`、`application/{usecases,ports}/`、
    `infrastructure/repositories/mysql_exercise_repository.rs`、
    `interfaces/http/routes/api/exercises.rs`)
  - T05-2 frontend 一覧 + 詳細
    (`features/exercises/`、`routes/exercises/`)
  - T05-3 結合テスト (preset 15 行、他人の種目で 404)
- DoD: 認証なしで 401。preset 種目が 15 行返る。`make api-generate`
  後フロントから `Exercise` 型が import できる。

### S06 ユーザー種目作成 (US-5)

- スコープ: `POST /api/v1/exercises`、新規作成 UI。
- 関連設計書: `api-design.md §2.2 / §1.6 (error codes)`、
  `data-model.md §4.3 / §4.4`、`specification.md US-5 / §境界値表`、
  `architecture.md §ドメインロジックの置き場所 / ADR #8`。
- 前提: S05。
- タスク分割案:
  - T06-1 backend create-exercise (`domain/exercise/factories.rs`、
    `application/usecases/create_exercise.rs`、ハンドラ)
  - T06-2 frontend 作成フォーム
    (`features/exercises/components/`、`routes/exercises/new.tsx`)
  - T06-3 結合テスト (重複 / 文字種 / parent 検査)
- DoD: 名前重複 (preset 含む) / 文字種違反 / parent 不正 のエラーケース
  が Postman で検証。

### S07 ユーザー種目編集 (US-5)

- スコープ: `PATCH /api/v1/exercises/{id}` (name / measurement_kinds)、
  記録存在時の measurement_kinds 変更制約、編集 UI。
- 関連設計書: `api-design.md §2.2`、`data-model.md §4.3 / §4.4`、
  `specification.md US-5`。
- 前提: S06。
- タスク分割案:
  - T07-1 backend patch-exercise (Repository に
    `count_records_using(exercise_id)` 追加、ユースケース、ハンドラ)
  - T07-2 frontend 編集 UI (`routes/exercises/[id]/edit.tsx`)
  - T07-3 結合テスト (記録ありで kind 削除 → 400)
- DoD: 記録のある種目で必須 measurement を外そうとすると 400
  が出る (具体エラーコードは `api-design.md §1.6`)。

### S08 ユーザー種目削除 (US-5)

- スコープ: `DELETE /api/v1/exercises/{id}`、配下 records カスケード、
  子種目は parent NULL で孤立、削除 UI 確認ダイアログ。
- 関連設計書: `api-design.md §2.2`、`data-model.md §7 (カスケード設計) / §4.3`、
  `specification.md US-5`。
- 前提: S06。
- タスク分割案:
  - T08-1 backend delete-exercise (DB の `ON DELETE` 規則を活用、
    所有権チェック、ユースケース、ハンドラ)
  - T08-2 frontend 削除確認ダイアログ
  - T08-3 結合テスト (子種目が parent NULL になる、records も消える)
- DoD: カスケード挙動が `data-model.md §7` の表通り、Postman で検証。

### S09 プリセット種目クローン (US-4)

- スコープ: `POST /api/v1/exercises/{id}/clones`、suffix 付与のリトライ
  ロジック、クローン UI。
- 関連設計書: `api-design.md §2.2`、`data-model.md §4.3`、
  `specification.md US-4`、本書 §4 ADR #8 (S09 リトライ上限)。
- 前提: S06。
- タスク分割案:
  - T09-1 backend clone-preset
    (`application/usecases/clone_preset.rs`、ハンドラ、
    リトライ上限 5 回)
  - T09-2 frontend クローンボタン
  - T09-3 結合テスト (preset 以外を path に → 404、
    複数回クローンで suffix 違いが作成)
- DoD: ユーザー種目を path に → 404 (存在露呈防止)、リトライ上限超過で
  500 (`api-design.md §1.6` 参照)。

### S10 親付け替え (US-6)

- スコープ: `PATCH /api/v1/exercises/{id}` の `parent_id` 変更、
  サイクル / 深さ / 子数の検査、UI。
- 関連設計書: `api-design.md §2.2`、`data-model.md §4.3 / §9 (トランザクション境界)`、
  `specification.md US-6 / §境界値表`。
- 前提: S07。
- タスク分割案:
  - T10-1 backend patch-parent
    (再帰 SQL でサイクル検出、深さ計算、子数チェック)
  - T10-2 frontend 親選択 UI
  - T10-3 結合テスト (サイクル / 深さ超過 / 子数超過 の各 400)
- DoD: サイクル・深さ超過・子数超過の境界値が Postman で検証 (具体値は
  `specification.md §境界値表`)。

### S11 サブツリー取得 (US-6)

- スコープ: `GET /api/v1/exercises/{id}/tree`、ツリー UI。
- 関連設計書: `api-design.md §2.2`、`data-model.md §4.3 (parent_id 自己参照)`、
  `specification.md US-6`。
- 前提: S10。
- タスク分割案:
  - T11-1 backend tree (再帰 CTE、`application/usecases/get_tree.rs`)
  - T11-2 frontend ツリー表示コンポーネント
  - T11-3 結合テスト (preset → ユーザー種目混在のツリー)
- DoD: preset と user 種目が混在するツリーが期待通り返る、深さ上限まで
  リーフが返る。

### S12 セッション開始 (US-7)

- スコープ: `POST /api/v1/sessions`、セッション開始 UI。
- 関連設計書: `api-design.md §2.3`、`data-model.md §4.5`、
  `specification.md US-7 / §境界値表 (note 最大長)`、
  本書 §5 残課題 (`note` 上限)。
- 前提: S05。
- タスク分割案:
  - T12-1 backend create-session (`domain/session/`、
    `application/usecases/start_session.rs`、ハンドラ)
  - T12-2 frontend 開始フォーム
  - T12-3 結合テスト (`workout_date` の境界、note 最大長)
- DoD: `note` の最大長と `workout_date` 形式が Postman で検証。

### S13 セッション詳細取得 (US-7 / US-8)

- スコープ: `GET /api/v1/sessions/{id}` (フル集約: blocks + sets を内包)、
  詳細画面。
- 関連設計書: `api-design.md §2.3`、`data-model.md §4.5 / §4.6 / §4.7 / §6`、
  `specification.md US-7 / US-8`。
- 前提: S12。
- タスク分割案:
  - T13-1 backend get-session (1 SELECT または最適化された複数 SELECT、
    所有権チェック、ハンドラ)
  - T13-2 frontend セッション詳細ページ
  - T13-3 結合テスト (他人のセッションで 404、空 blocks 返却)
- DoD: 他人のセッション ID で 404、`blocks: []` の空集約が正しく返る。

### S14 ブロック追加 (US-7)

- スコープ: `POST /api/v1/sessions/{id}/blocks`、ブロック追加 UI、
  上限 50。
- 関連設計書: `api-design.md §2.3 / §1.6 (`exceeds_max_blocks`)`、
  `data-model.md §4.6 / §9 (トランザクション境界、ギャップロック注意)`、
  `specification.md US-7 / §境界値表`。
- 前提: S13。
- タスク分割案:
  - T14-1 backend add-block
    (`application/usecases/add_block.rs`、`block_order` 採番手順は
    `data-model.md §9` に従う)
  - T14-2 frontend 追加ボタン + 種目ピッカ
  - T14-3 結合テスト (50 個目 OK、51 個目で
    `exceeds_max_blocks`)
- DoD: 上限 50 / 51 が Postman で検証。

### S15 セット追加 (US-7)

- スコープ: `POST /api/v1/blocks/{id}/sets`、セット追加 UI、必須計測
  項目チェック。
- 関連設計書: `api-design.md §2.4 / §1.6`、
  `data-model.md §4.7 / §9 (`workout_sets` 採番のロック手順)`、
  `specification.md US-7 / §境界値表`。
- 前提: S14。
- タスク分割案:
  - T15-1 backend add-set
    (`domain/session/workout_set.rs` 値オブジェクト、
    `application/usecases/add_set.rs`、ハンドラ)
  - T15-2 frontend SetEditor / AddSetButton
  - T15-3 結合テスト (必須 measurement 欠落 / 値の境界値)
- DoD: 必須計測欠落で 400 `missing_required_measurement`、各値の境界
  (0/1/N-1/N/N+1) が Postman で検証。

### S16 セット編集・削除 (US-8)

- スコープ: `PATCH /api/v1/sets/{id}`、`DELETE /api/v1/sets/{id}`、
  並び順変更、UI。
- 関連設計書: `api-design.md §2.4`、
  `data-model.md §4.7 / §9 (再採番)`、`specification.md US-8`。
- 前提: S15。
- タスク分割案:
  - T16-1 backend patch/delete-set + 並び順変更ユースケース
  - T16-2 frontend 編集 UI + 上下並び替え
  - T16-3 結合テスト (削除後の `set_order` 連番、並び替え後の連番)
- DoD: 削除や並び替え後の `set_order` が dense 整数 (0..N-1) を保つ。

### S17 ブロック編集・削除・並び替え (US-8)

- スコープ: `PATCH/DELETE /api/v1/blocks/{id}`、種目差し替え時の
  互換性チェック、UI。
- 関連設計書: `api-design.md §2.3`、`data-model.md §4.6 / §9`、
  `specification.md US-8`。
- 前提: S15。
- タスク分割案:
  - T17-1 backend patch/delete-block + 並び替え + 互換性チェック
  - T17-2 frontend ブロック編集 UI
  - T17-3 結合テスト (互換性なしの差し替えで 400)
- DoD: 並び順 dense 維持、互換性違反のエラーが Postman で検証。

### S18 セッション編集・終了・削除 (US-7 / US-8)

- スコープ: `PATCH /api/v1/sessions/{id}`、`POST .../end`、
  `DELETE .../`、UI。
- 関連設計書: `api-design.md §2.3 / §1.6 (`before_start`)`、
  `data-model.md §4.5 / §7 (カスケード)`、`specification.md US-7 / US-8`。
- 前提: S13。
- タスク分割案:
  - T18-1 backend patch/end/delete-session
  - T18-2 frontend 編集・終了・削除 UI
  - T18-3 結合テスト (`ended_at < started_at` で 400、削除後カスケード)
- DoD: `ended_at < started_at` で 400、削除で blocks/sets もカスケード。

### S19 履歴 (日付別) (US-9)

- スコープ: `GET /api/v1/history/sessions`、カーソルページング、
  日付フィルタ、履歴一覧 UI。
- 関連設計書: `api-design.md §2.6`、`data-model.md §6 / §8 (カーソル設計)`、
  `specification.md US-9`。
- 前提: S18。
- タスク分割案:
  - T19-1 backend list-history (カーソル + `from`/`to` フィルタ、
    summary 形 DTO)
  - T19-2 frontend 履歴一覧 + 無限スクロール / Load more
  - T19-3 結合テスト (日付境界、カーソル前後の重複なし)
- DoD: 1 ページ最大件数の境界、空ページ、`from`/`to` 範囲が Postman で
  検証。

### S20 履歴 (種目別 + ツリー集約) (US-10)

- スコープ: `GET /api/v1/history/exercises/{id}`、`include_descendants`
  クエリ、`previous_summary`、種目別履歴ビュー UI。
- 関連設計書: `api-design.md §2.6 (`previous_summary` の返却粒度を含む)`、
  `data-model.md §4.6 / §6 / §8`、`specification.md US-10`。
- 前提: S19、S11。
- タスク分割案:
  - T20-1 backend list-history-by-exercise (再帰 CTE で子孫含む、
    `previous_summary` は直近 1 ブロックの全セットを返す)
  - T20-2 frontend 種目別履歴ページ + ツリー集約モード切替
  - T20-3 結合テスト (リーフ種目で `include_descendants` の有無で結果同一)
- DoD: 単一種目 / ツリー集約モードでアイテム数差が出る、リーフは差が
  出ない。`previous_summary.sets` が直近 1 ブロックの全セットになる。

### S21 PWA shell (NF)

- スコープ: `manifest.json`、Service Worker (CacheFirst assets / Network
  Only API)、インストール可能性の確認。
- 関連設計書: `architecture.md §PWA 方針`、`specification.md NF`。
- 前提: S05〜S20 (画面が出揃っていること)。
- タスク分割案:
  - T21-1 PWA 設定 (`vite.config.ts` の `vite-plugin-pwa` 既導入分の有効化、
    `frontend/public/manifest.json`、アイコン整備)
  - T21-2 Service Worker キャッシュ戦略の検証 (DevTools)
  - T21-3 結合テスト不要 (UI / DevTools 確認)
- DoD: Lighthouse PWA カテゴリで Installable + Service Worker active。

### S22 レート制限 (NF)

- スコープ: `/web/v1/login` / `/web/v1/signup` の 429 レスポンス、
  メモリ内 token bucket。
- 関連設計書: `api-design.md §1.6 (`rate_limit_exceeded`)`、
  `architecture.md §セキュリティ責務マップ`、本書 §4 ADR #6 (レート制限はメモリ内)。
- 前提: S01、S02。
- タスク分割案:
  - T22-1 backend tower middleware で IP / handle 単位のバケット
  - T22-2 結合テスト (規定回数超で 429、復帰)
- DoD: login の同一 IP / 1 分 10 回超、signup の同一 IP / 5 回超で 429。

### S23 構造化ログ整備 (NF)

- スコープ: `tracing` での JSON 構造化ログ、PII (handle / password / token
  raw 値) を出さない。
- 関連設計書: `architecture.md §オブザーバビリティ / §セキュリティ責務マップ`。
- 前提: 全 API スライス完了 (= S22 まで)。
- タスク分割案:
  - T23-1 backend tracing-subscriber 設定 + フィルタ
  - T23-2 ハンドラ群への `#[tracing::instrument]` 付与レビュー
- DoD: stdout に JSON 1 行 / リクエスト、PII が一切含まれない (grep で確認)。

### S24 E2E グリーン化 (NF)

- スコープ: `tests/integration/triary.postman_collection.json` を
  GitHub Actions で実行、fail で CI red。
- 関連設計書: 既存の `.github/workflows/ci.yml`、Newman 実行系の整備、
  `CLAUDE.md §Common commands`。
- 前提: 全機能スライス完了。
- タスク分割案:
  - T24-1 GHA workflow に Newman ステップ追加 (DB セットアップ含む)
  - T24-2 fixture 投入方法 (signup 経由) の pre-request スクリプト整備
- DoD: PR ごとに Postman / Newman が green であることが必須 CI に組み込まれる。

### S25 UI 仕上げ + アクセシビリティ (NF)

- スコープ: `role` / `aria-*`、空状態、ローディング、エラー UX 統一。
- 関連設計書: `architecture.md §フロントエンドアーキテクチャ`、
  `specification.md NF`。
- 前提: S21 (PWA shell ができていること)。
- タスク分割案:
  - T25-1 共通 empty / loading / error コンポーネント整備
  - T25-2 各画面への適用 + a11y 監査 (axe DevTools)
- DoD: 主要画面で axe critical issue なし。

---

## 4. ADR 候補

本計画レベルで決めた／確認した判断。

1. **共通基盤 (P0) を先に終わらせる** — 後から横断改修するコストが大きい。
2. **エラー envelope は単一・複数共に `errors[]` 配列** — 既存 `AppError` を P0-A で置換。
3. **OpenAPI 1 ファイル維持** (MVP) — 分割は MVP 後に検討。
4. **DB マイグレーションは「目的単位」** — ファイル名で意図を表現。
5. **依存追加は本計画レベルでは確定しない** — 各スライスで必要時に個別ユーザー確認。`vite-plugin-pwa` は `architecture.md §コンテキスト` で既導入のため対象外。
6. **レート制限は MVP ではメモリ内** — Redis 等の外部依存は追加しない。
7. **PWA は CacheFirst (assets) + Network Only (API)** — オンライン前提仕様の踏襲。
8. **S09 クローン suffix リトライ上限 = 5 回** — 仕様 NF 同時利用ユーザー数「想定 10 人未満」(MVP 規模) で race の発生確率は実質ゼロ、保守的バッファとして 5 回、超えたら `UseCaseError::Internal`。MVP 後にスケールする場合は見直す。

---

## 5. 残課題

実装スライス着手時にユーザーへ最終確認するもの。「項目」列に取り消し線が
引かれている行は本ブランチのレビュー過程で確定済み (検討先列にその旨)、
それ以外は実装着手時の暫定値。

| 項目 | 検討先 | 暫定値 |
|---|---|---|
| プリセット種目正式リスト | P0-D 着手時にレビュー | 15 種目案 (本書 §5.4) |
| 予約語の正式リスト | S01 着手時 | `admin / api / system / triary / root` |
| Argon2id パラメータ | S01 着手時 | m=19456, t=2, p=1 (`OWASP-2024` 準拠) |
| `note` の最大長 | S12 着手時 | 2000 文字 (TEXT) |
| `block_order` 再採番の SQL | S16 / S17 着手時 | 「全行 UPDATE」を採用、トランザクション内 |
| ~~ブロック上限超過の error code~~ | 確定済み (`api-design.md §1.6 / §2.3`) | `exceeds_max_blocks` on `blocks` |
| ~~履歴の日付フィルタ仕様~~ | 確定済み (`api-design.md §2.6`) | `from` / `to` クエリパラメータ (S19) |
| ドラッグ並び替えの依存追加 | S16 / S17 着手時 | 既定は不採用 (上下ボタン) |
| ~~PWA プラグイン (`vite-plugin-pwa`)~~ | 確定済み (`architecture.md §コンテキスト`) | 既導入 |
| Postman 結合テストの fixture 投入方法 | S24 着手時 | Newman pre-request で signup 経由 |

### 5.4 プリセット種目 初版リスト案 (15 種目)

P0-D 着手時にユーザーへ最終確認する素案。各種目の `parent_id` /
`measurement_kinds` は以下の通り。

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
