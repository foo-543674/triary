# 直接依存の台帳

`docs/dependency-policy.md` の手順で審査した記録。規則と手順はそちらにあり、このファイルは記録だけを持つ。保護する基準ファイルではないので、crate の追加は台帳の検査とレビューを通れば人の承認なしでマージされる (2026-11-01 のオーナー判断で方針ファイルから分けた)。

## 直接依存の台帳

`backend/Cargo.toml` の `[dependencies]` / `[dev-dependencies]` / `[build-dependencies]` に書かれた crate と、この表の crate は一致していなければならない (`backend/tests/dependency_ledger.rs` が `cargo nextest run` で検査する)。表の 1 列目は `` `crate 名` `` の形で書く。

| crate | 区分 | 用途 | 追加 | 確認 |
|---|---|---|---|---|
| `anyhow` | dependencies | main の起動エラー | 2026-10-31 以前 | 既存 (この台帳より前。審査記録なし) |
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
| `argon2` | dependencies | パスワードハッシュ (Argon2id、S01) | 2026-10-31 (S01) | 名前: RustCrypto の公式 crate (architecture.md の argon2id 指定)。出所: `github.com/RustCrypto/password-hashes`、crates.io 所有者 `newpavlov` (RustCrypto のメンテナ)。実績: 総 6,960 万 DL。使う版は 0.5.3 (2024-01-20 公開、yank なし)。0.6 系は推移的な依存 (`ctutils` など) が公開から 7 日未満で、自動マージの公開日数確認に通らないため見送った (2026-11-01)。build.rs / proc macro なし。ライセンス MIT OR Apache-2.0。feature は既定 (`alloc`、`password-hash`、`rand`)。ソルトは直接依存の `getrandom` で作る。確認: `cargo info argon2`、`https://crates.io/api/v1/crates/argon2`、`.../owner_user`、cargo-deny |
| `getrandom` | dependencies | セッショントークンの 256 bit 乱数 (OS の CSPRNG、S01) | 2026-10-31 (S01) | 名前: rust-random の crate (rand の基盤)。出所: `github.com/rust-random/getrandom`、所有者 `dhardy`。実績: 総 24.4 億 DL、0.4.3 は 2026-06-17 公開、既に lock に推移的依存として入っている版。ライセンス MIT OR Apache-2.0。確認: `cargo info getrandom`、`https://crates.io/api/v1/crates/getrandom`、`.../owner_user`、cargo-deny |
| `sha2` | dependencies | セッショントークンのハッシュ保存 (SHA-256、data-model §4.2、S01) | 2026-10-31 (S01) | 名前: RustCrypto の公式 crate。出所: `github.com/RustCrypto/hashes`。実績: 総 11.5 億 DL、0.10.9 は 2025-04-30 公開、既に lock に入っている版 (sqlx が使用) を選び重複を避けた。ライセンス MIT OR Apache-2.0。確認: `cargo info sha2`、`https://crates.io/api/v1/crates/sha2`、cargo-deny |
| `fake` | dev-dependencies | テストデータ | 2026-10-31 以前 | 既存 (同上) |
| `http-body-util` | dev-dependencies | テストでレスポンス本文を読む | 2026-10-31 以前 | 既存 (同上) |
| `pretty_assertions` | dev-dependencies | テストの差分表示 | 2026-10-31 以前 | 既存 (同上) |
| `proptest` | dev-dependencies | プロパティテスト | 2026-10-31 以前 | 既存 (同上) |
| `rstest` | dev-dependencies | パラメータ化テスト | 2026-10-31 以前 | 既存 (同上) |
| `tower` | dev-dependencies | テストでルーターを呼ぶ | 2026-10-31 以前 | 既存 (同上) |
