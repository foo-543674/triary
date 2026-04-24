# 設計フェーズ引き継ぎ資料

次の設計タスクを担当する AI が最初に読む。プロジェクト全体の前提は
`CLAUDE.md` と `.contexts/concept.md` を参照。

## プロジェクト概要（ごく簡潔に）

triary — 筋トレ記録・スコアリング PWA。個人プロジェクトだが public 公開。

- Backend: Rust + Axum + MySQL（生 SQL マイグレーション、sqlx-cli）
- Frontend: TypeScript + SolidJS + Tailwind + CSS Modules（Biome のみ）
- API: OpenAPI スキーマファースト
- 統合テスト: Postman / Newman（言語非依存）
- 認証: Cookie + サーバーセッション（同一オリジン配信前提、`SameSite=Lax`）
- TZ: サーバーは持たない、フロントで完結

## 設計フェーズの進捗

| フェーズ | 状態 | 成果物 |
|---|---|---|
| 要件定義 | 完了 | `.contexts/requirements.md` |
| 仕様化 | 完了 | `.contexts/specification.md` |
| アーキテクチャ設計 | 完了 | `.contexts/architecture.md` |
| API 設計 | 完了 | `.contexts/api-design.md` |
| **データモデル設計** | **完了（最新）** | `.contexts/data-model.md` |
| コンポーネント設計 | 未着手（次タスク） | — |
| 実装計画 | 未着手 | — |

## 次のタスク: データモデル設計

**使用スキル**: `foo-skills:design-data-model`

### 順序の注意

triary はスキーマファースト方針だが、今回は **API 設計が先に完了している**。
そのためデータモデル設計時は「API 設計で確定した外部仕様を壊さない」こと
が制約になる。API 設計を変えたくなった場合は勝手に変えず、ユーザーに確認
してから `api-design.md` を更新すること。

### データモデル設計で決める項目

`api-design.md §7` と `architecture.md §設計フェーズ後段に送る決定事項`
で後段に送られた決定事項：

1. **プログレッションツリーの DB 表現**
   - 隣接リスト / クロージャテーブル / マテリアライズドパス等を MySQL 8.0
     制約を踏まえて選定
   - `GET /api/v1/exercises/{exercise_id}/tree` を効率的に返せること
     （ツリー全体を 1 回で取得するエンドポイント）
   - `PATCH /api/v1/exercises/{exercise_id}` での `parent_id` 付け替え
     （サブツリーごと移動）を現実的なコストで実現できること
   - 深さ最大 8 段、1 親あたり子数最大 16（spec §主要な前提 既決）
   - 循環検出ができること
   - プリセット種目を親にしてユーザー種目をぶら下げられること（US-6）

2. **計測項目セット (measurement_kinds) の DB 表現**
   - 種目テーブルに列で持つか、別テーブルにするか
   - 将来の計測項目追加（距離、心拍、RPE 等）で既存記録を壊さない拡張性
   - `{kind, required}` の組（MVP では kind は reps / weight / time の 3 種）

3. **プリセット種目の保持方法**
   - 同一テーブルに `owner` 列で区別する vs 別テーブル
   - `exercises.owner` は API 上 `"preset" | "user"` で表現される（api §2.2）
   - プリセットは SQL シードで投入（spec US-4）、ユーザーが編集しようと
     したら API は 403 `preset_not_modifiable` を返す

4. **Session 集約の正規化**
   - Session, ExerciseBlock, WorkoutSet の 3 テーブル
   - arch §境界定義で Session 集約配下の ExerciseBlock / WorkoutSet は
     内部エンティティと既定
   - API 上は `block` / `set` は疑似トップレベル（`/api/v1/blocks/{id}`,
     `/api/v1/sets/{id}`）として触れるが、所有関係 `block.session_id →
     session.user_id` はサーバー側で必ず照合する
   - `order` カラム（ブロック内のセット順、セッション内のブロック順）の
     再採番戦略

5. **WorkoutSet の計測項目値の保持**
   - `reps: INT NULL`, `weight_kg: DECIMAL NULL`, `duration_seconds: INT NULL`,
     `interval_seconds: INT NULL` で持つ（疎な列持ち）か、EAV にするか
   - 符号付き weight で加重 / 補助を表現（spec §主要な前提、範囲 -500.0〜999.9）
   - 回数 0〜9999、時間 0〜86400、インターバル 0〜3600

6. **ユーザー認証関連テーブル**
   - `users`: `user_id` (PK、小文字正規化済み)、`password_hash` (argon2id)
   - `user_sessions`: セッショントークン (256bit)、`user_id`、有効期限
   - セッショントークンは「DB から行を削除すれば即時失効」が要件（arch §認証）

7. **ID 体系**
   - API 上は `{prefix}_{ulid}` 形式（`usr_` / `exr_` / `ses_` / `blk_` / `set_`）
   - DB 内部での持ち方（CHAR(26) vs BINARY(16)）を決める
   - 主キー戦略（ULID をそのまま PK にするか、別に BIGINT AUTO_INCREMENT
     を PK にしてビジネス ID を UNIQUE にするか）

8. **カーソルページネーションの実体**
   - `/api/v1/history/sessions` と `/api/v1/history/exercises/{id}` で
     カーソル方式採用（api §1.5）
   - 不透明 base64url、デコード失敗で 400 `invalid_cursor`
   - 内部キーの選び方（`(workout_date DESC, session_id DESC)` 等の複合キー）
   - インデックス設計

9. **各エンドポイントのトランザクション境界**
   - Session 集約の更新は 1 トランザクションに閉じる（複数 block / set
     を同時操作する場合）
   - Exercise の `parent_id` 付け替えは循環検出と一緒にアトミックに

10. **カスケード削除の設計**
    - User 削除時: 全データ削除（MVP はユーザー削除 UI 自体ないが、運用
      手動対応を想定）
    - Exercise 削除時: 紐づく `exercise_block` / `workout_set` カスケード
      削除、子の exercise は親 NULL で孤立（api §2.2 exercises DELETE、
      spec US-5）
    - Session 削除時: 配下の block / set カスケード削除
    - Block 削除時: 配下の set カスケード削除
    - MVP はソフトデリートなし（spec 既決）

11. **マイグレーション方針**
    - `backend/migrations/` に連番 SQL ファイル
    - 初回マイグレーションでスキーマ + プリセット種目シード
    - プリセット種目の正式リストは仕様書 §未決事項 に残置、設計フェーズ
      で初版作成が必要

### 非機能要件

- 1 ユーザー: セッション 1 万件、種目ブロック 10 万件まで動作保証
  (spec §非機能 定量化版)
- 主要 GET は p95 300ms 以内、記録保存は p95 500ms 以内
- 同時ユーザー数は数名規模、スケールアウト不要
- 行レベルで `user_id` 分離（他人のデータには絶対にアクセスできない）

### 成果物

`.contexts/data-model.md` に書き出す。他の `.contexts/*.md` と同じ文書ス
タイル（日本語、見出し、表、ADR 候補セクション付き）。

## 全設計文書の参照マップ

| 文書 | 内容 | 役割 |
|---|---|---|
| `concept.md` | プロジェクトのコンセプトと製品背景 | 最上位 |
| `requirements.md` | 要件 (Must / Should / Could / Out of Scope、F1〜F4、NF) | 何を作るか |
| `specification.md` | 受け入れ基準粒度までの仕様 (US-1〜US-10、境界値) | どう振る舞うか |
| `architecture.md` | 4 層レイヤ、集約、CQRS 判断、エラー境界、フロント構成、ADR | どう構造化するか |
| `api-design.md` | HTTP API の完全仕様（`/web/v1` + `/api/v1` 分割） | 外部インターフェース |
| `setup-plan.md` | 環境構築計画（既存） | セットアップ |

## 重要な既決事項（データモデル設計で踏襲すべきもの）

### アーキテクチャ由来

- **ドメイン層はリッチ**（CRUD 直叩きを避ける）。Input → Validator →
  Validated → Factory / `apply_*` の型付きパイプライン（arch ADR #8）
- **集約境界**: User / Exercise / Session の 3 つ。集約間は ID 参照のみ
  （arch §境界定義）
- **永続化ポートは application 層**: `UserRepository`,
  `ExerciseRepository`, `SessionRepository`, `SessionStore` は
  `application/ports/` に定義、`infrastructure/repositories/` で実装
- **Clock / PasswordHasher は domain 層のポート**: 現実の概念なので
  （arch ADR #9）
- **CQRS は採用しない**が、Command / Query ハンドラは分けて配置して
  おく（arch §CQRS）
- **エラーは 3 段階変換**: infrastructure → domain → application → http
  （arch §エラー境界）

### API 設計由来（api-design.md）

- **エラーは `errors[]` 配列で複数返却**。domain Validator は `Result<_,
  Vec<DomainError>>` を返して fail-fast しない（api §1.6）
- **1 フィールド内の複数制約違反は個別コードに分解**
  （`exercise_name_too_long` と `exercise_name_invalid_charset` を別コード）
- **HTTP ステータスはプロトコル層限定**: ドメインバリデーションは 400
  に集約、404 はパスの不存在限定、409 は楽観ロック衝突のみ予約（MVP 未
  使用）、403 はプリセット編集のみ
- **プリセット種目は API 上 `owner: "preset" | "user"` で表現**。DB 表現
  の内部詳細は API に漏らさない
- **ボディで参照された ID の不存在は 400** で、パスの `not_found` とは
  別コード（`parent_exercise_not_found`, `exercise_not_found_in_body` 等）

## API 設計の最終サマリ（参考）

- **パスファミリ 2 分割**:
  - `/web/v1/*` — PWA 専用 BFF、動詞パス（signup, login, logout, me, change-password）
  - `/api/v1/*` — REST リソース制御（exercises, sessions, blocks, sets, history）
- **エンドポイント数**: 約 24 本
- **ID**: `{prefix}_{ulid}` 形式
- **ページネーション**: 履歴系のみカーソル方式、デフォルト 30 件

## 注意事項（次 AI への申し送り）

1. `.contexts/` 配下の既存文書を **勝手に書き換えない**。矛盾が見つかった
   場合はユーザーに確認してから修正する
2. データモデル設計の途中で API 設計を変えたくなるケース（例: あるエンド
   ポイントが DB から効率良く取れないことが判明）は、ユーザーに両方の
   案を提示して判断を仰ぐ
3. 日本語で書く（既存文書と揃える）
4. 文書末尾に「ADR 候補」セクションを設け、主要な設計判断を箇条書きで残す
5. 「設計フェーズ後段に送る決定事項」セクションを設け、コンポーネント設計・
   実装フェーズに送るものを明示する
