# bootstrap-decisions: AI 自走基盤の構築判断記録

`/foo-skills:bootstrap` を 2026-04-25 に実行し、本プロジェクトに AI 自
走基盤（CLAUDE.md 増強・ツール横断コンテキスト・code-reviewer エージェ
ント・アーキテクチャテスト）を導入したときの判断記録。

`.contexts/setup-plan.md` が「環境構築の方針」を扱うのに対し、本ドキュ
メントは「AI が自律的に開発を継続するための基盤の方針」を扱う。

## Phase 1: プロジェクトの本質（既存ドキュメントから確定）

| 項目 | 内容 |
|---|---|
| プロジェクト名 | triary |
| 1-2 文要約 | 筋トレ記録・スコアリング PWA。漸進性過負荷の原則に沿った記録支援を行う、個人プロジェクト兼プログラミング学習用プレイグラウンド |
| 規模感 | 個人 / 長期 / public 公開 / 同時ユーザー数は数名規模 |
| 設計フェーズ | 要件・仕様・アーキテクチャ・API・データモデル設計 完了。コンポーネント設計と実装計画は未着手 |

## Phase 2: 適用した philosophy / perspectives

### philosophy（全 4 ファイル、フル適用）

- `core-principles.md` — 語彙定義義務、逃げの禁止、捨てやすさ
- `development-values.md` — テストファースト、バーチカルスライス、フィー
  ドバックループ駆動
- `quality-standards.md` — 技術品質 > 製品品質
- `technology-choices.md` — 静的型付け重視、関数型志向

**除外した原則**: なし。学習目的を兼ねるプロジェクトのため、philosophy
は意図的に幅広く適用する。

### perspectives（全 21 ファイル、フル適用）

| カテゴリ | 適用する perspective |
|---|---|
| 共通 | architecture, naming, readability, testing, disposability, error-handling, dependency, comments, type-design, variables, functional, solid, documentation |
| バックエンド寄り | api-design, data-modeling, security, concurrency, performance |
| フロントエンド寄り | component, state-design |

**重み付けの調整**: なし（A: 全部フル適用、ユーザー確認済み）。

### プロジェクト固有の補足

- **OpenAPI スキーマファースト**: api-design は本プロジェクトでは
  `openapi/openapi.yaml` を「契約の唯一の正」として運用する。
  perspective に書かれた一般論より OpenAPI 定義を優先する。
- **言語非依存統合テスト**: testing perspective の「テストピラミッド」
  原則を保ちつつ、統合テストは Postman / Newman で記述する制約を上書き
  する（バックエンド言語移行時の資産維持のため）。
- **Rust の型システムが保証する範囲のテストは省略**: testing
  perspective の網羅性原則の例外として、`Option` / `Result` で型レベル
  に表現済みの不変条件は単体テストを書かない。代わりに `proptest` で
  ドメインロジックの性質を検証する。
- **認証戦略**: 既決（`.contexts/_handoff.md`）。Cookie + サーバーセッ
  ション、`SameSite=Lax`、256bit セッショントークン、行削除で即時失効。
  `CLAUDE.md` の「Authentication strategy: Undecided」記述を最新状態に
  上書きした。

## Phase 3: 生成物

| 生成物 | 役割 | 言語 |
|---|---|---|
| `CLAUDE.md`（増強） | Claude Code / Claude Agent SDK 向けの主要コンテキスト | 英語（既存スタイルを維持） |
| `.github/copilot-instructions.md`（新規） | GitHub Copilot 向けの常時コンテキスト | 英語（Copilot 慣例） |
| `.cursorrules`（新規） | Cursor 向けの常時ルール | 英語（Cursor 慣例） |
| `.claude/agents/code-reviewer.md`（新規） | プロジェクト固有のレビュアーエージェント | 日本語（`.contexts/` のスタイルに揃える） |
| `.contexts/bootstrap-decisions.md`（新規・本ファイル） | bootstrap 中の判断記録 | 日本語 |

## Phase 4: アーキテクチャテスト

### 採用ツール

| 対象 | ツール | 理由 |
|---|---|---|
| Rust 側 | カスタムテストモジュール（`backend/tests/architecture.rs`） | 単一クレート構成のため Cargo の workspace 境界が使えない。`grep` 相当のソーススキャンで依存方向と禁止語を検査するのが最小コスト。`cargo nextest run` で他のテストと同じレールに乗る |
| TypeScript 側 | `dependency-cruiser` | 標準的な依存方向検査ツール。Biome/ESLint 非依存で動作するため、Biome 一本化方針と両立する |

### テスト化したルール

- **Rust 依存方向**: `domain` / `application` 配下に
  `axum` / `axum_extra` / `sqlx` / `tower` / `tower_http` / `tracing` /
  `tracing_subscriber` / `hyper` の use 文がないことをスキャン
  （実装側 `backend/tests/architecture.rs` の `FORBIDDEN_INFRA_CRATES`
  と同期）
- **Rust 禁止語**: ソース全体で `Service` / `Manager` / `Helper` /
  `Util(s)` / `Processor` / `Worker` / `Engine` を含む型名（`pub
  struct` / `pub enum` / `pub trait` 宣言）がないことをスキャン。
  `Handler` は `interfaces::http` 配下のみ許容
- **TS 依存方向**: `frontend/src/components/` から
  `frontend/src/features/` への import 禁止、`frontend/src/features/<x>/`
  から `frontend/src/features/<y>/` への横断 import 禁止、
  `frontend/src/api/` 以外から `openapi-fetch` の直接 import 禁止、
  `frontend/src/components/` から `frontend/src/routes/` への import 禁止、
  `frontend/src/api/` 以外から `src/api/schema.gen.ts` への直接 import 禁止
- **TS 禁止語**: `dependency-cruiser` は依存関係を見るツールで型名・クラ
  ス名のスキャンには向かないため、TS 側の禁止語チェックは `arch:test`
  には組み込まず、`code-reviewer` エージェント（Layer 3）に委ねる

### CI 組み込み

- `backend-test` ジョブの `cargo nextest run` に統合（追加ジョブ不要）
- `frontend-test` ジョブの直前に `pnpm run arch:test` ステップを追加

### 意図的にテストしないもの

- 命名の意味的妥当性（「動詞 + 目的語」テストの自動化は不可。
  code-reviewer エージェント側でカバー）
- `Result<_, Vec<DomainError>>` の収集型契約（型レベルでは強制困難。
  code-reviewer が指摘）
- `errors[]` 配列形式のエラーレスポンス（OpenAPI 側のスキーマ検証で別
  途カバー）

- **意図的にテストしないもの (追記)**:
  `no-feature-cross-imports` の `to.pathNot: "^src/features/$1/"` における
  `$1` は dependency-cruiser の正規表現グループ参照（`from.path` の第 1
  キャプチャグループを `to` 側で展開する）。この挙動は `features/` ディレ
  クトリが実際に存在するまでテストケースを作れないため、現時点では
  `frontend/.dependency-cruiser.cjs` のインラインコメントに TODO として記
  録するに留める。features ディレクトリ追加時にクロスインポートのテスト
  ケースを追加して検証すること。

### 意図的な例外（dependency-cruiser）

- **`not-to-dev-dep` の `src/index.tsx` 除外**:
  `frontend/src/index.tsx` に `import 'solid-devtools';` の側作用インポー
  トがある。`solid-devtools` は本番ビルド向けに noop エントリ
  （`./dist/index_noop.js`）を `exports.import.default` で提供しており、
  実行時コストは 0 であるため `devDependencies` に置いたまま運用する。
  そこで `not-to-dev-dep` ルールの `from.pathNot` に
  `^src/index\.tsx$` を追加し、当該エントリポイントだけを明示除外する
  （`solid-devtools/vite` プラグインとペアで成立する側作用インポートで
  あって、本物の本番依存を見逃す穴ではない）。
  この例外を取り下げるべきタイミング: `solid-devtools` を削除したとき、
  または `solid-devtools` 側が本番でも有効な API を主動線として提供する
  ようになったとき（その場合は `dependencies` へ昇格させて除外不要）。

### upstream 依存の workaround とその撤去条件

- **`.github/workflows/ai-review.yml` の `github.actor != 'Copilot'` 条件
  と `trigger-copilot-review` ジョブ**:
  `anthropics/claude-code-action@v1` の `checkHumanActor` が
  `Copilot` actor 名（GitHub Copilot Coding Agent が push する際の actor）
  を解決できず `GET /users/Copilot - 404` で失敗する
  （upstream issue: anthropics/claude-code-action#900）。これを回避する
  ため、`pull_request` トリガーの `ai-review` ジョブは `actor == 'Copilot'`
  時にスキップし、別ジョブ `trigger-copilot-review` から
  `workflow_dispatch` 経由で再起動している。
  この workaround の撤去条件:
  1. `anthropics/claude-code-action` の v1 系で issue #900 が解決され、
     `Copilot` actor を `allowed_bots` 経由で許可できるようになる
     （= `checkHumanActor` が 404 を返さないようになる）。
  2. もしくは GitHub 側で Copilot Coding Agent の actor 表現が
     `copilot[bot]` 等の解決可能なボット ID へ正規化される。
  上記いずれかが成立したら、`if:` 条件から `github.actor != 'Copilot'` を
  外し、`trigger-copilot-review` ジョブと `allowed_bots: "github-actions"`
  を撤去する。

## `.claude/settings.json` 許可コマンドの方針

bootstrap で許可コマンド (`permissions.allow` / `permissions.deny`) を以下
の方針で更新した。後から AI が判断に迷ったときの参照点として残す。

- **`find` と `grep` は project path に限定して allow する**: ベストプラ
  クティスは「allow 側を積極的に限定する」方針。`Bash(find:*)` のように
  全許可するとシステムパス探索を deny だけで止める形になり、deny の漏れ
  が即セキュリティ事故になる。例えば `Bash(grep * .)` `Bash(grep * ./*)`
  `Bash(grep * /workspaces/triary*)` 等で **プロジェクト内とカレント基
  準の grep のみを allow** している
- **相対パスパターン（`find backend*` 等）は devcontainer 起動ディレクト
  リ固定を前提とする**: `Bash(find backend*)` / `Bash(find frontend*)` /
  `Bash(find openapi*)` / `Bash(find tests*)` はカレントディレクトリが
  `/workspaces/triary` であることを前提とした相対パスパターン。devcontainer
  外（例: ホスト側シェルや別ディレクトリから起動した場合）では意図しない
  パスが許可されうる。この前提が崩れる場合はこれらを絶対パス形式
  （`Bash(find /workspaces/triary/backend*)` 等）に置き換えること。
- **`find` のドット始まりパスは `Bash(find .)` と `Bash(find ./*)` に限
  定する**: `Bash(find .*)` は `..` で始まる相対パスにもマッチし、
  `find ../../../etc` のようなパストラバーサルを allow してしまう。
  `Bash(find .)` はカレントディレクトリ自体の検索を、`Bash(find ./*)` は
  `./` 配下への検索を許可し、上位ディレクトリへのトラバーサルを排除する
- **意図的な副作用**: パス指定なしの相対 grep（例: `grep "x" file.rs`）
  は permission prompt を出す。これは仕様であり、設定の不備ではない。
  pwd を絶対パスで指定するか `./file.rs` の形にすれば allow される
- **`deny` 構文はコマンドの引数位置に合わせて使い分ける**: `find` は最
  初の非オプション引数がパスなので `Bash(find /etc:*)` のコロン (prefix-
  match) 構文で `find /etc` 系コマンドだけを正確に止められる。一方
  `grep` はパターンが先でパスが後ろに来るため、コロン構文では allow パ
  ターン全体まで巻き込んでしまう。そのため grep deny は `Bash(grep *
  /etc*)` のようにグロブ構文で「任意のパターン × システムパス」を表現
  する。allow 側のグロブ (`Bash(grep * /workspaces/triary*)` 等) はプロ
  ジェクト外パスを含まないので、deny との重複は発生しない
- **wildcard `Bash(find /etc*)` のグロブは find では使わない**: find の
  allow パターンを巻き込むためコロン構文に統一する
- **ルートパス deny は載せない**: `Bash(find /:*)` は `find /workspaces/
  triary` まで巻き込むので置かない。代わりに `find /` 単独実行は allow
  に無く、permission prompt 経由で都度確認するに留める

## Phase 5: 技術インフラの状態

bootstrap 着手時点で技術インフラは概ね整備済み:

- ✅ devcontainer（Rust + Node + DooD + GitHub CLI）
- ✅ docker-compose（MySQL dev / test、`triary-network` 疎結合）
- ✅ Makefile（`infra-up` / `db-migrate` / `api-generate` 等）
- ✅ CI（lint / test / build / spectral / cargo audit / Storybook /
  Newman の各ジョブ）
- ✅ Biome / Vitest / Storybook / sqlx-cli / cargo-nextest 一式
- ✅ `.claude/settings.json`（許可コマンド設定済み）

bootstrap で追加したもの:

- `make arch-test` ターゲット（Rust + TS のアーキテクチャテストをまと
  めて実行）
- `frontend/package.json` に `arch:test` スクリプトと
  `dependency-cruiser` 依存
- `backend/tests/architecture.rs`（Rust 側カスタムテスト）
- `frontend/.dependency-cruiser.cjs`（TS 側設定）

## 判断委任の境界（CLAUDE.md より転記）

AI が自律判断してよい:
- 実装の詳細（関数・変数名、アルゴリズム選択、ライブラリ内部）
- テストの追加・修正
- 既存テストが全パスする範囲のリファクタリング
- lint / format の修正
- ドキュメントの更新

確認が必要:
- 新しい外部依存の追加（Cargo crate / npm パッケージ）
- レイヤー構成・アーキテクチャルールの変更
- OpenAPI スキーマ・`/api/v1/*` の破壊的変更
- 認証・認可・暗号化に関わる判断
- `.contexts/*.md` の書き換え（設計判断そのものの変更）
- 要件解釈に曖昧さがある場合

## 次の更新タイミング

このドキュメントは AI 自走基盤の方針記録なので、以下のタイミングで追
記する:
- philosophy / perspectives の適用範囲を変更したとき
- アーキテクチャテストのルールを追加・変更したとき
- code-reviewer の観点を増減したとき
- AI 委任範囲の境界を動かしたとき

設計判断そのものは `.contexts/architecture.md` 等の本体側に記録する。
