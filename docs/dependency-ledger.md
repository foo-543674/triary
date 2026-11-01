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
| `fake` | dev-dependencies | テストデータ | 2026-10-31 以前 | 既存 (同上) |
| `http-body-util` | dev-dependencies | テストでレスポンス本文を読む | 2026-10-31 以前 | 既存 (同上) |
| `pretty_assertions` | dev-dependencies | テストの差分表示 | 2026-10-31 以前 | 既存 (同上) |
| `proptest` | dev-dependencies | プロパティテスト | 2026-10-31 以前 | 既存 (同上) |
| `rstest` | dev-dependencies | パラメータ化テスト | 2026-10-31 以前 | 既存 (同上) |
| `tower` | dev-dependencies | テストでルーターを呼ぶ | 2026-10-31 以前 | 既存 (同上) |
