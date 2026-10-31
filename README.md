# triary

A workout-logging and scoring web application (PWA). Workouts are scored
from reps, weight, and set count following the principle of progressive
overload, so training progress is easy to see at a glance.

This is a personal project that doubles as a programming learning
repository.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Rust + Axum |
| DB | MySQL 8.0 (SQL-based migrations via `sqlx-cli`) |
| Frontend | TypeScript + SolidJS + Tailwind CSS + CSS Modules |
| Delivery | PWA |
| Lint / format (Rust) | `rustfmt` + `clippy` |
| Lint / format (Frontend) | Biome |
| Tests (Backend) | `cargo nextest` + property-based tests |
| Tests (Frontend) | Vitest + Storybook |
| Integration tests | Postman / Newman (language agnostic) |
| E2E | Playwright |
| CI | GitHub Actions |

See `.contexts/setup-plan.md` for the rationale behind these choices.

## Setup

### Prerequisites

- Docker (Docker Desktop / Rancher Desktop / etc.)
- VS Code with the Dev Containers extension

### Steps

```sh
# 1. Clone
git clone <this-repo>
cd triary

# 2. Prepare environment variables
cp .env.example .env

# 3. Open in VS Code and choose "Reopen in Container".
#    Inside the devcontainer ./dev runs commands directly on the
#    devcontainer's own toolchain (see the note below).

# 4. Start the local infra (MySQL dev + test)
make infra-up

# 5. Apply migrations
make db-migrate

# 6. Then start the dev servers individually
cd backend  && ../dev cargo run
cd frontend && ../dev pnpm install && ../dev pnpm run dev
```

Language commands (cargo, pnpm, npx, ...) go through `./dev`, which runs them
in the dev image (`tools/dev-image/Dockerfile`). Inside the devcontainer it
runs them directly; elsewhere it uses podman or docker. Do not install the
toolchains on your machine; see "Common commands" in `AGENTS.md`.

NOTE: two things are not settled yet (`.contexts/bootstrap-decisions.md`
"2026-10-31 再実行 (3.0.1)"):

- The devcontainer's toolchain is not aligned with the dev image yet (Rust
  `latest`, unpinned nextest / sqlx-cli, no cargo-audit), so results there
  can differ from CI.
- Step 6 outside the devcontainer is unverified. `./dev` publishes no ports,
  so under docker the dev servers are probably not reachable from the host
  browser. The backend's `DATABASE_URL` in `.env.example` uses the container
  name `triary-mysql`: under docker `./dev` joins `triary-network`, which
  resolves it; under podman in the ai-box the container shares the box's
  network and that name probably does not resolve. Check by running step 6
  there.

## Common commands

```sh
make help            # List available commands
make infra-up        # Start local infra
make infra-down      # Stop local infra
make infra-reset     # Reset data and restart
make db-migrate      # Apply DB migrations
make db-seed         # Seed the development DB
```

For backend / frontend specific commands, see the "Common commands" section
in `AGENTS.md`.

## API spec

The API is schema-first. The source of truth lives at
[`openapi/openapi.yaml`](./openapi/openapi.yaml). To preview it locally:

```sh
# Redocly (NOTE: the preview port is not published by ./dev; see the note
# on step 6 above)
./dev npx @redocly/cli preview-docs openapi/openapi.yaml

# Swagger UI (via docker)
docker run --rm -p 8081:8080 \
  -e SWAGGER_JSON=/openapi/openapi.yaml \
  -v $(pwd)/openapi:/openapi \
  swaggerapi/swagger-ui
```

## Repository layout

```
.
├── .contexts/          # Project background, design decisions, build plan
├── .devcontainer/      # devcontainer config (Rust + Node + Biome + DooD)
├── .github/workflows/  # CI / E2E pipelines
├── backend/            # Rust + Axum backend
│   └── migrations/     # sqlx SQL migrations
├── frontend/           # SolidJS + Tailwind frontend
├── openapi/            # OpenAPI schema (source of truth for the API)
├── tests/integration/  # Postman collection (language-agnostic integration tests)
├── docker-compose.yml  # Local infra (MySQL dev/test)
├── Makefile            # Developer task hub
├── docs/               # Review contract, remote acceptance contract, ruleset
├── tools/review-gate/  # Review ledger gate and remote acceptance verifier
├── AGENTS.md           # Project guide for AI assistants (single source)
└── CLAUDE.md           # Imports AGENTS.md for Claude Code
```

## Development principles

- **TDD**: Red -> Green -> Refactor. Skip tests for things the Rust type
  system already guarantees, and lean on property-based tests.
- **Schema first**: write the OpenAPI definition first, then derive
  implementation, documentation, and types from it.
- **SQL migrations**: avoid ORM model generation so the live service does
  not couple models tightly to the DB schema.
- **Language-agnostic integration tests**: write them in Newman so the test
  assets survive a possible future backend rewrite in another language.
- **Loose coupling between devcontainer and infra**: the devcontainer runs
  standalone and only joins the infra over `triary-network` when needed.

## License

Undecided (personal project).
