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

# Language commands run in the dev image through ./dev (tools/dev-image/);
# they are not installed on the calling machine. The review gate's and
# ./dev's own tests are the exception and run on the caller's Node 22
# (.contexts/bootstrap-decisions.md "2026-10-31 再実行 (3.0.1)").
DEV := $(CURDIR)/dev

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
	cd backend && "$(DEV)" sqlx migrate run

.PHONY: db-migrate-test
db-migrate-test: ## Apply migrations to the test DB
	cd backend && DATABASE_URL=$(TEST_DATABASE_URL) "$(DEV)" sqlx migrate run

.PHONY: db-prepare
db-prepare: ## Regenerate sqlx offline metadata for query! macros (backend/.sqlx/)
	cd backend && "$(DEV)" cargo sqlx prepare -- --tests

# ---------- Running the app ----------

# Run the app through make: this Makefile exports the variables of .env (see
# the top), e.g. the database settings the backend reads from its environment.
# Under docker every ./dev call is its own container (./dev --engine): the
# backend gets a name on triary-network (created by `make infra-up`), the
# frontend reaches it by that name, listens on the container's interfaces and
# is published on the host's 127.0.0.1:3000. Directly (devcontainer) and under
# the ai-box's podman both servers share one network and need none of this.
# NOTE: unverified under docker (only the arguments are tested, by
# `make dev-test`). Check: `make run-backend` and `make run-frontend` in two
# WSL terminals, then open http://localhost:3000/health from the browser.
BACKEND_CONTAINER := triary-backend

.PHONY: run-backend
run-backend: ## Run the backend on :8080 with the variables of .env
	cd backend && TRIARY_DEV_NAME=$(BACKEND_CONTAINER) "$(DEV)" cargo run

.PHONY: run-frontend
run-frontend: ## Run the Vite dev server on :3000 (proxies /api, /web and /health to the backend)
	cd frontend && "$(DEV)" pnpm install --frozen-lockfile
	@if [[ "$$("$(DEV)" --engine)" == docker ]]; then \
	  cd frontend && TRIARY_DEV_PUBLISH=3000 BACKEND_ORIGIN=http://$(BACKEND_CONTAINER):$(or $(BACKEND_PORT),8080) \
	    "$(DEV)" pnpm run dev --host 0.0.0.0; \
	else \
	  cd frontend && "$(DEV)" pnpm run dev; \
	fi

# ---------- Frontend ----------

.PHONY: api-generate
api-generate: ## Regenerate TypeScript types from the OpenAPI schema (frontend/src/api/schema.gen.ts)
	cd frontend && "$(DEV)" pnpm run api:generate

# ---------- Architecture tests ----------

.PHONY: arch-test
arch-test: ## Run architecture tests for both backend and frontend
	# Scope note: this target runs ONLY the architecture-test binary
	# (`--test architecture`) so a developer can validate layer rules in
	# isolation, without compiling and running the rest of the backend
	# test suite. CI's `backend-test` job (`.github/workflows/ci.yml`)
	# runs `cargo nextest run --all-features --no-tests=pass` without the
	# `--test` filter, so the architecture tests run there too — alongside
	# every other test in the workspace. Both invocations pass
	# `--no-tests=pass` so that a binary which currently has no tests
	# (e.g. before any `domain/` files are added) is treated as success.
	cd backend && "$(DEV)" cargo nextest run --test architecture --all-features --no-tests=pass
	cd frontend && "$(DEV)" pnpm run arch:test

# ---------- Review gate ----------

.PHONY: hooks-install
hooks-install: ## Enable the git hooks in .githooks/ (review gate, see AGENTS.md)
	git config core.hooksPath .githooks

.PHONY: gate-test
gate-test: ## Type-check and test the review gate tool (tools/review-gate/)
	"$(DEV)" frontend/node_modules/.bin/tsc -p tools/review-gate/tsconfig.json
	node --test tools/review-gate/test/*.test.ts

.PHONY: dev-test
dev-test: ## Type-check and test the ./dev entrypoint (tools/dev-image/)
	"$(DEV)" frontend/node_modules/.bin/tsc -p tools/dev-image/tsconfig.json
	node --test tools/dev-image/test/*.test.ts
