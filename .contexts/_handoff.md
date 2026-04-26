# 設計フェーズ引き継ぎ資料

次の設計タスクを担当する AI が最初に読む。プロジェクト全体の前提は
`CLAUDE.md` と `.contexts/concept.md` を参照。

## プロジェクト概要（ごく簡潔に）

triary — 筋トレ記録・スコアリング PWA。個人プロジェクトだが public 公開。

- Backend: Rust + Axum + MySQL（生 SQL マイグレーション、sqlx-cli）
- Frontend: TypeScript + SolidJS + Tailwind + CSS Modules（Biome のみ）
- API: OpenAPI スキーマファースト
- 統合テスト: Postman / Newman（言語非依存）
- 認証: Cookie + サーバーセッション（同一オリジン配信前提、`SameSite=Lax`）
- TZ: サーバーは持たない、フロントで完結

## 設計フェーズの進捗

| フェーズ | 状態 | 成果物 |
|---|---|---|
| 要件定義 | 完了 | `.contexts/requirements.md` |
| 仕様化 | 完了 | `.contexts/specification.md` |
| アーキテクチャ設計 | 完了 | `.contexts/architecture.md` |
| API 設計 | 完了 | `.contexts/api-design.md` |
| データモデル設計 | 完了 | `.contexts/data-model.md` |
| コンポーネント設計 | スキップ（実装計画に統合） | — |
| **実装計画** | **完了（最新）** | `.contexts/implementation-plan.md` |

## 次のタスク: 実装着手

設計フェーズはすべて完了している。`.contexts/implementation-plan.md`
§0「この文書の使い方」と §6「スライス順序表」を読み、Phase 0（共通基盤）
から順に着手する。

実装途中で曖昧さが出たら勝手に判断せず、実装計画 §11「残課題」と
`CLAUDE.md` §AI delegation scope の "Stop and confirm first" に従って
ユーザーに確認すること。

> **過去の経緯**: 本文書の以前のバージョンには「データモデル設計フェーズの
> 11 項目の決定事項」「非機能要件」「API 設計の最終サマリ」が含まれていた。
> これらは現在 `data-model.md` (DDL / インデックス / 再採番戦略 / カスケード
> 規則) と `api-design.md` (HTTP 仕様 / エラーコード / Cookie 属性) に
> 移管済みのため、本文書からは削除した。各決定事項を辿りたいときは
> 移管先の文書を参照する。

## 全設計文書の参照マップ

| 文書 | 内容 | 役割 |
|---|---|---|
| `concept.md` | プロジェクトのコンセプトと製品背景 | 最上位 |
| `requirements.md` | 要件 (Must / Should / Could / Out of Scope、F1〜F4、NF) | 何を作るか |
| `specification.md` | 受け入れ基準粒度までの仕様 (US-1〜US-10、境界値) | どう振る舞うか |
| `architecture.md` | 4 層レイヤ、集約、CQRS 判断、エラー境界、フロント構成、ADR | どう構造化するか |
| `api-design.md` | HTTP API の完全仕様（`/web/v1` + `/api/v1` 分割） | 外部インターフェース |
| `data-model.md` | DDL、インデックス、再採番戦略、カスケード規則 | 永続化形 |
| `implementation-plan.md` | 垂直スライス順序、Phase 0〜5、品質ゲート、レビュー対応 | 実装の進め方 |
| `setup-plan.md` | 環境構築計画（既存） | セットアップ |

## 注意事項（次 AI への申し送り）

1. `.contexts/` 配下の既存文書を **勝手に書き換えない**。矛盾が見つかった
   場合はユーザーに確認してから修正する。
2. 実装中に API 設計やデータモデルを変えたくなるケースは、ユーザーに両方の
   案を提示して判断を仰ぐ（例: あるエンドポイントが DB から効率良く取れない
   ことが判明、等）。
3. 仕様変更が必要な場合は、`specification.md` / `api-design.md` /
   `data-model.md` / `implementation-plan.md` の中で関連する箇所を漏れなく
   更新する。
4. 日本語で書く（既存文書と揃える）。
5. 実装着手時の進め方は `implementation-plan.md` §0「この文書の使い方」
   と §6「スライス順序表」に従う。
