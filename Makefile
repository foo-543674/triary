# NOTE: One-stop Makefile for triary developer tasks.
#       Wraps the most common operations (local infra, migrations, builds,
#       tests, ...) behind single commands.

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

# NOTE: Load `.env` if present so vars like DATABASE_URL flow into recipes.
ifneq (,$(wildcard .env))
include .env
export
endif

COMPOSE := docker compose

.PHONY: help
help: ## List available commands
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---------- Local infra ----------

.PHONY: infra-up
infra-up: ## Start local infra (MySQL dev/test) and wait until healthy
	@docker network create triary-network 2>/dev/null || true
	$(COMPOSE) up -d --wait

.PHONY: infra-down
infra-down: ## Stop local infra
	$(COMPOSE) down

.PHONY: infra-reset
infra-reset: ## Stop local infra, drop data volumes, and start fresh
	$(COMPOSE) down -v
	@docker network create triary-network 2>/dev/null || true
	$(COMPOSE) up -d --wait

.PHONY: infra-logs
infra-logs: ## Tail local infra logs
	$(COMPOSE) logs -f

# ---------- Database migrations ----------

.PHONY: db-migrate
db-migrate: ## Apply migrations to the development DB (backend/migrations/)
	cd backend && sqlx migrate run

.PHONY: db-migrate-test
db-migrate-test: ## Apply migrations to the test DB
	cd backend && DATABASE_URL=$(TEST_DATABASE_URL) sqlx migrate run

.PHONY: db-seed
db-seed: ## Seed the development DB
	cd backend && bash scripts/seed.sh

.PHONY: db-prepare
db-prepare: ## Regenerate sqlx offline metadata for query! macros (backend/.sqlx/)
	cd backend && cargo sqlx prepare -- --tests

# ---------- Frontend ----------

.PHONY: api-generate
api-generate: ## Regenerate TypeScript types from the OpenAPI schema (frontend/src/api/schema.gen.ts)
	cd frontend && pnpm run api:generate

# ---------- Architecture tests ----------

.PHONY: arch-test
arch-test: ## Run architecture tests for both backend and frontend
	# Scope note: this target runs ONLY the architecture-test binary
	# (`--test architecture`) so that a developer can validate layer rules
	# without compiling the rest of the backend test suite. CI's
	# `backend-test` job (`.github/workflows/ci.yml`) runs the full
	# `cargo nextest run --all-features --no-tests=pass`, which includes
	# the architecture tests as a side-effect alongside every other test.
	cd backend && cargo nextest run --test architecture --all-features --no-tests=pass
	cd frontend && pnpm run arch:test
