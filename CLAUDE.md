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
- **Authentication strategy**: Cookie + server session, same-origin delivery,
  `SameSite=Lax`. Session token is a 256-bit random; deleting the row in
  `user_sessions` revokes it immediately.

## Development workflow

- **TDD**: drive development from tests. Skip tests for things the Rust type
  system already guarantees, and lean on property-based tests
  (`proptest` / `fast-check`).
- **Vertical slice first**: prefer end-to-end thin slices over layered
  build-up. A blank-page route counts as a slice.
- **API is schema first**: write the OpenAPI definition before the
  implementation.
- **Integration tests are language agnostic** (Postman / Newman) so the test
  assets survive a future backend rewrite in another language.
- **Frontend lint / format is Biome only**. ESLint and Prettier are not used.
- **Migrations are SQL based** to avoid tightly coupling models with the DB
  schema in a running service.

## Layer rules (enforced by architecture tests)

Backend layers and their origin (see `.contexts/architecture.md` for the
full rationale):

| Layer | Origin | One-line definition |
|---|---|---|
| `domain` | existed in the paper-ledger era | business logic that would exist even without an app |
| `application` | only exists because we built an app | persistence, transaction boundaries, authorization, logging |
| `infrastructure` | the outside world | concrete implementations of ports declared by `domain` / `application` |
| `interfaces` | external protocol boundary | HTTP / CLI adapters, DTO conversion, auth middleware |

Hard rules:
- `domain` must not import `axum`, `axum_extra`, `sqlx`, `tower`,
  `tower_http`, `tracing`, `tracing_subscriber`, `hyper`, or any other
  infrastructure crate.
- `application` must not import infrastructure crates either; it depends on
  ports defined in `domain` / `application`.
- Repository traits live in `application/ports/`; concrete implementations
  live in `infrastructure/repositories/`.
- `Clock`, `PasswordHasher` and other "real-world concept" ports live in
  `domain` (they predate the app).
- ORM-generated types (e.g. `sqlx::FromRow` rows) must not appear in the
  signatures of `domain` or `application` items.
- Forbidden structural vocabulary in type names anywhere: `Service`,
  `Manager`, `Helper`, `Util`, `Utils`, `Processor`, `Worker`, `Engine`.
  `Handler` is allowed only inside `interfaces::http`.

These rules are checked by `cargo nextest run` against
`backend/tests/architecture.rs` and `pnpm run arch:test` for the frontend.

## Quality lenses applied

The full lens set comes from the `foo-skills` plugin (see
`.contexts/bootstrap-decisions.md` for which `perspectives/` were selected
and why). The ones most often consulted on this project:

- **architecture**: layer origins, port placement, error boundaries
- **api-design**: HTTP status reserved for protocol concerns; errors as
  `errors[]` array (never single-error envelopes)
- **data-modeling**: typed columns (DATE, DECIMAL, INTERVAL); orthogonal
  dimensions as independent columns; no Nullable escape
- **error-handling**: `Result<_, Vec<DomainError>>` for collected validation;
  `panic!` is a bug only, never control flow
- **disposability**: external types do not appear in `domain` / `application`
  signatures
- **testing**: test names describe behavior; cover 0, 1, N-1, N, N+1; mock
  external dependencies only
- **functional**: pure core, impure shell; high-order functions over
  imperative loops; `Option` / `Result` over `null`
- **component / state-design**: state lives outside presentational
  components; discriminated unions over flag soup
- **naming**: `get` is pure, `fetch` does I/O; one concept one word
- **readability**: nesting <= 3, function <= 50 lines; guard clauses up front
- **security**: parameterized queries; resource ownership check on every
  protected endpoint; argon2id for passwords

## AI delegation scope

### Decide and proceed without asking

- Implementation details (function/variable names, algorithm choice, library
  internals)
- Adding / fixing tests
- Refactoring within the green-test envelope
- lint / format fixes
- Updating in-line documentation and comments

### Stop and confirm first

- Adding a new external dependency (Cargo crate or npm package)
- Changes to layer structure or architecture rules
- Breaking changes to the OpenAPI schema or any `/api/v1/*` endpoint
- Authentication / authorization / cryptography decisions
- Anything in `.contexts/*.md` (rewriting design decisions)
- Ambiguous requirements

## Commit convention

### Prefix

| prefix | use |
|---|---|
| `[feat]` | new feature |
| `[fix]` | bug fix |
| `[update]` | enhancement to an existing feature |
| `[improve]` | non-functional improvement (perf, DX, ...) |
| `[refactor]` | structural change without behavior change |
| `[chore]` | maintenance (deps, version bumps, ...) |
| `[docs]` | documentation only |
| `[test]` | tests only |
| `[style]` | formatting / style only |

### Granularity

- Stage by intent, not by file. One commit, one purpose.
- Do not mix unrelated changes (e.g. a feature commit also bumping deps).
- Before committing, make sure `cargo fmt`, `cargo clippy`,
  `cargo nextest run`, `biome ci .`, `tsc --noEmit`, and the architecture
  test suites all pass.

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
| `make db-prepare` | Regenerate sqlx offline metadata |
| `make api-generate` | Regenerate frontend types from OpenAPI |
| `cd backend && cargo nextest run` | Rust unit + architecture tests |
| `cd backend && cargo clippy --all-targets` | Rust lint |
| `cd backend && cargo fmt --all` | Rust format |
| `cd frontend && pnpm run lint:ci` | Biome lint + format check |
| `cd frontend && pnpm run typecheck` | TypeScript type check |
| `cd frontend && pnpm run test:run` | Frontend unit tests |
| `cd frontend && pnpm run arch:test` | Frontend architecture tests (dependency-cruiser) |
| `cd frontend && pnpm run dev` | Frontend dev server |

## devcontainer and local infra

The devcontainer and local infrastructure are **loosely coupled**. The
devcontainer starts on its own and reaches MySQL through `triary-network`
(declared `external: true`). When the work in front of you does not need a
database, you do not have to run `make infra-up`.

## Reference documents

- `.contexts/concept.md`: project concept and product background
- `.contexts/requirements.md`: functional and non-functional requirements
- `.contexts/specification.md`: user stories and acceptance criteria
- `.contexts/architecture.md`: layer/aggregate/CQRS decisions, ADRs
- `.contexts/api-design.md`: HTTP API contract
- `.contexts/data-model.md`: persistence model, ID strategy, indexes
- `.contexts/setup-plan.md`: environment build plan
- `.contexts/bootstrap-decisions.md`: AI context bootstrap decisions
- `.contexts/security-overrides.md`: ledger for the pnpm.overrides patches
- `openapi/openapi.yaml`: OpenAPI schema (the source of truth for the API)

## Design principles (when in doubt)

- Layer by **origin** of the concern, not by a Clean-Architecture template.
- A vocabulary word used as a structural concept must pass the
  "verb + object responsibility in one sentence" test. Banned: `Service`,
  `Manager`, `Helper`, `Util`, `Utils`, `Processor`, `Worker`, `Engine`.
- Avoid escape patterns: vague boxes for unknowns, stringifying numeric
  structures, exhaustive enums for orthogonal dimensions, premature
  abstractions. If you must escape, leave a note in `.contexts/` saying why.
- Disposability: every external dependency should have an isolation strategy
  (wrapper / import-restriction / layer separation / coexistence).
- Tech-stack changes go through a doc under `.contexts/` first.
