# triary アーキテクチャ設計 (MVP)

`requirements.md` / `specification.md` を踏まえた、MVP のアーキテクチャ設計。
細かい型・テーブル・エンドポイントは別フェーズ (data-model / api) に委ねる。
本ドキュメントはレイヤー構成・境界・主要技術判断・エラー境界を扱う。

## コンテキスト

- 既存リポジトリは新規同然だが、骨格は既に切られている：
  - `backend/`: Rust 2024 edition + Axum 0.8 + sqlx 0.8 (MySQL)。
    `domain` / `application` / `infrastructure` / `interfaces` の 4 モジュールが
    既に切られている（中身は空）
  - `frontend/`: SolidJS + Tailwind + CSS Modules、TanStack Query、
    openapi-fetch（OpenAPI から型生成）、MSW、Vitest、Storybook、
    `vite-plugin-pwa` を導入済み
  - `openapi/openapi.yaml`: スキーマファーストの真実の源
  - `backend/migrations/`: sqlx-cli + 生 SQL マイグレーション
- 技術スタックは `setup-plan.md` で確定済みで、本フェーズで変更しない
- 既存の 4 層構造をそのまま継承し、MVP の責務を明確化する

## 全体像

```
+-------------------------------------------------------------------+
|                        Browser (PWA)                              |
|  +------------------+  +-------------------+  +----------------+  |
|  |  SolidJS UI      |  | TanStack Query    |  | openapi-fetch  |  |
|  |  (routes/        |  | (server state     |  | (typed client  |  |
|  |   components/    |  |  cache,           |  |  from          |  |
|  |   features/)     |  |  mutations)       |  |  schema.gen)   |  |
|  +------------------+  +-------------------+  +----------------+  |
|         | local UI state via signals                              |
+---------|---------------------------------------------------------+
          | HTTPS (JSON, Cookie auth)
          v
+-------------------------------------------------------------------+
|                  Axum HTTP server (single binary)                 |
|                                                                   |
|  interfaces/http  : routing, DTO, auth middleware, error mapping  |
|        |                                                          |
|        v                                                          |
|  application      : use cases + persistence ports                 |
|        |            (Repository / SessionStore traits)            |
|        v                                                          |
|  domain           : entities, value objects, validators,          |
|                     factories, real-world concept ports           |
|                     (Clock / PasswordHasher traits), errors       |
|                                                                   |
|  infrastructure   : adapters that implement BOTH domain ports     |
|                     (SystemClock, Argon2PasswordHasher) AND       |
|                     application ports (sqlx repositories,         |
|                     session store). Depends on both layers.       |
+-------------------------------------------------------------------+
                              |
                              v
                       +-------------+
                       |   MySQL 8   |
                       +-------------+
```

依存方向は **interfaces → application → domain**、および
**infrastructure → application かつ infrastructure → domain**。
domain は他のどの層にも依存しない。infrastructure は domain の型
（エンティティ・値オブジェクトなど）に依存し、加えて application と
domain の **両方が定義するポートトレイト** を実装する。

ポートトレイトの置き場所は「概念が現実に存在するか」で分ける：

- **現実の概念をモデル化したもの** — 例: `Clock`（現在時刻という現実の
  概念）、`PasswordHasher`（秘密を検証可能な形に変換するという現実の概念）。
  これらのトレイトは **domain** に置く。実装は infrastructure
- **アプリケーションの営みとしての永続化** — 例: 各種 `Repository`、
  `SessionStore`。これらは現実世界の語彙ではなくシステムを動かすための
  パターンなので **application** に置く。実装は infrastructure

## レイヤー構成

### domain

- **責務**: **「アプリケーションになる前から、現実でその営みをする上で
  必要だったロジック」** を表現する。triary でいえば、ノートに書きとめて
  いた頃から存在した「種目とは何か」「セットの記録とは何か」「漸進性
  過負荷の積み上げとは何か」といった概念とルール。永続化やログのような
  ソフトウェア固有の関心事はここには現れない
- **保持するもの**:
  - エンティティ / 集約: `User`, `Exercise`, `Session`, `ExerciseBlock`, `WorkoutSet`
  - 値オブジェクト: `UserId`, `Password`, `ExerciseName`, `MeasurementKindSet`,
    `Weight`, `Reps`, `DurationSeconds`, `WorkoutDate` 等
  - **入力型 (Input)**: バリデーション前の素の入力を表す `pub` 構造体
  - **バリデータ (Validator)**: 入力 + 必要な外部事実から
    `Result<ValidatedXxx, DomainError>` を返す
  - **検証済み入力型 (Validated)**: 内部フィールドが `pub(crate)` などで
    封じられた構造体。バリデータを通った値だけが構成できる
  - **ファクトリ (Factory)**: `Validated*` を受け取り、集約を生成する
    **失敗しない** 関数（ID 生成・初期状態設定など）
  - **現実の概念をモデル化したポートトレイト**: `Clock`（現在時刻）、
    `PasswordHasher`（秘密の変換）など。実装は infrastructure が提供する
  - ドメインエラー (`thiserror` の enum)
- **持たないもの**:
  - リポジトリトレイト（永続化はアプリケーションの営みなので application 層へ）
  - DB / sqlx / Axum / HTTP に関する型・概念
  - 「データを取りに行く」コードそのもの。Validator は外部事実を **引数で
    受け取る**（プレーンな値、もしくは高階関数として渡される取得関数）
- **依存**: 標準ライブラリ + `chrono` + `uuid` + `thiserror` のみ。
  Axum / sqlx には依存しない
- **テスト**: 値オブジェクト・集約・Validator・Factory はすべて純粋関数
  として、プレーンな入力と外部事実を渡してテストする。リポジトリや DB は
  一切登場しない。proptest を積極利用

#### エラー方針

- **panic はプログラマのバグ専用**。`unwrap` / `expect` は「ここに到達したら
  バグ」と言い切れる箇所だけ
- **ユーザー入力・外界由来の失敗はすべて `Result<T, DomainError>`**。
  `DomainError` は `thiserror` で枚挙する
- 「インスタンス化のときに値チェックして例外」は採用しない。代わりに
  **型レベルで「未検証 / 検証済み」を区別** することで、検証していない値
  が集約に紛れ込むことをコンパイル時に防ぐ

#### ドメインロジックの置き場所の優先順位

「ドメインサービス」のような曖昧な箱は使わない。entity / 集約を貧血に
しないことを最優先しつつ、責務ごとに **具体的な型** に落とす。

1. **値オブジェクト** — 単一の値が満たすべき制約。`Type::try_new(raw)`
   または `Type::parse(raw)` が `Result<Self, DomainError>` を返す。
   一度作られた値オブジェクトは常に妥当（型がそれを保証する）。例:
   `MeasurementKindSet::try_new(set)`, `UserId::parse(raw)`,
   `Weight::try_new(value)`
2. **集約 / エンティティのメソッド** — 既存集約の状態に対する操作。
   必要な外部事実（祖先列、bool フラグ、別集約のスナップショット）は
   呼び出し側 application 層が事前ロードして引数で渡す。メソッドは
   `Result<(), DomainError>` を返し、集約自身が「与えられた事実を
   前提に自分を更新する／拒否する」ことに集中する
3. **入力型 / バリデータ / 検証済み入力型 / ファクトリ** — 集約の **生成**
   フロー。次節「Create フローの 4 役割」参照。Create に限らず、複雑な
   ミューテーション（多フィールド入力 + 外部事実が絡むもの）にも同じ
   パターンを適用する
4. **ドメインワークフロー** — 上記のいずれにも収まらず、本当に複数集約に
   またがる不可分なドメイン判断が発生した場合のみ。`〜Workflow` という
   名前で **1 ワークフロー 1 目的** に閉じる。MVP では該当なし

#### Create フローの 4 役割（型付きパイプライン）

集約の生成は、常に以下 4 つの役割を経由させる。役割を分けることで、
未検証データから集約が作られる経路をコンパイラレベルで遮断する。

```rust
// 1. 入力型: 素のデータ。pub フィールド。失敗しない
pub struct CreateExerciseInput {
    pub name: String,
    pub kinds: Vec<RawMeasurementKind>,
    pub parent_id: Option<String>,
}

// 2. バリデータ: 入力 + 外部事実 → Result<Validated, DomainError>
pub struct CreateExerciseValidator;

impl CreateExerciseValidator {
    pub fn validate(
        input: CreateExerciseInput,
        owner: UserId,
        name_taken: bool,                  // 外部事実: 同名種目の存在
        parent: Option<&Exercise>,         // 外部事実: 親種目のスナップショット
    ) -> Result<ValidatedCreateExerciseInput, DomainError> {
        let name = ExerciseName::try_new(input.name)?;
        if name_taken { return Err(DomainError::ExerciseNameConflict); }
        let kinds = MeasurementKindSet::try_new(input.kinds)?;
        // 親の妥当性（同じ owner に属するか等）も検証
        let parent_id = parent.map(|p| p.id().clone());
        Ok(ValidatedCreateExerciseInput { owner, name, kinds, parent_id })
    }
}

// 3. 検証済み入力型: 内部フィールドは封印 (pub(crate) など)。
//    バリデータを通らないと作れない
pub struct ValidatedCreateExerciseInput {
    pub(crate) owner: UserId,
    pub(crate) name: ExerciseName,
    pub(crate) kinds: MeasurementKindSet,
    pub(crate) parent_id: Option<ExerciseId>,
}

// 4. ファクトリ: 検証済み入力 → 集約。失敗しない
pub struct ExerciseFactory;

impl ExerciseFactory {
    pub fn create(
        validated: ValidatedCreateExerciseInput,
        id: ExerciseId,                    // ID 採番は呼び出し側
        now: DateTime<Utc>,                // Clock も外から
    ) -> Exercise {
        Exercise {
            id,
            owner: validated.owner,
            name: validated.name,
            kinds: validated.kinds,
            parent_id: validated.parent_id,
            created_at: now,
        }
    }
}
```

application 層のユースケースは「外部事実を集めてバリデータに渡し、検証済み
入力をファクトリに渡し、できた集約をリポジトリに保存する」だけになる。
ドメインルールはバリデータに集約され、ファクトリは「型レベルで妥当な値が
来る」前提で書けるので、ファクトリ自体は失敗しないシンプルなコンストラクタ
になる。

ミューテーション系（既存集約の状態を変える操作）も、複雑なものは同じ
パターンを使う：

- `ChangeExerciseKindsInput` → `ChangeExerciseKindsValidator::validate(input, has_records)` → `ValidatedChangeExerciseKinds` → `Exercise::apply_change_kinds(validated)`（infallible）
- `ReparentExerciseInput` → `ReparentExerciseValidator::validate(input, ancestors_chain, sibling_count)` → `ValidatedReparent` → `Exercise::apply_reparent(validated)`
- `ReassignBlockExerciseInput` → `ReassignBlockExerciseValidator::validate(input, new_kinds, current_set_values)` → `ValidatedReassignBlockExercise` → `Session::apply_reassign_block_exercise(validated)`
- `AppendSetInput` → `AppendSetValidator::validate(input, exercise_kinds)` → `ValidatedAppendSet` → `Session::apply_append_set(validated)`

集約側の `apply_*` は型レベルで妥当性が保証された入力しか受け取らないので
失敗せず、`Result` を返さない。ロジックは「内部状態を更新する」だけ。
これによって集約は貧血にならず、責務（自分の不変条件を守る）を保ちつつ
入力検証ロジックは Validator に切り出される。

簡単な単一値ミューテーション（例: `Session::edit_note(note: NoteText)`）は、
NoteText 値オブジェクト 1 つで十分なので、Validator/Factory は要らない。
判断基準は「外部事実が必要か」「複数フィールドの整合が必要か」。

#### 外部事実の渡し方

Validator は domain 層の住人なので、リポジトリやデータベースを知らない。
必要な外部事実は **application 層から引数で受け取る**。形は以下の 3 つ
から選ぶ。「常にプレーンな値で渡す」は避ける — データ量が増えたときに
全件ロードを強制してしまうため。

##### 形 A: プレーンな値（事前に集約された結論）

application が **DB に「結論だけを問い合わせるクエリ」を投げて**、
その結果を `bool` / `usize` / 小さな構造体として渡す。

| 例 | application 側のクエリ | Validator の引数 |
|---|---|---|
| 種目名重複 | `SELECT EXISTS(SELECT 1 FROM exercises WHERE owner=? AND name=?)` | `name_taken: bool` |
| 種目に記録があるか | `SELECT EXISTS(SELECT 1 FROM exercise_blocks WHERE exercise_id=?)` | `has_records: bool` |
| 新しい親配下の子数 | `SELECT COUNT(*) FROM exercises WHERE parent_id=?` | `sibling_count: usize` |
| 親種目スナップショット | `SELECT * FROM exercises WHERE id=? AND owner=?` | `parent: Option<&Exercise>` |

**使うべき条件**: 結論の集約コストが O(1) 〜 O(log n) で済み、その値を
取るために大量のレコードを読まない場合。MVP の上記ケースはすべて
EXISTS / COUNT / PK 引きなので形 A で問題ない。

##### 形 B: ドメインの語彙で表したコレクション抽象

「ある種類の集合に対して問い合わせる」こと自体がドメインの営みになって
きたら、`ExerciseLedger` / `WorkoutHistory` のような **現実の営みを表す
言葉** で domain にトレイトを切る（「リポジトリ」とは呼ばない）。
Validator はそのトレイトを引数で受け取り、必要なときに必要な分だけ
問い合わせる。実装は application or infrastructure が提供する。

```rust
// domain: 「種目台帳」という現実の語彙で表現したコレクション抽象
pub trait ExerciseLedger {
    fn ancestors_of(&self, id: &ExerciseId) -> Vec<Exercise>;
    fn count_children_of(&self, id: &ExerciseId) -> usize;
}

impl ReparentExerciseValidator {
    pub fn validate(
        input: ReparentExerciseInput,
        ledger: &dyn ExerciseLedger,
    ) -> Result<ValidatedReparent, DomainError> {
        // 必要なときだけ ledger を引いて検証する
    }
}
```

**使うべき条件**:

- Validator のロジックが「最大何件読むか」を事前に決められず、入力に
  応じて読む量が変わる
- 「コレクションに対する問い合わせ」自体がドメインの語彙として自然
  （「台帳を引く」「履歴をたどる」など）
- スコアリングのような将来機能で、複数集約にまたがる集計を ad-hoc に
  行いたい

##### 形 C: 高階関数（取得関数）

最小単位の取得関数を `Fn` / `FnMut` として引数に受け取る。コレクション
抽象を切るほどではないが、Validator が **遅延的に / 条件付きで** データを
読みたいときに使う。

```rust
impl ReparentExerciseValidator {
    pub fn validate(
        input: ReparentExerciseInput,
        load_parent: impl Fn(&ExerciseId) -> Option<Exercise>,
    ) -> Result<ValidatedReparent, DomainError> {
        // load_parent をたどって祖先列を構築し、循環・深さを検証する。
        // 循環が早期に検出できればその時点で打ち切れる
    }
}
```

**使うべき条件**:

- 形 A の事前集約だと「最悪ケースの全件ロード」を強制してしまう
- 形 B のコレクション抽象を切るほど概念として独立していない
- 取得が「必要な分だけ」「短絡評価したい」場合（例: 循環検出は最初の
  ヒットで終わる）

##### 判断フロー

```
1. application 側で O(1)〜O(log n) のクエリで結論を出せるか?
     Yes → 形 A (プレーンな値)
     No  ↓

2. その「集合への問い合わせ」がドメインの語彙として独立しているか?
     Yes → 形 B (ドメイン語彙のコレクション抽象)
     No  ↓

3. → 形 C (高階関数で取得関数を渡す)
```

##### MVP での適用方針

MVP のほとんどのケースは形 A で足りる（EXISTS / COUNT / PK 引きで結論
が出る）。**例外として、親付け替えの祖先列・循環検出** は形 C を選ぶ：

- 循環検出は最初の「自分にぶつかる祖先」で短絡できる
- ツリー深さは上限 8 だが、将来上限を緩めたときに全件ロードへ退化しない
- application 側で `load_parent: impl Fn(&ExerciseId) -> Option<Exercise>`
  を構築し、内部では `SELECT * FROM exercises WHERE id=? AND owner=?` を
  毎回叩く（必要なら request スコープのキャッシュを噛ませる）

domain は決して「データを取りに行くコード」を直接持たないが、**いつ何を
取るか** はドメインのロジックに委ねられる、というのが形 B / C の意義。

#### MVP の各ドメイン操作の置き場所

| 操作 | 置き場所 | 補足 |
|---|---|---|
| 計測項目セットの空集合チェック | 値オブジェクト `MeasurementKindSet::try_new` | |
| ユーザー ID の正規化・文字種検証 | 値オブジェクト `UserId::parse` | 予約語チェックは VO 内 |
| 各セット値の範囲検証 (`Weight` / `Reps` / `DurationSeconds`) | 値オブジェクト `try_new` | |
| パスワードと PasswordHash の型分離 | 値オブジェクト 2 種類 | 平文型は永続化されない / シリアライズしない |
| `WorkoutDate` の未来日禁止 | 値オブジェクト `WorkoutDate::try_new(date, today)` | 「今日」を引数で渡す（純粋関数化） |
| ユーザー登録 | `CreateUserInput` → `CreateUserValidator::validate(input, id_taken)` → `ValidatedCreateUserInput` → `UserFactory::create` | 重複チェックは外部事実 |
| パスワード変更 | `ChangePasswordInput` → `ChangePasswordValidator::validate(input, current_hash, hasher)` → `ValidatedChangePassword` → `User::apply_change_password(validated)` | 現在パスワード照合を含む |
| 種目作成 | `CreateExerciseInput` → `CreateExerciseValidator::validate(input, owner, name_taken, parent)` → `ValidatedCreateExerciseInput` → `ExerciseFactory::create` | |
| 種目編集（名前など単一フィールド） | 値オブジェクトの再生成 + 集約の単純メソッド | Validator/Factory は不要 |
| 計測項目セット変更 | `ChangeExerciseKindsInput` → `ChangeExerciseKindsValidator::validate(input, has_records)` → `ValidatedChangeExerciseKinds` → `Exercise::apply_change_kinds(validated)` | 記録の有無は外部事実 |
| 親付け替え | `ReparentExerciseInput` → `ReparentExerciseValidator::validate(input, load_parent, sibling_count)` → `ValidatedReparent` → `Exercise::apply_reparent(validated)` | 循環・深さは高階関数 `load_parent` で短絡評価。子数は形 A (`COUNT`) |
| セッション開始 | `StartSessionInput` → `StartSessionValidator::validate(input, today)` → `ValidatedStartSession` → `SessionFactory::create` | `workout_date` の未来日チェック含む |
| セッション終了 | 集約メソッド `Session::end(now)` | 単純な状態遷移 (`started_at <= now`) なので Validator/Factory なし |
| 種目ブロック追加 | `AppendBlockInput` → `AppendBlockValidator::validate(input, exercise)` → `ValidatedAppendBlock` → `Session::apply_append_block(validated)` | 種目の存在確認 + owner 一致を含む |
| セット追加 | `AppendSetInput` → `AppendSetValidator::validate(input, exercise_kinds)` → `ValidatedAppendSet` → `Session::apply_append_set(validated)` | 必須計測項目の充足検証 |
| ブロックの種目差し替え | `ReassignBlockExerciseInput` → `ReassignBlockExerciseValidator::validate(input, new_kinds, existing_set_values)` → `ValidatedReassignBlockExercise` → `Session::apply_reassign_block_exercise(validated)` | 既存セット値との互換性検証 |
| `started_at <= ended_at` の維持 | 集約メソッド `Session::end` / `Session::edit_times` 内で検証 → `Result` 返却 | 1 つの状態遷移ルールなので Validator は分けない |
| 種目削除（カスケード・孤立化） | application 層のユースケース | 残すべきドメイン判断なし |

MVP では **ドメインワークフローに該当するケースは存在しない**。複雑な操作
はすべて「Input → Validator → Validated → Factory または apply メソッド」の
パイプラインに収まる。ワークフローはドメインの語彙として将来用に残す。

### application

- **責務**: **「現実の営みをアプリケーションにしたときに初めて発生する
  文脈・ロジック」** を引き受ける場所。永続化、トランザクション境界、
  構造化ログ、トレース、メトリクス、ユースケースレベルの認可、レート
  制限、入出力 DTO の詰め替えなど、いずれも **現実世界には存在せず、
  ソフトウェアにしたから必要になった** 関心事を扱う。
  これらの関心事を組み合わせて domain の値オブジェクト・集約・Validator・
  Factory を呼び出した結果として、仕様書のユースケースが実装される。
  併せて、永続化に関するポート（トレイト）を定義する場所でもある
- **application が引き受ける「アプリケーションになって初めて出てくる」関心事**:
  - 永続化のオーケストレーション（トランザクション開始・コミット・
    ロールバック、リポジトリ呼び出し）
  - 構造化ログ・トレースの取得ポイント（ユースケース開始/終了、失敗時の
    ドメインエラー記録）
  - メトリクス（処理時間、失敗率など）
  - ユースケースレベルの認可（「この `user_id` でこのリソースを触れるか」を
    集約取得時に強制する）
  - レート制限の適用ポイント（細部は interfaces 層のミドルウェアと協調）
  - 外部入力 DTO を domain の **入力型 (`Xxx Input`)** に詰め替える
  - Validator が必要とする外部事実（祖先列、bool フラグ、別集約のスナップ
    ショットなど）を「形 A / 形 B / 形 C」のいずれかでロードして渡す
  - 出力結果を domain 型から外部向け DTO に詰め替える
- **application が引き受けるのは「営みのつなぎ合わせ」**:
  - 上記の関心事の中で domain の集約・Validator・Factory を呼び出し、結果を
    トランザクション境界に閉じ込めて永続化する
  - これが結果として「仕様書のユースケース」を実装することになるが、
    application の本質はユースケースという成果物ではなく、上のリストの
    関心事を引き受けていることそのもの
- **やらないこと**:
  - ビジネスルールの判定（現実の営みのルールなので domain に委ねる）
  - 不変条件の検証（同上）
  - HTTP / JSON / Cookie の知識を持つこと（interfaces に閉じる）
  - DB ベンダー固有の SQL や sqlx の型を扱うこと（infrastructure に閉じる）
- **保持するもの**:
  - **永続化ポート（トレイト）**: `UserRepository`, `ExerciseRepository`,
    `SessionRepository`, `SessionStore` など。これらは「アプリケーションが
    永続化のために外界に求める能力」を表現する
  - **アプリケーションサービス**: ロジックを持つ application 層の部品。
    トランザクション境界 (`TransactionRunner` / `UnitOfWork`)、認可
    (`Authorizer`)、構造化ログのデコレータ、リトライポリシー、レート
    制限カウンタなど。これらは「現実世界には存在しなかったが、システム
    にしたから必要になったロジック」を背負う
  - **ユースケース**: Command / Query の入口。例: `CreateExerciseUseCase`,
    `StartSessionUseCase`, `AppendSetUseCase`, `DeleteSessionUseCase`,
    `ReparentExerciseUseCase`, `ChangePasswordUseCase`,
    `ListSessionsByDateUseCase`, `GetExerciseHistoryUseCase`,
    `GetExerciseHistoryWithDescendantsUseCase`。**それ自体はロジックを
    持たない**（後述）
  - 入出力 DTO（リクエスト・レスポンスのデータ構造）
  - `UseCaseError` などの application 層のエラー型
- **依存**: domain のみ。infrastructure には依存しない（domain と
  application が定義したポート経由で呼ぶ）

#### ユースケースとアプリケーションサービスの分担

**ユースケースはロジックを持たない**。やることは以下だけ：

- 入力 DTO を domain の入力型に詰め替える
- アプリケーションサービス（トランザクション、認可、ログ等）と
  domain のバリデータ・ファクトリ・集約メソッドを順に呼ぶ
- それぞれの結果を `Result` の `?` / `and_then` / `map` でつないで
  伝搬する
- 最終結果を出力 DTO に詰め替えて返す

ユースケースに **分岐・計算・条件判定が出てきたら、それは抽出のサイン**：

- ドメインルール由来の判定なら → domain 層の Validator や集約メソッドへ
- アプリケーション固有のロジック（複数操作のトランザクション境界の張り
  方、リトライ条件、ログのフォーマットなど）なら → application 層の
  サービスクラスへ

この規律により、ユースケース本体は「Result を縦に並べて `?` でつなぐ
だけ」の薄いグルーになる。

##### 単体テスト方針

ユースケース本体は **単体テストを書かない**。ロジックがない以上、
テストするとしても「リポジトリトレイトをモックして呼ばれた回数を
検証するだけ」になり、書く価値が低い割に保守コストが高い。

代わりに以下をテストする：

| 対象 | テスト方法 | 価値 |
|---|---|---|
| domain の値オブジェクト・集約メソッド・Validator・Factory | 純粋関数として入力 → 出力を検証。proptest 積極利用 | 高: ロジックの本丸 |
| application サービス（`TransactionRunner` 等） | 単体テスト。ロジックがあるので意味がある | 高: アプリ固有ロジック |
| ユースケース本体 | 書かない | 低: モック検証になるだけ |
| 全体の統合 | infrastructure を差したまま test DB に対する結合テスト + Postman / Newman | 高: 実際に動くかの担保 |

### infrastructure

- **責務**: 永続化・外部実装。domain と application が定義したポート
  トレイトのアダプタを提供する
- **保持するもの**:
  - sqlx ベースの `MysqlUserRepository`, `MysqlExerciseRepository`,
    `MysqlSessionRepository`, `MysqlSessionStore`（`application` の
    永続化トレイトを `impl` する）
  - `Argon2PasswordHasher`（`domain::PasswordHasher` の実装）
  - `SystemClock`（`domain::Clock` の実装。テスト時は固定 Clock）
  - DB 接続プール、トランザクション管理
- **依存**:
  - **domain**: エンティティ・値オブジェクトを直接扱う（DB 行 ↔ ドメイン
    型のマッピング）。`Clock` / `PasswordHasher` トレイトを実装するために
    domain にも依存する
  - **application**: 永続化ポートトレイトを実装するために依存する
  - sqlx, chrono, argon2 などの外部クレート
- **テスト**: 統合テスト（実 MySQL コンテナを sqlx で叩く）

### interfaces/http

- **責務**: HTTP プロトコルとの境界
- **保持するもの**:
  - Axum router・エンドポイントハンドラ
  - リクエスト DTO（OpenAPI と整合）→ application Command への変換
  - application Query 結果 → レスポンス DTO への変換
  - 認証ミドルウェア（Cookie からセッションを取り出して `UserId` を抽出）
  - エラー → HTTP ステータスのマッピング
  - レート制限ミドルウェア
- **依存**: application + Axum + tower
- **テスト**: `tower::ServiceExt::oneshot` でルーターを直接叩く（既存方式）。
  さらに Postman / Newman で言語非依存の統合テスト

### 既存スケルトンとの整合

既存の `backend/src/{domain,application,infrastructure,interfaces}/mod.rs` は
そのまま使う。本ドキュメントの設計はこの 4 モジュールに自然に対応するため、
リネームや構造変更は不要。

## CQRS の適用判断

**MVP では適用しない**。

判断理由：

- 書き込みと読み取りの要求モデルは大きく異ならない
- 想定ユーザー数は数名規模、読み取り側に独自最適化が必要なほどの負荷はない
- 結果整合性を導入すると UX の複雑さに対して得られる便益が小さい
- ただし、application 層では `Command` ハンドラと `Query` ハンドラを **クラスとして
  分けて配置** しておく。これにより将来 Should Have のスコアリングが入って
  読み取り側を分離したくなったとき、Query 側だけを別実装に差し替えられる

将来 Read Model が必要になったら、Query ハンドラの実装だけを集約ビューに
向けて再実装する形で段階的に CQRS 化できる、という移行余地を残す。

## 境界定義 (Bounded Contexts)

MVP では **単一の Bounded Context** とする。コンテキストの分割は早すぎる
最適化になるため避ける。

ただし、ドメイン内部では以下の **集約 (Aggregate)** に意識的に分ける：

| 集約 | ルートエンティティ | 管轄 |
|---|---|---|
| User | `User` | `UserId`, `PasswordHash`, アカウントライフサイクル |
| Exercise | `Exercise` | 種目名・計測項目セット・親プログレッション・ユーザー所有 |
| Session | `Session` | `workout_date`, `started_at`, `ended_at`, `note`, 配下の `ExerciseBlock` と `WorkoutSet` |

集約間の参照は **ID のみ**（`Session` が直接 `Exercise` インスタンスを持つ
ことはなく、`ExerciseId` を持つ）。これによりトランザクション境界を集約
単位に閉じ、将来の分離可能性を確保する。

`ExerciseBlock` と `WorkoutSet` は `Session` 集約の **内部エンティティ**
として扱う（外部からは Session 経由でしか触れない）。

### 外部システムとの接点

MVP では外部 SaaS / 外部 API への依存はない。将来的に Web Push / 通知 /
解析が入る場合は、それぞれ Anti-Corruption Layer 相当の薄いアダプタを
infrastructure 層に追加する想定。

## 認証・セッション方針

MVP では **Cookie ベースのサーバーセッション** を採用する。

| 項目 | 採用方針 | 根拠 |
|---|---|---|
| セッショントークン | サーバーが発行するランダム 256bit、`user_sessions` テーブルに保存 | サーバー側で取り消し可能。JWT のような失効困難問題を回避 |
| 配送 | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` Cookie | XSS でトークンが取れない、CSRF 保護を兼ねる |
| CSRF 対策 | 同一オリジン配信を前提に `SameSite=Lax` で担保。クロスオリジン配信を採用するなら double-submit cookie を追加（運用フェーズで判断） | シンプルさ優先 |
| 失効 | DB から行を削除すれば即時失効 | 強制ログアウト機能（Future）の余地を残す |
| パスワードハッシュ | argon2id（パラメータは設計フェーズ後段で確定） | 現代水準 |
| ログイン試行制限 | tower の middleware でレート制限。MVP では in-process カウンタで十分 | スケール不要 |

### 配信トポロジの前提

フロントとバックエンドは **同一オリジンで配信** されることを前提とする。
具体的には以下のいずれか：

- バックエンドが静的フロントを serve する（`/` に index.html、`/api/*` に API）
- フロントとバックエンドの前段にリバースプロキシを置き、同一 origin に揃える

これにより `SameSite=Lax` で CSRF 対策が成立する。dev 環境は `vite dev` の
proxy 経由で `/api/*` をバックエンドに転送して同一 origin にする。

## エラー境界の設計

レイヤーごとにエラー型を分離する。下層から上層へエラーを変換するルールを定める。

```
infrastructure error  (sqlx::Error 等)
       │  infrastructure 内で domain error or anyhow に変換
       v
domain error (DomainError enum)
       │  application 層でユースケースごとの UseCaseError にラップ
       v
application error (UseCaseError enum)
       │  interfaces/http で HTTP ステータスにマップ
       v
HTTP response (4xx / 5xx + ProblemDetails 風 JSON)
```

### domain エラーの分類（MVP）

```rust
pub enum DomainError {
    // 入力検証
    InvalidUserId,
    InvalidPassword,
    InvalidExerciseName,
    EmptyMeasurementSet,
    InvalidWeight,
    InvalidReps,
    InvalidDuration,
    InvalidWorkoutDate,

    // ビジネスルール違反
    UserIdAlreadyTaken,
    UserIdReserved,
    ExerciseNameConflict,
    MeasurementSetLockedByExistingRecords,
    ProgressionCycleDetected,
    ProgressionDepthExceeded,
    ProgressionFanoutExceeded,
    SetMissingRequiredMeasurement,
    SessionEndBeforeStart,
    WorkoutDateInFuture,

    // 認証
    InvalidCredentials,
    SessionExpired,

    // not-found / 認可
    UserNotFound,
    ExerciseNotFound,
    SessionNotFound,
    Forbidden,
}
```

### HTTP マッピング指針

| エラー種別 | HTTP ステータス | 補足 |
|---|---|---|
| 入力検証エラー (`Invalid*`) | 400 | クライアント側の検証漏れの場合のみ到達 |
| ビジネスルール違反 (`*Conflict`, `*Locked`, `*Exceeded`, `*Detected` 等) | 409 | 競合・状態違反 |
| `InvalidCredentials` / `SessionExpired` | 401 | |
| `Forbidden` | 403 | |
| `*NotFound` | 404 | 認可エラーも同じ 404 にして存在露呈を防ぐ |
| `WorkoutDateInFuture` 等の不正値 | 400 | |
| 内部例外（infrastructure の予期せぬ失敗） | 500 | 構造化ログに詳細、レスポンスには出さない |

レスポンスボディはシンプルな JSON `{ "error": "code", "message": "..." }`
を返す。ProblemDetails (RFC 7807) は MVP ではオーバースペックとして見送り、
将来的な拡張余地として残す。

## フロントエンドアーキテクチャ

### レイヤー / フォルダ構成

既存の `frontend/src/` 配下を以下のように使う：

```
frontend/src/
├── api/
│   ├── client.ts          # openapi-fetch クライアントの単一インスタンス
│   ├── query-client.ts    # TanStack Query client
│   └── schema.gen.ts      # OpenAPI から自動生成 (openapi-typescript)
├── features/              # ドメイン機能ごとの縦割り
│   ├── auth/
│   │   ├── queries/       # サーバー状態リード (1 ファイル 1 シグナル)
│   │   │   └── current-user.ts          # createCurrentUserQuery
│   │   ├── mutations/     # サーバー状態ライト (1 ファイル 1 シグナル)
│   │   │   ├── login.ts                 # createLoginMutation
│   │   │   ├── logout.ts                # createLogoutMutation
│   │   │   └── change-password.ts       # createChangePasswordMutation
│   │   ├── state/         # 画面状態シグナル
│   │   │   └── login-form.ts            # createLoginFormState
│   │   ├── keys.ts        # クエリキー定義 (`["auth", "me"]` 等)
│   │   ├── containers/
│   │   │   └── login-form-container.tsx
│   │   └── components/    # Domain Presentational (fully controlled)
│   │       └── login-form.tsx
│   ├── exercises/
│   │   ├── queries/
│   │   │   ├── exercise-list.ts         # createExerciseListQuery
│   │   │   ├── exercise.ts              # createExerciseQuery
│   │   │   └── exercise-tree.ts         # createExerciseTreeQuery
│   │   ├── mutations/
│   │   │   ├── create-exercise.ts       # createCreateExerciseMutation
│   │   │   ├── update-exercise.ts       # createUpdateExerciseMutation
│   │   │   ├── delete-exercise.ts       # createDeleteExerciseMutation
│   │   │   └── reparent-exercise.ts     # createReparentExerciseMutation
│   │   ├── state/
│   │   │   ├── exercise-picker.ts       # createExercisePickerState (open/close, selected)
│   │   │   ├── exercise-form.ts         # createExerciseFormState
│   │   │   └── exercise-tree-ui.ts      # createExerciseTreeUiState (展開状態など)
│   │   ├── keys.ts
│   │   ├── containers/
│   │   │   ├── exercise-list-container.tsx
│   │   │   ├── exercise-picker-container.tsx
│   │   │   └── exercise-tree-container.tsx
│   │   └── components/    # Domain Presentational
│   │       ├── exercise-list.tsx
│   │       ├── exercise-tree-view.tsx
│   │       ├── exercise-picker-modal.tsx
│   │       └── exercise-form.tsx
│   ├── sessions/
│   │   ├── queries/
│   │   │   └── session.ts               # createSessionQuery
│   │   ├── mutations/
│   │   │   ├── start-session.ts         # createStartSessionMutation
│   │   │   ├── end-session.ts           # createEndSessionMutation
│   │   │   ├── append-block.ts          # createAppendBlockMutation
│   │   │   ├── append-set.ts            # createAppendSetMutation
│   │   │   ├── edit-set.ts              # createEditSetMutation
│   │   │   └── delete-session.ts        # createDeleteSessionMutation
│   │   ├── state/
│   │   │   ├── session-editor.ts        # createSessionEditorState (展開中ブロック等の構造的状態)
│   │   │   └── set-input-form.ts        # createSetInputFormState (入力値・dirty・バリデーションエラー)
│   │   ├── keys.ts
│   │   ├── containers/
│   │   │   └── session-editor-container.tsx
│   │   └── components/    # Domain Presentational
│   │       ├── session-editor.tsx
│   │       ├── exercise-block-form.tsx
│   │       └── set-row.tsx
│   └── history/
│       ├── queries/
│       │   ├── sessions-by-date.ts                  # createSessionsByDateQuery
│       │   ├── exercise-history.ts                  # createExerciseHistoryQuery
│       │   └── exercise-history-with-descendants.ts # createExerciseHistoryWithDescendantsQuery
│       ├── state/
│       │   ├── calendar.ts                          # createCalendarState (表示中の月など)
│       │   └── history-view-mode.ts                 # createHistoryViewModeState (集約 ON/OFF)
│       ├── keys.ts
│       ├── containers/
│       │   ├── date-history-container.tsx
│       │   └── exercise-history-container.tsx
│       └── components/    # Domain Presentational
│           ├── session-calendar.tsx
│           └── exercise-history-list.tsx
├── components/            # Generic Presentational
│                          #  (Button, Modal, TextField 等。
│                          #   features に依存しない)
├── lib/
│   ├── infra/             # フロントのインフラ抽象 (Clock, LocalStorage 等)
│   │   ├── clock.ts
│   │   ├── local-storage.ts
│   │   └── context.tsx    # InfraContext + useInfraContext
│   ├── date.ts            # 日付計算 (純粋関数)
│   ├── measurement.ts     # 計測項目バリデーション・整形
│   └── ...                # 純粋ロジック。Vitest + fast-check 対象
├── routes/                # Page Component (URL に 1 対 1 対応)
│   ├── index.tsx
│   ├── login.tsx
│   ├── exercises/
│   │   └── index.tsx
│   ├── sessions/
│   │   ├── index.tsx
│   │   └── [id].tsx
│   └── history/
│       └── index.tsx
├── mocks/                 # MSW ハンドラ (Storybook でページ層相当の
│                          #  Story を実 API なしに見せたい場合のみ使う。
│                          #  Domain / Generic Presentational のテスト
│                          #  では使わない)
└── test/                  # テストユーティリティ
```

**1 ファイル 1 クエリ / ミューテーションのルール**:

- ファイル名はケバブケースで対象の名詞 / 動詞 + 名詞を表す
  （`use-` プレフィックスは React 文化なので使わない）
- 関数名は SolidJS の慣習に従い **`create*`** プレフィックスを付ける：
  - クエリ: `create<Noun>Query` （例: `createExerciseListQuery`）
  - ミューテーション: `create<Verb><Noun>Mutation` （例:
    `createCreateExerciseMutation`, `createDeleteExerciseMutation`）
  - 動詞の `create` と SolidJS プレフィックスの `create` がぶつかって
    `createCreateXxxMutation` のような形になるが、前者がアクション、
    後者が SolidJS のファクトリ規約という意味の違いがあり一貫性のため
    そのまま採用する
- `queries/<noun>.ts` は `createXxxQuery` を **1 つだけ** エクスポートする
- `mutations/<verb>-<noun>.ts` は `createXxxMutation` を **1 つだけ**
  エクスポートする
- クエリキーはそのファイルにベタ書きせず、`features/<feature>/keys.ts` に
  集約する。`invalidateQueries` のときに参照しやすく、キーの重複・齟齬を
  防げる
- 1 ファイル内で複数のクエリ / ミューテーションを定義したくなったら、
  それは責務が複数あるサインなので分ける

### フロントのインフラ抽象とアプリブートストラップ

フロント側にも「ブラウザというインフラを使わなければ実現できない」関心事
がいくつかある（現在時刻、LocalStorage、URL ナビゲーション等）。これらは
**`lib/infra/` にトレイト相当の型として定義**し、具象の生成・束縛は
`App.tsx` の 1 箇所に閉じる。コンポーネントは具象を直接触らない。

#### 配置と生成

```
src/lib/infra/
├── clock.ts              # Clock 型 + 実ブラウザ実装 (SystemClock)
├── local-storage.ts      # LocalStorageStore 型 + 実装
├── ...
└── context.tsx           # InfraContext + Provider + フック
```

- `lib/infra/<thing>.ts`: 抽象型と実装を定義
- `lib/infra/context.tsx`: SolidJS の `createContext` で `InfraContext` を
  定義し、`useInfraContext()` のような取り出し用フックも併設
- `App.tsx`: 実ブラウザ向け具象を生成して `InfraContext.Provider` でアプリ
  全体をラップする。テスト・Storybook ではフェイクを差し替える

```tsx
// src/App.tsx
const infra: Infra = {
  clock: createSystemClock(),
  localStorage: createBrowserLocalStorage(),
};

export function App() {
  return (
    <InfraContext.Provider value={infra}>
      <Router>{/* routes */}</Router>
    </InfraContext.Provider>
  );
}
```

#### Page 経由での Container への引き渡し

Page Component は `useContext(InfraContext)` で抽象を取り出し、必要なものを
Container に **Props として明示的に渡す**。Container 自身が `useContext` を
直接呼ぶことは禁止する（テスト時にコンテキスト依存が透けない方が、薄い
グルーである Container の差し替えやすさが保てる）。

```tsx
// src/routes/sessions/[id].tsx
export default function SessionEditorPage() {
  const { clock } = useInfraContext();
  const params = useParams();
  return <SessionEditorContainer sessionId={params.id} clock={clock} />;
}
```

```tsx
// src/features/sessions/containers/session-editor-container.tsx
type Props = { sessionId: string; clock: Clock };
export function SessionEditorContainer(props: Props) {
  const session = createSessionQuery(() => props.sessionId);
  const startSession = createStartSessionMutation();
  // ... clock を必要なところに渡す
  return <SessionEditor session={session.data} onStart={() => startSession.mutate({ now: props.clock.now() })} />;
}
```

#### 区分ごとの責務（インフラ抽象まわり）

| 区分 | インフラ抽象との関わり |
|---|---|
| `App.tsx` | 実ブラウザ向け具象を生成し `Provider` で配る |
| Page | `useContext` で抽象を取り出し、必要なものだけ Container に Props で渡す |
| Container | Props で受け取って使う。`useContext` は呼ばない |
| Domain Presentational | インフラ抽象に触れない。必要な値は Container から Props で来る |
| Generic Presentational | 同上 |

これにより：

- Page のテストは原則しないが、書くなら `Provider` をテスト用フェイクで
  ラップして DOM スナップショットで担保できる
- Container は Props だけが入力なので、テストするときも Provider を
  気にしなくていい
- Storybook は `InfraContext` のフェイク値を `decorators` で配るだけで
  全 Story が動く

### コンポーネントの 4 区分

責務をぼかさないために、フロントのコンポーネントは以下の 4 区分に
分けて配置・命名する。

#### 1. Page Component

- **責務**: ルート (URL) に 1 対 1 対応する最上位コンポーネント。URL
  パラメータの受け取り、レイアウトの組み立て、必要な Container を並べる
- **持たないもの**: データ取得そのもの（Container に委ねる）、ドメイン
  ロジック、フォーム状態
- **配置**: `src/routes/`
- **例**: `routes/sessions/[id].tsx` (セッション編集ページ),
  `routes/exercises/index.tsx` (種目一覧ページ),
  `routes/login.tsx` (ログインページ)
- **テスト**: 書かない。実 HTTP 経路は Newman で担保する

#### 2. Container Component

- **責務**: feature ごとの **シグナル組み立て層**。`createXxxQuery` /
  `createXxxMutation` （サーバー状態シグナル）と `createXxxState`
  （画面状態シグナル）を生成し、それぞれの値とコールバックを Domain
  Presentational に **Props としてばらして渡す**。Mutation の `onSuccess`
  で `invalidateQueries` するようなシグナル間の繋ぎ込みもここに住む
- **持たないもの**: 描画ロジック、ドメインルール、複雑な計算、自分自身
  の状態（`createSignal` を Container 内で直接呼ばない。状態が要るなら
  `state/` のシグナルに切り出す）
- **配置**: `src/features/<feature>/containers/`
- **例**: `features/sessions/containers/session-editor-container.tsx`,
  `features/exercises/containers/exercise-list-container.tsx`
- **テスト**: 書かない。ロジックがなく薄いグルーなので、書いても
  モック検証になるだけ。ロジックがあると感じたら `lib/` か application
  層に逃がす

#### 3. Domain Presentational Component

- **責務**: feature 固有の **大きな描画部品**。Container から Props で
  受け取った値を描画する。複数の Generic Presentational を組み合わせて、
  画面の意味のあるブロック（フォーム全体、リスト全体、ツリー表示など）
  を構成する
- **持たないもの**: API 呼び出し、グローバル状態への直接アクセス、
  非同期処理、**JavaScript で扱うローカルな状態 (`createSignal` /
  `createStore` を含む)**。開閉・選択中・フォーム入力値のような構造的な
  画面状態はすべて Props で外から受け取る（fully controlled）。状態管理
  ロジックはシグナル側 (`features/<f>/state/`) に住み、Container がその
  シグナルを Props にばらして渡す
- **CSS の擬似クラスで表現できる視覚状態 (`:hover` / `:focus` / `:active`
  / `:disabled` / `:checked` 等) は CSS Modules 側で書く**。JS シグナルや
  Props には持ち上げない
- **配置**: `src/features/<feature>/components/`
- **例**: `features/sessions/components/session-editor.tsx`,
  `features/sessions/components/exercise-block-form.tsx`,
  `features/exercises/components/exercise-tree-view.tsx`,
  `features/auth/components/login-form.tsx`
- **テスト**: Storybook でカタログ化 + Chromatic で VRT。Props のバリ
  エーション（空状態、ロード中、エラー、複数行データ等）を Story として
  並べ、視覚差分でレビューする

#### 4. Generic Presentational Component

- **責務**: feature やドメイン語彙に依存しない **汎用 UI 原子**
- **配置**: `src/components/`
- **例**: `components/button.tsx`, `components/modal.tsx`,
  `components/text-field.tsx`, `components/select.tsx`,
  `components/card.tsx`, `components/spinner.tsx`
- **依存**: `features/` には絶対に依存しない（依存方向の逆転を防ぐ）
- **テスト**: Storybook でカタログ化 + Chromatic で VRT

#### 区分間の依存方向

```
Page (routes/)
   └─ Container (features/<f>/containers/)
        └─ Domain Presentational (features/<f>/components/)
             └─ Generic Presentational (components/)
```

- 上から下への一方向のみ
- Domain Presentational から Generic Presentational への参照は OK
- Generic Presentational が `features/` を参照するのは禁止
- Domain Presentational が直接 `createXxxQuery` を呼ぶのも禁止
  （データ取得を抱え込んだら Container に分離する）

#### 「コンポーネントテストで MSW が必要」になったときの判断

それは Container と Presentational の区分けが甘いサイン。Presentational
が API を直接呼んでいないか確認し、呼んでいたら Container に切り出す。
Presentational は Storybook で Props のバリエーションを描画できれば
テスト目的を果たすので、MSW は要らない。

### 状態管理ポリシー

**JavaScript で扱う状態はすべてシグナルに住む**。コンポーネントは
JavaScript の状態を一切持たず、Props 経由で受け取った値と Props 経由で
受け取ったコールバックだけで動作する（fully controlled component）。

ただし **CSS の擬似クラスで表現できる視覚状態は CSS に任せる**。
具体的には `:hover` / `:focus` / `:focus-within` / `:active` / `:disabled`
/ `:checked` / `:placeholder-shown` などで表現できる見た目変化は、
JavaScript シグナルに持ち上げない。理由：

- ブラウザ DevTools の擬似クラス強制機能でエミュレートできる
- Storybook の擬似クラス操作プラグイン (`@storybook/addon-pseudo-states`
  相当) で Story から擬似クラスを切り替えられる
- JS 経由で持ち上げると DevTools / アドオンの恩恵を捨てることになり、
  CSS と JS の二重管理にもなる

#### 何をシグナルに上げ、何を CSS に任せるか

| 種類 | 例 | 配置 |
|---|---|---|
| サーバー側の真実 | セッション・種目・履歴 | `features/<f>/queries/` (`createQuery` ラッパ) |
| サーバーへの書き込み | 作成・更新・削除 | `features/<f>/mutations/` (`createMutation` ラッパ) |
| 画面状態のうち **構造や条件分岐を変えるもの** | モーダル開閉、選択中の ID、フォーム入力値、現在のステップ、エラー表示中か | `features/<f>/state/` (`create*State` シグナル) |
| 永続化が必要な画面状態 | テーマ、最後に使った種目 ID、ドラフト | `features/<f>/state/` (`lib/infra/local-storage.ts` 経由) |
| **CSS 擬似クラスで表現できる視覚状態** | `:hover` でのハイライト、`:focus` のリング、`:active` の押下表現、`:disabled` のグレーアウト、`:checked` のチェック表現、`:focus-within` での親側強調 | **シグナルにしない**。CSS Modules / Tailwind の擬似クラスバリアントで書く |
| クロスカット状態 (ログイン中ユーザー) | `current-user` | `features/auth/queries/current-user.ts` (`["auth", "me"]` キャッシュ) |
| ルーティング | URL | `@solidjs/router` |
| タイムゾーン / 現在時刻 | Clock | `lib/infra/clock.ts` (Provider 経由) |

#### 判断フロー

```
その状態を切り替えると…
  ├─ レンダリングされる要素そのものが変わる → シグナル
  ├─ 別のリクエストが必要になる              → シグナル (query/mutation)
  ├─ 永続化したい                            → シグナル (LocalStorage 経由)
  ├─ 同じ要素の見た目だけが変わる
  │     ├─ CSS 擬似クラスで表現できる        → CSS に任せる
  │     └─ できない (例: 「3 秒後に消える通知バー」など) → シグナル
  └─ それ以外                                → 多分シグナル
```

#### ボタンの「ホバー時に色が変わる」は CSS だけ

```tsx
// components/button.tsx — Generic Presentational
type Props = { label: string; onClick: () => void; disabled?: boolean };
export function Button(props: Props) {
  return (
    <button
      class={styles.button}    // :hover / :focus / :active は CSS 側
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.label}
    </button>
  );
}
```

```css
/* button.module.css */
.button { /* 通常時 */ }
.button:hover { /* ホバー */ }
.button:focus-visible { /* フォーカスリング */ }
.button:active { /* 押下中 */ }
.button:disabled { /* 無効 */ }
```

Storybook では擬似クラス操作アドオンを入れ、`pseudo` パラメータで
hover / focus / active のバリエーションをカタログ化する。シグナルや
Props を増やす必要はない。

#### Container と画面状態シグナルの関係

Container Component は以下を組み立てるグルーである：

1. クエリシグナル (`createXxxQuery`) でサーバーデータを読む
2. ミューテーションシグナル (`createXxxMutation`) で書き込みを準備する
3. 画面状態シグナル (`createXxxState`) で画面状態を読み書きする
4. それぞれから取り出した「値」と「操作（コールバック）」を Domain
   Presentational に Props として渡す

Container 自身はロジックを書かない（書きたくなったらそのロジックを
シグナル側に切り出す）。

#### 例: 種目選択モーダル

**画面状態シグナル** (`features/exercises/state/exercise-picker.ts`):

```ts
export function createExercisePickerState() {
  const [isOpen, setOpen] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<ExerciseId | null>(null);
  return {
    isOpen,
    selectedId,
    open: () => setOpen(true),
    close: () => { setOpen(false); setSelectedId(null); },
    select: (id: ExerciseId) => setSelectedId(id),
  };
}
```

**Container** (`features/exercises/containers/exercise-picker-container.tsx`):

```tsx
export function ExercisePickerContainer(props: { onPicked: (id: ExerciseId) => void }) {
  const exercises = createExerciseListQuery();
  const picker = createExercisePickerState();

  return (
    <ExercisePickerModal
      isOpen={picker.isOpen()}
      exercises={exercises.data ?? []}
      selectedId={picker.selectedId()}
      onOpen={picker.open}
      onClose={picker.close}
      onSelect={picker.select}
      onConfirm={() => {
        const id = picker.selectedId();
        if (id) { props.onPicked(id); picker.close(); }
      }}
    />
  );
}
```

**Domain Presentational** (`features/exercises/components/exercise-picker-modal.tsx`):

```tsx
type Props = {
  isOpen: boolean;
  exercises: Exercise[];
  selectedId: ExerciseId | null;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (id: ExerciseId) => void;
  onConfirm: () => void;
};
export function ExercisePickerModal(props: Props) {
  // 状態を一切持たない。Props だけで描画する
  return /* ... */;
}
```

**Storybook**: `isOpen={true}` / `isOpen={false}` / `selectedId` を変えた
バリエーションを並べるだけで全パターンがカタログ化できる。

### PWA 方針

- `vite-plugin-pwa` を Workbox プリキャッシュで使う（既導入）
- Service Worker はアセット（JS / CSS / 画像 / フォント）と PWA シェルのみ
  キャッシュする
- API レスポンスはキャッシュ対象外（オンライン前提のため）
- オフライン時に API を叩いた場合は TanStack Query のエラー UI を表示

## テスタビリティ戦略

| レイヤー | テスト戦略 |
|---|---|
| domain | 値オブジェクト・集約・Validator・Factory を純粋関数として、入力 → 出力で検証。実 DB 不要。proptest 積極利用。**ロジックの本丸なのでここのカバレッジを最大化する** |
| application: サービスクラス | `TransactionRunner` / `Authorizer` などロジックを持つ application 部品は単体テスト |
| application: ユースケース本体 | **書かない**。ロジックがなくモック検証になるだけなので価値が低い。実際の動作は infrastructure 統合テストと API 統合テストで担保する |
| infrastructure | testcontainers 相当（または `make infra-up` の test DB）に対する sqlx クエリ検証。マイグレーションを含めたスキーマ整合性テスト |
| interfaces/http | `tower::ServiceExt::oneshot` でルーターを直接叩くユニット結合テスト |
| API 全体 | Postman / Newman の言語非依存統合テスト（既存方針） |
| frontend 純粋ロジック (`lib/` 直下) | Vitest + fast-check で純粋関数テスト。日付計算・計測項目バリデーション・フォーム値整形など |
| frontend インフラ抽象 (`lib/infra/`) | 実装側 (`createSystemClock` 等) は I/O ラッパなのでテスト不要。型と Provider 経由の差し替え動作を Storybook の decorator で実証 |
| frontend サーバー状態シグナル (`features/<f>/queries/`, `mutations/`) | **Vitest で単体テスト**。openapi-fetch クライアントをモックして、クエリキー・引数・成功時の `invalidateQueries`・エラー時の挙動を検証する。MSW は使わずクライアントを差し替える |
| frontend 画面状態シグナル (`features/<f>/state/`) | **Vitest で単体テスト**。`createXxxState` の初期値・更新・派生計算・LocalStorage 連動などをリアクティブに検証する |
| frontend Generic Presentational (`components/`) | **Storybook でカタログ化 + Chromatic で VRT**。Props のバリエーションを Story として並べる |
| frontend Domain Presentational (`features/<f>/components/`) | 同上。空状態 / ロード中 / エラー / 複数行データなどのバリエーションを Story として並べる |
| frontend Container (`features/<f>/containers/`) | テストしない。薄いグルーなのでテストしてもモック検証になるだけ。書きたくなったら `lib/` かシグナル側に切り出す |
| frontend Page (`routes/`) | テストしない。実 HTTP 経路は Newman で担保 |

## オブザーバビリティ

MVP は最小限：

- バックエンド: `tracing` の構造化ログを stdout。リクエストごとに
  `request_id` / `user_id`（あれば）/ `path` / `latency_ms` / `status` を出す
- 個人情報・パスワード・セッショントークンはログに出さない
- メトリクス・分散トレースは MVP では導入しない（運用フェーズで Prometheus
  exporter 等を追加する余地を残す）

## セキュリティ責務マップ

| 責務 | 担当レイヤー |
|---|---|
| 入力スキーマ検証 (型レベル) | interfaces/http の DTO デシリアライズ |
| ビジネスルール検証 (値オブジェクト・集約メソッド・ファクトリ) | domain |
| 認証 (Cookie → user_id) | interfaces/http のミドルウェア |
| 認可 (リソースが自分のものか) | application 層で `user_id` を必ずユースケース引数に取り、リポジトリクエリで `WHERE user_id = ?` を強制 |
| パスワードハッシュ化 | infrastructure (`Argon2PasswordHasher`) |
| 通信暗号化 | リバースプロキシ / ロードバランサ (運用層) |
| レート制限 | interfaces/http のミドルウェア |
| CORS | 既存の `build_cors_layer` を継承 |

## ディレクトリ構造（最終形）

```
triary/
├── backend/
│   ├── Cargo.toml
│   ├── migrations/
│   │   └── *.sql
│   └── src/
│       ├── main.rs                  # 既存。run() を呼ぶだけ
│       ├── lib.rs                   # ルーター組み立て
│       ├── config.rs                # 既存
│       ├── domain/
│       │   ├── mod.rs
│       │   ├── shared/              # 共通値オブジェクト (UserId, etc.)
│       │   ├── clock.rs             # Clock trait (現実の概念)
│       │   ├── password_hasher.rs   # PasswordHasher trait (現実の概念)
│       │   ├── user/
│       │   │   ├── mod.rs           # User 集約 + 値オブジェクト
│       │   │   ├── create.rs        # CreateUserInput / Validator / Validated / Factory
│       │   │   └── change_password.rs
│       │   ├── exercise/
│       │   │   ├── mod.rs           # Exercise 集約 + 値オブジェクト
│       │   │   ├── create.rs
│       │   │   ├── change_kinds.rs
│       │   │   └── reparent.rs
│       │   ├── session/
│       │   │   ├── mod.rs           # Session 集約 (ExerciseBlock, WorkoutSet)
│       │   │   ├── start.rs         # StartSessionInput / Validator / Validated / Factory
│       │   │   ├── append_block.rs
│       │   │   ├── append_set.rs
│       │   │   └── reassign_block_exercise.rs
│       │   └── error.rs             # DomainError
│       │   # NOTE: 複数集約をまたぐ「ワークフロー」が必要になったら
│       │   #       domain/workflows/ を新設する。MVP では不要
│       │   # NOTE: 永続化ポート (Repository, SessionStore) は application/ports/ へ
│       ├── application/
│       │   ├── mod.rs
│       │   ├── ports/               # 永続化ポート (アプリケーションの営み)
│       │   │   ├── user_repository.rs
│       │   │   ├── exercise_repository.rs
│       │   │   ├── session_repository.rs
│       │   │   └── session_store.rs
│       │   ├── auth/                # ユースケース
│       │   ├── exercises/
│       │   ├── sessions/
│       │   ├── history/
│       │   └── error.rs             # UseCaseError
│       ├── infrastructure/
│       │   ├── mod.rs
│       │   ├── db.rs                # sqlx pool
│       │   ├── repositories/        # application::ports::*Repository を実装
│       │   ├── password_hasher.rs   # domain::PasswordHasher を実装
│       │   ├── session_store.rs     # application::ports::SessionStore を実装
│       │   └── clock.rs             # domain::Clock を実装
│       └── interfaces/
│           ├── mod.rs
│           └── http/
│               ├── routes/
│               ├── dto/
│               ├── middleware/      # auth, rate-limit
│               └── error.rs         # HTTP マッピング
├── frontend/
│   └── src/                         # 上記の features ベース構成
└── openapi/
    └── openapi.yaml                 # 真実の源
```

## 設計フェーズ後段に送る決定事項

| 項目 | 後段で扱う場所 |
|---|---|
| プログレッションツリーの DB 表現 (隣接リスト / クロージャテーブル) | data-model |
| 計測項目セットの DB 表現 | data-model |
| ユーザー・セッション・記録の正規化形 | data-model |
| エンドポイント一覧と DTO スキーマ | api |
| OpenAPI スキーマの具体的な構造 | api |
| 各ユースケースのトランザクション境界の細部 | data-model + api 後の component 設計 |
| Argon2 のパラメータ値 | component / インフラ詳細 |

## アーキテクチャ判断のサマリー (ADR 候補)

以下の判断は、本ドキュメント自体が記録となるが、将来的に独立 ADR 化する候補：

1. **既存 4 層スキャフォールドを継承する** — 別アーキテクチャに置き換えない
2. **ドメイン層をリッチにする (CRUD 直叩きを避ける)** — 不変条件が複数あり、
   進化方向としてスコアリング・係数モデルが控えているため
3. **MVP では CQRS を適用しない** — ただし application で Command/Query を
   呼び分けやすい配置にしておく
4. **Cookie + サーバーセッションを採用する** — JWT を選ばない理由は失効
   コストと XSS 露出の回避
5. **同一オリジン配信を前提にする** — CSRF 対策を `SameSite=Lax` で済ませる
6. **タイムゾーンはフロントで完結** — サーバーに TZ 情報を持たない
7. **エラーは domain → application → http の 3 段階で変換** — 各層が
   下層の技術詳細に依存しない
8. **ドメインの生成・複雑ミューテーションは Input → Validator → Validated
   → Factory / apply_\* の型付きパイプライン** — 値検証の経路をコンパイラ
   で強制し、未検証データから集約が作られないことを型レベルで保証する。
   panic はプログラマのバグ専用、ユーザー入力起因の失敗はすべて
   `Result<_, DomainError>` で返す
9. **ポートトレイトは「現実の概念か / アプリケーションの営みか」で
   配置先を分ける** — `Clock` や `PasswordHasher` のように現実に存在する
   概念をモデル化したものは domain に置く。`Repository` / `SessionStore`
   のような永続化はアプリケーションの営みなので application に置く。
   infrastructure は domain と application の両方のポートに依存し、
   両方のトレイトを実装する。domain の Validator が外部事実を必要と
   する場合は、application が事前にロードしてプレーンな値（または
   高階関数）として引数で渡す
10. **ユースケースはロジックを持たない薄いグルーに保つ** — 入力 DTO 詰め
    替え → アプリケーションサービスと domain 部品を Result の `?` で
    つなぐ → 出力 DTO 詰め替え、しかしないこと。分岐や計算が出てきたら
    domain（ルール由来）か application サービス（アプリ固有ロジック）に
    抽出する。結果としてユースケース本体は単体テストを書く価値がない
    薄さになり、テスト努力は domain と application サービスと統合経路に
    集中させる
11. **フロントのインフラ抽象は `lib/infra/` に置き、`App.tsx` で具象化、
    Page で `useContext` 経由で取り出して Container に Props で渡す** —
    Container 以下の層は `useContext` を直接呼ばない。これにより Container
    と Presentational のテスト・差し替えが容易になる
12. **フロントのシグナル（サーバー状態 / 画面状態 / 永続化）は単体
    テストの対象** — リアクティブ挙動・クエリキー・成功時の invalidate・
    エラー処理・LocalStorage 連動などを Vitest で検証する。MSW は使わず
    openapi-fetch クライアントをモックする。コンポーネント（Presentational
    / Container / Page）はシグナルの結果を受け取るだけなので個別の単体
    テストは書かない
13. **コンポーネントは fully controlled（JS の状態を一切持たない）** —
    `createSignal` / `createStore` をコンポーネント内で呼ばない。開閉・
    選択中・フォーム入力中のような構造的な画面状態はすべて Props で
    受け取り、状態管理ロジックは `features/<f>/state/` のシグナルに
    住まわせる。これにより全バリエーションを Storybook で Props 切り替え
    だけで再現でき、シグナル側はコンポーネントとは独立に Vitest で
    テストできる
14. **CSS 擬似クラスで表現できる視覚状態は CSS に任せる** — `:hover` /
    `:focus` / `:active` / `:disabled` / `:checked` / `:focus-within` 等
    は CSS Modules / Tailwind の擬似クラスバリアントで書き、JS シグナルや
    Props には持ち上げない。理由は (a) ブラウザ DevTools の擬似クラス
    強制機能でエミュレートでき、(b) Storybook の擬似クラス操作アドオン
    で Story から切り替えられ、(c) JS に持ち上げると CSS と JS の二重
    管理になり DevTools・アドオンの恩恵を捨てることになるため
