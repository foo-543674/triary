# triary データモデル設計 (MVP)

`requirements.md` / `specification.md` / `architecture.md` / `api-design.md`
を踏まえた MVP のデータベーススキーマ設計。対象 DB は **MySQL 8.0**、
マイグレーションは **素の SQL**（`sqlx-cli` 管理）。

## 0. スコープ宣言

**決める**:
- テーブル定義（カラム・型・制約・インデックス）
- リレーション（外部キー・カスケード）
- プログレッションツリーと計測項目セットの DB 表現
- プリセット種目の保持方法
- ID の DB 内表現
- カーソルページネーションの内部キー
- トランザクション境界の骨格
- マイグレーション方針

**決めない**（他フェーズに任せる）:
- Repository / Port の配置（`architecture.md` 既決）
- Validator / Factory の構造（同上）
- SQL クエリの具体的な書き方（実装フェーズ）
- Argon2 パラメータ値（実装フェーズ）
- プリセット種目の完全リストの文言調整（マイグレーション作成時）

## 1. 前提と既決事項の整理

| 出所 | 既決事項 | データモデルへの影響 |
|---|---|---|
| arch §集約 | User / Exercise / Session の 3 集約 | 集約間は ID 参照のみ。集約内のエンティティ (`ExerciseBlock` / `WorkoutSet`) は `Session` 経由でのみ触る |
| arch §認証 | サーバーセッション 256bit、DB 行削除で即時失効 | `user_sessions` テーブル必須 |
| arch エラー境界 | ドメイン層はリッチで貧血にしない | スキーマは不正状態を型・制約で排除する方向で設計 |
| api §3 | ID は `{prefix}_{ulid}` 形式 | DB 内は BINARY(16) で 16 バイト ULID として持つ |
| api §2.2 | `owner: "preset"\|"user"` が API に出る | DB 内部表現は同一テーブル + NULL 判定で吸収 |
| api §1.5 | 履歴系のみカーソル方式、デフォルト 30 件 | `(workout_date DESC, id DESC)` 複合キー系のインデックス必須 |
| spec 主要前提 | 重量 -500.0〜999.9、0.1 刻み / 回数 0〜9999 / 時間 0〜86400 秒 / インターバル 0〜3600 秒 | 数値型で保持（文字列化しない）+ CHECK 制約で範囲担保 |
| spec 主要前提 | ツリー深さ最大 8、1 親あたり子数最大 16 | アプリ層で強制。深さ・子数は小さいので DB 側にハード制約を置かない |
| spec §非機能 | 1 ユーザー セッション 1 万件、種目ブロック 10 万件まで動作保証 | 主要 WHERE 条件（`user_id`, `workout_date`, `exercise_id`）にインデックス必須 |
| spec US-5 | 種目削除時、配下の block / set はカスケード、子種目は親 NULL で孤立 | `exercises.parent_id` は `ON DELETE SET NULL`、`exercise_blocks.exercise_id` は `ON DELETE CASCADE` |

## 2. 命名と語彙

- テーブル名: **snake_case、複数形**（`users`, `exercises`, `workout_sets` …）
- カラム名: snake_case、省略しない（`password_hash`, `workout_date`）
- 主キー: `<単数形>_id`（`user_id`, `exercise_id`）。集約内部エンティティ
  も同じ命名（`block_id`, `set_id`）
- 論理削除カラム (`deleted_at`) は **一切使わない**。MVP はすべて物理削除
  （spec 既決）
- タイムスタンプ: `created_at` / `updated_at` は **UTC** の `DATETIME(3)`。
  arch §認証の「サーバーは TZ を持たない」に整合
- 日付: `workout_date` は **`DATE` 型**（spec 既決、文字列化しない）

## 3. ID の DB 内表現

### 方針

- API レイヤでは `{prefix}_{ulid}` 文字列として扱う
- DB 内では **`BINARY(16)`** に ULID を raw バイト列で格納する
- 主キー = ビジネス ID。追加の BIGINT AUTO_INCREMENT は**採用しない**

### 理由

- **CHAR(26) と比較**: 16 バイト vs 26 バイト。種目 10 万件規模の履歴テー
  ブルで主キー・FK インデックスのサイズ差が 40% 近く出る。B-tree ページ
  効率に直接効く
- **BIGINT 代理キーを併用しない理由**: ULID は時系列ソート可能 (MSB が
  時刻) なので代理キーを追加するメリットがない。JOIN 列が 2 本になり
  インデックスも増える
- **プレフィックスは API 層の関心事**: `usr_` / `exr_` 等は
  `interfaces/http/dto/` で付け外しする。DB スキーマには出さない
- **ULID の時系列ソート性**: `ORDER BY exercise_id DESC` は近似的に
  「新しい順」。履歴系カーソルの tiebreaker として活用する

### 補助ユーティリティ

- Rust 側: `ulid::Ulid` の `to_bytes()` / `from_bytes()` を使う。sqlx は
  `[u8; 16]` として扱える
- 可読性のため、開発用ビューで `HEX(user_id)` を出す運用 (本文では定義しない)

## 4. テーブル定義

以下は**論理設計**。DDL はマイグレーション作成時に最終形へ整える。
InnoDB / `utf8mb4` / `utf8mb4_0900_ai_ci` 前提。

### 4.1 `users`

```sql
CREATE TABLE users (
  user_id         BINARY(16)   NOT NULL,           -- ULID (内部主キー)
  user_handle     VARCHAR(32)  NOT NULL,           -- 小文字正規化済み、URL 露出側
  password_hash   VARCHAR(255) NOT NULL,           -- argon2id のフルエンコード文字列
  created_at      DATETIME(3)  NOT NULL,
  updated_at      DATETIME(3)  NOT NULL,
  PRIMARY KEY (user_id),
  UNIQUE KEY uk_users_handle (user_handle),
  CONSTRAINT ck_users_handle CHECK (
    CHAR_LENGTH(user_handle) BETWEEN 3 AND 32
    AND user_handle REGEXP '^[a-z0-9_-]+$'
  )
) ENGINE=InnoDB;
```

- `user_handle`: spec US-1「ユーザー ID は大文字小文字を区別しない」に
  対応。**保存時に小文字正規化** し、DB 側は単純な UNIQUE で担保する
- `password_hash`: Argon2id の PHC 文字列（`$argon2id$v=19$...`）。長さ
  は通常 100〜110 文字程度だが、パラメータ変更を考慮して 255 に
- 予約語チェックは CHECK 制約では表現しづらい（リストが長くなる・将来
  変更したくなる）ので **アプリケーション層で担保**。予約語リストは
  Rust 定数として持ち、Validator で弾く

### 4.2 `user_sessions`

```sql
CREATE TABLE user_sessions (
  session_token_hash  BINARY(32)   NOT NULL,       -- SHA-256(raw_token_256bit)
  user_id             BINARY(16)   NOT NULL,
  created_at          DATETIME(3)  NOT NULL,
  expires_at          DATETIME(3)  NOT NULL,
  last_seen_at        DATETIME(3)  NOT NULL,
  PRIMARY KEY (session_token_hash),
  KEY ix_user_sessions_user_id_expires (user_id, expires_at),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

- **トークンそのものではなくハッシュを保存**: DB ダンプ流出時にセッショ
  ン乗っ取りを許さない。ハッシュは SHA-256 で十分（HMAC は不要、平文
  トークンの衝突耐性があれば全数探索不可能）
- 主キーにハッシュを採用することで、Cookie 検証時の SELECT が O(1)
- `user_id, expires_at` インデックスは「ユーザーの有効セッション洗い替え」
  「期限切れセッション一括削除」のため
- `ON DELETE CASCADE`: ユーザー削除時に全セッション破棄（MVP にユーザー
  削除 UI はないが、運用削除のため）

### 4.3 `exercises`

```sql
CREATE TABLE exercises (
  exercise_id             BINARY(16)  NOT NULL,     -- ULID
  owner_user_id           BINARY(16)  NULL,         -- NULL = プリセット
  name                    VARCHAR(64) NOT NULL,
  name_normalized         VARCHAR(64) GENERATED ALWAYS AS (LOWER(name)) STORED,
  parent_exercise_id      BINARY(16)  NULL,         -- プログレッション親
  created_at              DATETIME(3) NOT NULL,
  updated_at              DATETIME(3) NOT NULL,
  PRIMARY KEY (exercise_id),
  KEY ix_exercises_owner (owner_user_id),
  KEY ix_exercises_parent (parent_exercise_id),
  -- ユーザー内スコープの名前ユニーク (プリセットは owner NULL のため別扱い)
  UNIQUE KEY uk_exercises_user_name (owner_user_id, name_normalized),
  -- プリセット内のみで効く名前ユニーク (generated column で実現)
  -- → 実体は preset_name_normalized: owner が NULL のときだけ値を持つ
  CONSTRAINT ck_exercises_name CHECK (CHAR_LENGTH(name) BETWEEN 1 AND 64),
  CONSTRAINT fk_exercises_owner
    FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_exercises_parent
    FOREIGN KEY (parent_exercise_id) REFERENCES exercises(exercise_id) ON DELETE SET NULL
) ENGINE=InnoDB;
```

補助カラム（上記テーブルに追加する generated column）:

```sql
ALTER TABLE exercises
  ADD COLUMN preset_name_normalized VARCHAR(64)
    GENERATED ALWAYS AS (CASE WHEN owner_user_id IS NULL THEN LOWER(name) END) STORED,
  ADD UNIQUE KEY uk_exercises_preset_name (preset_name_normalized);
```

#### プリセット種目の保持方法

- **同一テーブル + `owner_user_id` NULL でプリセットを表現** する。API
  層の `owner: "preset" | "user"` はこの NULL 判定で吸収する
- **別テーブルにしない理由**:
  - `parent_exercise_id` がプリセットとユーザー種目の両方を指せる必要が
    ある (US-6「プリセットゴールの下に自分用段階をぶら下げる」)。別
    テーブルにすると「参照先は 2 テーブルのどちらか」というポリモーフィック
    FK となり外部キー制約が効かなくなる (アンチパターン回避)
  - `exercise_blocks.exercise_id` も同様に両方を指す必要がある
- **同一テーブルの代償**: `owner_user_id IS NULL` の検索と `owner_user_id = ?`
  の検索が混在する。`ix_exercises_owner` は NULL を含むが、MySQL の
  InnoDB は NULL もインデックスできるので問題ない

#### 名前ユニーク制約の設計

spec US-5 で「種目名はユーザー内（プリセット含む）でユニーク」と既決。
これを DB 制約だけで完全表現するのは難しい (プリセットとユーザー名衝突
を単一の UNIQUE で表現できない) ので、**2 層の DB 制約 + 1 層のアプリ
チェック** で担保する:

| 層 | 対象 | 手段 |
|---|---|---|
| DB | ユーザー内のユーザー種目名の一意 (`owner_user_id = X` かつ同名複数を拒否) | `uk_exercises_user_name (owner_user_id, name_normalized)` |
| DB | プリセット同士の名前重複禁止 | `uk_exercises_preset_name (preset_name_normalized)` (generated column で NULL 以外にユニーク効かせる) |
| アプリ | ユーザー種目名がプリセット名と衝突しないこと | `POST/PATCH` ハンドラが INSERT/UPDATE 前に `SELECT 1 FROM exercises WHERE owner_user_id IS NULL AND name_normalized = LOWER(?)` を実行 |

- プリセットは SQL シードで投入され運用中は変更されないので、ユーザー
  種目作成時のアプリレベル事前 SELECT は race condition を起こさない
- `name_normalized` を `LOWER(name)` にする (generated stored column) こ
  とで、大文字小文字を区別しないユニーク判定が DB 側の通常 UNIQUE で効く

#### プログレッションツリーの表現: **隣接リスト + 再帰 CTE**

```
exercises.parent_exercise_id  →  自己参照
                                  最上位ルートは NULL
```

**選定理由**:

| 選択肢 | 採否 | 理由 |
|---|---|---|
| **隣接リスト (parent_id のみ)** | **採用** | シンプル。MySQL 8.0 の `WITH RECURSIVE` で部分木取得も循環検出も表現可能。スケール (種目数 数十〜数百) で十分速い |
| クロージャテーブル | 不採用 | 書き込み時の closure 再計算が複雑。triary の種目数規模ではオーバーキル。捨てやすさ (§6) の観点で、後から必要になれば **書き込み時に同期する View / Read Model** として追加可能 |
| マテリアライズドパス (`/root/a/b`) | 不採用 | 改名・付け替えで全子孫のパス書き換えが発生。ID が ULID (長い) でパスがさらに膨らむ |
| MySQL `ltree` 相当 | 不採用 | MySQL には native にない。エミュレーションは茨の道 |

**使う再帰 CTE の形**:

- `/exercises/{id}/tree` (子孫取得):
  ```sql
  WITH RECURSIVE subtree(exercise_id, parent_exercise_id, depth) AS (
    SELECT exercise_id, parent_exercise_id, 0
      FROM exercises WHERE exercise_id = ?
    UNION ALL
    SELECT e.exercise_id, e.parent_exercise_id, s.depth + 1
      FROM exercises e JOIN subtree s ON e.parent_exercise_id = s.exercise_id
    WHERE s.depth < 8
  )
  SELECT * FROM subtree;
  ```

- 循環検出 (`parent_exercise_id` 付け替え時): 移動対象 `X` を `Y` の子に
  しようとする場合、`X` の子孫集合に `Y` が含まれているかを上記と同様の
  CTE で確認して含まれていれば `creates_cycle` エラー
- 深さ上限検証: 新親 `Y` のルートまでの深さ (祖先方向の CTE) + 移動対象
  `X` を根とする部分木の深さ + 1 が 8 を超えたら `exceeds_max_depth`
- 子数上限検証: `SELECT COUNT(*) FROM exercises WHERE parent_exercise_id = ?`
  が 16 を超えたら `exceeds_max_children`

**インデックス**: `parent_exercise_id` に単独インデックス。CTE の再帰ス
テップは `parent_exercise_id = s.exercise_id` で索引参照する

### 4.4 `exercise_measurement_kinds`

```sql
CREATE TABLE exercise_measurement_kinds (
  exercise_id   BINARY(16) NOT NULL,
  kind          ENUM('reps','weight','time') NOT NULL,
  is_required   BOOLEAN    NOT NULL,
  PRIMARY KEY (exercise_id, kind),
  CONSTRAINT fk_emk_exercise
    FOREIGN KEY (exercise_id) REFERENCES exercises(exercise_id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

#### 計測項目セットを別テーブルにする理由

- **種目テーブルの列持ち (`has_reps BOOL`, `reps_required BOOL`, ...) は
  不採用**。逃げ C (直交する次元の排他列挙化) の亜種。新しい計測項目
  (距離、心拍、RPE) を追加するたびに `exercises` 本体に 2 列追加する
  マイグレーションが必要になる。設計的天井を自分で作ることになる
- **JSON カラム (`measurement_kinds JSON`) は不採用**。制約 (kind が
  enum のいずれか、required は bool) を DB 側で保証できない。CHECK 制約
  で書くことも可能だが、MySQL の JSON CHECK は書きづらく、結局アプリ
  側でバリデータ再実装になる
- **別テーブル**: `(exercise_id, kind)` の複合主キーで「同じ種目に同じ
  kind が 2 行入らない」ことを DB が保証する。将来 `'distance'` などを
  追加するには ENUM に値を足すだけ。既存データへの影響ゼロ

#### 「最低 1 件必要」の担保

spec US-5: 「計測項目を 1 つも選ばずに保存しようとするとエラー」。これ
は DB 制約としては表現できないので **アプリケーション層** (ドメインの
`ExerciseMeasurementKinds` 値オブジェクトの Validator) で担保する。
DB から読み込んだ行が 0 件の状態は「壊れている」と判断して `500` を
返す方向 (起きえない前提)。

### 4.5 `sessions`

```sql
CREATE TABLE sessions (
  session_id     BINARY(16)   NOT NULL,
  user_id        BINARY(16)   NOT NULL,
  workout_date   DATE         NOT NULL,
  started_at     DATETIME(3)  NOT NULL,
  ended_at       DATETIME(3)  NULL,
  note           TEXT         NULL,
  created_at     DATETIME(3)  NOT NULL,
  updated_at     DATETIME(3)  NOT NULL,
  PRIMARY KEY (session_id),
  KEY ix_sessions_user_date (user_id, workout_date DESC, session_id DESC),
  KEY ix_sessions_user_started (user_id, started_at),
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT ck_sessions_end_after_start CHECK (
    ended_at IS NULL OR ended_at >= started_at
  )
) ENGINE=InnoDB;
```

- **`workout_date` は DATE 型**。spec §主要前提で既決。文字列化は逃げ
  B (数値的構造の文字列化) に該当するので避ける
- **`started_at` / `ended_at` は DATETIME(3) UTC**。arch / spec 既決の
  「サーバーは TZ を持たない」を尊重。MySQL の `TIMESTAMP` は暗黙 TZ 変
  換があるので **採用しない**。`DATETIME` は無変換
- **`note TEXT`**: 入力上限は API バリデータで担保 (spec では明示なし、
  後で 2000 文字程度を設計フェーズ後段で決める余地)
- **複合インデックス `(user_id, workout_date DESC, session_id DESC)`**:
  `GET /api/v1/history/sessions` のカーソルページネーション専用。降順
  インデックスは MySQL 8.0 から正式サポート
- **`started_at <= ended_at` は DB の CHECK で担保**。逃げ F (制約を型で
  表現せず Nullable で逃げる) を避ける。Null は「未終了」という意味を
  持ち、Null 許容は適切

### 4.6 `exercise_blocks`

```sql
CREATE TABLE exercise_blocks (
  block_id        BINARY(16)  NOT NULL,
  session_id      BINARY(16)  NOT NULL,
  exercise_id     BINARY(16)  NOT NULL,
  block_order     SMALLINT    NOT NULL,         -- 0..(session 内の block 数 - 1)
  workout_date    DATE        NOT NULL,         -- sessions.workout_date の denorm (履歴クエリ用)
  created_at      DATETIME(3) NOT NULL,
  updated_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (block_id),
  UNIQUE KEY uk_blocks_session_order (session_id, block_order),
  KEY ix_blocks_exercise_date (exercise_id, workout_date DESC, block_id DESC),
  CONSTRAINT fk_blocks_session
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT fk_blocks_exercise
    FOREIGN KEY (exercise_id) REFERENCES exercises(exercise_id) ON DELETE CASCADE,
  CONSTRAINT ck_blocks_order CHECK (block_order >= 0)
) ENGINE=InnoDB;
```

#### `workout_date` の denormalization

- `sessions.workout_date` を `exercise_blocks` 側にもコピーする
- **理由**: `GET /api/v1/history/exercises/{id}` は「ある種目 (または
  その子孫) のブロックを `workout_date DESC, block_id DESC` で降順に
  ページネーション」する。毎回 `sessions` と JOIN して `workout_date`
  で ORDER BY すると、カーソル条件のインデックスレンジスキャンが効か
  ない
- `(exercise_id, workout_date DESC, block_id DESC)` の複合インデックス
  があれば、JOIN なしで範囲スキャン 1 本で `limit 30` が完結する
- **同期コスト**: `sessions.workout_date` が PATCH されたとき、そのセ
  ッション配下の全 block の `workout_date` を同じトランザクションで
  UPDATE する必要がある。セッションあたりの block 数は実用上 50 程度
  なので同期コストは無視できる
- **原則との整合**: CQRS を正式採用していない (arch §CQRS) が、「書き
  込みフロー内での Read 最適化のための局所非正規化」はアーキテクチャ
  設計でも明示的に許容されている。ADR に判断を残す
- **リスク**: `sessions.workout_date` と `exercise_blocks.workout_date`
  が食い違う ("壊れた状態") を作らないため、PATCH ハンドラで必ず 1
  トランザクションでまとめて更新する

#### `block_order` の設計

- **dense integer (0, 1, 2, ...)** として持つ。並び替え時は同セッション
  配下の他ブロックの `block_order` を再採番 (インクリメント/デクリメント)
- **fractional ordering (LexoRank / 小数ランク) は採用しない**。1 セッ
  ションあたりのブロック数は実用上 50 まで (spec §主要前提) で小さい
  ため、dense 再採番のコストは無視できる。複雑な順序体系は捨てやすさを
  下げる
- `UNIQUE(session_id, block_order)` により順序重複を DB が防ぐ。再採番
  は「一旦 `block_order + 10000` に逃がして詰め直す」か、一時的にユニー
  ク制約違反を避けて順序適用する必要がある。**実装上のテクニック**で
  あってスキーマ設計の本質ではない (実装フェーズで処理する)

### 4.7 `workout_sets`

```sql
CREATE TABLE workout_sets (
  set_id              BINARY(16)   NOT NULL,
  block_id            BINARY(16)   NOT NULL,
  set_order           SMALLINT     NOT NULL,     -- 0..(block 内のセット数 - 1)
  reps                SMALLINT     NULL,         -- 0..9999
  weight_kg           DECIMAL(4,1) NULL,         -- -500.0..999.9
  duration_seconds    INT          NULL,         -- 0..86400
  interval_seconds    INT          NULL,         -- 0..3600
  created_at          DATETIME(3)  NOT NULL,
  updated_at          DATETIME(3)  NOT NULL,
  PRIMARY KEY (set_id),
  UNIQUE KEY uk_sets_block_order (block_id, set_order),
  CONSTRAINT fk_sets_block
    FOREIGN KEY (block_id) REFERENCES exercise_blocks(block_id) ON DELETE CASCADE,
  CONSTRAINT ck_sets_reps      CHECK (reps IS NULL OR reps BETWEEN 0 AND 9999),
  CONSTRAINT ck_sets_weight    CHECK (weight_kg IS NULL OR weight_kg BETWEEN -500.0 AND 999.9),
  CONSTRAINT ck_sets_duration  CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400),
  CONSTRAINT ck_sets_interval  CHECK (interval_seconds IS NULL OR interval_seconds BETWEEN 0 AND 3600),
  CONSTRAINT ck_sets_not_empty CHECK (
    reps IS NOT NULL OR weight_kg IS NOT NULL OR duration_seconds IS NOT NULL
  ),
  CONSTRAINT ck_sets_order     CHECK (set_order >= 0)
) ENGINE=InnoDB;
```

#### 計測項目値は **疎な列持ち** (EAV にしない)

- `reps`, `weight_kg`, `duration_seconds`, `interval_seconds` を
  **個別のカラム** として持つ。不要な項目は NULL
- **EAV パターン (`set_attributes(set_id, kind, value)`) は不採用**。
  - 型が混在 (INT, DECIMAL) するので value 列は文字列化せざるを得ない
    → 逃げ B (数値構造の文字列化) に該当
  - DB 側の CHECK 制約で範囲を担保できない
  - 読み込み時に GROUP BY / PIVOT が必要になり、単純な SELECT でセット
    1 行の全属性が取れない
- 現状の計測項目は **3 種類 (reps / weight / time) + インターバル** と
  小さく、将来の拡張 (distance, heart rate) も数種類の範囲。列持ちで
  十分に済む
- **将来の拡張手順**: 新しい計測項目を追加する場合、
  1. `workout_sets` に `<kind>_<unit> <type> NULL` を追加
  2. 範囲 CHECK を追加
  3. `exercise_measurement_kinds.kind` の ENUM に値を追加
  4. 既存行は NULL のまま → 破壊的変更にならない

#### 加重 / 補助の符号付き `weight_kg`

- 正値 = 加重（自重種目で +5.0kg の負荷）、負値 = 補助（アシスト懸垂の
  -10.0kg）
- spec §主要前提で既決
- **符号付き 1 フィールドにする理由**: `weight_kg` と `assist_kg` を
  分けると、両方が同時に入らない排他制約が必要になる (逃げ C の亜種)
- UI 上の「加重 / 補助」トグルは API レイヤより外 (フロント) で吸収する
  (api §S-3)

#### `ck_sets_not_empty` CHECK

- 全計測項目が NULL のセットは「意味のないデータ」なので DB レイヤで拒否
- 「必須計測項目が記録されているか」は種目依存なのでアプリ層 (Validator)
  で担保する。DB の CHECK は種目テーブルを参照できないため
- `interval_seconds` は 4 列の「not empty」判定に**含めない**。インター
  バルだけ記録されたセットは存在しないので (インターバルは他の計測値を
  補助する情報)

## 5. リレーション図 (テキスト)

```
users (1) ─┬─ (N) user_sessions          [CASCADE on user delete]
           │
           ├─ (N) exercises (owner)      [CASCADE]
           │       │
           │       └─ (N) exercise_measurement_kinds  [CASCADE]
           │
           └─ (N) sessions               [CASCADE]
                   │
                   └─ (N) exercise_blocks  [CASCADE]
                           │   ↑
                           │   └── exercise_id → exercises  [CASCADE]
                           │
                           └─ (N) workout_sets  [CASCADE]

exercises.parent_exercise_id → exercises.exercise_id  [SET NULL on delete]
```

- **集約境界と FK 方向の整合**: Session 集約内のテーブル
  (`sessions`, `exercise_blocks`, `workout_sets`) 間は CASCADE で一括
  操作される。Exercise 集約は別集約だが、ブロックから参照されるため
  CASCADE で「種目削除時に過去の記録も消す」(spec US-5) を実装する
- **集約間の ID 参照**: `exercise_blocks.exercise_id` は集約境界をまた
  ぐ参照。arch §境界では「集約間は ID 参照のみ」と決めているが、これは
  ドメインオブジェクトの話。DB レベルでは参照整合性のため FK を張る

## 6. インデックス設計サマリ

| テーブル | インデックス | 用途 |
|---|---|---|
| `users` | PK `user_id` | ID ルックアップ |
| `users` | UNIQUE `user_handle` | ログイン時のハンドル検索、重複チェック |
| `user_sessions` | PK `session_token_hash` | Cookie 検証 |
| `user_sessions` | `(user_id, expires_at)` | 有効セッション一覧、期限切れ一括削除 |
| `exercises` | PK `exercise_id` | ID ルックアップ |
| `exercises` | `owner_user_id` | ユーザーの種目一覧 |
| `exercises` | `parent_exercise_id` | 子取得、再帰 CTE のヒット、子数カウント |
| `exercises` | UNIQUE `(owner_user_id, name_normalized)` | ユーザー種目の名前一意 |
| `exercises` | UNIQUE `preset_name_normalized` | プリセット名の一意 |
| `exercise_measurement_kinds` | PK `(exercise_id, kind)` | 種目単位の計測項目取得 |
| `sessions` | PK `session_id` | ID ルックアップ |
| `sessions` | `(user_id, workout_date DESC, session_id DESC)` | `/history/sessions` のカーソルページング |
| `sessions` | `(user_id, started_at)` | 期間絞り込み / 最新セッション |
| `exercise_blocks` | PK `block_id` | ID ルックアップ |
| `exercise_blocks` | UNIQUE `(session_id, block_order)` | セッション内ブロック順、一覧取得 |
| `exercise_blocks` | `(exercise_id, workout_date DESC, block_id DESC)` | `/history/exercises/{id}` のカーソルページング (ツリー集約モード時は `IN` 句) |
| `workout_sets` | PK `set_id` | ID ルックアップ |
| `workout_sets` | UNIQUE `(block_id, set_order)` | ブロック内セット順 |

- **過剰インデックスを避ける**: `created_at` 等への単独インデックスは
  つけない。使うクエリがないため
- **`exercise_blocks` の denorm インデックス**: `exercise_id` 単独では
  なく `workout_date` をくっつけた複合インデックスにすることで、種目別
  履歴の降順スキャンを 1 テーブル内で完結できる

## 7. カスケード削除設計

| 削除対象 | 連動削除・更新 | 根拠 |
|---|---|---|
| `users` 1 行 | `user_sessions`, `exercises (owner)`, `sessions` → すべて CASCADE。連鎖で `exercise_measurement_kinds`, `exercise_blocks`, `workout_sets` も消える | MVP にユーザー削除 UI はないが、運用削除 (手動) を想定 |
| `exercises` 1 行 (自分の種目) | `exercise_measurement_kinds` CASCADE、`exercise_blocks` CASCADE (→ `workout_sets` も連鎖)、`exercises (parent)` 列は `SET NULL` で子が孤立 | spec US-5 既決 |
| `exercises` 1 行 (プリセット) | 同上だが、MVP では API 経由で削除不可 (403) | プリセットは SQL シード時のみ変更 |
| `sessions` 1 行 | `exercise_blocks` CASCADE → `workout_sets` CASCADE | api §2.3 DELETE /sessions/{id} |
| `exercise_blocks` 1 行 | `workout_sets` CASCADE | api §2.4 DELETE /blocks/{id} |
| `workout_sets` 1 行 | なし | 末端 |

- **`ON DELETE SET NULL` は `parent_exercise_id` だけ** に限定。他の FK
  でこれを使うと「参照元だけ残って参照先がない」状態を作ってしまう
- カスケードの **連鎖の深さ** は最大 4 段 (`users → sessions → blocks →
  sets`)。MySQL のデフォルト `innodb_online_alter_log_max_size` 内で収
  まる

## 8. カーソルページネーションの実体

### 8.1 `GET /api/v1/history/sessions`

- ソートキー: `(workout_date DESC, session_id DESC)`
- 複合キー索引: `sessions(user_id, workout_date DESC, session_id DESC)`
- カーソルのペイロード:
  ```json
  {"w": "2026-04-08", "s": "01HZ..."}
  ```
  これを JSON → base64url して `cursor` クエリに乗せる
- 次ページ取得クエリ:
  ```sql
  SELECT ...
    FROM sessions
   WHERE user_id = ?
     AND (workout_date, session_id) < (?, ?)
   ORDER BY workout_date DESC, session_id DESC
   LIMIT ?;
  ```
- `from` / `to` フィルタが指定されたらさらに `AND workout_date BETWEEN ? AND ?`

### 8.2 `GET /api/v1/history/exercises/{exercise_id}`

- ソートキー: `(workout_date DESC, block_id DESC)`
- 複合キー索引: `exercise_blocks(exercise_id, workout_date DESC, block_id DESC)`
- カーソルペイロード:
  ```json
  {"w": "2026-04-08", "b": "01HZ..."}
  ```
- 基本クエリ:
  ```sql
  SELECT ...
    FROM exercise_blocks b
    JOIN sessions s ON s.session_id = b.session_id
   WHERE s.user_id = ?            -- 認可
     AND b.exercise_id = ?
     AND (b.workout_date, b.block_id) < (?, ?)
   ORDER BY b.workout_date DESC, b.block_id DESC
   LIMIT ?;
  ```
- **ツリー集約モード (`include_descendants=true`)**: 先に CTE で子孫種目
  ID 集合 `D` を作る → `b.exercise_id IN D` に置換。子数は最大で
  16^8 だが spec の深さ 8・子数 16 は「アプリが強制する」上限なので
  実運用では数十件
- **認可**: `s.user_id = ?` の JOIN 条件で他ユーザーのブロックは弾かれる。
  他ユーザーが所有する `exercise_id` を指定しても 0 件返るだけで露呈しない
  (api §1.2 の 404 に寄せる方針はハンドラ側で「対象種目が自分から見えない」
  を判定して返す)

### 8.3 カーソルの不透明性

- エンコード: JSON → UTF-8 バイト列 → base64url
- デコード失敗、スキーマ不一致は **400 `invalid_format` on `cursor`**
- 内部キー構造はクライアントに**保証しない**。将来カーソル内容を拡張
  してもクライアント無改修で運用できる

## 9. トランザクション境界

| ユースケース | トランザクション内の操作 | 備考 |
|---|---|---|
| サインアップ (`POST /web/v1/signup`) | `users` INSERT → `user_sessions` INSERT | Cookie トークン発行と同トランザクション |
| ログイン (`POST /web/v1/login`) | `users` SELECT (password 検証) → `user_sessions` INSERT | SELECT と INSERT の間でユーザー状態は変わらない前提 |
| ログアウト | `user_sessions` DELETE 1 行 | 単発なので TX 省略可 |
| 種目作成 (`POST /api/v1/exercises`) | `exercises` INSERT → `exercise_measurement_kinds` INSERT (複数) → (parent 指定時) 循環・深さ・子数チェック CTE | チェックは INSERT 前 |
| 種目編集 (`PATCH /api/v1/exercises/{id}`) | 名前衝突チェック → `exercises` UPDATE → (計測項目変更時) `exercise_measurement_kinds` DELETE + INSERT → (parent 変更時) 循環・深さ・子数チェック | 計測項目の変更時は `exercise_blocks` が参照する行があれば `locked_by_existing_records` で拒否 |
| 種目削除 | `exercises` DELETE 1 行 (連鎖 CASCADE + 子は SET NULL) | 単発クエリで完結 |
| セッション作成 | `sessions` INSERT | 単発 |
| セッション編集 (`PATCH /api/v1/sessions/{id}`) | `sessions` UPDATE → `workout_date` が変わった場合は `exercise_blocks.workout_date` も同時 UPDATE | denorm 整合性を TX で守る |
| セッション終了 (`POST .../end`) | `sessions` UPDATE 1 行 | |
| ブロック追加 (`POST /sessions/{id}/blocks`) | `exercise_blocks` 末尾 `block_order` 計算 → INSERT (denorm `workout_date` も埋める) | |
| ブロック並び替え (`PATCH /blocks/{id}` with `order`) | 対象セッションの `exercise_blocks.block_order` を再採番 | UNIQUE 制約衝突を避けるため「一旦 +10000 に退避 → 詰め直す」の 2 段階 UPDATE、または内部順序 SELECT → 全行 UPDATE |
| ブロック種目差し替え | 新種目の `measurement_kinds` と現存セットの値互換チェック → `exercise_blocks.exercise_id` UPDATE | 不整合なら `incompatible_with_existing_sets` |
| ブロック削除 | `exercise_blocks` DELETE → 残ブロックの `block_order` を詰め直す | 単 TX |
| セット追加 | 末尾 `set_order` 計算 → INSERT | |
| セット並び替え / 編集 | `workout_sets` UPDATE | 並び替えはブロックと同様 |
| セット削除 | DELETE → 残セットの `set_order` 詰め直し | |

- **分離レベル**: MySQL デフォルトの `REPEATABLE READ` を想定。
  名前衝突チェックは `SELECT ... FOR UPDATE` でロックを取るか、UNIQUE
  制約違反を掴んで domain エラーに変換する (後者のほうがロック範囲が
  小さい)
- **再採番の実装**: 実装フェーズで検討。スキーマ設計の問題ではない

## 10. マイグレーション計画

### 10.1 ファイル構成 (`backend/migrations/`)

`sqlx-cli` の慣習に従い、連番 + 説明の SQL ファイルを置く:

```
backend/migrations/
├── 20260401000001__init_users_and_sessions.sql
├── 20260401000002__init_exercises.sql
├── 20260401000003__init_session_records.sql
├── 20260401000004__seed_preset_exercises.sql
```

- 1 ファイル = 1 論理トピック。将来の変更で diff が読みやすい
- `__init_*` はスキーマ作成、`__seed_*` は初期データ
- タイムスタンプ形式 `YYYYMMDDHHMMSS` は sqlx-cli が自動付与する (新規
  マイグレーション作成コマンド経由)

### 10.2 シード (プリセット種目) の扱い

- プリセット種目は `20260401000004__seed_preset_exercises.sql` 内で
  `INSERT INTO exercises` する
- `exercise_id` は **SQL リテラル** として固定 ULID を書く
  (`UNHEX('01HZ00000000000000000000000001')` 等)。Rust 側で乱数生成
  しない。理由: 再現可能なマイグレーションを保つため。同じ DB をリセット
  しても同じ ID になる
- **プリセット種目の初版リスト**: MVP 初回マイグレーション作成時に
  決定する。候補 (あくまで初版たたき台):

  | 種目 | measurement_kinds | parent |
  |---|---|---|
  | ベンチプレス | reps (req), weight (req) | null |
  | バックスクワット | reps (req), weight (req) | null |
  | デッドリフト | reps (req), weight (req) | null |
  | オーバーヘッドプレス | reps (req), weight (req) | null |
  | 懸垂 | reps (req), weight (opt) | null |
  | プッシュアップ | reps (req), weight (opt) | null |
  | ディップス | reps (req), weight (opt) | null |
  | プランク | time (req) | null |
  | ハンドスタンドプッシュアップ | reps (req) | null |
  | パイクプッシュアップ | reps (req) | (HSPU) |
  | デクラインプッシュアップ | reps (req) | (HSPU) |
  | ピストルスクワット | reps (req), weight (opt) | null |

  実際のリストはマイグレーション作成時にユーザー確認のうえ確定する。
  本ドキュメントではスキーマ設計を妨げないための存在証明として置く

### 10.3 破壊的変更の段階適用 (捨てやすさ §8)

将来スキーマを変える際のルール:

| 変更 | 段階 |
|---|---|
| カラム追加 (NOT NULL) | (1) NULL 許容で追加 → (2) デフォルト埋め → (3) NOT NULL に変更 |
| カラム削除 | (1) アプリの書き込み停止 → (2) 数リリース後削除 |
| カラム型変更 | (1) 新カラム追加 → (2) データ移行 → (3) 旧カラム削除 |
| テーブル分割 | (1) 新テーブル作成 → (2) 両書き → (3) 読み切り替え → (4) 旧削除 |

- MVP は単独運用 (ダウンタイム許容可) だが、原則を先に決めておけば
  後から高可用運用にシフトする際に同じパターンで通せる
- `sqlx-cli` は down migration を強制しないが、重要な変更は同じファイル
  番号の `down.sql` を手で用意して rollback 可能にする

## 11. 「捨てやすさ」確認

| 確認項目 | 状態 |
|---|---|
| ORM 生成型をドメイン層に直接使わない | OK: sqlx の `#[derive(FromRow)]` は `infrastructure/repositories/*` 内の private struct のみに付与。`domain::User` とは別物 |
| 値オブジェクトを `string` で素通しさせない | OK: `ExerciseName`, `UserHandle`, `WeightKg` 等の値オブジェクトに Mapper で変換する (arch §Create フロー既決) |
| プログレッションツリーの内部表現 (隣接リスト) を API に漏らさない | OK: API は `parent_id` と `children_order` のみ。クロージャテーブルに移行しても API 互換 |
| プリセット判定 (`owner_user_id IS NULL`) を API に漏らさない | OK: API は `owner: "preset"\|"user"` の独自語彙 |
| カーソルの内部キー形 (`(workout_date, session_id)`) をクライアントに漏らさない | OK: base64url(JSON) で不透明化 |
| マイグレーションツール (sqlx-cli) 固有の慣習にドメイン層が縛られていない | OK: マイグレーションは infrastructure の関心事 |
| ストレージ固有機能の使用 (`ENUM`, `GENERATED STORED COLUMN`) | 影響範囲: `exercise_measurement_kinds.kind` の ENUM 列挙、`exercises.preset_name_normalized` の generated column。PostgreSQL 等に移行する場合は ENUM → CHECK 制約、generated column → 別方式での制約に書き換え必要。ADR に明記 |

## 12. ADR 候補

本ドキュメントで確定した設計判断。将来 ADR 化候補:

1. **ID は DB 内で BINARY(16) の ULID として持つ。プレフィックスは API 層で付ける**
   - 代理キー併用せず、ULID 自身を主キーにする
   - CHAR(26) 比で 40% 近いサイズ削減、時系列ソート性も兼ねる

2. **プログレッションツリーは隣接リスト (parent_exercise_id) + MySQL 8.0 の再帰 CTE**
   - クロージャテーブル / マテリアライズドパスは不採用
   - 根拠: 種目数スケール (数十〜数百) でクロージャ維持コストに見合わない
   - 将来スケール変化時は Read Model としてクロージャテーブルを追加可能

3. **プリセット種目は `exercises` 同一テーブル + `owner_user_id NULL`**
   - ポリモーフィック FK を避けるため別テーブルにしない
   - ユーザー名のスコープ内一意は (DB UNIQUE × 2 + アプリ層チェック) の 3 段構成
   - generated column + UNIQUE でプリセット同士の名前一意を DB で担保

4. **計測項目セットは `exercise_measurement_kinds` 別テーブル + ENUM `kind`**
   - 列持ち (has_reps BOOL, ...) や JSON カラムは不採用
   - 将来の計測項目追加は ENUM 拡張のみで既存データに影響しない

5. **`workout_sets` の計測項目値は疎な列持ち (reps / weight_kg / duration_seconds / interval_seconds)**
   - EAV は採用しない (型混在と DB 制約欠如のデメリットが大きい)
   - 加重 / 補助は符号付き `weight_kg DECIMAL(4,1)` で表現

6. **`exercise_blocks.workout_date` を denormalize する**
   - 理由: 履歴種目別 API のカーソルページネーションを JOIN なしで 1 インデックスレンジスキャンに収めるため
   - 同期は `PATCH /sessions/{id}` のトランザクション内で行う
   - CQRS を正式採用していないが、書き込みフロー内での局所 Read 最適化として位置づける

7. **時刻は `DATETIME(3)` UTC で保持 (MySQL の `TIMESTAMP` は使わない)**
   - 理由: `TIMESTAMP` の暗黙 TZ 変換を避ける。arch の「サーバーは TZ を持たない」原則と整合

8. **論理削除 (`deleted_at`) は採用しない。全テーブル物理削除 + CASCADE**
   - MVP は復元 UI を持たない (spec 既決)
   - すべてに `deleted_at` を振ると WHERE 条件が複雑化する

9. **`user_sessions` はトークンの SHA-256 ハッシュを主キーにする**
   - DB ダンプ流出時にセッション乗っ取りを許さない防御

10. **順序列 (`block_order`, `set_order`) は dense integer で持ち、並び替え時は再採番**
    - LexoRank 等の fractional ordering は MVP では不要 (上限 50 で十分速い)

11. **値の範囲チェックは DB の CHECK 制約で持つ (アプリと二重)**
    - 逃げ F (Nullable で逃げる) を避ける
    - 二重管理のコストは小さく、壊れたデータが DB に入ることを防ぐ価値が上回る

## 13. 設計フェーズ後段に送る決定事項

| 項目 | 送り先 | 理由 |
|---|---|---|
| プリセット種目の正式リストと日本語名 | マイグレーション作成直前 (ユーザー確認) | データ自体は設計範囲外。スキーマは決まっている |
| Argon2id の具体パラメータ (memory, iterations, parallelism) | `design-component` / 実装 | アプリ設定値であり DB スキーマには影響しない |
| `block_order` / `set_order` 再採番の SQL 実装手順 (一時退避 UPDATE の書き方) | 実装フェーズ | スキーマではなくクエリ実装の問題 |
| `note` カラムの最大長 (TEXT のまま / VARCHAR(2000) 等へ絞る) | `design-component` でバリデータ仕様化時 | 上限値の決定は UX 議論 |
| Repository ポートのインターフェース具体形 (メソッド一覧、エラー型) | `design-component` | arch §Ports-and-Adapters の詳細化 |
| トランザクションランナー (`UnitOfWork` / `TransactionRunner`) の実装 | `design-component` / 実装 | sqlx の `Transaction` をどう抽象化するか |
| `user_sessions` の期限切れ掃除バッチ | 運用フェーズ | MVP は cron スクリプト不要 (期限切れは SELECT 時に弾く) |
| 将来「種目マージ / スコアリング」機能導入時のスキーマ拡張 | 将来フェーズ | MVP スコープ外 |
