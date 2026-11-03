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

# The project name, compose file and project directory are pinned, so an
# inherited COMPOSE_PROJECT_NAME / COMPOSE_FILE or the caller's directory
# cannot point the infra targets (including infra-reset's `down -v`) at
# another project. The name is fixed to "triary" because docker-compose.yml
# already fixes the container names, so every checkout shares one stack.
# CURDIR is where make runs this Makefile (the repository root, or the
# directory given to `make -C`).
COMPOSE := docker compose -p triary --project-directory "$(CURDIR)" -f "$(CURDIR)/docker-compose.yml"

# Language commands run in the dev image through ./dev (tools/dev-image/);
# they are not installed on the calling machine. The review gate
# (tools/review-gate/gate.sh) and its tests need only git and a POSIX shell
# (.contexts/bootstrap-decisions.md "2026-11-01 再実行 (3.1.0)").
DEV := $(CURDIR)/dev
# Installs the frontend dependencies the type checks below borrow tsc from;
# a no-op when node_modules is current.
FRONTEND_DEPS := (cd frontend && pnpm install --frozen-lockfile --prefer-offline --reporter=silent --config.confirmModulesPurge=false)

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
# rootless Podman (single-UID mode) with ./dev's explicit --network host,
# both servers share one network and need none of this.
# Directly (devcontainer), Vite is told to listen on 127.0.0.1: without --host
# it listened on [::1]:3000 only, and VS Code's port forwarding connects to
# 127.0.0.1:3000 and was refused (observed 2026-11-03 on the owner's WSL2,
# #106). Under Podman it keeps Vite's default (localhost; observed working
# 2026-10-31).
# NOTE: unverified under docker (only the arguments are tested, by
# `make dev-test`). Check: `make run-backend` and `make run-frontend` in two
# WSL terminals, then open http://localhost:3000/health from the browser.
# While a devcontainer window is open, VS Code holds the host's
# 127.0.0.1:3000 (forwardPorts), so close it first (README "Setup").
BACKEND_CONTAINER := triary-backend

.PHONY: run-backend
run-backend: ## Run the backend on :8080 with the variables of .env
	cd backend && TRIARY_DEV_NAME=$(BACKEND_CONTAINER) "$(DEV)" cargo run

.PHONY: run-frontend
run-frontend: ## Run the Vite dev server on :3000 (proxies /api, /web and /health to the backend)
	cd frontend && "$(DEV)" pnpm install --frozen-lockfile
	@engine="$$("$(DEV)" --engine)"; \
	if [[ "$$engine" == docker ]]; then \
	  cd frontend && TRIARY_DEV_PUBLISH=3000 BACKEND_ORIGIN=http://$(BACKEND_CONTAINER):$(or $(BACKEND_PORT),8080) \
	    "$(DEV)" pnpm run dev --host 0.0.0.0; \
	elif [[ "$$engine" == direct ]]; then \
	  cd frontend && "$(DEV)" pnpm run dev --host 127.0.0.1; \
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

.PHONY: ledger-migrate
ledger-migrate: ## Migrate the legacy JSON review ledger to TSV
	"$(DEV)" node tools/review-gate/src/migrate-ledger.ts

.PHONY: hooks-install
hooks-install: ## Enable the git hooks in .githooks/ (review gate, see AGENTS.md)
	git config core.hooksPath .githooks

.PHONY: gate-test
gate-test: ## Test the review gate (on this machine) and the remote verifier's TypeScript (in the dev image)
	sh tools/review-gate/test/gate.test.sh
	# Host-only: bash and standard POSIX utilities; API and language tools are fakes.
	bash tools/review-gate/test/acceptance.test.sh
	"$(DEV)" bash -c '$(FRONTEND_DEPS) && frontend/node_modules/.bin/tsc -p tools/review-gate/tsconfig.json && node --test --test-reporter=dot tools/review-gate/test/*.test.ts'

.PHONY: dev-test
dev-test: ## Type-check and test the ./dev entrypoint (tools/dev-image/) in the dev image
	"$(DEV)" bash -c '$(FRONTEND_DEPS) && frontend/node_modules/.bin/tsc -p tools/dev-image/tsconfig.json && node --test --test-reporter=dot tools/dev-image/test/*.test.ts'
