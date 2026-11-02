#!/bin/sh
# Run CI commands with Docker independently of the local dev entrypoint.
set -eu
set -f

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd -P)"
WORKDIR=$(pwd -P)
case "$WORKDIR/" in
  "$ROOT"/*) ;;
  *) echo "run: run from inside the repository ($ROOT)" >&2; exit 1 ;;
esac
[ "$#" -gt 0 ] || { echo 'usage: sh .github/actions/dev-image/run.sh <command> [args...]' >&2; exit 1; }
IMAGE=$(sh "$ROOT/.github/actions/dev-image/image-ref.sh")

set -- --rm -i \
  --volume "$ROOT:$ROOT" --workdir "$WORKDIR" \
  --volume triary-dev-cargo-registry:/usr/local/cargo/registry \
  --volume triary-dev-cargo-git:/usr/local/cargo/git \
  --volume triary-dev-corepack:/cache/corepack \
  --volume triary-dev-pnpm-store:/cache/pnpm-store \
  "$IMAGE" "$@"
if [ -t 0 ] && [ -t 1 ]; then set -- --tty "$@"; fi
for name in DATABASE_URL TEST_DATABASE_URL SQLX_OFFLINE RUSTFLAGS CARGO_TERM_COLOR RUST_LOG RUST_BACKTRACE CI TERM BACKEND_PORT BACKEND_ORIGIN; do
  # The name is from the fixed allowlist; values are never evaluated as code.
  eval 'value=${'"$name"':-}'
  if [ -n "$value" ]; then set -- --env "$name" "$@"; fi
done
set -- --user "$(id -u):$(id -g)" "$@"
if docker network inspect triary-network >/dev/null 2>&1; then
  set -- --network triary-network "$@"
fi
exec docker run "$@"
