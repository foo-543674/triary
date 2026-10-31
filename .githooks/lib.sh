#!/usr/bin/env bash
# Shared helpers for the git hooks in this directory.
# Design: docs/review-contract.md and AGENTS.md "Review gate".

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
REVIEW_GATE=(node "$REPO_ROOT/tools/review-gate/src/cli.ts")
FRONTEND_BIN="$REPO_ROOT/frontend/node_modules/.bin"

fail() {
  echo "git-hook: $*" >&2
  exit 1
}

# A deterministic gate that cannot run is a failure, never a pass.
require_frontend_deps() {
  [[ -x "$FRONTEND_BIN/biome" && -x "$FRONTEND_BIN/tsc" ]] ||
    fail "frontend dependencies are missing; run 'pnpm install' in frontend/ before committing."
}

touches() {
  local pattern="$1"
  shift
  printf '%s\n' "$@" | grep -Eq "$pattern"
}

run_rust_lint() {
  (cd "$REPO_ROOT/backend" && cargo fmt --all -- --check && cargo clippy --all-targets --all-features --quiet -- -D warnings)
}

run_frontend_lint() {
  require_frontend_deps
  (cd "$REPO_ROOT/frontend" && "$FRONTEND_BIN/biome" ci . && "$FRONTEND_BIN/tsc" --noEmit)
}

run_review_gate_selftest() {
  require_frontend_deps
  "$FRONTEND_BIN/tsc" -p "$REPO_ROOT/tools/review-gate/tsconfig.json"
  node --test "$REPO_ROOT"/tools/review-gate/test/*.test.ts
}

run_dev_selftest() {
  require_frontend_deps
  "$FRONTEND_BIN/tsc" -p "$REPO_ROOT/tools/dev-image/tsconfig.json"
  node --test "$REPO_ROOT"/tools/dev-image/test/*.test.ts
}
