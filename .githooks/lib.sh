# Shared helpers for the git hooks in this directory (sourced, POSIX sh).
# Design: docs/review-contract.md and AGENTS.md "Review gate".
#
# The hooks themselves need only git and a POSIX shell; the review gate
# (tools/review-gate/gate.sh) is written in the same. Language commands
# (cargo, biome, tsc, vitest, node, ...) run in the dev image through ./dev,
# which needs docker or podman. Nothing has to be installed or prepared by
# hand first: dependencies the gates need are installed by the gate itself
# (.contexts/bootstrap-decisions.md "2026-11-01 再実行 (3.1.0)").

set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
GATE="$REPO_ROOT/tools/review-gate/gate.sh"
DEV="$REPO_ROOT/dev"

# Run inside the dev image before the frontend tools: a no-op when
# node_modules is current, an install from the pnpm store volume otherwise
# (never an interactive prompt: a hook has no one to answer it).
FRONTEND_DEPS='pnpm install --frozen-lockfile --prefer-offline --reporter=silent --config.confirmModulesPurge=false'

fail() {
  printf 'git-hook: %s\n' "$*" >&2
  exit 1
}

# touches <extended regex>: does any path in $CHANGED (one per line) match?
# A deterministic gate that cannot run is a failure, never a pass; this also
# holds for ./dev, which never falls back to tools installed on this machine.
touches() {
  printf '%s\n' "$CHANGED" | grep -Eq "$1"
}

# Each ./dev call starts a container (about 3.5 s under rootless podman with
# vfs storage, observed 2026-10-31), so the commands of one gate share one call.
# Force the checked-in backend/.sqlx cache even when DATABASE_URL is set
# (including via .env, documented by sqlx 0.8's query! Requirements).
# A changed query without cached metadata fails compilation with sqlx's
# "no cached data for this query" diagnostic; regenerate with make db-prepare
# against a migrated database. Offline builds cannot detect schema-only drift.
run_rust_lint() {
  (cd "$REPO_ROOT/backend" &&
    SQLX_OFFLINE=true "$DEV" bash -c 'cargo fmt --all -- --check && cargo clippy --locked --all-targets --all-features --quiet -- -D warnings')
}

run_rust_tests() {
  # Inspected 2026-11-02: backend/tests checks source/dependency metadata;
  # unit/HTTP tests use in-memory fakes (src/testing.rs), with no live DB.
  # Run the full suite, as CI's backend-test does without a DB service.
  # Live-MySQL coverage remains in CI's separate Newman integration job.
  (cd "$REPO_ROOT/backend" &&
    SQLX_OFFLINE=true "$DEV" cargo nextest run --locked --all-features --no-tests=pass)
}

run_frontend_lint() {
  (cd "$REPO_ROOT/frontend" && "$DEV" bash -c "$FRONTEND_DEPS && node_modules/.bin/biome ci . && node_modules/.bin/tsc --noEmit")
}

run_frontend_tests() {
  (cd "$REPO_ROOT/frontend" && "$DEV" bash -c "$FRONTEND_DEPS && node scripts/check-arch.mjs && node_modules/.bin/vitest run")
}

# The gate itself is tested on this machine (git + sh); the remote verifier's
# TypeScript parts are type-checked and tested in the dev image.
run_review_gate_selftest() (
  clear_selftest_git_env
  sh "$REPO_ROOT/tools/review-gate/test/gate.test.sh" &&
    (cd "$REPO_ROOT" && "$DEV" bash -c "(cd frontend && $FRONTEND_DEPS) && frontend/node_modules/.bin/tsc -p tools/review-gate/tsconfig.json && node --test --test-reporter=dot tools/review-gate/test/*.test.ts")
)

run_dev_selftest() (
  clear_selftest_git_env
  (cd "$REPO_ROOT" && "$DEV" bash -c "(cd frontend && $FRONTEND_DEPS) && frontend/node_modules/.bin/tsc -p tools/dev-image/tsconfig.json && node --test --test-reporter=dot tools/dev-image/test/*.test.ts")
)

# Use only in self-test subshells: the hook's gate commands need Git's selectors.
# ./dev's container allowlist excludes GIT_*, but its direct mode inherits them.
clear_selftest_git_env() {
  for selftest_git_env in $(env | sed -n 's/^\(GIT_[A-Za-z0-9_]*\)=.*/\1/p'); do
    unset "$selftest_git_env"
  done
  unset selftest_git_env
}
