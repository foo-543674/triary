#!/bin/sh
# Resolve the CI image independently of the local development entrypoint.
# Keep the hash formula in sync with dev. Checked against action.yml: a pull
# failure rebuilds from the Dockerfile, and both CI scripts use this reference.
# NOTE: drift need not cause a pull failure (a different tag may exist), so
# the fallback alone does not guarantee correctness under arbitrary drift.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd -P)"
REGISTRY_IMAGE="ghcr.io/foo-543674/triary-dev"
DOCKERFILE="$ROOT/tools/dev-image/Dockerfile"

die() {
  printf 'image-ref: %s\n' "$*" >&2
  exit 1
}

hash_dockerfile() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum < "$DOCKERFILE"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 < "$DOCKERFILE"
  else
    die "SHA-256 hashing requires sha256sum or shasum; install one of these tools."
  fi
}

[ -r "$DOCKERFILE" ] || die "missing $DOCKERFILE"
sum=$(hash_dockerfile) || die "cannot hash $DOCKERFILE"
printf '%s:df-%.12s\n' "$REGISTRY_IMAGE" "$sum"
