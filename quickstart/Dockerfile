# Images for the quickstart (quickstart/compose.yaml). Build context: the
# repository root. Targets: migrate, backend, web.
#
# Toolchain versions follow tools/dev-image/Dockerfile (Rust, Node, sqlx-cli)
# so the quickstart builds what CI checks. Keep them in step when that file
# changes.

# ---------- migrate: sqlx-cli + the SQL migrations ----------
FROM rust:1.99.1-bookworm AS sqlx-cli
RUN cargo install --locked sqlx-cli@0.8.6 --no-default-features --features mysql,rustls

FROM debian:bookworm-slim AS migrate
COPY --from=sqlx-cli /usr/local/cargo/bin/sqlx /usr/local/bin/sqlx
COPY backend/migrations /migrations
USER nobody
CMD ["sqlx", "migrate", "run", "--source", "/migrations"]

# ---------- backend: release build of the Axum server ----------
FROM rust:1.99.1-bookworm AS backend-build
WORKDIR /src/backend
COPY backend/ ./
# The query! macros are checked against the committed metadata (backend/.sqlx),
# so the build does not need a database.
ENV SQLX_OFFLINE=true
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/backend/target \
    cargo build --locked --release \
 && cp target/release/triary-backend /usr/local/bin/triary-backend

FROM debian:bookworm-slim AS backend
COPY --from=backend-build /usr/local/bin/triary-backend /usr/local/bin/triary-backend
USER nobody
EXPOSE 8080
CMD ["triary-backend"]

# ---------- web: built frontend behind the reverse proxy ----------
FROM node:22.23.4-bookworm AS web-build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /src/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm exec vite build

FROM nginx:1.30.6-alpine AS web
COPY quickstart/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /src/frontend/dist /usr/share/nginx/html
