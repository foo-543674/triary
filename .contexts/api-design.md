# triary API 設計 (MVP)

`requirements.md` / `specification.md` / `architecture.md` を踏まえた MVP の
HTTP API 設計。OpenAPI スキーマファーストの原則に従い、本ドキュメントは
**`openapi/openapi.yaml` を起こすための設計確定版** であって、最終的な真実の
源は `openapi/openapi.yaml` 側に置く。

スコープは `requirements.md` の Must Have（US-1〜US-10）に対応するエンドポイ
ントのみ。Should Have（スコアリング）/ Future は対象外。

## スコープ宣言（このドキュメントで決めること / 決めないこと）

**決める**:
- API スタイル / URL 規約 / バージョニング戦略
- 全エンドポイント一覧（HTTP メソッド・パス・操作意味）
- リクエスト / レスポンス DTO の **形** と命名（フィールド名・ネスト構造）
- エラーレスポンスの統一形式とエラーコード体系
- ページネーション仕様
- 認証の HTTP プロトコル仕様（Cookie 名・ヘッダ）

**決めない**（他のフェーズに任せる）:
- DTO を domain 型に詰め替えるロジックの配置層 → アーキテクチャ既決
- DB スキーマ・テーブル構造 → `design-data-model`
- フロントの API クライアント設計（`features/*/queries`・`mutations`） → `design-component`
- 認証ミドルウェア・Argon2 パラメータの実装詳細 → `design-component`
- フロント UI 上のラベル文言 → 後段

---

## 1. 共通仕様

### 1.1 API スタイルと 2 つのパスファミリ

triary は HTTP エンドポイントを **2 つの独立したパスファミリ** に分けて
配置する。両者は役割が根本的に異なるため、名前空間から明示的に分離する。

| ファミリ | ベースパス | 役割 | 想定利用者 | スタイル |
|---|---|---|---|---|
| **REST API** | `/api/v1` | ドメインリソース（Exercise / Session / ExerciseBlock / WorkoutSet / 履歴）の CRUD と検索。リソース指向 | 将来的に 3rd party クライアントに公開してもよい、語彙として閉じた API | REST |
| **Web UI BFF** | `/web/v1` | PWA フロントエンド専用のアクションエンドポイント。ブラウザセッションのライフサイクル管理（サインアップ / ログイン / ログアウト / 現在ユーザー情報 / パスワード変更） | triary 本体の PWA フロントエンドのみ | アクション指向（動詞パス） |

#### なぜ分けるか

1. **意味論の不一致**: `login` / `logout` は「リソースを作る / 消す」より
   「認証フローを進める」という **手続き** に近い。REST の語彙に `login`
   という動詞パスを混ぜると「REST っぽくない REST」になり、外部に公開
   する際の語彙一貫性が壊れる
2. **認可・認証モデルの違いへの備え**: REST API は将来的に Cookie 以外の
   認証（API Key / Bearer トークン）を受け付ける余地があるのに対し、
   `/web/v1` は **Cookie セッション専用** に固定する。名前空間を分けて
   おけばミドルウェアスタックを別にできる
3. **廃止・移行の独立性**: PWA フロントエンドを SolidJS から別のフレーム
   ワークに乗せ替えた場合に `/web/v1` の形が変わっても、`/api/v1` は
   そのまま保てる（あるいはその逆）。影響範囲が閉じる
4. **OpenAPI 上のタグ分離**: `openapi.yaml` 内で `tags` を `api-v1` /
   `web-v1` のように分け、生成されるクライアント / ドキュメントも別と
   して扱える

#### 両ファミリ共通の規約

| 項目 | 採用 | 理由 |
|---|---|---|
| バージョニング | どちらも URL path (`/api/v1`, `/web/v1`) | PWA キャッシュ中の旧クライアントを壊さないため、最初から `v1` を明示。将来の破壊的変更時は `v2` を並走 |
| 命名規則 | パス: kebab-case / リソース: 複数形 / フィールド: snake_case | パスは URL らしく、フィールドは Rust / OpenAPI / SQL すべてで自然な snake_case に統一する。フロント側は openapi-typescript の生成型をそのまま使う |
| Content-Type | `application/json; charset=utf-8` | JSON 1 本に絞る |
| 文字コード | UTF-8 | |
| 日付 / 時刻 | ISO 8601 文字列。`workout_date` は `YYYY-MM-DD`、`started_at` / `ended_at` は `YYYY-MM-DDTHH:MM:SSZ`（UTC 固定で末尾 `Z`） | サーバーは TZ を持たないため UTC を返し、フロントが表示時に Intl で変換（arch 既決） |
| エラー形式 | §1.6 で定義する `errors[]` 配列構造を両ファミリで共通化 | フロント実装が 2 つのエラー形式を扱わずに済む |
| 認証 | 両ファミリとも同一の Cookie `triary_session` を受け付ける（MVP） | ログインを `/web/v1` で行い、その Cookie で `/api/v1` を叩く。将来 `/api/v1` に Bearer トークンを追加しても Cookie の受け入れは維持する |

### 1.2 リソース命名と URL 設計の方針

ここで述べる方針は **`/api/v1` (REST API)** に対するもの。`/web/v1`
(Web UI BFF) は動詞パスを許容するので対象外（§2.2 で個別に仕様化）。

- リソース指向 URL を基本とする。CRUD で素直に表現できない操作（セッション
  終了 / 種目の親付け替え / プリセットの複製）は **サブリソースの POST**
  または **専用パスの POST** で表現する
- ネストは **最大 2 階層**。`/sessions/{id}/blocks/{blockId}/sets/{setId}`
  のような 3 階層を避けるため、`block` / `set` は **疑似トップレベルリソース**
  として `/blocks/{blockId}` / `/sets/{setId}` を持たせる。所有チェック
  （`block.session_id` / `set.block_id`）はサーバー側で行う
- リスト系エンドポイントは必ずページネーションを持つ
- **他ユーザーのリソース**へのアクセス試行は **404 を返す**（存在露呈防止。
  仕様 NF §認可で既決）。これは「パス上のリソースは存在するが権限外」を
  403 で露呈させないための例外で、パスセマンティクスとしての 404 ではなく
  「意図的に 404 に寄せる」処理

### 1.3 認証プロトコル

| 項目 | 仕様 |
|---|---|
| セッショントークン | サーバー発行のランダム 256bit。Cookie 名 `triary_session` |
| Cookie 属性 | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=2592000` (30 日) |
| 認証必須エンドポイント | `/web/v1/signup`, `/web/v1/login`, `/health` 以外すべて (詳細は §2.1 を参照) |
| 未認証アクセス | `401 Unauthorized` + `{"errors":[{"code":"unauthenticated","message":"..."}]}` （§1.6 の共通エラー envelope と一致） |
| ログアウト | `POST /web/v1/logout` でサーバー側の `user_sessions` 行を削除し、`Set-Cookie: triary_session=; Max-Age=0` を返す |
| CSRF 対策 | 同一オリジン配信前提で `SameSite=Lax` のみ。クロスオリジン化したら double-submit cookie をヘッダ `X-CSRF-Token` で追加（運用フェーズ判断） |

### 1.4 共通レスポンス構造

triary は **envelope を採用しない**。リソースを直接 JSON のトップレベルに
返す。リスト系のみ envelope を持つ：

```json
// 単一リソース取得
{
  "id": "exr_01HZ...",
  "name": "ベンチプレス",
  ...
}

// リスト
{
  "items": [ {...}, {...} ],
  "page_info": {
    "next_cursor": "eyJ3...",   // null なら次ページなし
    "has_next": true
  }
}
```

理由：
- envelope (`{data, meta, error}`) は MVP には過剰
- リスト系のページ情報だけは構造が必要なので `items` + `page_info` で
  最小限に統一する
- エラーは別構造で返す（後述）

### 1.5 ページネーション仕様

| 種別 | 方式 | 採用箇所 |
|---|---|---|
| カーソル | `?cursor=<opaque>&limit=<n>` | 履歴系（時系列降順、追記中心）: `GET /history/sessions`, `GET /history/exercises/{id}` |
| 非ページング | 全件返す | `GET /exercises`, `GET /exercises/{id}/tree` (件数上限が小さい：種目数 数十〜数百、ツリー深さ 8 / 子数 16) |

カーソル方式の選定理由：
- 履歴系は時系列降順 + 末尾追記中心。offset 方式だと新規追加で
  ページ境界がずれる
- カーソルは **不透明文字列**（base64url）として扱い、サーバー側の
  実装詳細（複合キー `(workout_date, session_id)` 等）を漏らさない
- `limit` は `1〜100`、デフォルト `30`（仕様の S-6 ページサイズと整合）

カーソルのエンコード仕様：
- バックエンドは内部的に「直前の項目のキー」を JSON 化 → base64url
- 復号失敗時は `400 invalid_format` on `cursor`
- ページサイズ変更でも安全に動作する

### 1.6 エラーレスポンス統一形式

**全てのエラーレスポンスは必ず `errors` 配列を持つ**。単一エラーの場合でも
要素数 1 の配列になる。これは以下の体験を防ぐための意図的な設計：

> `name` に長さ制限と文字種制約の両方があるとき、"foo(testname)" を送ると
> 先に「長さ超過」だけ返る。ユーザーが長さを直して再送すると今度は「使え
> ない文字」が返る。ユーザーは段階的にしか自分の間違いを知れず、submit
> ごとに 1 つずつ潰していく劣悪な体験になる。

これを避けるため、サーバーは **fail-fast しない**。少なくとも以下の 2 段階
ではエラーを全件収集して返す：

1. **単一フィールド内の複数制約違反**（例: `name` の長さと文字種の両方）
2. **同一リクエストボディ内の複数フィールド**（例: `name` と `password`
   の両方が不正）

#### レスポンス構造

```json
{
  "errors": [
    {
      "code": "too_long",
      "field": "name",
      "message": "Must be 64 characters or fewer"
    },
    {
      "code": "invalid_charset",
      "field": "name",
      "message": "Only hyphen and underscore are allowed as symbols"
    }
  ]
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `errors` | 必須 | 1 件以上のエラー要素の配列。順序に意味はない |
| `errors[].code` | 必須 | プログラム的に判別する **エラーコード**。snake_case の API 独自語彙。内部実装の例外型・SQL エラーコードを **絶対に漏らさない** |
| `errors[].message` | 必須 | デバッグ向け短文。フロントは原則そのままユーザーに見せず、`code` と `field` の組に基づき自前の文言を出す |
| `errors[].field` | 任意 | バリデーション系の場合、問題のあったフィールドのパス。ネストは `blocks[0].sets[1].reps` のようにドット / ブラケット記法。フィールド非依存のエラー（`not_found`, `unauthenticated` 等）では省略 |

#### コード設計の大原則: **コードに field 名を埋め込まない**

エラーコードは **違反の種類** のみを表現し、**どのフィールドの話か** は
`field` 側だけで表現する。つまり `user_id_too_short` / `password_too_short`
のように field 名を混ぜたコードは **作らない**。両方とも `code: "too_short"`
で、`field` が `user_id` / `password` と区別する。

理由：
- **情報の重複**: `field` に主語があるのに `code` にも埋めるのは二重管理
- **クライアントの分岐爆発**: `user_id_too_short` / `password_too_short` /
  `exercise_name_too_short` ... を個別にハンドリングせざるを得なくなる。
  汎用の「`too_short` ならこのメッセージテンプレートで表示」という書き方
  が使えない
- **新フィールド追加のたびにコード体系が広がる**: 種目のコメント機能を
  追加しました → `comment_too_long` を新設、みたいなことが起きる。`code`
  は違反の種類だけに閉じるべき
- **i18n / フロントのメッセージ辞書**: クライアントは `(code, field)`
  の組で辞書引きすればよい

#### 単一エラーの例

フィールドに紐付かないエラー（リソース不存在など）:

```json
{
  "errors": [
    {
      "code": "not_found",
      "message": "Exercise not found"
    }
  ]
}
```

フィールドに紐付く違反は `field` で主語を示す:

```json
{
  "errors": [
    {
      "code": "already_taken",
      "field": "name",
      "message": "This name is already in use"
    }
  ]
}
```

#### HTTP ステータスの決定

複数エラーが含まれるとき、HTTP ステータスは **配列内で最も severe な
エラーに従う** 単一値を返す。severity 順は `500 > 401 > 403 > 404 > 409 > 429 > 400`。
ただし MVP では実際に混ざるのはほぼ 400 系同士（バリデーション系）なの
で、混在時は 400 を返す。401 / 404 / 409 が単独で発生する場合はバリデー
ション収集を打ち切ってそのエラー 1 件だけを返す（例: セッション自体が
見つからないときにブロック更新のフィールド検証を続けても意味がない）。

#### バックエンドの実装方針（API 設計の一部として規定）

- `domain::Validator`（arch §Create フローの 4 役割）は `Result<Validated, Vec<DomainError>>`
  を返す。単一の `DomainError` ではなく **収集型**
- 1 つの値オブジェクトの中で複数違反が出るケース（例: `ExerciseName` の
  長さと文字種）は `ExerciseName::try_new` が `Result<_, Vec<DomainError>>`
  を返す
- 複数フィールドを持つ `Input` の Validator は、各フィールドの検証結果を
  連結してから返す（失敗があったら即 `return` しない）
- interfaces/http レイヤの DTO → `Input` 詰め替え段階のエラー（JSON 型
  不一致など）は serde 側で発生するが、この段階で 1 件だけ出てしまうの
  は許容する（構造的エラーは 1 個出た時点で後続が意味を持たないため）

#### HTTP ステータスコードのセマンティクス

各ステータスコードは **HTTP プロトコル層の関心事** に限定して使い、ドメイン
バリデーションエラーは原則すべて **400** に集約する。ドメインエラーの種別は
`errors[].code` で表現する。

| HTTP | 使いどころ | 使わないケース |
|---|---|---|
| **400** | **ドメインバリデーションエラー全般**。入力値が受け付けられない理由すべて。値そのものの不正（長さ・文字種・値域）、ボディで参照された ID が存在しない、既存値と衝突して受け付けられない（ユーザー ID 重複、種目名衝突）、ドメインルール違反（プログレッションの循環・上限超過）、状態依存で拒否されるケース（既存記録ありの計測項目変更）もすべてここ | パス上のリソース不存在 → 404。楽観ロック衝突 → 409 |
| **401** | 認証トークンが無い / 無効 / ログイン失敗 | 認可（別ユーザーのリソース）は 404 に寄せる |
| **403** | **パス対象は可視**だが操作が禁じられている場合のみ。MVP ではプリセット種目の編集・削除試行（spec US-4 で明示）。プリセットは全ユーザーから見えるので存在露呈の懸念がないため 403 でよい | 他人のリソースは 404 に寄せる |
| **404** | **パスパラメータが指すリソースが存在しないとき**。加えて「他ユーザーのリソースへのアクセス試行」を存在露呈防止のため 404 に寄せる | リクエストボディで参照された ID が存在しない場合は 400（バリデーションエラー） |
| **409** | **楽観的排他制御によるコンフリクト**専用。既存行の同時更新で ETag / バージョンカラムが噛み合わなかった場合のみ。MVP では **未使用**（楽観ロックを導入していない）。ETag 対応を入れる将来拡張のために予約 | ユーザー ID 重複・種目名衝突は「入力値の検証エラー」なので 400 |
| **429** | レート制限超過 | |
| **500** | 予期しない内部例外 | `message` に内部詳細を出さない |

`errors[].code` は **フィールド横断で再利用される汎用コード**。どの
フィールドに対する違反かは必ず `field` で特定する。`DomainError` enum
（arch §domain エラーの分類）と N:1 対応にはならず、`(code, field)` の
組で個別違反を表現する。

#### フィールド依存のコード（`field` 必須）

| `code` | 意味 | 主な `field` 例 |
|---|---|---|
| `required` | 必須フィールドが欠けている | `workout_date`, `sets[0].reps` |
| `too_short` | 文字列長が下限を下回る | `user_id`, `password` |
| `too_long` | 文字列長が上限を超える | `user_id`, `password`, `name`, `note` |
| `invalid_charset` | 許可された文字種以外が含まれる | `user_id`, `name` |
| `invalid_format` | 文字列フォーマットが不正 | `workout_date`, `cursor`, `started_at` |
| `empty` | リスト / オブジェクトが空 | `measurement_kinds`, `sets[0]`（セットが全 null） |
| `out_of_range` | 数値が許容範囲外 | `weight_kg`, `reps`, `duration_seconds`, `interval_seconds` |
| `in_future` | 未来日付が許されないのに未来を指している | `workout_date` |
| `before_start` | 「開始時刻より前」を設定しようとした | `ended_at` |
| `reserved` | 予約語を使おうとした | `user_id` |
| `already_taken` | 既存値との衝突（ユニーク制約系） | `user_id`, `name` |
| `not_found` | ボディで参照された ID が存在しない / 他人のリソース | `parent_id`, `exercise_id` |
| `locked_by_existing_records` | 既存記録があり変更できない | `measurement_kinds` |
| `incompatible_with_existing_sets` | 既存セットと新しい選択が矛盾する | `exercise_id`（ブロックの種目差し替え） |
| `creates_cycle` | 指定によりグラフに循環が生じる | `parent_id` |
| `exceeds_max_depth` | ツリーの深さ上限を超える | `parent_id` |
| `exceeds_max_children` | ツリーの子数上限を超える | `parent_id` |
| `missing_required_measurement` | 種目が必須としている計測項目がセットに欠けている | `sets[0]`（どの計測項目が欠けているかは message / details で） |

#### フィールド非依存のコード（`field` 省略）

| HTTP | `code` | 意味 |
|---|---|---|
| 401 | `unauthenticated` | セッション Cookie が無い / 無効 |
| 401 | `invalid_credentials` | ログイン / パスワード変更時の現在パスワード不一致。ID 露呈を避けるため詳細は返さない |
| 403 | `preset_not_modifiable` | パス対象は可視だが操作が許されない（プリセット編集） |
| 404 | `not_found` | パスパラメータが指すリソースが存在しない / 他ユーザーのリソース |
| 409 | （MVP 未使用。将来 `version_conflict` 等を予約） | 楽観ロック衝突 |
| 429 | `rate_limited` | レート制限超過 |
| 500 | `internal_error` | 予期しない内部例外 |

#### 「パスの not_found」と「ボディ参照の not_found」の区別

両方とも `code: "not_found"` を使うが、**HTTP ステータスと `field` の
有無** で明確に区別される：

- **パスの `not_found`**: HTTP 404、`field` は省略。リクエスト全体が
  成立しないことを意味する
- **ボディ参照の `not_found`**: HTTP 400、`field` に参照元フィールド名
  （`parent_id`, `exercise_id` 等）。リクエスト自体は成立していて、その
  中の特定フィールドの値が不正という意味

クライアントは `status + field` の有無で機械的に 2 つを分岐できる。

### 1.7 バリデーション境界値

`specification.md` の主要前提と一致させる。境界値は仕様書を真実の源とし、
本ドキュメントでは API レイヤで参照する形だけ示す：

| フィールド | 制約 |
|---|---|
| `user_id` | `^[a-z0-9_-]{3,32}$`、保存時に小文字正規化、予約語不可 |
| `password` | 12〜128 文字 |
| `exercise.name` | 1〜64 文字、ユーザー内（プリセット含む）でユニーク |
| `exercise.measurement_kinds` | 1 件以上必須。各要素 `{kind: reps|weight|time, required: bool}` |
| `weight` | -500.0〜999.9（kg, 0.1 刻み） |
| `reps` | 0〜9999 |
| `duration_seconds` | 0〜86400 |
| `interval_seconds` | 0〜3600 |
| `workout_date` | 過去〜クライアントローカル日付（未来不可） |

---

## 2. エンドポイント一覧

2 つのパスファミリ + ヘルスチェックで構成する：

- **§2.1 Web UI BFF (`/web/v1`)**: サインアップ / ログイン / ログアウト /
  現在ユーザー情報 / パスワード変更
- **§2.2〜2.6 REST API (`/api/v1`)**: 種目 / セッション / ブロック / セット
  / 履歴の CRUD と検索
- **§2.7 health** (`/health`): 既存維持、バージョン外

---

### 2.1 Web UI BFF (`/web/v1`)

PWA フロントエンドのセッションフローを支える動詞指向エンドポイント群。
リクエスト / レスポンス DTO は REST API 側と同じ規約（snake_case、ISO 8601、
§1.6 のエラー形式など）に従う。

#### POST /web/v1/signup

- 概要: サインアップ（US-1）
- 認証: 不要
- リクエスト:
  ```json
  { "user_id": "alice", "password": "correcthorsebatterystaple" }
  ```
- レスポンス 201: 自動ログイン状態。`Set-Cookie: triary_session=...` を付与
  ```json
  { "user_id": "alice" }
  ```
- エラー:
  - 400 on `user_id`: `too_short` / `too_long` / `invalid_charset` / `reserved` / `already_taken`
  - 400 on `password`: `too_short` / `too_long`
  - 429 `rate_limited`
- 備考:
  - 「新しいユーザーリソースを作る」より「サインアップフローを完走する
    (成功 = 自動ログイン + Cookie 発行)」というアクション面が強いため、
    REST 側 (`POST /api/v1/users`) ではなく Web UI BFF に置く
  - サインアップレート制限は IP/1h 5 件（spec NF）
  - `user_id` は小文字正規化して保存する

#### POST /web/v1/login

- 概要: ログイン（US-2）
- 認証: 不要
- リクエスト: `{ "user_id": "alice", "password": "..." }`
- レスポンス 200: `Set-Cookie: triary_session=...` 付与
  ```json
  { "user_id": "alice" }
  ```
- エラー: 401 `invalid_credentials`（ID 存在の有無を露呈しないため一律）、429 `rate_limited`
- 備考: ログイン失敗は IP/1min 10 回まで（spec NF）

#### POST /web/v1/logout

- 概要: ログアウト（US-2）
- 認証: 必要
- リクエスト: 空ボディ
- レスポンス 204: `Set-Cookie: triary_session=; Max-Age=0`
- 備考: 該当 `user_sessions` 行を即座に削除する

#### GET /web/v1/me

- 概要: 現在ログイン中のユーザー情報を返す
- 認証: 必要
- レスポンス 200: `{ "user_id": "alice" }`
- 用途: PWA 起動時にセッション有効性を確認する

#### POST /web/v1/change-password

- 概要: パスワード変更（US-3）
- 認証: 必要
- リクエスト:
  ```json
  { "current_password": "...", "new_password": "..." }
  ```
- レスポンス 204
- エラー:
  - 401 `invalid_credentials`（現在パスワード不一致）
  - 400 on `new_password`: `too_short` / `too_long`
- 備考:
  - 「変更前の検証 → 新値適用」という手続き的操作なので動詞パスで表現
    する（REST 側に `PUT /me/password` を置かない）
  - MVP では既存セッションは無効化しない（spec US-3）

---

以降 §2.2〜§2.6 は **REST API (`/api/v1`)** のエンドポイント。すべて
Cookie セッション認証必須（未認証は 401 `unauthenticated`）。

### 2.2 exercises

#### GET /api/v1/exercises

- 概要: 自分が参照できる種目の一覧。プリセットと自分の種目を混在で返す
  （US-4 / US-5）
- 認証: 必要
- クエリパラメータ:
  - `q` (任意): 名前部分一致フィルタ
  - `owned_only` (任意, bool): true で自分の種目のみ
- レスポンス 200:
  ```json
  {
    "items": [
      {
        "id": "exr_01HZ...",
        "name": "ベンチプレス",
        "owner": "preset",                   // "preset" | "user"
        "measurement_kinds": [
          {"kind": "reps",   "required": true},
          {"kind": "weight", "required": true}
        ],
        "parent_id": null,
        "depth": 0
      }
    ]
  }
  ```
- 備考: 件数が小さいためページネーションなし。`depth` はツリー上の深さ
  （0 が根）

#### GET /api/v1/exercises/{exercise_id}

- 概要: 種目詳細
- 認証: 必要
- レスポンス 200: 上記 list 要素と同じ形 + `created_at`
- エラー: 404 `not_found`

#### POST /api/v1/exercises

- 概要: 自分の種目を新規作成（US-5）
- 認証: 必要
- リクエスト:
  ```json
  {
    "name": "アシスト懸垂",
    "measurement_kinds": [
      {"kind": "reps",   "required": true},
      {"kind": "weight", "required": false}
    ],
    "parent_id": "exr_01HX..."   // null 可
  }
  ```
- レスポンス 201: 作成された種目（GET と同形）
- エラー:
  - 400 on `name`: `empty` / `too_long` / `invalid_charset` / `already_taken`
  - 400 on `measurement_kinds`: `empty`
  - 400 on `parent_id`: `not_found`（存在しない / 他ユーザー / プリセットで自分からは参照不可）/ `creates_cycle` / `exceeds_max_depth` / `exceeds_max_children`

備考: `parent_id` はパスではなくボディの参照なので、存在しない場合は
HTTP 404 ではなく **400 `not_found` on `parent_id`**（入力値の検証エラー）
として扱う。

#### PATCH /api/v1/exercises/{exercise_id}

- 概要: 自分の種目の編集（US-5）
- 認証: 必要
- リクエスト（部分更新、提供されたフィールドだけ更新）:
  ```json
  {
    "name": "新しい名前",
    "measurement_kinds": [...],
    "parent_id": "exr_01HX..."
  }
  ```
- レスポンス 200: 更新後の種目
- エラー:
  - 404 `not_found`（パスの種目が存在しない / 他ユーザー）
  - 403 `preset_not_modifiable`（spec US-4。プリセットは全ユーザー可視
    のため存在露呈の懸念なし、404 寄せではなく 403）
  - 400 on `name`: `empty` / `too_long` / `invalid_charset` / `already_taken`
  - 400 on `measurement_kinds`: `empty` / `locked_by_existing_records`
  - 400 on `parent_id`: `not_found` / `creates_cycle` / `exceeds_max_depth` / `exceeds_max_children`

備考: `parent_id` の付け替えもこの PATCH に含める。専用エンドポイント
（`PUT /exercises/{id}/parent`）を作らない理由：操作粒度の差はトランザク
ション境界の話であって URL 形状の話ではないため、HTTP 上は PATCH 1 本に
集約する。

#### DELETE /api/v1/exercises/{exercise_id}

- 概要: 自分の種目を削除（US-5）
- 認証: 必要
- レスポンス 204
- 動作: 紐づく `exercise_block` / `workout_set` を **カスケード削除** する。
  子の種目（プログレッションの子）は **孤立させる**（親 NULL に更新）
- エラー: 404 `not_found`、403 `preset_not_modifiable`

#### POST /api/v1/exercises/{exercise_id}/clones

- 概要: 種目を「自分用にコピー」する（US-4）。プリセット種目を自分の編集
  可能な種目として複製する用途
- 認証: 必要
- リクエスト: 空ボディ（または `{"name": "..."}` で改名指定可）
- レスポンス 201: 新しく作られた自分の種目（GET と同形）
- エラー: 404 `not_found`（クローン元が存在しない）、400 `already_taken` on `name`（改名指定が既存と衝突）

URL について: REST のリソース指向に寄せるなら `/exercise-copies` のような
トップレベル POST も検討したが、`{exercise_id}` を URL から特定できる方が
直感的なため、既知パターン「サブリソース POST = 派生エンティティの生成」を
採用する。`clones` を複数形にしているのは「コピーは複数作れる」ことを示す。

#### GET /api/v1/exercises/{exercise_id}/tree

- 概要: 指定種目をルートとするプログレッションサブツリーを返す（US-6 /
  US-10 のツリー集約モード用）
- 認証: 必要
- レスポンス 200:
  ```json
  {
    "root_id": "exr_01HZ...",
    "nodes": [
      {
        "id": "exr_01HZ...",
        "name": "ハンドスタンドプッシュアップ",
        "owner": "preset",
        "measurement_kinds": [...],
        "parent_id": null,
        "children_order": ["exr_01HY...", "exr_01HW..."]
      },
      ...
    ]
  }
  ```
- 備考: ツリーをフラットな配列で返し、`children_order` で兄弟順序を表現
  する（順序情報を `children` ネストに混ぜず正規化する）。深さ最大 8 / 子数
  最大 16 制約により単一レスポンスで完結する

### 2.3 sessions（書き込み中心）

#### POST /api/v1/sessions

- 概要: トレーニングセッションを開始する（US-7）
- 認証: 必要
- リクエスト:
  ```json
  {
    "workout_date": "2026-04-08",  // 任意。省略時はサーバーが UTC date を使うのではなく "クライアント送信必須" にする
    "note": null
  }
  ```
- レスポンス 201:
  ```json
  {
    "id": "ses_01HZ...",
    "workout_date": "2026-04-08",
    "started_at": "2026-04-08T11:23:45Z",
    "ended_at": null,
    "note": null,
    "blocks": []
  }
  ```
- エラー: 400 on `workout_date`: `required` / `invalid_format` / `in_future`

備考: `workout_date` は **クライアント必須**。理由：サーバーは TZ を持たな
いため、ローカル日付の決定はフロント責務（arch / spec 既決）。空で送ると
400 を返す。

#### GET /api/v1/sessions/{session_id}

- 概要: セッション 1 件の取得（編集画面・履歴詳細で使用）
- 認証: 必要
- レスポンス 200: 完全な集約（blocks + sets まで含む）
  ```json
  {
    "id": "ses_01HZ...",
    "workout_date": "2026-04-08",
    "started_at": "2026-04-08T11:23:45Z",
    "ended_at": "2026-04-08T12:30:00Z",
    "note": "脚の日",
    "blocks": [
      {
        "id": "blk_01HZ...",
        "exercise_id": "exr_01HZ...",
        "exercise_name": "バックスクワット",
        "exercise_measurement_kinds": [...],
        "order": 0,
        "sets": [
          {
            "id": "set_01HZ...",
            "order": 0,
            "reps": 5,
            "weight_kg": 100.0,
            "duration_seconds": null,
            "interval_seconds": 120
          }
        ]
      }
    ]
  }
  ```
- エラー: 404 `not_found`

備考: ブロック内に `exercise_name` / `exercise_measurement_kinds` を **デ
ノーマライズして同梱** する。理由：履歴閲覧時に種目テーブルを別途叩かなく
て済む / 種目が削除されてもセッション履歴の表示が壊れないようにできる
（カスケード削除されないケースは現状ないが、表示のためだけに再 fetch を
減らす）。詰め替えはサーバー側の DTO 化レイヤで行う。

#### PATCH /api/v1/sessions/{session_id}

- 概要: セッション本体の属性編集（`workout_date` / `note` / `ended_at`）
- 認証: 必要
- リクエスト（部分更新）:
  ```json
  { "workout_date": "2026-04-07", "note": "...", "ended_at": "2026-04-08T12:30:00Z" }
  ```
- レスポンス 200: 更新後のセッション（完全形）
- エラー:
  - 404 `not_found`
  - 400 on `workout_date`: `invalid_format` / `in_future`
  - 400 on `ended_at`: `before_start`

#### POST /api/v1/sessions/{session_id}/end

- 概要: セッションを「終了」する（US-7）。`ended_at` をサーバー現在時刻に
  設定する明示操作
- 認証: 必要
- リクエスト: 空ボディ
- レスポンス 200: 更新後のセッション（完全形）
- 冪等性: 既に終了済みなら 204 ではなく 200 で同じ表現を返す（多重実行
  しても害はない＝冪等）
- エラー: 404 `not_found`

#### DELETE /api/v1/sessions/{session_id}

- 概要: セッション削除（US-8）。配下の `blocks` / `sets` をカスケード削除
- 認証: 必要
- レスポンス 204
- エラー: 404 `not_found`

#### POST /api/v1/sessions/{session_id}/blocks

- 概要: セッションに種目ブロックを追加（US-7）
- 認証: 必要
- リクエスト:
  ```json
  { "exercise_id": "exr_01HZ..." }
  ```
- レスポンス 201: 追加されたブロック（`order` はサーバーが末尾割当）
  ```json
  {
    "id": "blk_01HZ...",
    "session_id": "ses_01HZ...",
    "exercise_id": "exr_01HZ...",
    "exercise_name": "...",
    "exercise_measurement_kinds": [...],
    "order": 3,
    "sets": []
  }
  ```
- エラー:
  - 404 `not_found`（パス上の session が存在しない / 他ユーザー）
  - 400 `not_found` on `exercise_id`（ボディの種目が存在しない / 他ユーザーの種目）

### 2.4 blocks（疑似トップレベル）

ネスト深さ 2 階層維持のため、`blocks` は `/sessions/{id}/blocks` 配下では
なく **トップレベル `/blocks/{block_id}` でも触れる** ようにする。所有関係
は `block.session_id → session.user_id` でサーバー側にて照合。

#### PATCH /api/v1/blocks/{block_id}

- 概要: ブロックの編集（種目差し替え / 並び順変更）
- 認証: 必要
- リクエスト（部分更新）:
  ```json
  { "exercise_id": "exr_01HZ...", "order": 2 }
  ```
- レスポンス 200: 更新後のブロック
- エラー:
  - 404 `not_found`（パス上の block が存在しない / 他ユーザー）
  - 400 on `exercise_id`: `not_found` / `incompatible_with_existing_sets`
    （計測項目セットが既存セットと矛盾する場合。spec US-8）

備考: `order` 変更は単一ブロックに対する手続きとして扱う。サーバー側で
同セッション内の他ブロックの `order` を再採番する（クライアントから配列
全体を送らせない）。

#### DELETE /api/v1/blocks/{block_id}

- 概要: ブロック削除。配下のセットをカスケード削除（US-8）
- 認証: 必要
- レスポンス 204
- エラー: 404 `not_found`

#### POST /api/v1/blocks/{block_id}/sets

- 概要: ブロックにセットを追加（US-7）
- 認証: 必要
- リクエスト:
  ```json
  {
    "reps": 8,
    "weight_kg": 80.0,
    "duration_seconds": null,
    "interval_seconds": 120
  }
  ```
- レスポンス 201: 追加されたセット（`order` はサーバーが末尾割当）
- エラー:
  - 404 `not_found`（パス上の block が存在しない / 他ユーザー）
  - 400 on `reps` / `weight_kg` / `duration_seconds` / `interval_seconds`: `out_of_range`
  - 400 on `reps` / `weight_kg` / `duration_seconds`: `required`（種目の必須計測項目が欠けている場合）
  - 400 `empty`（全計測項目が null の場合、`field` はセット自体）

備考: 完全に空のセット（全フィールドが null）はサーバー側で「保存しない」
とは扱わず、API レイヤとしては 400 `empty`（`field` はセットのパス）を返す。spec US-7 の「空セ
ットは破棄される」はフロント側の UX で吸収する（保存ボタンを押さなけれ
ばリクエストが飛ばないようにする）。サーバーが暗黙に成功を返すと「保存
されたつもりが保存されていない」状態を生むため、API では明示エラーにする。

### 2.5 sets（疑似トップレベル）

#### PATCH /api/v1/sets/{set_id}

- 概要: セットの編集（数値変更 / 並び順変更）
- 認証: 必要
- リクエスト（部分更新）:
  ```json
  { "reps": 10, "weight_kg": 82.5, "interval_seconds": 90, "order": 1 }
  ```
- レスポンス 200: 更新後のセット
- エラー:
  - 404 `not_found`
  - 400 on `reps` / `weight_kg` / `duration_seconds` / `interval_seconds`: `out_of_range`
  - 400 on 必須計測項目フィールド: `required`
  - 400 `empty`（全計測項目が null になる編集）

#### DELETE /api/v1/sets/{set_id}

- 概要: セット削除
- 認証: 必要
- レスポンス 204
- エラー: 404 `not_found`

### 2.6 history

履歴閲覧は **書き込み API（`/sessions`）の参照では効率が悪い** ため、
専用の Query エンドポイントを切る。arch §CQRS で「Command と Query を
分けて配置する」と決めているのに対応する HTTP 表現。

#### GET /api/v1/history/sessions

- 概要: 日付別履歴ビュー（US-9）。セッションを `workout_date` 降順で返す
- 認証: 必要
- クエリパラメータ:
  - `from` (任意, `YYYY-MM-DD`): この日付以降
  - `to` (任意, `YYYY-MM-DD`): この日付以前
  - `cursor` (任意): 続きを取得するための不透明トークン
  - `limit` (任意, 1〜100, default 30)
- レスポンス 200:
  ```json
  {
    "items": [
      {
        "id": "ses_01HZ...",
        "workout_date": "2026-04-08",
        "started_at": "2026-04-08T11:23:45Z",
        "ended_at": "2026-04-08T12:30:00Z",
        "block_count": 5,
        "set_count": 18,
        "exercise_summary": [
          {"exercise_id": "exr_01HZ...", "exercise_name": "バックスクワット"},
          ...
        ]
      }
    ],
    "page_info": { "next_cursor": "eyJ...", "has_next": true }
  }
  ```
- 備考: 一覧では blocks / sets の **詳細を返さない**（over-fetching 防止）。
  詳細は `GET /sessions/{id}` で取りに行く

#### GET /api/v1/history/exercises/{exercise_id}

- 概要: 種目別履歴ビュー（US-10）
- 認証: 必要
- クエリパラメータ:
  - `include_descendants` (任意, bool, default false): true でツリー集約
    モード（プログレッション子孫も時系列で混ぜて返す）
  - `cursor` / `limit`
- レスポンス 200:
  ```json
  {
    "items": [
      {
        "block_id": "blk_01HZ...",
        "session_id": "ses_01HZ...",
        "workout_date": "2026-04-08",
        "started_at": "2026-04-08T11:23:45Z",
        "exercise_id": "exr_01HZ...",
        "exercise_name": "パイクプッシュアップ",
        "is_root_exercise": false,
        "sets": [
          {
            "id": "set_01HZ...",
            "order": 0,
            "reps": 8,
            "weight_kg": null,
            "duration_seconds": null,
            "interval_seconds": null
          }
        ]
      }
    ],
    "page_info": { "next_cursor": "eyJ...", "has_next": true },
    "previous_summary": {
      "exercise_id": "exr_01HZ...",
      "exercise_name": "パイクプッシュアップ",
      "workout_date": "2026-04-08",
      "sets": [...]
    }
  }
  ```
- 備考:
  - `is_root_exercise` は「リクエストされた種目そのものに対する記録か、
    子孫種目への記録か」を示す。フロントが UI 上「どの段階の記録か」を
    強調表示するために使う
  - `previous_summary` は spec US-10「前回の数値を一目で把握できる」UI
    のための専用フィールド。先頭ページにのみ含める（cursor 指定時は省略）
  - **数値の合算は行わない**（spec US-10 境界条件、reps と秒数を足せない
    ため）。あくまで時系列の混合表示

---

### 2.7 health

どちらのパスファミリにも属さないスタンドアロンのヘルスチェック。バージ
ョニングしない（監視ツールが常に同じ URL を叩けるようにするため）。

#### GET /health

- 概要: ヘルスチェック（既存実装を維持）
- 認証: 不要
- レスポンス 200: `{"status":"ok"}`

---

## 3. リソース ID 体系

| リソース | プレフィックス | 例 |
|---|---|---|
| User | `usr_` | `usr_01HZ...` |
| Exercise | `exr_` | `exr_01HZ...` |
| Session | `ses_` | `ses_01HZ...` |
| ExerciseBlock | `blk_` | `blk_01HZ...` |
| WorkoutSet | `set_` | `set_01HZ...` |

- ID 本体は **ULID**（時系列ソートしやすい / URL safe / 衝突しない）
- API レイヤでは `{prefix}_{ulid}` の文字列として扱う。プレフィックスは
  クライアントの取り違え防止と API ログの可読性のため
- DB 内部での持ち方（ULID をそのまま CHAR(26) で持つ vs BINARY(16)）は
  data-model フェーズで決める。API はどちらでも吸収できる

---

## 4. バージョニング戦略

| 項目 | 採用 |
|---|---|
| 方式 | URL path (`/api/v1`, `/api/v2`) |
| 破壊的変更の定義 | フィールド削除 / 型変更 / 必須化 / `error` コードの意味変更 |
| 非破壊変更 | 任意フィールドの追加 / 新エンドポイント追加 / 新 `error` コードの追加（既知コードを増やすだけ） |
| 廃止プロセス | 旧バージョン廃止予告 → アクセスログでクライアント残存確認 → 廃止 |

MVP 期間中は **`/api/v1` と `/web/v1` がそれぞれ v1 1 本のみ運用** される
想定。triary は単独運用で「サーバーとフロントが同時デプロイ」されるが、
PWA はクライアントのブラウザにキャッシュされる時間帯があるため、フロント
更新の遅延中も旧 v1 が動く保証として URL path バージョニングを最初から
導入しておく。

`/api/v1` と `/web/v1` のバージョンは **独立して進化できる**。たとえば
`/web/v1` を破壊的に変更して `/web/v2` を出すときに `/api/v1` はそのまま
維持してよい（その逆も可）。これがパスファミリを分けたことの実利の 1 つ。

将来 `v2` を導入するときは：
- `v1` と `v2` を一定期間並走させる
- 内部実装は v2 を正、v1 を v2 → v1 のアダプタ層として実装する（捨てやすさ）
- ログから `v1` 利用がゼロになったことを確認してから削除

---

## 5. 「捨てやすさ」確認

API レスポンスに **内部実装型を漏らさない** チェックを設計時点で実施する。

| 確認項目 | 状態 |
|---|---|
| ORM (`sqlx::FromRow`) の生成型をそのままレスポンス DTO に使わない | OK: `interfaces/http/dto/` で必ず詰め替える（arch §interfaces/http） |
| `sqlx::Error` / `argon2::Error` 等の内部例外をエラーレスポンスに漏らさない | OK: `error` コードは API 独自語彙のみ。`message` にも内部詳細を含めない |
| ドメイン型（`domain::Exercise` 等）と API DTO（`ExerciseResponse` 等）を別型として定義する | OK: arch §レイヤ構成で「DTO ↔ domain 詰め替え」を `interfaces/http` に置く |
| プリセット種目の判定方法 (`is_preset` の DB 列 vs 別テーブル) を API 側に漏らさない | OK: API は `owner: "preset" \| "user"` という API 独自語彙で表現 |
| プログレッションツリーの内部表現（隣接リスト / クロージャテーブル）を API に漏らさない | OK: API は `parent_id` と `/exercises/{id}/tree` の `children_order` で表現 |
| カーソルの内部キー構造をクライアントに漏らさない | OK: 不透明 base64url。デコードできなければ 400 |
| 認証フロー（Cookie 管理・セッションライフサイクル）の詳細を REST API に漏らさない | OK: `/web/v1` に分離。`/api/v1` はリソース制御のみで `login` / `signup` のような動詞パスを持たない。将来 REST を外部公開する際に Web UI 固有の概念を引きずらない |

---

## 6. ADR 候補（本ドキュメントで確定した判断）

以下は本ドキュメント自体が判断記録となる。将来独立 ADR 化候補：

1. **HTTP エンドポイントを 2 つのパスファミリに分ける: `/api/v1` (REST
   リソース制御) と `/web/v1` (Web UI BFF、動詞パス)** — `login` /
   `logout` / `signup` のようなセッションフロー系は REST の語彙に混ぜ
   ず、PWA フロントエンド専用の BFF として切り出す。これにより REST API
   は純粋なリソース指向を保てて外部公開にも耐え、Web UI 側は動詞パスを
   自由に使える。両ファミリは独立してバージョンを上げられる

2. **REST + URL path バージョニング (`/api/v1` / `/web/v1`)** — schema-first
   OpenAPI と PWA キャッシュ事情から、最初から `v1` を URL に埋める
3. **エンドポイント命名は kebab-case、フィールドは snake_case** — Rust /
   sqlx / OpenAPI で衝突しない統一規約
4. **envelope を採用しない（リスト系のみ `items` + `page_info`）** — MVP
   には冗長。エラーは別構造
5. **ページネーションはカーソル方式（履歴系のみ）** — 時系列降順 + 追記
   中心という履歴の性質に最適
6. **エラーは常に `errors[]` 配列で返す（単一エラー時も要素数 1）** — バ
   リデーションは fail-fast せず全件収集して返し、ユーザーが 1 submit で
   全ての間違いを把握できるようにする。1 フィールド内の複数制約違反も
   個別に 1 要素ずつ返してフロントが個別ハイライトできるようにする。
   **エラーコードは `field` 名を埋め込まず違反の種類のみを表現する**
   (`too_short`, `invalid_charset`, `already_taken` 等)。主語は `field`
   で特定するので `user_id_too_short` のような重複エンコードは作らない。
   これによりクライアントは `(code, field)` の組で辞書引きする汎用パス
   を使え、新フィールド追加のたびにコード体系が膨張することを防げる
7. **HTTP ステータスコードはプロトコル層の関心事に限定し、ドメインバリ
   デーションは原則 400 に集約する** — 404 はパスパラメータの不存在（＋
   他ユーザーのリソースを存在露呈防止で 404 に寄せる）、403 はパス対象が
   可視だが操作禁止（プリセット編集）、409 は楽観ロック衝突専用（MVP 未
   使用、将来の予約）。ボディで参照された ID の不存在・ユーザー ID 重複
   ・種目名衝突・プログレッションの循環/上限超過・計測項目セット変更拒
   否などは **すべて 400**（入力値検証の失敗）として扱う
8. **`block` / `set` を疑似トップレベルリソース化** — 2 階層ネスト制限を
   守りつつ細粒度操作を提供
9. **書き込み (`/sessions`) と読み取り (`/history/...`) でエンドポイント
   を分割** — arch の Command / Query 分離方針を HTTP 表現にも反映。詳細
   over-fetching を避けつつ将来 Read Model 化の余地を残す
10. **リソース ID は `{prefix}_{ulid}` 形式** — クライアント取り違え防止
11. **冪等性キーは導入しない（MVP）** — 決済等の二重実行リスクが大きい
    操作がない。POST 二重発火は UI 側で抑止する

---

## 7. 設計フェーズ後段に送る決定

| 項目 | 後段で扱う場所 |
|---|---|
| プログレッションツリーの DB 表現と `tree` エンドポイント実装方法 | data-model |
| カーソルの実体（複合キーの選び方） | data-model + 実装フェーズ |
| 種目テーブルとプリセットの保持方法（同一テーブル + フラグ vs 別テーブル） | data-model |
| 各エンドポイントのトランザクション境界の細部 | data-model + 実装 |
| `interfaces/http/dto/` 内のモジュール分割粒度 | design-component |
| フロントの `features/*/queries`・`mutations` の関数シグネチャ | design-component |
| OpenAPI スキーマファイルの分割方針（`paths/*.yaml` 分割など） | 実装着手前に確定 |
