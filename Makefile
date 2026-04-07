# triary 開発タスク集約 Makefile。
# ローカルインフラ・マイグレーション・ビルド・テスト等の主要操作を
# コマンド一発で実行できるようにする。

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

# .env があれば読み込み（DATABASE_URL 等）
ifneq (,$(wildcard .env))
include .env
export
endif

COMPOSE := docker compose

.PHONY: help
help: ## 利用可能なコマンドを一覧表示
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---------- ローカルインフラ ----------

.PHONY: infra-up
infra-up: ## ローカルインフラ(MySQL dev/test)を起動しヘルスチェックが通るまで待つ
	@docker network create triary-network 2>/dev/null || true
	$(COMPOSE) up -d --wait

.PHONY: infra-down
infra-down: ## ローカルインフラを停止
	$(COMPOSE) down

.PHONY: infra-reset
infra-reset: ## ローカルインフラを停止しデータボリュームも削除して再起動
	$(COMPOSE) down -v
	@docker network create triary-network 2>/dev/null || true
	$(COMPOSE) up -d --wait

.PHONY: infra-logs
infra-logs: ## ローカルインフラのログを追尾表示
	$(COMPOSE) logs -f

# ---------- DB マイグレーション ----------

.PHONY: db-migrate
db-migrate: ## 開発用 DB にマイグレーションを適用 (backend/migrations/)
	cd backend && sqlx migrate run

.PHONY: db-migrate-test
db-migrate-test: ## テスト用 DB にマイグレーションを適用
	cd backend && DATABASE_URL=$(TEST_DATABASE_URL) sqlx migrate run

.PHONY: db-seed
db-seed: ## 開発用 DB にシードデータを投入
	cd backend && bash scripts/seed.sh

.PHONY: db-prepare
db-prepare: ## sqlx の query! マクロ用オフラインメタデータを再生成 (backend/.sqlx/)
	cd backend && cargo sqlx prepare -- --tests

# ---------- Frontend ----------

.PHONY: api-generate
api-generate: ## OpenAPI スキーマから TypeScript 型を再生成 (frontend/src/api/schema.gen.ts)
	cd frontend && pnpm run api:generate
