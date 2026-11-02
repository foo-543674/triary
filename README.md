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

## Try it

Needs only git and Docker (Docker Desktop, Rancher Desktop, or Docker Engine
on WSL / Linux). No VS Code, devcontainer, `make` or `.env`.

```sh
git clone https://github.com/foo-543674/triary.git
cd triary
docker compose -f quickstart/compose.yaml up --build
```

Open http://localhost:3000 once the log shows the `web` service running
(on WSL, open it in the Windows browser). The first run builds the images, so
it takes a while; later runs reuse them. Stop with Ctrl+C;
`docker compose -f quickstart/compose.yaml down -v` also deletes the data.

This builds release images of the backend and the frontend and serves them
from one origin behind a reverse proxy (`quickstart/`). It shares nothing
with the development setup ("Setup" below) except host port 3000: stop the dev
servers first, or pick another port with
`TRIARY_PORT=3100 docker compose -f quickstart/compose.yaml up --build`.
On Windows, a VS Code window attached to the devcontainer forwards its own
port 3000 and takes `localhost:3000` from the Windows browser; close that
window (or stop forwarding 3000 in its Ports panel) or use another port.

What has been observed (2026-11-03, WSL2 in NAT mode, Windows browser side
checked with `curl.exe`): the pages, `/health`, and signing up then calling
the API with the session cookie, all through the proxy. NOTE: macOS is not
observed yet, and neither is a real browser login. The session cookie is
`Secure` and served over plain `http://localhost`; Chrome, Edge and Firefox
treat localhost as secure, Safari may drop such a cookie. Check by signing
up, then reloading the page: you should still be signed in. If not, use one
of the other browsers.

## Setup

For changing the code. To only try the app, see "Try it" above.

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

Open http://localhost:3000. The browser only talks to the Vite dev server, which forwards
`/api`, `/web` and `/health` to the backend, so the session cookie is
same-origin. Run the backend through `make`: the Makefile exports `.env` to
it.

How the two servers find each other depends on how `./dev` runs commands
(`./dev --engine`):

- `direct` (devcontainer): both servers run in the devcontainer and
  `make run-frontend` makes Vite listen on `127.0.0.1`, where VS Code's port
  forwarding connects (without it Vite listened on `[::1]` only and the
  forwarding was refused; observed 2026-11-03). NOTE: the fixed path is not
  yet observed from the host browser; check by opening
  http://localhost:3000/health there while both run.
- rootless `podman` (including single-UID mode; see the networking comment in
  `dev`): observed 2026-10-31, `/health` through `localhost:3000` reached the
  backend. Open `localhost`, not `127.0.0.1`: Vite listens on `localhost`
  there, which resolved to `::1`.
- `docker` (e.g. WSL without the devcontainer): every `./dev` call is its own
  container. `make run-backend` names the backend container `triary-backend`
  on `triary-network` (run `make infra-up` first, it creates the network);
  `make run-frontend` proxies to it by that name and publishes the dev server
  on the host's `127.0.0.1:3000`. Docker's `127.0.0.1` publishing itself
  reaches the Windows browser on WSL2 (observed 2026-11-03 with throwaway
  servers). NOTE: this make path as a whole is not yet observed from the
  browser; check the same way. If `make run-backend`
  reports that the name `triary-backend` is in use while no backend runs, a
  killed run left the container behind: `docker rm -f triary-backend`.

  **Close any devcontainer window of this repository first** (or stop its
  port 3000 forwarding in VS Code's Ports view). While it is open, VS Code
  (`Code.exe`) holds Windows' `127.0.0.1:3000` for its `forwardPorts`, so
  the browser reaches VS Code's forwarding instead of the server you
  started from WSL (observed 2026-11-03). The quickstart ("Try it" above)
  also publishes port 3000, so the same should apply to it (NOTE: not
  observed; check with the `netstat.exe` command below while it runs).

  If the browser still gets no page, first find out who holds the port on
  Windows (PowerShell or cmd):

  ```sh
  netstat.exe -ano -p TCP -a | findstr :3000
  tasklist.exe /FI "PID eq <pid from the line above>"
  ```

  Then tell where it stops, from Windows (`curl.exe`) and from WSL:

  ```sh
  curl --noproxy '*' -4 -v --max-time 5 http://localhost:3000/
  curl --noproxy '*' -4 -v --max-time 5 http://localhost:3000/health
  ```

  If `/` does not answer either, check that `make run-frontend` is still
  running and printed its URL; if `/` answers but `/health` fails, look at
  the backend or the proxy. `TRIARY_DEV_PUBLISH_ADDRESS=0.0.0.0` (see
  `dev`) publishes on every interface instead; it was added for this
  symptom but the cause turned out to be VS Code holding the port, so it
  does not fix it.

See the networking comment in `dev` for the Podman decision, its effects,
and the remaining network checks; what has been observed so far is recorded in
`.contexts/bootstrap-decisions.md`. NOTE: docker on a real engine remains unobserved; run `make dev-test` with
`TRIARY_DEV_ENGINE=docker`. macOS `shasum` remains unobserved; run
`./dev --image-ref` on macOS with `sha256sum` absent from PATH.

Language commands (cargo, pnpm, npx, ...) go through `./dev`, which runs them
in the dev image (`tools/dev-image/Dockerfile`). Inside the devcontainer it
runs them directly; elsewhere it uses rootless Podman (single-UID mode is
supported) or docker. The entrypoint is POSIX sh; no host language toolchain
is needed. Image tag calculation requires host `sha256sum` or `shasum`; if neither
is installed, the entrypoint fails with a message naming both tools. Do not install the
toolchains on your machine; see "Common commands" in `AGENTS.md`.

NOTE: two things are not settled yet (`.contexts/bootstrap-decisions.md`
"2026-10-31 再実行 (3.0.1)"):

- The devcontainer is built from the dev image's Dockerfile (#56), so it has
  the same toolchain as CI. Unverified until the owner rebuilds it once.
- NOTE: step 6 outside the devcontainer remains unobserved (see the list above
  for docker), including the following database connectivity caveat. The
  backend's `DATABASE_URL` in `.env.example` uses the container
  name `triary-mysql`: under docker `./dev` joins `triary-network`, which
  resolves it; under rootless Podman (see the networking comment in `dev`),
  that container name may not resolve. Check step 6 with this
  engine/configuration; use a host-reachable MySQL address
  in `DATABASE_URL` if needed.

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
├── quickstart/         # One-command "try it" stack (README "Try it")
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
