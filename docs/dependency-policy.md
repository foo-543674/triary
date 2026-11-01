# 依存パッケージの方針 (サプライチェーン)

外部パッケージ (Rust の crate、npm パッケージ) を取り込むときの規則と、それを機械的に止める仕組み。設定ファイルの関係:

| 仕組み | 場所 | 何を止めるか |
|---|---|---|
| cargo-deny | `backend/deny.toml`、CI job `security / cargo deny` (必須) | RustSec の advisory (脆弱性・メンテ終了・unsound・yank)、許可外のライセンス、`*` のバージョン指定、crates.io 以外の取得元 (git・別レジストリ) |
| cargo audit | `backend/.cargo/audit.toml`、CI job `security / cargo audit` (必須) | RustSec の脆弱性 |
| pnpm audit | CI job `security / pnpm audit` (必須) | npm の high 以上の脆弱性 |
| ロックファイル固定 | cargo の build / clippy / nextest は CI (`ci.yml`・`e2e.yml`・`dev-image.yml`) と git hook で `--locked`、pnpm は `--frozen-lockfile` | コミットされていない版が CI やフックの中で解決されること。`cargo fmt` と `cargo audit` は依存を解決しないので付けていない |
| Dependabot の cooldown | `.github/dependabot.yml` | 公開直後の版 (7 日、major は 14 日) を提案しない。乗っ取られた版が見つかって yank されるまでの時間を稼ぐ。セキュリティ更新は遅らせない |
| 直接依存の台帳 | `docs/dependency-ledger.md`、検査は `backend/tests/dependency_ledger.rs` (`cargo metadata` で直接依存を取る) | 台帳に載っていない直接依存 (審査の記録がない crate) の追加、台帳に残った削除済みの crate |
| 公開日数の確認 | 受け入れの検証器 (`tools/review-gate/src/release-age.ts`) | ロックファイルで新しく入る版のうち、公開から 7 日 (既存パッケージの major 更新は 14 日) 経っていないもの。止めるのは承認なしのマージだけで、受け入れ判定は落とさない (セキュリティ更新は人の承認で入れられる) |
| 人間の承認 | CODEOWNERS (このファイル、`backend/deny.toml`、`backend/.cargo/`、`backend/tests/dependency_ledger.rs`)。マニフェスト (`backend/Cargo.toml`・`frontend/package.json`) と台帳 (`docs/dependency-ledger.md`) は含めない。マニフェストの依存以外の区画 (scripts・lints・`[patch]` など) の変更は、検証器が承認なしの区分から外す | 上の規則そのものの緩和 |

規則を緩める変更 (許可ライセンスの追加、advisory の無視、取得元の追加、cooldown の短縮、台帳検査の削除) は検証器の改訂で、オーナーの承認が要る (AGENTS.md "AI delegation scope")。

## 承認の範囲

- 2026-10-31: オーナーが Rust の crate の追加を事前承認した (#65)。条件は、サプライチェーンのガードレールを設けたうえで、このファイルの手順を守ること。AGENTS.md "Stop and confirm first" はこれを参照する。
- 2026-11-01: オーナー判断により、依存の追加・更新もガードレールを通れば人の承認なしでマージする (`docs/remote-acceptance.md`「人間の承認なしでマージしてよい変更」)。そのため台帳を、保護するこのファイルから `docs/dependency-ledger.md` に分けた。審査の記録と台帳の検査は従来どおり求める。
- npm パッケージの新規追加は、npm 側のガードレール (インストール時スクリプトの既定停止など。pnpm 10 への移行で入れる予定) が揃うまで、承認なしのマージの対象にしない (検証器が `frontend/package.json` の依存名と `frontend/pnpm-lock.yaml` に初めて現れるパッケージ名を検出する)。既存パッケージの版の更新は対象にする。

## crate を追加する手順

追加する PR ごとに、次を確かめて台帳に記録する。確かめられない項目があれば追加しない。

1. **名前**: crates.io 上の正確な名前を確かめる (typosquatting 対策)。公式ドキュメントや、既に使っている crate の依存として知られている名前と照合する。
2. **出所**: リポジトリが既知の組織・作者のもの (例: RustCrypto、tokio-rs、rust-lang、serde-rs) か。crates.io の所有者 (`owners`) とリポジトリが一致するか。
3. **実績**: 総ダウンロード数、最終リリース日、メンテが続いているか。RustSec に未解決の advisory がないか (cargo-deny が機械的にも見る)。
4. **最小限**: 標準ライブラリや既存の依存で足りないか。`default-features = false` にして必要な feature だけを有効にする。
5. **ビルド時に動くコード**: `build.rs` や proc macro を持つ crate は、ビルドするだけでコードが動く。持つかどうかを記録する。
6. **ライセンス**: `backend/deny.toml` の許可リストに入っているか (cargo-deny が機械的にも見る)。
7. **バージョン**: `Cargo.lock` に固定された版をコミットする。`*` は使わない (cargo-deny が止める)。

確かめるのに使ったコマンド・URL を台帳の「確認」欄に書く (例: `cargo info <name>`、`https://crates.io/api/v1/crates/<name>/owners`)。

## advisory を無視するとき

`backend/deny.toml` の `[advisories] ignore` と `backend/.cargo/audit.toml` の両方に、advisory の ID、当てはまらない理由または直せない理由、見直す条件を書く。オーナーの承認が要る。
