---
name: code-review
description: triary の変更を、プロジェクト固有の品質基準でレビューし、指摘をレビュー台帳に記録する。commit / push が review gate に止められたとき、PR を出す前、Dependabot など他者の PR を取り込む前に使う。実装した会話とは別のコンテキスト (Claude Code の code-reviewer サブエージェント、Codex の別セッション等) で実行する。
---

# code-review — triary のレビュー手順

レビューの **手順** の原典。どのツールのレビュー主体もこれに従う。

- 指摘の扱い・完了の判定・独立性の **規則** は `docs/review-contract.md` が原典。ここには転記しない。迷ったら契約を読む
- プロジェクトの規約は `AGENTS.md`、設計判断は `.contexts/`、API 契約は `openapi/openapi.yaml`

## 前提: 独立性

- 実装した会話の中でこのスキルを実行しない。実装側から受け取るのは、承認済みの要件・制約・設計判断と、解消確認のための変更内容・再現手順・検証結果 (証拠) だけ。実装時の思考の経緯や「直したはず」という結論は判断材料にしない
- 別のコンテキストで実行できないなら、レビューは未実施として扱い、その旨を返す

## 入力

| 項目 | 内容 |
|---|---|
| スコープ | `commit` (staged diff) か `push` (`origin/main` との merge-base から HEAD まで)。PR の取り込みは、その PR のブランチを checkout した状態の `push` |
| 証拠 (任意) | 解消確認の対象と、追加したテスト・再現手順・検証結果 |

## 手順

1. **対象 diff とハッシュを取る**
   - `commit`: `git diff --cached`
   - `push`: `git fetch origin main` のあと `git diff $(git merge-base origin/main HEAD) HEAD`
   - ハッシュ: `sh tools/review-gate/gate.sh hash --scope <scope>`。このハッシュ以外の diff について記録しない
2. **台帳を読む**: `sh tools/review-gate/gate.sh show` (各指摘の現在の状態と、次の ID。履歴は `--all`)。既存の指摘 (ID・状態・根拠) を把握する
3. **既存の指摘の解消確認から始める** (2 回目以降)
   - `fixed_unverified` は、渡された証拠と現在の diff で自分で確かめる。確かめられたら `resolved`、だめなら `open` (理由付き)
   - `resolved` / `rejected` の指摘が修正で再発していたら、同じ ID を新しい証拠付きで `open` に戻す
   - 前回出た指摘が今回の観点で見当たらないことは、解消の根拠にしない (契約「再レビューの範囲」)
4. **変更をレビューする**: 下記「観点」のうち、変更ファイルに該当するものだけを見る。初回は変更全体、2 回目以降は前回からの差分と修正の影響範囲を中心にする
5. **指摘を整える**
   - 各指摘に、根拠 (AGENTS.md / `.contexts/` / OpenAPI の該当箇所) と証拠 (ファイル・行・再現手順) を付ける。根拠を示せない好みの指摘は出さない
   - 同じ問題の言い換えは新しい ID にしない。既存の指摘の更新にする
   - 新規指摘の由来を記録する: 前からあった見落とし (`pre_existing`) か、修正が生んだもの (`caused_by_fix`、元の指摘 ID 付き) か、不明か。確かさ (`confirmed` / `inferred` / `unknown`) を区別し、不明を推測で埋めない
   - 委任範囲では決められない指摘 (意図の衝突・権限の不足・許容できない不確実性) は `escalated` にする。判断依頼 (GitHub Issue、ラベル `needs-decision`) の番号を `decisionRef` に入れる。番号がまだなければ、依頼の文面を結果に含めて実装側に提出させ、番号が付いてから記録する。直せる欠陥をエスカレーションにしない
   - 同じカテゴリの指摘が 2 ラウンド続いたら、その観点で全件スイープして一度に出す
6. **ラウンドを記録する**: 下記の形式のファイル (例: `<git-common-dir>/review-ledger/round.tsv`、`git rev-parse --git-common-dir` で場所を確かめる) を **ファイル書き込みツール (Claude Code なら Write)** で書き、`sh tools/review-gate/gate.sh record --file <path>` を実行する
   - シェルの heredoc やリダイレクトでは書かない (タブが崩れやすく、許可されていないコマンドとして確認で止まる)
   - レビューを最後まで行えなかった (diff が読めない、ツールが失敗した等) ときは outputOk を `false` で記録する。「指摘なし」と書かない
   - `record` が拒否したら (diff が変わった、理由がない、欄の数が違う等)、原因を直してから記録し直す。1 行でも拒否されればラウンド全体が記録されない
7. **結果を返す** (下記「出力形式」)

### ラウンドのファイル

1 行に 1 レコード、欄は **タブ** で区切る (下の例の `<TAB>` は実際のタブ文字)。欄の中にタブと改行は書けない。値のない欄は `-`。`#` で始まる行と空行は無視する。

```text
round<TAB>commit<TAB><gate.sh hash の出力><TAB>true<TAB>code-reviewer
new<TAB>F7<TAB>critical<TAB>backend/src/domain/session.rs<TAB>AGENTS.md Layer rules: domain must not import sqlx<TAB>backend/src/domain/session.rs:3 `use sqlx::Row;`<TAB>caused_by_fix/confirmed/F3
update<TAB>F3<TAB>resolved<TAB>import removed; architecture test passes (cargo nextest run --test architecture)<TAB>-<TAB>-<TAB>-
```

| 行 | 欄 (この順) |
|---|---|
| `round` (1 行目に 1 つだけ) | スコープ (`commit` / `push`)、diff ハッシュ、出力が正常か (`true` / `false`)、レビュー主体 |
| `new` (新しい指摘) | ID、重大度 (`critical` / `important` / `minor`)、対象のパス (カンマ区切り)、根拠、証拠、由来 (`種別/確かさ[/元の指摘 ID]`。種別は `pre_existing` / `caused_by_fix` / `unknown`、確かさは `confirmed` / `inferred` / `unknown`。不明なら `-`) |
| `update` (既存の指摘の更新) | ID、状態、処置の理由、新しい証拠、判断依頼 (`#123`)、重大度の変更。変えない欄は `-` |

- `id` は台帳全体で一意 (`F` + 連番。`show` が次の ID を出す)。2026-11-01 より前の台帳の `R` 番号とは別物
- `status` の値と、遷移に必要なもの (理由・新しい証拠、Critical に使えない状態) は `docs/review-contract.md`「ライフサイクル」に従う。`record` は規則に合わないラウンドを拒否する
- `push` スコープの base は `origin/main`。別の base なら `record --base <ref>`

## 動作原則

- **設定ファイル・ベンダー固有 DSL・スキーマに踏み込む指摘は、必ず該当する公式ドキュメントまたはスキーマを確認してから出す** (Claude Code の settings / hooks、GitHub Actions の workflow 構文、ruleset、OpenAPI、`Cargo.toml`、`package.json`、Biome、dependency-cruiser 等)。推測でものを言わない
- レビュー間で指摘が矛盾するときの原因は、ほぼ常に「最初に仕様を確かめていない」こと。確かめてから指摘する
- 仕様を確かめずに述べる場合は「未確認だが」と明示する
- `cargo fmt` / `biome ci` / `tsc` / clippy / アーキテクチャテストで機械的に見つかるものは指摘しない (決定的ゲートの仕事)
- `.contexts/` の設計判断そのものを覆す提案はしない。違反は「`.contexts/architecture.md` §X と矛盾」と指摘する
- 指摘を閉じる都合で規約・受け入れ条件・検証器を緩める修正を見つけたら、それ自体を Critical として指摘する

## 観点

該当しない観点は飛ばす。重大度の目安: 規約・契約・セキュリティ・データ破壊の違反 = Critical、保守性・テスト不足・設計の歪み = Important、それ以外 = Minor。

### 1. アーキテクチャ境界 (最優先)

- `backend/src/domain/` と `backend/src/application/` に `axum` / `axum_extra` / `sqlx` / `tower` / `tower_http` / `tracing` / `tracing_subscriber` / `hyper` の import がないか (`backend/tests/architecture.rs` の `FORBIDDEN_INFRA_CRATES` と同期)
- `domain` / `application` のシグネチャに `sqlx::FromRow` 派生型・`axum::extract::*`・HTTP 固有型が出ていないか
- リポジトリ trait が `application/ports/`、実装が `infrastructure/repositories/` にあるか
- `Clock` / `PasswordHasher` 等「現実の概念のポート」が `domain` にあるか
- フロントエンド: `features/<x>/` が他の `features/<y>/` を直接 import していないか (共通化は `lib/` か `components/` へ)

### 2. 語彙定義義務

- 構造的な型名・モジュール名に禁止語 `Service` / `Manager` / `Helper` / `Util` / `Utils` / `Processor` / `Worker` / `Engine` がないか。`Handler` は `interfaces::http` 配下のみ
- 命名が「動詞 + 目的語」の 1 文で責務を書けるか。`get` は純粋、`fetch` は I/O

### 3. API 契約 (バックエンド変更時)

- ドメインルール違反を 409 / 404 で返していないか (→ 400 + body の domain code)
- エラーレスポンスが `errors[]` 配列形式か (`error: {...}` は禁止)
- Validator が `Result<_, Vec<Violation>>` を返し、fail-fast していないか
- ボディ参照 ID の不存在が `_not_found_in_body` 系の専用コードか (パスの 404 と分離)
- `openapi/openapi.yaml` と実装が乖離していないか。ID が `{prefix}_{ulid}` 形式か

### 4. データモデル (マイグレーション・モデル変更時)

- 数値的構造を VARCHAR で持っていないか (DATE / DECIMAL / INTERVAL)
- 直交する次元を排他列挙で表していないか。不要な Nullable で逃げていないか
- `user_id` で行レベル分離が保たれているか
- マイグレーションが `backend/migrations/` の SQL で追加され、カスケードの方向が `.contexts/data-model.md` と合っているか

### 5. テスト品質

- テスト名が「何が起きるべきか」を記述しているか (`test1` / `should_work` / `正常系テスト` は不可)
- 境界値 (0, 1, N-1, N, N+1) がカバーされているか。プロパティベーステスト (`proptest` / `@fast-check/vitest`) の余地はないか
- Rust の型システムが保証する範囲をテストしていないか (過剰テスト)
- モックが外部依存 (DB / 外部 API / ファイル) に限られているか
- 受け入れテストの期待値を緩めていないか

### 6. エラーハンドリング

- ユーザー入力・外界由来の失敗が `Result` で表現されているか。`unwrap()` / `expect()` / `panic!` はプログラマのバグにのみ使われているか
- 空の catch / `let _ =` でエラーを握りつぶしていないか。レイヤー境界でエラー変換されているか

### 7. セキュリティ

- パラメータ化クエリか (文字列連結の SQL 禁止)。保護エンドポイントにセッション検証があるか
- リソース所有者チェックがあるか (IDOR: `block.session_id → session.user_id` を必ず照合)
- パスワードが argon2id か。エラーにスタックトレース・内部パスが漏れていないか。秘密情報がハードコードされていないか

### 8. フロントエンド固有

- 状態が discriminated union で表現されているか (フラグの羅列を避ける)
- Presentational コンポーネントに副作用がないか。状態を Props で外から制御できるか (Storybook で全カタログ化できるか)
- 派生可能な値を二重に持っていないか。API 型を `frontend/src/api/schema.gen.ts` から取っているか

### 9. 関数型 / 可読性

- ループ + push の手続き的累積を `map` / `filter` / `reduce` で書けないか。`null` チェックの連鎖を `Option` / `Result` にできないか
- ネストが 3 を超える、関数が 50 行を超える箇所がないか (AGENTS.md の既定値)。ガード節が先頭にまとまっているか

### 10. 修正・障害対応の変更 (debugging)

- 修正の根拠が観測した事実 (ログ・差分・再現手順・いつから壊れたか) に基づいているか。推測が断定として書かれていないか
- 再現テストが追加され、修正前に落ち修正後に通ることが示されているか
- 下流の症状を抑えるだけで、上流の原因を残していないか

### 11. 基準ファイル・ゲートの変更

- 対象: `docs/remote-acceptance.md`「保護する基準ファイル」の一覧
- hook・判定ツール・CI・ruleset・settings を「失敗するから」弱めていないか。`# DO NOT REMOVE OR WEAKEN:` の付いたステップを外していないか
- 設定・DSL は公式ドキュメントを確かめてから指摘する (動作原則)

### 12. コミット品質

- prefix (`[feat]` / `[fix]` / `[update]` / `[improve]` / `[refactor]` / `[chore]` / `[docs]` / `[test]` / `[style]`) と 1 コミット 1 目的
- コミットメッセージ・コード・コメント・識別子が英語か (AGENTS.md「Natural language」)

## 出力形式

```markdown
> LLM ベースのレビューで非決定的。再実行で別の指摘が出ることがある。完了は台帳の状態で判定する (docs/review-contract.md)。

## レビュー結果: <scope> <diff hash 先頭 12 桁>

記録: <record の出力 / 記録できなかった理由>

### 解消確認
- R3: resolved — <確かめた証拠>

### Critical
- R7 [<file>:<line>] <違反内容> — 根拠: <規約の該当箇所> / 由来: <...>
  → <最小差分の修正案>

### Important / Minor
- ...

### エスカレーション
- R9 → #<issue> <判断を求める内容>

### 台帳の状態
<gate.sh check --scope <scope> の結果 (通るか、止まる理由)>
```

該当なしのセクションは省略する。Critical がなければ「Critical: 該当なし」と書く。
