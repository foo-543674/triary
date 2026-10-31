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

echo "==> Enabling the review-gate git hooks (.githooks/, see AGENTS.md)"
# First, so a later failure does not leave the clone without the gate.
git config core.hooksPath .githooks

echo "==> Reclaiming build directories created by another user"
# Earlier devcontainers ran as root, and their frontend/node_modules stays in
# the bind-mounted workspace: as the editor user, pnpm install then failed
# with EACCES and the stale node_modules (dependency-cruiser 16) made
# arch:test analyse 0 modules (observed on the owner's machine 2026-10-31).
# These directories are derived, so taking them over loses nothing.
# NOTE: relies on the passwordless sudo the common-utils feature sets up for
#       the editor user (feature documentation; not observed yet). Check with
#       `sudo -n true` inside the devcontainer.
for dir in frontend/node_modules backend/target; do
  # Whole tree: a foreign entry deep inside (node_modules/.pnpm/...) breaks
  # pnpm install just the same. -quit stops at the first one found.
  if [ -e "$dir" ] && [ -n "$(find "$dir" ! -user "$(id -u)" -print -quit)" ]; then
    echo "    $dir has entries not owned by $(id -un); taking it over with sudo"
    sudo -n chown -R "$(id -u):$(id -g)" "$dir" || {
      echo "post-create: could not take over $dir (no passwordless sudo?)." >&2
      echo "  Fix it from the host or as root: chown -R $(id -u):$(id -g) $dir" >&2
      exit 1
    }
  fi
done

echo "==> Installing frontend dependencies (needed by the git hooks)"
# The image moves the pnpm store to /cache/pnpm-store, so a node_modules
# installed from another store must be rebuilt. pnpm asks before doing that
# and has no TTY here; confirm-modules-purge=false rebuilds without asking
# (observed with pnpm through ./dev on 2026-10-31).
(cd frontend && pnpm install --frozen-lockfile --config.confirm-modules-purge=false)

echo "==> Installing typescript-language-server (for the Claude Code typescript-lsp plugin)"
# The TypeScript version the lockfile installed, into the user's own prefix:
# the image's global node_modules belong to root.
ts_version="$(node -p "require('./frontend/node_modules/typescript/package.json').version")"
npm install --global --prefix "$HOME/.local" typescript-language-server "typescript@${ts_version}"

echo "==> post-create setup complete"
