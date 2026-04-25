# Copilot instructions for triary

A workout-logging and scoring PWA. Personal project, doubles as a programming
learning playground. **Read `CLAUDE.md` first** for the full project guide;
this file is the short version Copilot needs in every prompt.

## Stack

- Backend: Rust 2024 + Axum 0.8 + sqlx + MySQL 8.0 (`backend/`)
- Frontend: TypeScript + SolidJS + TanStack Query + Tailwind + CSS Modules,
  PWA (`frontend/`)
- API contract: OpenAPI at `openapi/openapi.yaml` (schema first)
- DB migrations: plain SQL via sqlx-cli (no ORM model generation)
- Frontend lint/format: Biome only (no ESLint, no Prettier)
- Integration tests: Postman / Newman (language-agnostic)

## Layer rules (do not break)

Backend:
- `domain` must not import infrastructure crates (`axum`, `axum_extra`,
  `sqlx`, `tower`, `tower_http`, `tracing`, `tracing_subscriber`, `hyper`).
- `application` must not import infrastructure crates either.
- Repository traits live in `application/ports/`; implementations in
  `infrastructure/repositories/`.
- `Clock`, `PasswordHasher` and other "real-world concept" ports live in
  `domain`.
- ORM-generated types (`sqlx::FromRow` rows etc.) must not appear in
  `domain` / `application` signatures.

Naming, anywhere in the codebase:
- Banned structural names: `Service`, `Manager`, `Helper`, `Util`, `Utils`,
  `Processor`, `Worker`, `Engine`. `Handler` is allowed only inside
  `interfaces::http`.
- A structural name must pass the "verb + object in one sentence" test.

## Coding style

- TDD: write the failing test first (`cargo nextest`, `vitest`, or
  `proptest`/`fast-check` for property-based).
- Validation collects errors: return `Result<_, Vec<DomainError>>`, not
  fail-fast on the first error.
- HTTP: errors as `errors[]` array, never single-error envelopes. HTTP
  status reserved for protocol concerns; domain rule violations return 400
  with a domain-specific `code`.
- IDs are `{prefix}_{ulid}` strings at the API boundary
  (`usr_`, `exr_`, `ses_`, `blk_`, `set_`).
- Pure core, impure shell. `Option`/`Result` over `null`. `panic!`/exception
  is for bugs only, never control flow.
- Frontend state: discriminated unions, not flag soup. State lives outside
  presentational components.

## Quality gates

Before suggesting a commit, the following must pass:
- `cargo fmt --check`, `cargo clippy --all-targets`, `cargo nextest run`
- `pnpm run lint:ci`, `pnpm run typecheck`, `pnpm run test:run`,
  `pnpm run arch:test`

## Commit message prefixes

`[feat]` `[fix]` `[update]` `[improve]` `[refactor]` `[chore]` `[docs]`
`[test]` `[style]`. One commit, one purpose.

## Where to look

- `.contexts/architecture.md` — layer / aggregate / CQRS / ADR
- `.contexts/api-design.md` — HTTP API contract
- `.contexts/data-model.md` — DB schema and ID strategy
- `.contexts/specification.md` — user stories with acceptance criteria
- `.contexts/bootstrap-decisions.md` — selected quality lenses and rationale
