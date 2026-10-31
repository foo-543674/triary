#!/usr/bin/env bash
# Shared helpers for the git hooks in this directory.
# Design: docs/review-contract.md and AGENTS.md "Review gate".

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
# The review gate and the self-tests of the gate and of ./dev run on the
# caller's Node 22: they have to work wherever git and ./dev run. Everything
# else (cargo, biome, tsc, vitest, ...) runs in the dev image through ./dev
# (.contexts/bootstrap-decisions.md "2026-10-31 再実行 (3.0.1)").
REVIEW_GATE=(node "$REPO_ROOT/tools/review-gate/src/cli.ts")
DEV="$REPO_ROOT/dev"
FRONTEND_BIN="$REPO_ROOT/frontend/node_modules/.bin"

fail() {
  echo "git-hook: $*" >&2
  exit 1
}

# A deterministic gate that cannot run is a failure, never a pass. This also
# holds for ./dev: it fails when it cannot run the dev image and never falls
# back to tools installed on this machine.
require_frontend_deps() {
  [[ -x "$FRONTEND_BIN/biome" && -x "$FRONTEND_BIN/tsc" ]] ||
    fail "frontend dependencies are missing; run '../dev pnpm install' in frontend/ before committing."
}

touches() {
  local pattern="$1"
  shift
  printf '%s\n' "$@" | grep -Eq "$pattern"
}

# Each ./dev call starts a container (about 3.5 s in the ai-box's vfs
# storage, observed 2026-10-31), so the commands of one gate share one call.
run_rust_lint() {
  (cd "$REPO_ROOT/backend" &&
    "$DEV" bash -c 'cargo fmt --all -- --check && cargo clippy --all-targets --all-features --quiet -- -D warnings')
}

run_frontend_lint() {
  require_frontend_deps
  (cd "$REPO_ROOT/frontend" && "$DEV" bash -c 'node_modules/.bin/biome ci . && node_modules/.bin/tsc --noEmit')
}

run_review_gate_selftest() {
  require_frontend_deps
  (cd "$REPO_ROOT" && "$DEV" frontend/node_modules/.bin/tsc -p tools/review-gate/tsconfig.json)
  node --test "$REPO_ROOT"/tools/review-gate/test/*.test.ts
}

run_dev_selftest() {
  require_frontend_deps
  (cd "$REPO_ROOT" && "$DEV" frontend/node_modules/.bin/tsc -p tools/dev-image/tsconfig.json)
  node --test "$REPO_ROOT"/tools/dev-image/test/*.test.ts
}
