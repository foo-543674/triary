# triary dev image: the only place the language toolchains live.
#
# Every language command (cargo, pnpm, node scripts, sqlx, ...) runs in this
# image through the `./dev` entrypoint at the repository root; neither the
# owner's machine nor the AI's box installs them (AGENTS.md "Common
# commands"). CI builds and publishes it (.github/workflows/dev-image.yml);
# the ai-box cannot build it because its single-UID Podman fails on apt-get's
# user switch.
#
# The image tag is derived from this file's content (`./dev --image-ref`), so
# any change here produces a new tag. Pin versions explicitly: a floating
# base tag would change the toolchain without changing the tag.

FROM node:22.23.4-bookworm AS node

FROM rust:1.99.1-bookworm

LABEL org.opencontainers.image.source="https://github.com/foo-543674/triary" \
      org.opencontainers.image.description="triary dev image: toolchains for ./dev"

# Node 22 (same major as CI) and corepack, copied from the official image.
# corepack installs the pnpm version pinned in frontend/package.json
# ("packageManager") on first use.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
 && corepack enable --install-directory /usr/local/bin pnpm

# Rust tools. sqlx-cli follows the sqlx major used by backend/Cargo.toml.
# The base image makes CARGO_HOME world-writable (rust-lang/docker-rust
# stable/bookworm/Dockerfile: `chmod -R a+w $RUSTUP_HOME $CARGO_HOME`), but
# files `cargo install` adds here as root are not, and cargo takes a lock in
# CARGO_HOME (.package-cache) even for builds; restore a+w for docker --user.
RUN rustup component add rustfmt clippy \
 && cargo install --locked cargo-nextest@0.9.150 cargo-audit@0.22.2 \
 && cargo install --locked sqlx-cli@0.8.6 --no-default-features --features mysql,rustls \
 && rm -rf /usr/local/cargo/registry /usr/local/cargo/git \
 && chmod -R a+w /usr/local/cargo

# Caches and HOME. `./dev` mounts named volumes on the cache paths; Docker
# initialises an empty named volume from the image directory, so the
# world-writable mode lets a non-root caller (docker --user) write to them.
ENV HOME=/home/dev \
    COREPACK_HOME=/cache/corepack \
    npm_config_store_dir=/cache/pnpm-store \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TRIARY_DEV_IMAGE=1
RUN mkdir -p /home/dev /cache/corepack /cache/pnpm-store /usr/local/cargo/registry /usr/local/cargo/git \
 && chmod 1777 /home/dev /cache /cache/corepack /cache/pnpm-store /usr/local/cargo/registry /usr/local/cargo/git \
 && git config --system safe.directory '*'
