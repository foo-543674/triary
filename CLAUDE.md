# triary project guide

A workout-logging and scoring PWA. Personal project, doubles as a programming
learning playground.

## Architecture overview

- **Backend**: Rust + Axum + MySQL (`backend/`)
- **Frontend**: TypeScript + SolidJS + Tailwind CSS + CSS Modules, served as a
  PWA (`frontend/`)
- **DB**: MySQL 8.0. Migrations are **plain SQL** (managed via `sqlx-cli`); we
  do not use ORM model-based generation.
- **API**: Schema first. The OpenAPI definition lives under `openapi/`, and
  documentation and types are derived from it.
- **User data policy**: We do not collect personal information.
- **Authentication strategy**: Undecided. Will be chosen when implementation
  starts.

## Development workflow

- **TDD**: drive development from tests. Skip tests for things the Rust type
  system already guarantees, and lean on property-based tests.
- **API is schema first**: write the OpenAPI definition before the
  implementation.
- **Integration tests are language agnostic** (Postman / Newman) so the test
  assets survive a future backend rewrite in another language.
- **Frontend lint / format is Biome only**. ESLint and Prettier are not used.
- **Migrations are SQL based** to avoid tightly coupling models with the DB
  schema in a running service.

## Common commands

| Command | Purpose |
|---|---|
| `make help` | List available make targets |
| `make infra-up` | Start local infra (MySQL dev/test) |
| `make infra-down` | Stop local infra |
| `make infra-reset` | Reset data volumes and restart |
| `make db-migrate` | Apply migrations to the development DB |
| `make db-migrate-test` | Apply migrations to the test DB |
| `make db-seed` | Seed the development DB |
| `cd backend && cargo nextest run` | Rust unit tests |
| `cd backend && cargo clippy --all-targets` | Rust lint |
| `cd backend && cargo fmt --all` | Rust format |
| `cd frontend && npx biome ci .` | Frontend lint + format check |
| `cd frontend && npx vitest run` | Frontend unit tests |
| `cd frontend && npx vite dev` | Frontend dev server |

## devcontainer and local infra

The devcontainer and local infrastructure are **loosely coupled**. The
devcontainer starts on its own and reaches MySQL through `triary-network`
(declared `external: true`). When the work in front of you does not need a
database, you do not have to run `make infra-up`.

## Reference documents

- `.contexts/concept.md`: project concept and product background
- `.contexts/setup-plan.md`: environment build plan (rationale for the
  setup decisions)
- `.contexts/security-overrides.md`: ledger for the pnpm.overrides patches
- `docs/api.md`: API documentation (derived from OpenAPI)
- `openapi/`: OpenAPI schema (the source of truth for the API)

## Design principles

- When in doubt, go back to the policy summary in `.contexts/setup-plan.md`.
- When considering a change to the tech stack, append the rationale to a doc
  under `.contexts/`.
- Make sure `cargo fmt` / `cargo clippy` / `biome ci` all pass before
  committing.
