# bootstrap-decisions: AI 自走基盤の構築判断記録

`/foo-skills:bootstrap` を 2026-04-25 に実行し、本プロジェクトに AI 自
走基盤（CLAUDE.md 増強・ツール横断コンテキスト・code-reviewer エージェ
ント・アーキテクチャテスト）を導入したときの判断記録。

`.contexts/setup-plan.md` が「環境構築の方針」を扱うのに対し、本ドキュ
メントは「AI が自律的に開発を継続するための基盤の方針」を扱う。

判断の理由と来歴の原典はこのファイル 1 か所。規則の本文は `AGENTS.md`、
`docs/review-contract.md`、`docs/remote-acceptance.md` が原典で、ここには
転記しない。

## 実行履歴

| 日付 | プラグイン | 生成結果 | 状態 |
|---|---|---|---|
| 2026-04-25 | foo-skills — 版・commit SHA は **不明** (記録なし。`AGENTS.md` を生成していないことから 2.x より前と推定) | commit `a5575a1`、PR #19 (2026-04-26 マージ) | 採用済み |
| 2026-10-31 | foo-skills 3.0.0 (`gitCommitSha` ce07f3463ad10f4ce4c2333af6c3fbbe4a4af738、https://github.com/foo-543674/foo-skills) | PR #46 (下記「2026-10-31 再実行」) | 採用済み (PR #46 のマージ。ruleset の適用は別途) |
| 2026-10-31 | foo-skills 3.0.1 (`gitCommitSha` 9bb1b4c3280d4977f2a7e67b73f578abaf8fa083) | ブランチ `chore/dev-entrypoint` の PR (下記「2026-10-31 再実行 (3.0.1)」) | **提案中** (2 段階。第 1 段の PR のマージで入口とイメージを採用、第 2 段で切り替え) |

以降の節のうち「Phase 1」〜「次の更新タイミング」は 2026-04-25 時点の記録
で、2026-10-31 の再実行で変わったものはその節に注記した。

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

> 2026-10-31 注記: 上の表は 20 件で、当時の原料にない `debugging` が 3.0.0
> では加わっている。プラグイン側だけの変更として `debugging` を追加した
> (`AGENTS.md` Quality lenses、レビュースキル観点 10)。

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
  (2026-10-31 注記: レビューの観点は `.agents/skills/code-review/SKILL.md`
  に移った)

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

> 2026-10-31: **撤去済み**。`ai-review.yml` ごと廃止した (下記「2026-10-31
> 再実行」の「変更ごとの扱い」)。以下は経緯として残す。

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

> 2026-10-31 注記: allow の `Bash(git:*)` / `Bash(docker:*)` /
> `Bash(docker compose:*)` / `Bash(make:*)` を非破壊の個別コマンドに置き換え
> た (下記「2026-10-31 再実行」)。上の find / grep の方針はそのまま残す。
> ただし観測した事実として、AI は現在 devcontainer ではなく
> `/home/node/work/foo-543674/triary` (ai-box) で動いており、
> `/workspaces/triary` を前提にした絶対パスのパターンはこの環境では効かない
> (相対パスのパターンは効く)。直すかどうかは判断していない。

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

## 判断委任の境界

原典は `AGENTS.md`「AI delegation scope」。2026-04-25 の記録ではここに
当時の CLAUDE.md の一覧を転記していたが、規則を転記しない方針に合わせて
2026-10-31 に参照だけにした (転記は AGENTS.md の改訂と食い違っていた)。

## 次の更新タイミング

このドキュメントは AI 自走基盤の方針記録なので、以下のタイミングで追
記する:
- philosophy / perspectives の適用範囲を変更したとき
- アーキテクチャテストのルールを追加・変更したとき
- レビューの観点 (`.agents/skills/code-review/SKILL.md`) を増減したとき
- AI 委任範囲の境界を動かしたとき

設計判断そのものは `.contexts/architecture.md` 等の本体側に記録する。

---

## 2026-10-31 再実行 (foo-skills 3.0.0)

前回の原料の版が不明なため、前回生成した結果 (PR #19 時点) と現在のプロジェ
クトと 3.0.0 の原料を直接比べた。前回以降に AI コンテキスト関連ファイルへ
入ったチームの変更は PR #19 のレビュー対応と `implementation-plan.md` の
整理 (2026-04-28) で、いずれも残した。

参照した原料 (すべて 3.0.0): `skills/bootstrap/SKILL.md`、
`skills/bootstrap/resources/` の `context-template.md` / `checklist.md` /
`known-pitfalls.md` / `local-review-gate.md` / `review-contract.md` /
`remote-acceptance.md`、`philosophy/*.md` (特に development-values「判断待ち
を仕事の停止条件にしない」、core-principles「記述の検証状態」)、
`perspectives/debugging.md`。

### Phase 2 で人間に確認した判断

| 問い | 回答 (2026-10-31、オーナー) | 反映先 |
|---|---|---|
| リモート AI レビュー (`ai-review.yml`、2026-04-07 にチームが追加) をどうするか | **廃止して置き換える** | `ai-review.yml` を削除。手元のレビューゲート + リモート受け入れ確認に置き換え |
| AI のマージを GitHub の保護ルールで止める構成にするか | **保護ルールで止める** | `docs/remote-acceptance.md`、`docs/rulesets/main.json`、`.github/CODEOWNERS` |

- AI の主体: GitHub App `foo-543674-ai-agent[bot]` (オーナーと別主体)。確認済み
- リポジトリは public。GitHub Free でも ruleset が使える
- 原料の他の原則・perspectives の除外や重み付けの変更は、前回の判断 (すべて
  フル適用) を引き継いだ。改めて問わなかった

### 変更ごとの扱い

| 項目 | 状況 | 扱い | 反映先 |
|---|---|---|---|
| `AGENTS.md` を単一の原典にする | プラグイン側だけが変わった | 採用 (提案中)。`CLAUDE.md` の本文をそのまま移し、`CLAUDE.md` / `GEMINI.md` は `@AGENTS.md` で読み込む。`.cursorrules` / `copilot-instructions.md` は派生元を `AGENTS.md` に替え、既存の記述は残した | `AGENTS.md` ほか |
| 自然言語の使用範囲 | プラグイン側だけ | 採用。設計文書と契約は日本語、`AGENTS.md` と派生ファイルは英語 (前回の「既存スタイルを維持」を引き継ぐ) | `AGENTS.md` Natural language |
| 設計成果物の役割分担・計画の 3 階層 | プラグイン側だけ | 採用。API 契約は `openapi.yaml`、永続化は `backend/migrations/` に具体化 | `AGENTS.md` Design artifacts |
| 判断待ちで止めない進め方 | プラグイン側だけ | 採用。判断待ちの置き場は **GitHub Issues (ラベル `needs-decision`)** を AI が選んだ。理由: 保護ルールを有効にすると、リポジトリ内のファイルは更新のたびにオーナーの承認が要り、判断待ちを積むこと自体が止まるため。Issue なら承認なしで積め、受け入れ検証が state (open / closed) を機械的に読める。暫定案に積んでよい差し替え費用の目安は「約 1 作業日」とした | `AGENTS.md` Asking for decisions |
| 記述の検証状態・逃げの一覧の拡張 | プラグイン側だけ | 採用 | `AGENTS.md` Development workflow |
| 規約・受け入れ条件・検証器の改訂は通常の作業権限に含めない | プラグイン側だけ | 採用。改訂権限の委任範囲は「なし」とした | `AGENTS.md` AI delegation scope |
| レビュー手順をスキルに移す | プラグイン側だけ | 採用。旧 `code-reviewer.md` の観点 1〜10 を移し (旧 10 のコミット品質は観点 12 に移動)、`debugging` (観点 10) と基準ファイル・ゲートの変更 (観点 11) を新たに追加。エージェント定義は薄くし、`model: sonnet` は意図の記録がないチームの設定として残した | `.agents/skills/code-review/SKILL.md`、`.claude/agents/code-reviewer.md` |
| 旧 `code-reviewer.md` の可読性基準 (ネスト 4 以上 / 関数 200 行以上) | チームの成果物の中で食い違い (CLAUDE.md は ネスト 3 以下 / 関数 50 行以下) | CLAUDE.md (現 `AGENTS.md`) の値に揃えた。どちらが意図かの記録はない。200 行で運用したい意図があったなら戻す | レビュースキル観点 9 |
| レビュー契約・台帳 | プラグイン側だけ | 採用。台帳は `.git/review-ledger/ledger.json`、判定は `tools/review-gate/` | `docs/review-contract.md` |
| ローカルレビューゲート | プラグイン側だけ | 採用。下記「ゲートの実装判断」 | `.githooks/`、`.claude/hooks/review-gate.sh` |
| リモート受け入れ保証 | プラグイン側だけ | 採用。ruleset はこの時点で生成済み・未適用 (2026-10-31 14:37 UTC にオーナーが適用、#42) | `docs/remote-acceptance.md`、`.github/workflows/acceptance.yml` |
| リモート AI レビュー (`ai-review.yml`) | **両方が変わった** (チームが追加し Copilot 向けの回避策を作り込んだ。3.0.0 は生成しない方針。さらに読み込み先の `foo-skills:code-reviewer` は 3.0.0 で廃止され、2026-04-28 以降成功していなかった) | オーナーの判断で廃止。リポジトリの secret `CLAUDE_CODE_OAUTH_TOKEN` が不要になったかはオーナーが確認する | — |
| `.claude/settings.json` の広い allow (`git:*` / `docker:*` / `docker compose:*` / `make:*`) | プラグイン側が変わった (allow は非破壊のみ)。チーム側は設定時の意図の記録なし (変わった ≠ 意図して選んだ) | 改訂案として非破壊の個別コマンドに置き換え、環境を壊す操作は ask、迂回と履歴の破壊は deny にした。`gh:*`・`npm:*`・`npx:*` などは残し、削除系の `gh` だけ deny を足した。基準ファイルの改訂なので PR の承認を経て有効になる | `.claude/settings.json` |
| known-pitfalls「claude-code-action + Copilot Coding Agent」 | 原料の該当エントリは本プロジェクトの事例 | `ai-review.yml` の廃止で該当しなくなった | — |

### ゲートの実装判断

- **判定ツール**: `tools/review-gate/` に TypeScript で書き、Node 22 の型
  ストリッピングで直接実行する。追加の依存はない (`frontend/` の `tsc` と
  `@types/node` を型チェックにだけ借りる)。判定ロジック (`ledger.ts`、
  `snapshot.ts`) は純粋関数、git と台帳ファイルを触るのは `cli.ts` だけ
- **git hook の管理方法**: `.githooks/` を hooksPath に設定する方式。
  lefthook / husky / pre-commit は追加の install が要るため選ばなかった。
  git の仕様上、clone 直後に hook を自動で有効にする方法はないので、
  devcontainer の `post-create.sh` で有効にし、それ以外の環境では
  `make hooks-install` を 1 回実行する。Claude Code hook は hooks が有効で
  ないと commit / push を止めるので、AI は有効化を飛ばせない
- **pre-commit**: 変更された領域だけ fmt + clippy / biome + tsc / ゲート
  ツールの自己テスト、その後 staged diff のレビュー記録を確認
- **pre-push**: 変更された領域だけ nextest / depcruise + vitest / ゲート
  ツールの自己テスト、その後 `origin/main` との差分のレビュー記録を確認。
  統合テスト (Newman) と Storybook のビルドは DB や時間の都合で CI に任せた
- **commit 時に全変更を自動で stage するオプション (`-a`) の禁止**: staged
  以外が混ざると、レビューした diff とコミットされる diff がずれるため
- **Claude Code hook の判定 (現行)**: hooksPath・`GIT_CONFIG_*`・エイリアス
  定義・`.git/config`・台帳ファイルへの言及はコマンド全体で止める。git の
  呼び出しの判定は `tools/review-gate/src/command.ts` (規則は同ファイル冒頭)
  に委ねる。シェルのように字句解析し (テキストは捨てず、heredoc と here-string
  はコマンドの入力として扱う)、すべての簡易コマンドで basename が `git` の語を
  すべて調べ、設定済みのエイリアスを展開し、`shell -c` / `eval` / シェルの
  heredoc 入力 / コマンド置換へ再帰し、他のランチャーに渡されたコマンド文字列
  は迂回フラグだけを見て、解析できないテキストは原文を保守的に走査する。
  単一引用符と backtick の中は意図して過剰に報告する。残る穴 (変数に入れた
  フラグ、ファイルに書いて後で実行するスクリプト、API 経由のコミット、hook
  ファイル自体の編集) は hook 冒頭に列挙し、リモート受け入れが受け持つ
- **経緯**: 最初は正規表現で判定したが、レビューで同じカテゴリの迂回が繰り
  返し見つかり (引用符内の区切り、行継続、キーワードや未知のランチャーの後ろ、
  エイリアス、heredoc の誤除去、引用符内のコマンド置換など)、作業中に正当な
  コマンドの誤ブロックも実際に踏んだ (`git log ...; grep -n`、`review-gate.sh`
  というファイル名)。個別の修正をやめ、構文の列挙に依存しない現行の方式に
  置き換えた
- **permission 規則**: 公式ドキュメント (code.claude.com/docs/en/permissions)
  で確認した仕様に合わせた。評価順は deny → ask → allow で最初に一致したもの、
  `:*` は語の区切りのあとの末尾ワイルドカード、規則の途中の `*` は前後に空白
  がある位置だけに一致し、deny / ask はセキュリティ境界ではない。そのため
  - allow は非破壊の形だけにし、破壊的な形は ask / deny に個別に置く。途中
    にワイルドカードを持つ規則には、フラグが先頭に来る形の規則も並べる
  - 広い ask (例: `git switch:*`) は具体的な allow を覆い隠すので置かない。
    allow にないコマンドは既定で確認が出る
  - 迂回の検出の本体は PreToolUse hook と git hook 側に置いた
  - 残る穴: `git push <remote> :<branch>` (空の送り元でリモートブランチを
    削除する refspec) はこの書式では安全に表せない

### リモート受け入れの実装判断

- 検証は `pull_request_target` / `workflow_run` / `issue_comment` /
  `workflow_dispatch` で base の定義を使い、PR のコードを実行しない。結果は
  commit status `acceptance / verdict` (GitHub Actions 発行に限って required)
- 必須にする CI ジョブから `security / *` を外した。`main` 自体が既知の
  脆弱性で赤い間は全 PR が止まるため (判断依頼に積む)。追記 2026-10-31:
  #45 で audit を緑に戻し、PR #58 で必須に加えた
- `integration / newman` は `integration / detect` 成功時の `skipped` を許す
- PR 内で追加した workflow が同名の status を出せる穴は、`.github/` を
  CODEOWNERS の対象にして承認で塞いでいる。機械的な遮断ではない
- ruleset の bypass はリポジトリの admin ロールの PR 経由のマージだけにした。
  個人リポジトリでオーナーが自分の PR を自己承認できないため
- 承認なしでマージしてよい変更の条件は案 (Dependabot の patch / minor の
  ロックファイル更新) を起草したが、**未合意・無効**。合意まですべての PR
  が承認必須。判断依頼に積む
- ファイル単位の保護の手間: `AGENTS.md` の現状説明の更新、アーキテクチャ
  テストの強化、`Makefile` の変更にもオーナーの承認が要る

### マージを止められるか

現在の状態、読み戻した履歴、AI の資格情報で確かめたことは
`docs/remote-acceptance.md`「マージを止められるか」と「ruleset」に一元化
した (ruleset はこの作業中にも 2 回変わり、複数か所に書くとずれるため)。
この再実行での判断は、目標を「保護ルールでマージを止める」とし、適用は
オーナーが行うこと (#42) だけである。

なお、Phase 1 の作業 (Dependabot の PR 8 件のマージ) は 05:30 頃で、
ruleset が有効になる前だった。

### 動作確認の結果

- `make gate-test` のテスト 151 件が通る。内訳は台帳と判定 (review-contract
  の 5 ケース、remote-acceptance の 1・2・4・9・10 の判定部分)、JSON 境界の
  検証、コマンド分類 (字句解析)、Claude Code hook の回帰ケース (一時リポジ
  トリで実行)、`.git/` 書き込み保護
- CLI を一時リポジトリで実行し、レビューなし → 止まる、未処置の Critical →
  止まる、証拠付きの却下 → 通る、diff が変わる → 止まる、古いラウンドの記録
  → 拒否、を確かめた
- このブランチ自体のコミットをすべて新しいゲートに通した (各コミットで別
  コンテキストのレビュアーが台帳に記録)。途中で pre-commit がゲートツールの
  自己テストの失敗で実際にコミットを止めたことと、Claude Code hook が正当な
  コマンドを誤って止めたこと (後に修正) も観測した
- この環境 (ai-box) には Rust のツールチェーンがなく、`backend/` を含む
  コミットは pre-commit の fmt / clippy を実行できず止まる。そのため
  `backend/` 内のコメントの `CLAUDE.md` 参照の更新は見送った
- 受け入れ検証スクリプトを `DRY_RUN=1` で実在の PR に対して実行し、#41 で
  CI の失敗 (frontend / test) とスナップショットなしを検出することを確かめた。
  #39 の実 diff に対し、一致するスナップショット → 合格、HEAD が違う → 不合格、
  改ざん → 不合格を確かめた
- 実 PR 上での 12 ケースの確認は ruleset の適用後に行う (未)

### 判断待ち (GitHub Issues、ラベル `needs-decision`)

| Issue | 問い | 状態 (2026-10-31) |
|---|---|---|
| #42 | 現在無効の ruleset `main` を `docs/rulesets/main.json` の内容で有効にするか | 2026-10-31 14:37 UTC にオーナーが適用し、AI が読み戻して有効を確認。マージを止められるかの動作確認は未 (`docs/remote-acceptance.md`) |
| #43 | 承認なしでマージしてよい変更 | オーナー回答「依存パッケージの更新は CI などで壊れなければ自動でマージしてよい」。案より広い (major を含む)。台帳は不要、GitHub Actions の更新も含める (07:07)、action は SHA で固定 (07:30)。Rust / npm は #63 で実装し、#50 で自動マージを観測。Actions の更新は code owner 保護との兼ね合いで承認ありのまま (`docs/remote-acceptance.md`) |
| #44 | PR #41 の TypeScript 7 | オーナー承認 (TS7 を Dependabot の対象から外し、残りを取り込む)。条件が満たされたら検知したい、との要望。週次の検知 workflow を #61 で追加 |
| #45 | `main` の security audit が赤い | オーナー回答「1」(依存の更新と overrides で緑に戻し、`security / *` を必須にする)。PR #47 (pnpm)・#58 (cargo と必須化) で完了 |

## 2026-10-31 再実行 (foo-skills 3.0.1)

3.0.0 と 3.0.1 の原料を直接比べた (どちらもプラグインのキャッシュに残って
いた)。`philosophy/` と `skills/bootstrap/` の変更は下表の 1 つだけ。ほかに
`skills/ai-box/` が変わっており (`containers/`、`seccomp.json`、entrypoint、
`setup.md`、`SKILL.md`「プロジェクトのコマンドを動かす仕組み」)、箱に
rootless Podman が入った。下記の「ai-box を podman 入りの版に更新する」と
入口の podman の扱いはこの変更に依存する。チーム側の変更: 3.0.0 の再実行
(PR #46) 以降に入ったのは PR #47 (依存の更新、アーキテクチャテストの 0 件
検出、Dependabot の TypeScript 7 除外) だけで、開発コマンドの実行方法には
触れていない (`git log afc204a..` ではなく PR #47 の diff で確認)。

| 原料の変更 | 状況 | 扱い |
|---|---|---|
| `philosophy/technology-choices.md`「実行環境 — 言語のツールチェーンは作業環境に入れない」、`skills/bootstrap/SKILL.md` Phase 5「開発コマンドの入口」と settings の deny、`resources/checklist.md` 2 項目、`resources/context-template.md` の開発コマンド、`resources/known-pitfalls.md`「言語のコマンドを作業環境で直接叩く」(出典 foo-skills PR #86) | プラグイン側だけが変わった | 採用 (提案中)。下記の 2 段階で入れる |

このプロジェクトでは known-pitfalls の症状がそのまま起きていた: ai-box に
Rust がなく `backend/` を含むコミットが pre-commit で止まり、#45 の cargo
audit を直す手段として「ai-box に Rust を入れる」を判断依頼に載せていた。
新しい原則ではこの選択肢は取らない (作業環境に入れない)。

### 2 段階にした理由

入口を hook・Makefile・CI に通すと、次の 2 つが揃うまでどこでも動かない。
(1) 開発イメージが GHCR に公開されていること (公開は `main` からだけ)、
(2) ai-box が podman を持つ版に更新されていること (この ai-box には podman
がない。2026-10-31 に `command -v podman` で確認)。そのため:

- **第 1 段** (PR `chore/dev-entrypoint`): 入口 `dev`、開発イメージ
  `tools/dev-image/Dockerfile`、入口のテスト (`make dev-test`)、イメージを
  ビルドしてプロジェクトの検査を中で通し `main` から公開する workflow
  (`.github/workflows/dev-image.yml`)、devcontainer の `TRIARY_DEV_DIRECT`。
  既存のコマンドの動きは変えない
- **第 2 段** (第 1 段のマージ・イメージの公開・ai-box の更新の後): hook・
  `Makefile`・`AGENTS.md` の開発コマンド・CI を入口に通し、settings.json で
  `cargo` / `pnpm` 等の直接実行を deny する。devcontainer のツールチェーンをイメージに揃える

### 入口の実装判断

- イメージのタグは Dockerfile の内容のハッシュ (`./dev --image-ref`)。どの
  checkout も自分の Dockerfile から作られたイメージを取る。版は Dockerfile
  で固定する (浮動タグだとタグを変えずに中身が変わる)
- podman があれば podman (ai-box の単一 UID モード。コンテナ内の root =
  呼び出し元)、なければ docker (`--user` で呼び出し元の UID)。どちらもなけ
  れば失敗し、作業環境のツールにフォールバックしない
- 作業ツリーを同じ絶対パスにマウントする。docker-outside-of-docker のように
  エンジンのホストからそのパスが見えない場合に空のディレクトリで走らないよう、
  コンテナ内で作業ツリーの存在を確かめてから実行する。devcontainer では
  `TRIARY_DEV_DIRECT=1` で直接実行する。理由はすでにツールチェーンが入って
  いること。docker-outside-of-docker 経由ではエンジンのホストから作業ツリー
  のパスが見えないと考えたことも理由だが、NOTE: 未確認 (devcontainer で
  エンジン経由の `./dev` を実行していない)。ただし devcontainer のツールチェーンはまだイメージと同じではない
  (rust `latest`、nextest / sqlx-cli の版が固定されておらず、cargo-audit が
  ない)。揃えるのは第 2 段の作業とする (devcontainer をイメージの上に作る案
  が有力。オーナーの作業環境の作り直しを伴うので、その時に確認する)
- 渡す環境変数は列挙したものだけ (トークン類を渡さない)
- レビューゲート (`tools/review-gate/`) と入口のテストは、作業環境の Node 22
  (ai-box と devcontainer が既に持つ) で動かす例外とした。git と入口が走る
  場所で動く必要があるため。型チェックは第 2 段で入口に通す
- 入口とイメージは決定的ゲートが何の上で走るかを決めるので基準ファイルにした
  (`.github/CODEOWNERS`、`docs/remote-acceptance.md`)
- GHCR のパッケージはログインなしで pull できる。2026-10-31 に、GHCR の資格
  情報を持たない ai-box から最初に公開されたタグ (`df-d98c305832a9`) を
  `podman pull` して確かめた (`podman login --get-login ghcr.io` は
  `not logged into ghcr.io`)。public にする作業は不要だった

### 第 2 段の実施 (2026-10-31, PR `chore/dev-entrypoint-stage2`)

前提の確認: PR #52 のマージ後、`main` の `dev-image` workflow (run
41195150162) が成功してイメージが公開された。オーナーが ai-box を podman
入りの版に作り直した。箱の中で `podman info` の uidmap / gidmap が 0 → 1000
(1 つだけ)、`~/.config/containers/containers.conf` が `netns = "host"`、
`./dev touch` で作ったファイルの所有者が node であることを観測した。

入口に通したもの:

- git hook (`.githooks/`): fmt / clippy / biome / tsc / nextest / vitest /
  check-arch、レビューゲートと入口のテストの型チェック。`node --test` と
  レビューゲート本体は作業環境の Node 22 で動かす例外のまま
- `Makefile`: `db-*`、`api-generate`、`arch-test`、`gate-test` /
  `dev-test` の型チェック
- `AGENTS.md` の開発コマンドと品質ゲート、派生ファイル (`.cursorrules`、
  `.github/copilot-instructions.md`)、`README.md`
- CI (`.github/workflows/ci.yml`): 全 job。job 名は受け入れ検証
  (`tools/review-gate/acceptance.sh`) が照合するので変えていない。イメージ
  が未公開 (その PR で Dockerfile を変えた) なら job の中でビルドする
  (`.github/actions/dev-image`)。`integration / newman` は MySQL を
  `docker-compose.yml` の `mysql-test` で `triary-network` に立て、バック
  エンドと newman を 1 回の `./dev` の中で動かす (コレクションの `baseUrl`
  が `127.0.0.1:8080` のため)

観測した制約: ai-box の podman は vfs ストレージなので、`./dev` 1 回ごとに
コンテナ起動で約 3.5 秒かかる (初回は約 8 秒)。hook では 1 つのゲートの
コマンドを 1 回の `./dev bash -c` にまとめた。

この段でやっていないこと:

- `.claude/settings.json` の deny: 編集が Claude Code の auto mode に
  自己改変として止められた。変更案は PR の説明に載せ、オーナーが当てる。
  2026-10-31 にオーナーが #55 で承認し、案のファイルを自分で配置した
  (言語コマンドを deny、`./dev` / `../dev` / `make dev-test` を allow、
  `make db-seed` を削除)
- `e2e.yml` (Playwright。ブラウザと `--with-deps` の apt がイメージにない。
  `main` への push だけで動き、設定ファイルがないので skip 中) と
  `chromatic.yml` は作業環境のツールのまま。e2e を有効にするときに入口へ
  通す (イメージにブラウザを入れるか、Playwright のイメージを別に使うか)
- devcontainer のツールチェーンをイメージに揃えること。オーナーの作業環境の
  作り直しを伴い、ai-box からは devcontainer をビルドして確かめられないため、
  方式をオーナーに確かめてから行う
  (追記 2026-10-31: #56 で推奨の「開発イメージの Dockerfile から作る」を暫定で
  実装した。オーナーの返事を待たずに進めたもので、オーナーが devcontainer を
  作り直して確かめるまで未確認)
