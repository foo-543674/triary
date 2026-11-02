#!/bin/sh
# Run against an already running quickstart stack. Each run creates a user.
set -eu

origin="http://localhost:${TRIARY_PORT:-3000}"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' 0
trap 'exit 1' HUP INT TERM

request() {
  path=$1
  expected=$2
  shift 2
  status=$(curl --silent --show-error --noproxy '*' --connect-timeout 5 \
    --max-time 30 --dump-header "$scratch/headers" --output "$scratch/body" \
    --write-out '%{http_code}' "$@" "$origin$path")
  if [ "$status" != "$expected" ]; then
    printf '%s: expected HTTP %s, got %s\n' "$path" "$expected" "$status" >&2
    cat "$scratch/body" >&2
    exit 1
  fi
}

request / 200
grep -Eiq '^content-type: text/html([;[:space:]]|$)' "$scratch/headers" || {
  echo '/: content-type is not text/html' >&2
  cat "$scratch/headers" >&2
  exit 1
}
request /health 200
request /signup 200

# mktemp's suffix gives repeated local runs distinct, valid user handles.
user_id="smoke_$(basename "$scratch" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
request /web/v1/signup 201 \
  --header 'Content-Type: application/json' --header "Origin: $origin" \
  --data "{\"user_id\":\"$user_id\",\"password\":\"quickstart-smoke-password\"}"
# The cookie is Secure; whether curl's cookie jar sends it back over
# http://localhost depends on the curl version, so pass it explicitly.
token=$(sed -n 's/^[Ss][Ee][Tt]-[Cc][Oo][Oo][Kk][Ii][Ee]: triary_session=\([0-9a-f]\{64\}\);.*/\1/p' "$scratch/headers")
[ -n "$token" ] || {
  echo '/web/v1/signup: no triary_session cookie with a 64-hex token' >&2
  cat "$scratch/headers" >&2
  exit 1
}
request /web/v1/me 200 --header "Cookie: triary_session=$token"
printf 'Quickstart smoke passed (%s).\n' "$origin"
