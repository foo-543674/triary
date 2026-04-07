#!/usr/bin/env bash
# NOTE: Initial setup script invoked by the devcontainer postCreateCommand.
#       Installs the Rust and frontend toolchains inside the devcontainer.

set -euo pipefail

echo "==> Installing cargo-binstall (for fast Rust tool installation)"
if ! command -v cargo-binstall >/dev/null 2>&1; then
  curl -L --proto '=https' --tlsv1.2 -sSf \
    https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh \
    | bash
fi

echo "==> Installing Rust dev tools (cargo-nextest, cargo-watch, sqlx-cli)"
cargo binstall -y --no-confirm \
  cargo-nextest \
  cargo-watch \
  sqlx-cli

echo "==> Enabling corepack and activating pnpm"
corepack enable
corepack prepare pnpm@latest --activate

echo "==> Installing Biome (Frontend linter + formatter)"
npm install -g @biomejs/biome

echo "==> Installing typescript-language-server (for Claude Code typescript-lsp plugin)"
npm install -g typescript typescript-language-server

echo "==> post-create setup complete"
