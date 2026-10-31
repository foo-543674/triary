# 依存パッケージの方針 (サプライチェーン)

外部パッケージ (Rust の crate、npm パッケージ) を取り込むときの規則と、それを機械的に止める仕組み。設定ファイルの関係:

| 仕組み | 場所 | 何を止めるか |
|---|---|---|
| cargo-deny | `backend/deny.toml`、CI job `security / cargo deny` (必須) | RustSec の advisory (脆弱性・メンテ終了・unsound・yank)、許可外のライセンス、`*` のバージョン指定、crates.io 以外の取得元 (git・別レジストリ) |
| cargo audit | `backend/.cargo/audit.toml`、CI job `security / cargo audit` (必須) | RustSec の脆弱性 |
| pnpm audit | CI job `security / pnpm audit` (必須) | npm の high 以上の脆弱性 |
| ロックファイル固定 | cargo の build / clippy / nextest は CI (`ci.yml`・`e2e.yml`・`dev-image.yml`) と git hook で `--locked`、pnpm は `--frozen-lockfile` | コミットされていない版が CI やフックの中で解決されること。`cargo fmt` と `cargo audit` は依存を解決しないので付けていない |
| Dependabot の cooldown | `.github/dependabot.yml` | 公開直後の版 (7 日、major は 14 日) を提案しない。乗っ取られた版が見つかって yank されるまでの時間を稼ぐ。セキュリティ更新は遅らせない |
| 直接依存の台帳 | 下の「直接依存の台帳」、検査は `backend/tests/dependency_ledger.rs` (`cargo metadata` で直接依存を取る) | 台帳に載っていない直接依存 (審査の記録がない crate) の追加、台帳に残った削除済みの crate |
| 人間の承認 | CODEOWNERS (このファイル、`backend/deny.toml`、`backend/.cargo/`、`backend/tests/dependency_ledger.rs`)。`backend/Cargo.toml` は含めない (Dependabot の自動マージを止めないため)。crate の追加は台帳の変更を伴うので、このファイルを通じて承認を経る | 上の規則そのものの緩和、審査記録のない crate の追加 |

規則を緩める変更 (許可ライセンスの追加、advisory の無視、取得元の追加、cooldown の短縮、台帳検査の削除) は検証器の改訂で、オーナーの承認が要る (AGENTS.md "AI delegation scope")。

## 承認の範囲

- 2026-10-31: オーナーが Rust の crate の追加を事前承認した (#65。「crateの追加はおｋです。ただしサプライチェーンなどのセキュリティリスクは考慮したガードレールは設けてください」)。条件はこのファイルの手順を守ること。AGENTS.md "Stop and confirm first" はこれを参照する。
- npm パッケージの追加は事前承認されていない。必要になったら needs-decision の issue で確認する (AGENTS.md "Stop and confirm first")。

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

## 直接依存の台帳

`backend/Cargo.toml` の `[dependencies]` / `[dev-dependencies]` / `[build-dependencies]` に書かれた crate と、この表の crate は一致していなければならない (`backend/tests/dependency_ledger.rs` が `cargo nextest run` で検査する)。表の 1 列目は `` `crate 名` `` の形で書く。

| crate | 区分 | 用途 | 追加 | 確認 |
|---|---|---|---|---|
| `anyhow` | dependencies | main の起動エラー | 2026-10-31 以前 | 既存 (この台帳より前。審査記録なし) |
| `argon2` | dependencies | パスワードハッシュ (Argon2id、S01) | 2026-10-31 (S01) | 名前: RustCrypto の公式 crate (architecture.md の argon2id 指定)。出所: `github.com/RustCrypto/password-hashes`、crates.io 所有者 `newpavlov` (RustCrypto のメンテナ)。実績: 総 6,960 万 DL、0.6.0 は 2026-08-27 公開 (cooldown 超)、yank なし。build.rs / proc macro なし。ライセンス MIT OR Apache-2.0。feature は既定 (`alloc`、`getrandom`、`password-hash`)。確認: `cargo info argon2`、`https://crates.io/api/v1/crates/argon2`、`.../owner_user`、cargo-deny |
| `getrandom` | dependencies | セッショントークンの 256 bit 乱数 (OS の CSPRNG、S01) | 2026-10-31 (S01) | 名前: rust-random の crate (rand の基盤)。出所: `github.com/rust-random/getrandom`、所有者 `dhardy`。実績: 総 24.4 億 DL、0.4.3 は 2026-06-17 公開、既に lock に推移的依存として入っている版。ライセンス MIT OR Apache-2.0。確認: `cargo info getrandom`、`https://crates.io/api/v1/crates/getrandom`、`.../owner_user`、cargo-deny |
| `sha2` | dependencies | セッショントークンのハッシュ保存 (SHA-256、data-model §4.2、S01) | 2026-10-31 (S01) | 名前: RustCrypto の公式 crate。出所: `github.com/RustCrypto/hashes`。実績: 総 11.5 億 DL、0.10.9 は 2025-04-30 公開、既に lock に入っている版 (sqlx が使用) を選び重複を避けた。ライセンス MIT OR Apache-2.0。確認: `cargo info sha2`、`https://crates.io/api/v1/crates/sha2`、cargo-deny |
| `axum` | dependencies | HTTP サーバー | 2026-10-31 以前 | 既存 (同上) |
| `chrono` | dependencies | 日付・時刻 | 2026-10-31 以前 | 既存 (同上) |
| `serde` | dependencies | シリアライズ | 2026-10-31 以前 | 既存 (同上) |
| `serde_json` | dependencies | JSON | 2026-10-31 以前 | 既存 (同上) |
| `sqlx` | dependencies | MySQL アクセス、migration | 2026-10-31 以前 | 既存 (同上) |
| `thiserror` | dependencies | エラー型 | 2026-10-31 以前 | 既存 (同上) |
| `tokio` | dependencies | 非同期ランタイム | 2026-10-31 以前 | 既存 (同上) |
| `tower-http` | dependencies | CORS・トレースの middleware | 2026-10-31 以前 | 既存 (同上) |
| `tracing` | dependencies | ログ | 2026-10-31 以前 | 既存 (同上) |
| `tracing-subscriber` | dependencies | ログ出力 | 2026-10-31 以前 | 既存 (同上) |
| `uuid` | dependencies | ID | 2026-10-31 以前 | 既存 (同上) |
| `fake` | dev-dependencies | テストデータ | 2026-10-31 以前 | 既存 (同上) |
| `http-body-util` | dev-dependencies | テストでレスポンス本文を読む | 2026-10-31 以前 | 既存 (同上) |
| `pretty_assertions` | dev-dependencies | テストの差分表示 | 2026-10-31 以前 | 既存 (同上) |
| `proptest` | dev-dependencies | プロパティテスト | 2026-10-31 以前 | 既存 (同上) |
| `rstest` | dev-dependencies | パラメータ化テスト | 2026-10-31 以前 | 既存 (同上) |
| `tower` | dev-dependencies | テストでルーターを呼ぶ | 2026-10-31 以前 | 既存 (同上) |
