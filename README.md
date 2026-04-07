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
#    The devcontainer sets up Rust, Node, and the rest of the toolchain.

# 4. Start the local infra (MySQL dev + test)
make infra-up

# 5. Apply migrations
make db-migrate

# 6. Then start the dev servers individually
cd backend  && cargo run
cd frontend && npx vite dev
```

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
in `CLAUDE.md`.

## API spec

The API is schema-first. The source of truth lives at
[`openapi/openapi.yaml`](./openapi/openapi.yaml). To preview it locally:

```sh
# Redocly
npx @redocly/cli preview-docs openapi/openapi.yaml

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
└── CLAUDE.md           # Project guide for Claude Code / AI assistants
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
