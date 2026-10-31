#!/usr/bin/env bash
# NOTE: Setup run once by the devcontainer postCreateCommand.
#       The toolchain itself comes from the dev image (tools/dev-image/
#       Dockerfile); this only adds per-user editor tooling and enables the
#       review-gate hooks.

set -euo pipefail

# The image sets HOME=/home/dev for ./dev's callers. devcontainer.json's
# remoteEnv gives the editor user its own HOME, but whether remoteEnv also
# applies to lifecycle commands like this one is not verified, so take the
# home directory from the account instead of trusting $HOME.
HOME="$(getent passwd "$(id -un)" | cut -d: -f6)"
export HOME

echo "==> Installing frontend dependencies (needed by the git hooks)"
(cd frontend && pnpm install --frozen-lockfile)

echo "==> Installing typescript-language-server (for the Claude Code typescript-lsp plugin)"
# The TypeScript version the lockfile installed, into the user's own prefix:
# the image's global node_modules belong to root.
ts_version="$(node -p "require('./frontend/node_modules/typescript/package.json').version")"
npm install --global --prefix "$HOME/.local" typescript-language-server "typescript@${ts_version}"

echo "==> Enabling the review-gate git hooks (.githooks/, see AGENTS.md)"
git config core.hooksPath .githooks

echo "==> post-create setup complete"
