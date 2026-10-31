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
| 現在の状態 | **PR に警告を出すだけ** (2026-10-31 06:16 にオーナーが ruleset `main` を無効にしたことを読み戻して確認)。05:41〜06:16 の間は有効で、PR 必須・承認 1 件、AI の App は迂回できなかった。`docs/rulesets/main.json` は生成済み・未適用で、適用コマンドは #42 にある。適用して読み戻すまで、受け入れ検証の結果は PR への警告にとどまり、AI は規律としてマージ条件を守る |
| AI の主体 | GitHub App `foo-543674-ai-agent[bot]`。オーナー (`foo-543674`) とは別の主体 |
| AI の資格情報で確かめたこと | ブランチ保護の読み取りが 403 (`Resource not accessible by integration`)、`viewerPermission` が空 (admin 権限なしと推定)。ruleset は読める。ruleset `main` の `current_user_can_bypass` が `never` (App は迂回できない)。**未確認**: App が ruleset を変更できないこと、App のレビューが承認として数えられないこと。code owner の承認が必須でない今は、書き込み権限を持つ App が他者の PR (Dependabot 等) を承認すると数えられる可能性がある。`main.json` の適用で code owner (オーナー) の承認が必須になれば塞がる |
| リポジトリ | public (GitHub Free でも ruleset が使える) |

状態が変わったら、この表と `.contexts/bootstrap-decisions.md` を更新する。止められないのに、止められるかのように AGENTS.md や README に書かない。

## 何を確かめるか

検証処理 `acceptance / verdict` が、PR の HEAD に対して次をすべて確かめる。

| 確かめること | 確かめ方 |
|---|---|
| 決定的ゲートが対象の版で **実行され成功した** | HEAD の SHA に対する `.github/workflows/ci.yml` の `pull_request` 実行を Actions API で取得し、必須ジョブ (下記) の conclusion が `success` であることを確かめる。`skipped`・`neutral`・未完了は成功扱いにしない。同じ名前のチェックが緑なだけでは信頼しない (workflow のパス・対象 SHA・リポジトリを照合する) |
| 提出されたレビュー台帳のスナップショットが対象の版に対応し、`docs/review-contract.md`「完了の判定」を満たす | PR コメントのスナップショットを `tools/review-gate` (base 側の版) で検証する。無い・壊れている・内容ハッシュ不一致・HEAD / merge-base / diff ハッシュ / 契約と検証器の版の不一致 = 不合格。エスカレーション中の指摘はここで初めて受け入れを止める |
| 対象の変更が依存する未裁定の判断依頼がない | スナップショットの `decisions` と、エスカレーション中の指摘の `decisionRef` が指す Issue がすべて closed であること。open なら「人間の判断待ち」として不合格 |
| 基準ファイルが変更されていれば、人間が承認している | PR の変更ファイルを base 側の `.github/CODEOWNERS` と照合し、該当があれば結果に「人間の確認が必要、受け入れ保証なし」と出す。承認そのものは ruleset の code owner 承認必須で強制する |

台帳について保証できるのは「記載された状態が契約の通過条件に適合する」までである。スナップショットは実装側が提出するので、書かれていない Critical や判断待ちが存在しないこと、解消理由が正しいことまでは保証しない。

### 必須ジョブ (CI)

`backend / lint (fmt + clippy)`、`backend / test (nextest)`、`backend / build (release)`、`frontend / lint (biome ci)`、`frontend / test (vitest + storybook smoke)`、`frontend / build (vite)`、`openapi / spectral lint`。

- `integration / newman` は `integration / detect` が成功していれば `skipped` を許す (検出対象がない PR では走らない設計のため)
- `security / cargo audit` と `security / pnpm audit` は必須にしていない。base (`main`) 自体が既知の脆弱性で失敗している間は、PR の内容と無関係に全 PR を止めてしまうため。base の audit を緑に戻したら必須に加える (判断依頼に積んでいる)

## 信頼できる検証経路

- 検証処理は `pull_request_target` / `workflow_run` / `issue_comment` / `workflow_dispatch` で起動する。これらは **base ブランチ (保護された `main`) 側の workflow 定義** で動くので、PR が `acceptance.yml` や `tools/review-gate/` を書き換えても、その PR の判定には効かない
- 検証処理は PR のコードを **実行しない**。checkout するのは base の版だけで、PR の HEAD は diff ハッシュの計算のために git オブジェクトとして fetch するだけ。PR のコードを実行する CI (`ci.yml`) と、証跡を検証して結果を発行する処理を分けている
- 結果は commit status `acceptance / verdict` として HEAD に発行する。ruleset では、この status を **GitHub Actions (integration id 15368) が発行したもの** に限って required check にする。AI の App が同名の status を発行しても数えられない
- PR 内で追加・変更した workflow は `pull_request` で走り、同名の status を発行できてしまう。これは `.github/` が基準ファイルで code owner の承認が要ることで塞いでいる (承認者は workflow の変更を見て判断する)。機械的な遮断ではないことをここに明記する
- base が進んだ場合は、ruleset の「マージ前にブランチを最新にする」(`strict_required_status_checks_policy`) で HEAD の更新を強制し、新しい HEAD で再検証させる。HEAD が同じで base だけ進んだ古い成功は使えない。契約や検証器が変わった場合も、スナップショットの `contractVersion` が base 側の版と合わなくなるので不合格になる
- 判断依頼の Issue を閉じても自動では再判定しない。`workflow_dispatch` (入力: PR 番号) か、スナップショットの再提出で再判定する
- 判定ステップには `# DO NOT REMOVE OR WEAKEN:` で存在意義を書き残す

## 証跡の提出と対応付け

提出方式は 1 つ: **PR コメントで提出 → 検証時に内容を固定 → CI の artifact に保存**。

1. 実装側 (AI) は push 後に `node tools/review-gate/src/cli.ts snapshot --pr <番号> [--decisions "#12,#15"]` の出力をそのまま PR にコメントする。`--decisions` には、この変更が依存する未裁定の判断依頼を列挙する
2. 検証処理は、許可された投稿者 (`foo-543674-ai-agent[bot]`、`foo-543674`) のコメントのうちマーカー `<!-- triary-review-snapshot -->` を含む最新のものを使う
3. 検証に使ったコメントの内容を artifact `review-snapshot-<PR>-<HEAD>` に保存し、判定結果 (job summary) から内容ハッシュで参照する。PR コメントは編集できるため

スナップショットが含むもの: リポジトリ、PR 番号、HEAD の SHA、base の SHA、merge-base、差分の範囲の定義 (`merge-base..head`)、diff ハッシュ、契約と検証器の版 (`docs/review-contract.md` の blob と `tools/review-gate` の tree)、依存する判断依頼、台帳、内容ハッシュ。

PR 差分のレビュー証跡と、CI の成功は別の証拠として扱い、どちらを検証したかを結果に別項目で出す。

Dependabot の PR も同じ条件で判定する。取り込む AI が手元でレビューし、スナップショットを提出する。

## 保護する基準ファイル

`.github/CODEOWNERS` でオーナーに割り当て、ruleset で code owner の承認を必須にする。CODEOWNERS は base 側の定義が使われるので、PR 内で書き換えてもその PR の判定は既存の定義で行われる。

- `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.cursorrules`、`.github/copilot-instructions.md`
- `docs/review-contract.md`、`docs/remote-acceptance.md` (承認なしでマージしてよい変更の条件を含む)、`docs/rulesets/`
- `.agents/skills/`、`.claude/` (`settings.json`、hook、エージェント定義)
- アーキテクチャテスト (`backend/tests/architecture.rs`、`frontend/.dependency-cruiser.cjs`)
- git hook (`.githooks/`)、判定ツール (`tools/review-gate/`)
- CI の workflow と設定 (`.github/`)、`Makefile`、`.devcontainer/`
- `.github/CODEOWNERS` 自身

承認後に push されたら承認を失効させる (`dismiss_stale_reviews_on_push` と `require_last_push_approval`)。bootstrap の再実行による変更も基準の改訂として同じ承認を経る。

ファイル単位の保護は安全側に倒している。AGENTS.md の現状説明の更新やアーキテクチャテストの強化にも承認が要る手間が出る。緩和だけを検出する仕組みはまだ持たない。

## ruleset

定義は `docs/rulesets/main.json`。既存の ruleset `main` (id 14771319) の規則を残したまま、必要な項目を足したもの。読み戻した履歴: bootstrap 着手時 (2026-10-31 05:30 頃) は `enforcement: disabled`・承認 0 件だったが、同日 05:41 に `active`・承認 1 件へ更新されていた (App には admin 権限がないので、オーナーによる変更と推定。意図の記録はない)。ruleset はリポジトリの設定でファイルにできないため、適用はオーナーが行う (外部に影響する操作)。

| 状態 | |
|---|---|
| 生成済み | `docs/rulesets/main.json` |
| 適用予定 | オーナーが `gh api -X PUT repos/foo-543674/triary/rulesets/14771319 --input docs/rulesets/main.json` を実行。既存の有効な ruleset を強化する操作になる。**この PR のマージ後に** 行う。先に適用すると、required check `acceptance / verdict` を発行する workflow が base にまだないので、この PR 自身が status を得られず止まる |
| 有効化済み | 未 (05:41〜06:16 に一部が有効だったが、現在は無効)。`main.json` の適用後に AI が読み戻し、下記の動作確認をしてからこの表を更新する |

主な設定: 削除・force push の禁止、PR 必須、承認 1 件 + code owner の承認必須、push で承認失効、最後の push 以外の人の承認、required status check `acceptance / verdict` (GitHub Actions 発行に限る)、ブランチを最新にする。bypass はリポジトリの admin ロールの PR 経由のマージだけ (オーナーが自分の PR をマージするため。自分の PR は自己承認できない)。AI の App は admin ではないので bypass できない (適用後に確かめる)。

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
| 11 | 範囲外の変更を承認なしでマージ | マージ不可 | 実 PR | 条件が未合意のため全 PR が承認必須 |
| 12 | 条件の改訂を承認なしで有効化 | マージ不可 | 実 PR | 条件はこのファイル (基準ファイル) にある |

## 人間の承認なしでマージしてよい変更

**現在、承認なしでマージしてよい変更はない。** 2026-10-31 にオーナーが #43 で「依存パッケージの更新は、CI などで壊れなければ自動でマージしてよい」と回答した。下の案より広い (major を含む)。具体化と未確認の 2 点 (GitHub Actions の更新を含めるか、台帳のスナップショットを求めるか) は #43 で確認中で、検証器と ruleset の実装もまだない。実装した PR が承認されてマージされるまでは、すべての変更を承認ありとして扱う。

### 案 (未合意・無効)

| 区分 | 変更 | 検証器が確かめる証拠 |
|---|---|---|
| 承認なし (案) | Dependabot による Rust / npm 依存の **patch / minor** 更新で、変更がロックファイルとマニフェストのバージョン指定だけのもの | PR 作成者が `dependabot[bot]`、変更ファイルが `backend/Cargo.lock` / `frontend/pnpm-lock.yaml` / `frontend/package.json` のみ、`package.json` の差分がバージョン指定行のみ、Dependabot のメタデータの update-type が patch / minor、上記「何を確かめるか」がすべて合格 |
| 人間の承認が要る | 上記以外のすべて。特に: 基準ファイル (`.github/` の workflow を含むので GitHub Actions の更新も該当)、major 更新、新しい依存の追加、認証・セッション・暗号、マイグレーション、`openapi/openapi.yaml`、`.contexts/` の設計判断 | — |

- 変更されたパスは判定の材料の 1 つで、パスだけで安全と決めない。検証器が機械的に確かめられない部分は承認ありとする
- 戻し方: `git revert` でロックファイルを戻す。データ変更・外部への作用は起きない (デプロイの仕組みがまだないため)。デプロイが入ったら見直す
- 改訂できる人: オーナー (`foo-543674`)。AI は改訂案を出せるが、自分で有効にしない (範囲を狭める改訂も同じ)。すぐにやってよいのは、条件を変えずに承認なしのマージを一時的に止めることだけ
- 見直すきっかけ: 承認なしでマージした変更での見逃し、デプロイの導入、条件に当てはまる変更の実績が 10 件たまったとき
- 有効にするには、検証器にこの条件の判定を足し、ruleset の承認必須を「CODEOWNERS 対象 + 条件外」に限る構成に変える必要がある (今の ruleset はすべての PR に承認を求める)

合意のための例 (判断依頼に載せる):

- 典型: `serde_json` 1.0.149 → 1.0.150 (Cargo.lock のみ) → 承認なし (案)
- 危険: `typescript` 6 → 7 (major。Storybook のビルドと dependency-cruiser の解析が壊れることを確認済み) → 承認が要る
- 判断が分かれそう: `actions/checkout` 6 → 7 (major、かつ workflow = 基準ファイル) → 承認が要る / Dependabot のグループ更新で major と minor が混ざる → 承認が要る

### 承認なしでマージした変更の報告

承認なしでマージした変更は、作業の区切りの報告で一覧にする (変更、適用した条件の版、検証の証跡、残っている事項、戻し方)。重大な事故はすぐ知らせる。

## この段階で扱わないこと

レビューの真正性の保証 (独立したレビュアーの署名等)、複数の提出方式、基準の意味的な緩和の検出、リモートでの LLM レビュー、フォークからの PR。
