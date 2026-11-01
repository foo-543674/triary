# リモート受け入れ契約

PR を受け入れてよいかを、実装エージェントの権限では変えられない経路で確かめる仕組みの **原典**。
AGENTS.md・`docs/review-contract.md`・検証処理 (`.github/workflows/acceptance.yml` と `tools/review-gate/`) はここを参照する。

生成元: foo-skills 3.0.0 `skills/bootstrap/resources/remote-acceptance.md` (経緯は `.contexts/bootstrap-decisions.md`)。
このファイルは基準ファイルで、変更には CODEOWNERS の承認が要る。

**リモートはもう一度レビューする場ではない。** 欠陥を探すのは手元のレビューゲート (`docs/review-contract.md`) の仕事で、リモートでは LLM を使わない。リモートの役割は、対象の版が明示された受け入れ条件に適合していることを、実装エージェントの権限では変えられない検証経路で確かめることに限る。

## マージを止められるか (現在の状態)

| 項目 | 状態 |
|---|---|
| 目標とする構成 | **GitHub の保護ルールでマージを止める** (2026-10-31 にオーナーが選択) |
| 現在の状態 | **ruleset `main` は有効 (`docs/rulesets/main.json` を適用済み)。ただし、マージを止められるかは未確認** (下の「動作確認」が済むまで)。2026-10-31 14:37 UTC にオーナーが適用し (#42)、AI が読み戻して `enforcement: active`、規則と対象が `main.json` と一致、`current_user_can_bypass: never` を確認した。`bypass_actors` は App の権限では読めず (`null` が返る)、未確認。動作確認が済むまで、AI は規律としてマージ条件を守る。それ以前の履歴: 05:41〜06:16 に一部の規則 (PR 必須・承認 1 件) が有効、06:16 に無効化 |
| AI の主体 | GitHub App `foo-543674-ai-agent[bot]`。オーナー (`foo-543674`) とは別の主体 |
| AI の資格情報で確かめたこと | ブランチ保護の読み取りが 403 (`Resource not accessible by integration`)、`viewerPermission` が空 (admin 権限なしと推定)。ruleset は読める。ruleset `main` の `current_user_can_bypass` が `never` (App は迂回できない)。**未確認**: App が ruleset を変更できないこと、App のレビューが承認として数えられないこと。ruleset が「承認 1 件」だけを求める構成 (05:41〜06:16 の状態) では、書き込み権限を持つ App が他者の PR (Dependabot 等) を承認すると数えられる可能性がある。`main.json` で code owner (オーナー) の承認を必須にすると塞がる |
| リポジトリ | public (GitHub Free でも ruleset が使える) |

状態と履歴はこの節と「ruleset」節だけに書く (他の文書は参照する)。状態が変わったら読み戻してここを更新する。止められないのに、止められるかのように AGENTS.md や README に書かない。

## 何を確かめるか

検証処理 (workflow `Acceptance` の job `acceptance / judge`) が、PR の HEAD に対して次をすべて確かめ、結果を commit status `acceptance / verdict` として発行する。

| 確かめること | 確かめ方 |
|---|---|
| 決定的ゲートが対象の版で **実行され成功した** | HEAD の SHA に対する `.github/workflows/ci.yml` の `pull_request` 実行を Actions API で取得し、必須ジョブ (下記) の conclusion が `success` であることを確かめる。`skipped`・`neutral`・未完了は成功扱いにしない。同じ名前のチェックが緑なだけでは信頼しない (workflow のパス・対象 SHA・リポジトリを照合する) |
| 提出されたレビュー台帳のスナップショットが対象の版に対応し、`docs/review-contract.md`「完了の判定」を満たす | PR コメントのスナップショットを `tools/review-gate` (base 側の版) で検証する。無い・壊れている・内容ハッシュ不一致・HEAD / merge-base / diff ハッシュ / 契約と検証器の版の不一致 = 不合格。エスカレーション中の指摘はここで初めて受け入れを止める |
| 対象の変更が依存する未裁定の判断依頼がない | スナップショットの `decisions` と、エスカレーション中の指摘の `decisionRef` が指す Issue がすべて closed であること。open なら「人間の判断待ち」として不合格 |
| 基準ファイルが変更されていれば、人間が承認している | PR の変更ファイルを base 側の `.github/CODEOWNERS` と照合し、該当があれば結果に「人間の確認が必要、受け入れ保証なし」と出す。承認そのものは ruleset の code owner 承認必須で強制する |
| 承認なしでマージしてよい区分に当たるか | 依存更新 (手順 0) と AI の変更 (手順 5)。条件は「人間の承認なしでマージしてよい変更」。当たれば job `acceptance / automerge` が承認して auto-merge を有効にする。当たらなければ status は同じく成功で、人間が承認してマージする |

台帳について保証できるのは「記載された状態が契約の通過条件に適合する」までである。スナップショットは実装側が提出するので、書かれていない Critical や判断待ちが存在しないこと、解消理由が正しいことまでは保証しない。

### 必須ジョブ (CI)

`backend / lint (fmt + clippy)`、`backend / test (nextest)`、`backend / build (release)`、`frontend / lint (biome ci)`、`frontend / test (vitest + storybook smoke)`、`frontend / build (vite)`、`openapi / spectral lint`、`security / cargo audit`、`security / cargo deny`、`security / pnpm audit`。

- `integration / newman` は `integration / detect` が成功していれば `skipped` を許す (検出対象がない PR では走らない設計のため)
- `security / cargo audit` と `security / pnpm audit` は 2026-10-31 に必須に加えた (#45 のオーナー判断「1」)。それまでは base (`main`) 自体が既知の脆弱性で失敗していて、必須にすると PR の内容と無関係に全 PR が止まるため外していた。依存の更新で緑に戻した (pnpm は PR #47、cargo は `Cargo.lock` の更新)。今後、新しい advisory が出ると PR の内容と無関係に止まる。そのときは依存を更新するか、`.contexts/security-overrides.md` の台帳に載せる対処で緑に戻す
- `security / cargo deny` は 2026-10-31 に必須に加えた (オーナー承認 #65: crate の追加の条件として、サプライチェーンのガードレールを求められた)。方針は `docs/dependency-policy.md`、設定は `backend/deny.toml`。Dependabot の自動マージもこの job の成功を必要とするので、許可外のライセンスや crates.io 以外の取得元を持ち込む更新は自動ではマージされない

## 信頼できる検証経路

- 検証処理は `pull_request_target` / `workflow_run` / `issue_comment` / `workflow_dispatch` で起動する。これらは **base ブランチ (保護された `main`) 側の workflow 定義** で動くので、PR が `acceptance.yml` や `tools/review-gate/` を書き換えても、その PR の判定には効かない
- 検証処理は PR のコードを **実行しない**。checkout するのは base の版だけで、PR の HEAD は diff ハッシュの計算のために git オブジェクトとして fetch するだけ。PR のコードを実行する CI (`ci.yml`) と、証跡を検証して結果を発行する処理を分けている
- 結果は commit status `acceptance / verdict` として HEAD に発行する。ruleset では、この status を **GitHub Actions (integration id 15368) が発行したもの** に限って required check にする設計で、AI の App が同名の status を発行しても数えられないことを狙っている。NOTE: 未確認 — `integration_id` の指定が check run だけでなく REST の commit status にも効くかは確かめていない。確認方法: ruleset の適用後、App の資格情報で同名の status を発行し、マージが拒否されるかを見る (動作確認 #5)。効かなければ check run での発行に切り替える
- PR 内で追加・変更した workflow は `pull_request` で走り、同名の status を発行できてしまう。これは `.github/` が基準ファイルで code owner の承認が要ることで塞いでいる (承認者は workflow の変更を見て判断する)。機械的な遮断ではないことをここに明記する
- base が進んだ場合は、ruleset の「マージ前にブランチを最新にする」(`strict_required_status_checks_policy`) で HEAD の更新を強制し、新しい HEAD で再検証させる。HEAD が同じで base だけ進んだ古い成功は使えない。契約や検証器が変わった場合も、スナップショットの `contractVersion` が base 側の版と合わなくなるので不合格になる
- 判断依頼の Issue を閉じても自動では再判定しない。`workflow_dispatch` (入力: PR 番号) か、スナップショットの再提出で再判定する
- 判定ステップには `# DO NOT REMOVE OR WEAKEN:` で存在意義を書き残す

## 証跡の提出と対応付け

提出方式は 1 つ: **PR コメントで提出 → 検証時に内容を固定 → CI の artifact に保存**。

1. 実装側 (AI) は push 後に `node tools/review-gate/src/cli.ts snapshot --pr <番号> [--decisions "#12,#15"]` の出力をそのまま PR にコメントする。`--decisions` には、この変更が依存する未裁定の判断依頼を列挙する
2. 検証処理は、許可された投稿者 (`foo-543674-ai-agent[bot]`、`foo-543674`) のコメントのうちマーカー `<!-- triary-review-snapshot -->` を含む最新のものを使う
3. 検証に使ったコメントの内容を artifact `review-snapshot-<PR>-<HEAD>` に保存し、判定結果 (job summary) から内容ハッシュで参照する。PR コメントは編集できるため

スナップショットが含むもの: リポジトリ、PR 番号、HEAD の SHA、base の SHA、merge-base、差分の範囲の定義 (`merge-base..head`)、diff ハッシュ、契約と検証器の版 (`docs/review-contract.md` の blob と `tools/review-gate` の tree)、依存する判断依頼、台帳、内容ハッシュ。台帳のうち resolved の指摘と、提出する差分以外のラウンドは載せない (前者はどのモードでも判定を通り、後者は判定が差分ハッシュで絞り込むので、除いても結果は変わらない。全部を載せると PR コメントの上限を超えた: 2026-11-01 に 263,298 文字のコメントが拒否された。251,810 文字は受け付けられていた)。全体は手元の台帳 (`cli.ts show`) に残る

PR 差分のレビュー証跡と、CI の成功は別の証拠として扱い、どちらを検証したかを結果に別項目で出す。

Dependabot の PR は、範囲内の全コミットが Dependabot 自身のもの (作成者 `dependabot[bot]`、コミッター `web-flow`、署名検証あり。判定は `dependency.ts` の `dependabotAuthored`) なら、変更ファイルを問わずスナップショットを求めない (2026-11-01 オーナー判断、暫定。AI が書いた変更ではないので、縛るべき AI のレビューがない。恒久的な扱いはオーナーが後で決める)。それ以外の判定 (CI、基準ファイルの code owner 承認、承認なしでマージできるかどうか) は変わらない。誰かが Dependabot のブランチにコミットを足した場合は、通常どおりスナップショットを求める。

## 保護する基準ファイル

`.github/CODEOWNERS` でオーナーに割り当て、ruleset で code owner の承認を必須にする。CODEOWNERS は base 側の定義が使われるので、PR 内で書き換えてもその PR の判定は既存の定義で行われる。

- `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.cursorrules`、`.github/copilot-instructions.md`
- `docs/review-contract.md`、`docs/remote-acceptance.md` (承認なしでマージしてよい変更の条件を含む)、`docs/rulesets/`
- `.agents/skills/`、`.claude/` (`settings.json`、hook、エージェント定義)
- アーキテクチャテスト (`backend/tests/architecture.rs`、`frontend/.dependency-cruiser.cjs`、`frontend/scripts/check-arch.mjs`)
- git hook (`.githooks/`)、判定ツール (`tools/review-gate/`)
- 依存のサプライチェーン対策 (`docs/dependency-policy.md`、`backend/deny.toml`、`backend/.cargo/audit.toml`、`backend/tests/dependency_ledger.rs`)。`backend/Cargo.toml` 自体は含めない (含めると Dependabot の自動マージが code owner の承認で止まる。直接依存の追加は台帳の検査で `docs/dependency-policy.md` の変更を伴うので、承認を経る)
- 開発コマンドの入口 (`dev`) と開発イメージ (`tools/dev-image/`)。決定的ゲートが何の上で走るかを決めるため
- CI の workflow と設定 (`.github/`)、`Makefile`、`.devcontainer/`
- 必須 CI ジョブが読む設定 (`frontend/biome.json`、`frontend/tsconfig.json`、`frontend/vite.config.ts`、`frontend/.storybook/`)。変えるとゲートが何を確かめるかが変わるため (2026-11-01、R100)。`frontend/package.json` と `backend/Cargo.toml` は依存の更新と同居するので載せず、検証器が依存以外の区画への変更を承認なしの区分から外す (手順 6)
- `.github/CODEOWNERS` 自身

承認後に push されたら承認を失効させる (`dismiss_stale_reviews_on_push` と `require_last_push_approval`)。bootstrap の再実行による変更も基準の改訂として同じ承認を経る。

ファイル単位の保護は安全側に倒している。AGENTS.md の現状説明の更新やアーキテクチャテストの強化にも承認が要る手間が出る。緩和だけを検出する仕組みはまだ持たない。

## ruleset

定義は `docs/rulesets/main.json`。既存の ruleset `main` (id 14771319) の規則を残したまま、必要な項目を足したもの。読み戻した履歴: bootstrap 着手時 (2026-10-31 05:30 頃) は `enforcement: disabled`・承認 0 件だったが、同日 05:41 に `active`・承認 1 件へ更新されていた (App には admin 権限がないので、オーナーによる変更と推定。意図の記録はない)。ruleset はリポジトリの設定でファイルにできないため、適用はオーナーが行う (外部に影響する操作)。

| 状態 | |
|---|---|
| 生成済み | `docs/rulesets/main.json` |
| 適用 | 2026-10-31 14:37 UTC にオーナーが `gh api -X PUT repos/foo-543674/triary/rulesets/14771319 --input docs/rulesets/main.json` を実行 (#42) |
| 有効化済み | 有効 (読み戻しで確認。詳細は「マージを止められるか」)。下記の動作確認は未 |

主な設定: 削除・force push の禁止、PR 必須、承認 1 件 + code owner の承認必須、push で承認失効、最後の push 以外の人の承認、required status check `acceptance / verdict` (GitHub Actions 発行に限る)、ブランチを最新にする。bypass はリポジトリの admin ロールの PR 経由のマージだけ (オーナーが自分の PR をマージするため。自分の PR は自己承認できない)。AI の App は admin ではないので bypass できない設計。適用後の読み戻しで App の `current_user_can_bypass: never` を確認した (2026-10-31)。`bypass_actors` は App の権限では読めず未確認。

### 動作確認 (適用後)

「保護ルールでマージを止める」構成では、次がすべてマージ不可になることを確かめる。結果はこの節に追記する。

| # | ケース | 期待 | 確認方法 | 結果 |
|---|---|---|---|---|
| 1 | スナップショットが無い・壊れている | 不合格 | 単体テスト + 実 PR | 単体テスト済み (`snapshot.test.ts`)。実 PR は未 |
| 2 | HEAD が進んだ後の古いスナップショット | 不合格 | 同上 | 単体テスト済み。実 PR は未 |
| 3 | 決定的ゲートの skipped・未実行 | 不合格 | 実 PR | 未 |
| 4 | Critical が未処置のスナップショット | 不合格 | 単体テスト + 実 PR | 単体テスト済み。実 PR は未 |
| 5 | 定義外の workflow が出した同名の成功チェック | マージ不可 | 実 PR | 未 (status の発行元制限 + code owner 承認で塞ぐ設計) |
| 6 | 人間の承認なしの基準ファイルの変更 | マージ不可 | 実 PR | 未 |
| 7 | 承認後の push | マージ不可 | 実 PR | 未 |
| 8 | 最終判定の欠落・失敗 | マージ不可 | 実 PR | 未 |
| 9 | HEAD は同じで base や契約の版だけ進んだ後の古い成功 | マージ不可 | 単体テスト + 実 PR | 単体テスト済み (契約の版・merge-base)。実 PR は未 |
| 10 | 依存する未裁定の判断依頼が残っている | 不合格 (人間の判断待ち) | 実 PR | 未 |
| 11 | 範囲外の変更を承認なしでマージ | マージ不可 | 実 PR | 未。検証器の区分判定は 2026-10-31 に `DRY_RUN=1` で確認 (Dependabot の #50 は区分内、AI の #59 は区分外でスナップショットを要求) |
| 12 | 条件の改訂を承認なしで有効化 | マージ不可 | 実 PR | 条件はこのファイル (基準ファイル) にある |

## 人間の承認なしでマージしてよい変更

条件の版: 2026-11-01。依存更新の区分は 2026-10-31 版 (#43 のオーナー判断。「依存パッケージの更新は CI などで壊れなければ自動でマージしてよい」「GitHub Actions の更新も含める」(のち、code owner 保護との兼ね合いを説明したうえで承認ありに確定。下記)「自動マージする更新に台帳は要らない」「action は commit SHA で固定する」)。#63 のマージ (2026-10-31) で有効。最初の適用は #50 (rstest): 14:42 UTC に automerge ジョブが GitHub Actions として承認し、そのままマージされた (run 41211333898、ruleset 有効の状態で観測)。

2026-11-01 の改訂 (オーナー判断): AI の変更も、受け入れ判定が通れば承認なしでマージする区分に加えた。品質は自動レビューの観点と CI のガードレールで作り込み、AI の PR を人がすべて読む運用は作業量に追いつかないため。人の承認を残すのは、AI を縛る基準ファイル (下の「保護する基準ファイル」) の変更だけ。AI が自分の検証器や規則を緩めてそのままマージできると、ほかのすべての証拠が意味を失うため。同日、依存の追加・更新もサプライチェーンの確認 (手順 6) を通れば承認なしとした。承認が要る部分 (マニフェストの依存以外の区画) は、ファイルではなく区画で切り分ける

| 区分 | 変更 | 検証器が確かめる証拠 (`tools/review-gate/acceptance.sh`) |
|---|---|---|
| 承認なし | Dependabot による Rust / npm の依存更新 (patch / minor / major を問わない) | 手順 0。判定は `tools/review-gate/src/dependency.ts` (単体テスト `dependency.test.ts`)。PR 作成者が `dependabot[bot]`。merge-base から判定した HEAD までの変更ファイル (リネーム元を含む) が `backend/Cargo.toml` / `backend/Cargo.lock` / `frontend/package.json` / `frontend/pnpm-lock.yaml` だけ。その範囲の全コミットについて、作成者が `dependabot[bot]`、コミッターが `web-flow` (GitHub)、署名検証が通っている (作成者は push する人が自由に書けるので、それだけでは足りない)。必須の CI ジョブがその SHA ですべて成功。台帳のスナップショットは求めない |
| 承認なし | AI (`foo-543674-ai-agent[bot]`) の変更で、基準ファイルに触れないもの | 手順 1〜4 がすべて合格 (必須の CI ジョブがその SHA で成功、HEAD と差分に結びついた台帳のスナップショットが契約を満たす、依存する判断依頼がすべて閉じている) したうえで、手順 5。判定は `tools/review-gate/src/ai-change.ts` (単体テスト `ai-change.test.ts`)。PR 作成者が AI の App、base が既定のブランチ、draft でない、`hold-merge` ラベルがない、変更ファイル (リネーム元を含む) に CODEOWNERS の対象がなく、必須 CI ジョブの設定 (`ai-change.ts` の `GUARDRAIL_CONFIG`: まだ存在しない rustfmt / clippy / nextest / vitest / biome / spectral の設定ファイル名) にも触れない。UI のレビュー待ちでない (下記)。マニフェストは手順 6 で区画ごとに判定する |
| 人間の承認が要る | 上記以外のすべて。基準ファイルを変える AI の PR、GitHub Actions の更新 (下記)、オーナー自身の PR、手順 6 に通らない依存の変更 | — |

上の 2 つの承認なしの区分は、どちらも最後に手順 6 (サプライチェーンの確認、`cli.ts check-dependencies`) を通ったときだけ自動マージする。通らなくても受け入れ判定は落とさず、人の承認でマージできる (セキュリティ更新を遅らせないため)。確かめること:

- マニフェストの変更が依存の区画だけであること (`tools/review-gate/src/manifest.ts`)。`frontend/package.json` は `dependencies` / `devDependencies` / `optionalDependencies` / `peerDependencies` 以外のフィールド (scripts、`pnpm.overrides` など)、`backend/Cargo.toml` は依存の表 (`[dependencies]` とその派生、`target.*`、`workspace.dependencies`) 以外の表 (`[package]`、`[lints]`、`[patch]` など) に触れたら人へ
- npm パッケージの新規追加がないこと。`package.json` に書いた名前だけでなく、ロックファイルに初めて現れる名前 (推移的な依存や `npm:` の別名) も数える (インストール時スクリプトの対策が入るまで。`docs/dependency-policy.md`)
- ロックファイル (`backend/Cargo.lock`、`frontend/pnpm-lock.yaml`) で新しく入る版が、公開から 7 日 (既存パッケージの major 更新は 14 日) 経っていること (`tools/review-gate/src/release-age.ts`)。推移的な依存も含む。公開日は crates.io と npm レジストリの API で読み、読めなければ人へ。150 版を超える変更は 1 つずつ確かめず人へ

- AI の変更の区分で、人の目の代わりになるもの: 手元のレビューゲート (別コンテキストのレビュアー、`docs/review-contract.md`)、決定的ゲート (fmt / lint / 型 / テスト / アーキテクチャテスト / cargo deny・audit / pnpm audit / Newman)、判断依頼の未決による停止。これらを強めることは歓迎で、弱めることは基準ファイルの変更としてオーナーの承認を経る
- 残る弱点: 台帳を書くのは別コンテキストのレビュアーだが、スナップショットを提出するのは実装側で、リモートはレビューの真正性を確かめられない (上の「何を確かめるか」の注記と「この段階で扱わないこと」)。人の承認を外す以上、この区分の品質はローカルのレビューゲートのフックと決定的ゲートに依存する。見逃しが出たら、まずゲートとレビュー観点を強める (見直すきっかけ)
- UI のレビュー (2026-11-01 オーナー判断): オーナーは UI の細部はレビューしない。見るのは新しい画面と大規模なレイアウト変更だけで、見落としは後で指摘して直せばよいとしている。新しい画面は検証器が機械的に検出する (`frontend/src/routes/` に追加された `.tsx`。テストとストーリーは除く。`ai-change.ts` の `isNewScreen`)。大規模なレイアウト変更かどうかは機械で判定しにくいので、AI が PR を開くときに判断し、該当すれば `needs-ui-review` ラベルを付ける (AGENTS.md)。どちらも、オーナーが `ui-reviewed` ラベルを付けるまで自動マージしない。`ui-reviewed` は付けた人を issue のイベントで確かめ、オーナー以外が付けたものは数えない。Chromatic は見た目の変更を自動で基準にし、承認を求めない (`chromatic.yml` の `autoAcceptChanges`)。限界 (R108、オーナーが許容した「見落としは後で直す」の範囲): `ui-reviewed` はオーナーが見たコミットに結び付いていないので、ラベルの後に push で足した画面も通る。`needs-ui-review` は AI が外せる (外した人は区別しない)。見落としが問題になったら、ラベルの時刻と最後に画面を足したコミットの比較を足す
- オーナーが特定の PR を止めたいときは `hold-merge` ラベルを付けるか draft に戻す。付けると再判定され、job `acceptance / hold` がすでに有効になった auto-merge を取り消す。外せば次の判定で自動マージに戻る。ただし、auto-merge は ruleset の条件がそろった時点ですぐマージするので、判定が通った後に付けても間に合わないことが多い。確実に効くのは判定が通る前 (CI の実行中、判断依頼の待ち、ブランチが古いとき) で、止めたい変更は PR を開いた時点で付ける。NOTE: 未確認 — 取り消しの動作 (`gh pr merge --disable-auto`) は実 PR で試していない
- 止まるのはこの表の条件だけである。AGENTS.md「Stop and confirm first」の項目 (`.contexts` の設計判断、OpenAPI の破壊的変更、認証・暗号、レイヤー構造など) は基準ファイルではないので、それ自体では止まらない。止まるのは、AI が判断依頼の Issue を立ててスナップショットの `decisions` に載せ、その Issue が open の間だけ。だから、これらに当たる変更では判断依頼を必ず `decisions` に載せる
- 積み重ねた PR (stack) では、下の PR がマージされると次の PR の merge-base と差分が変わり、スナップショットが古くなる。AI が次の PR を `main` に追従させ、差分をレビューし直してスナップショットを投稿する
- NOTE: 未確認 — GITHUB_TOKEN で行ったマージでは `main` への push の workflow (`ci.yml`、`chromatic.yml`、`e2e.yml`) が起動しない (上と同じドキュメントによる)。`e2e.yml` は push でしか走らないので、Playwright の設定が入った時点で、この区分のマージでは E2E が一度も走らないことになる (2026-11-01 時点は設定がなくスキップ)。見直すきっかけ: `frontend/playwright.config.*` の追加。そのとき E2E を PR の必須ジョブに移す。Chromatic の `main` のベースラインも更新されない
- 合格すると、`acceptance.yml` の `acceptance / automerge` ジョブが GitHub Actions として承認し、判定した HEAD に限って auto-merge を有効にする。前提となるリポジトリ設定: 「Allow GitHub Actions to create and approve pull requests」(承認に必要。オーナーの操作) と「Allow auto-merge」(`gh pr merge --auto` に必要。2026-10-31 に API の `allow_auto_merge: true` で有効を確認)。この設定で PR のコードから書き込みトークンに届くと自分の PR を承認できてしまうので、PR のコードを動かす workflow はトークンを読み取り専用にした (`permissions: contents: read`)
- 承認の後にブランチへ別のコミットが push された場合、その承認を使わせない仕組みは ruleset の `dismiss_stale_reviews_on_push` と `require_last_push_approval` (`docs/rulesets/main.json`) である。ruleset は 2026-10-31 から有効だが、これらが実際に効くことは動作確認 #7 が済むまで未確認。それまでの確かな防御は `--match-head-commit` (判定した HEAD 以外をマージしない) である
- NOTE: 未確認 — Dependabot のブランチで、作成者を偽った上で `web-flow` の署名付きコミットを作れるか (GitHub の Web UI や contents API で作ったコミットを `web-flow` が署名するかどうか、`author` を指定できるかどうかも確かめていない)。書き込み権限が要る操作で、今の書き込み権限者はオーナーと AI の App だけ。確かめ方: テスト用のブランチで contents API に `author` を指定してコミットし、`author.login` と `committer.login` を見る。より強い対策は、`dependabot/**` への push を Dependabot に限る ruleset (オーナーの操作)。影響範囲: 2026-11-01 から Dependabot 自身のコミットだけの PR はスナップショットを求めないので、偽装が可能なら、依存ファイルに限らず基準ファイル以外のあらゆる変更がスナップショットなしで判定を通る (承認なしの自動マージは依存ファイルに限られ、基準ファイルは code owner の承認が要るのは変わらない)
- **GitHub Actions の更新は承認あり (2026-10-31 にオーナーが確定、#43)。** オーナーは当初含めると判断したが、workflow は `.github/` にあり、ruleset の code owner 承認必須 (基準ファイルの保護) にかかる。外すには `.github/workflows/` を CODEOWNERS から外す必要があり、PR が workflow を足して同名の status を出す穴を承認で塞いでいる仕組み (上の「保護する基準ファイル」) が弱まる。この穴を説明したうえで、オーナーは承認ありを選んだ。運用: Actions の更新 PR はスナップショットなしで判定が通り (上の「Dependabot の PR」、2026-11-01 から暫定)、オーナーが承認してマージする
- NOTE: 未確認 — GITHUB_TOKEN で行ったマージは `main` への push の workflow を起動しない (GitHub のドキュメント「Triggering a workflow from a workflow」による)。そのため、この区分のマージでは `main` の CI が走らない。根拠は、ruleset の「ブランチを最新にする」で最新の HEAD に対して走った PR の CI とする
- 変更されたパスは判定の材料の 1 つで、パスだけで安全と決めない。検証器が機械的に確かめられない部分は承認ありとする
- 戻し方: `git revert` でマージを戻す (依存更新ならロックファイルとマニフェスト)。データ変更・外部への作用は起きない (デプロイの仕組みがまだないため)。デプロイが入ったら見直す
- 改訂できる人: オーナー (`foo-543674`)。AI は改訂案を出せるが、自分で有効にしない (範囲を狭める改訂も同じ)。すぐにやってよいのは、条件を変えずに承認なしのマージを一時的に止めることだけ (`acceptance.yml` の automerge ジョブを無効にする PR、またはリポジトリ設定で Actions の承認を切る)
- 見直すきっかけ: 承認なしでマージした変更での見逃し、デプロイの導入、条件に当てはまる変更の実績が 10 件たまったとき。デプロイが入ったら、AI の変更の区分は特に見直す (マージが本番への作用になるため)

### 承認なしでマージした変更の報告

承認なしでマージした変更は、作業の区切りの報告で一覧にする (変更、適用した条件の版、検証の証跡、残っている事項、戻し方)。重大な事故はすぐ知らせる。

## この段階で扱わないこと

レビューの真正性の保証 (独立したレビュアーの署名等)、複数の提出方式、基準の意味的な緩和の検出、リモートでの LLM レビュー、フォークからの PR。
