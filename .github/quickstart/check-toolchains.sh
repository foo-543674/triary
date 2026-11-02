#!/bin/sh
# Run from the repository root; compare every pinned image and sqlx install.
set -eu

for tool in rust node sqlx-cli; do
  case "$tool" in
    rust|node) pattern="^FROM $tool:" ;;
    sqlx-cli) pattern='sqlx-cli@' ;;
  esac
  expected=$(grep "$pattern" tools/dev-image/Dockerfile | \
    sed -n "s/.*$tool[:@]\([^[:space:]]*\).*/\1/p")
  actual=$(grep "$pattern" quickstart/Dockerfile | \
    sed -n "s/.*$tool[:@]\([^[:space:]]*\).*/\1/p")
  [ -n "$expected" ] && [ -n "$actual" ] || {
    printf 'Missing %s pin in a Dockerfile.\n' "$tool" >&2
    exit 1
  }
  for pin in $actual; do
    [ "$pin" = "$expected" ] || {
      printf '%s drift: quickstart=%s dev-image=%s\n' "$tool" "$pin" "$expected" >&2
      exit 1
    }
  done
done
printf 'Quickstart toolchain pins match the dev image.\n'
