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
#    The devcontainer is built from the dev image, and ./dev runs commands
#    directly inside it (see the note below).

# 4. Start the local infra (MySQL dev + test)
make infra-up

# 5. Apply migrations
make db-migrate

# 6. Start the backend and the frontend, in two terminals
make run-backend    # :8080 (with the variables of .env; the browser does not open it)
make run-frontend   # http://localhost:3000, open this one in the browser
```

Open http://localhost:3000 (under `direct` and `podman` not 127.0.0.1: the
dev server listens on `localhost` there, see below). The browser only talks to the Vite dev server, which forwards
`/api`, `/web` and `/health` to the backend, so the session cookie is
same-origin. Run the backend through `make`: the Makefile exports `.env` to
it.

How the two servers find each other depends on how `./dev` runs commands
(`./dev --engine`):

- `direct` (devcontainer) and `podman` (the AI's box, `netns = "host"`): both
  servers share one network. Observed in the AI's box on 2026-10-31:
  `/health` through `localhost:3000` reached the backend. Not verified in the
  devcontainer yet; check by opening http://localhost:3000/health from the
  host browser while both run (VS Code forwards the ports).
- `docker` (e.g. WSL without the devcontainer): every `./dev` call is its own
  container. `make run-backend` names the backend container `triary-backend`
  on `triary-network` (run `make infra-up` first, it creates the network);
  `make run-frontend` proxies to it by that name and publishes the dev server
  on the host's `127.0.0.1:3000`. NOTE: unverified; before this was added,
  `localhost:3000` was unreachable from the browser on WSL (reported
  2026-11-01). Check the same way, from the browser. If `make run-backend`
  reports that the name `triary-backend` is in use while no backend runs, a
  killed run left the container behind: `docker rm -f triary-backend`.

Language commands (cargo, pnpm, npx, ...) go through `./dev`, which runs them
in the dev image (`tools/dev-image/Dockerfile`). Inside the devcontainer it
runs them directly; elsewhere it uses podman or docker. Do not install the
toolchains on your machine; see "Common commands" in `AGENTS.md`.

NOTE: two things are not settled yet (`.contexts/bootstrap-decisions.md`
"2026-10-31 再実行 (3.0.1)"):

- The devcontainer is built from the dev image's Dockerfile (#56), so it has
  the same toolchain as CI. Unverified until the owner rebuilds it once.
- Step 6 outside the devcontainer is unverified (see the list above for
  docker). The backend's `DATABASE_URL` in `.env.example` uses the container
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
