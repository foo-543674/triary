#!/usr/bin/env bash
# Host-only harness: bash and standard POSIX utilities (plus mktemp).
# gh, jq, node, git and the gate's sh invocation are fakes; no network or .git.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox/bin" "$sandbox/tools/review-gate" "$sandbox/.github"
cp "$root/tools/review-gate/acceptance.sh" "$sandbox/tools/review-gate/acceptance.sh"
printf '/protected @owner\n' >"$sandbox/.github/CODEOWNERS"
cat >"$sandbox/bin/gh" <<'FAKE'
#!/usr/bin/env bash
set -eu
case "$*" in
  *pulls/1/files*) echo README.md ;;
  *pulls/1) [[ "$SCENARIO" != early-api ]] || exit 1; echo pr ;;
  *compare/*) echo compare ;;
  *actions/runs\?*) echo runs ;;
  *actions/runs/2/jobs*) echo jobs ;;
  *issues/1/comments*) echo comments ;;
  *issues/99*) echo 'gh: Not Found (HTTP 404)' >&2; exit 1 ;;
  *issues/1/events*) : ;;
  *) echo "unexpected gh: $*" >&2; exit 90 ;;
esac
FAKE
cat >"$sandbox/bin/git" <<'FAKE'
#!/usr/bin/env bash
if [[ "${SCENARIO:-}" == fetched-head && "$*" == 'rev-parse refs/remotes/pr/head' ]]; then exit 7; fi
case "$1" in
  fetch|diff) : ;;
  rev-parse|merge-base) echo head ;;
  *) exit 90 ;;
esac
FAKE
cat >"$sandbox/bin/node" <<'FAKE'
#!/usr/bin/env bash
case "$2" in
  classify-dependency) [[ "$SCENARIO" != classifier ]] || exit 1; echo '{}' ;;
  classify-ai-change) echo '{}' ;;
  *) echo "unexpected node: $*" >&2; exit 90 ;;
esac
FAKE
cat >"$sandbox/bin/jq" <<'FAKE'
#!/usr/bin/env bash
set -eu
input="$(cat)"
if [[ -n "${FAIL_JQ:-}" && "$*" == *"$FAIL_JQ"* ]]; then exit 7; fi
case "$*" in
  '-r .head.sha') echo head ;;
  '-r .base.ref'|'-r .base.repo.default_branch') echo main ;;
  '-r .state') echo open ;;
  '-r .user.login') echo author ;;
  *dependencyUpdate*) [[ "$SCENARIO" != dependency ]] && echo false || echo true ;;
  *dependabotAuthored*) echo false ;;
  *aiChange*) [[ "$SCENARIO" != ai ]] && echo false || echo true ;;
  *'.ok == true'*) echo true ;;
  *'.reasons[]?'*) : ;;
  *workflow_runs*) [[ "$SCENARIO" == ci ]] || echo run ;;
  '-r .status') echo completed ;;
  '-r .id') echo 2 ;;
  '.jobs') echo jobs ;;
  *'required[]'*)
    [[ "$*" == *'"quickstart / smoke"'* ]] || exit 90
    case "$SCENARIO" in
      quickstart-missing) echo 'quickstart / smoke: missing' ;;
      quickstart-failed) echo 'quickstart / smoke: failure' ;;
      quickstart-skipped) echo 'quickstart / smoke: skipped' ;;
    esac ;;
  *'allowed'*) echo snapshot ;;
  *) echo "unexpected jq: $* ($input)" >&2; exit 90 ;;
esac
FAKE
cat >"$sandbox/bin/sh" <<'FAKE'
#!/usr/bin/env bash
set -eu
[[ "$1" == tools/review-gate/gate.sh ]] || exit 90
case "$2" in
  range-hash|contract-version) echo hash ;;
  accept)
    case "$SCENARIO" in
      gate-error) exit 3 ;;
      snapshot) printf 'reason\tstale head; next: post a fresh snapshot\n'; exit 1 ;;
      missing) printf 'decision\t#99\n' ;;
    esac
    printf 'content-hash\thash\n' ;;
  *) exit 90 ;;
esac
FAKE
real_awk="$(command -v awk)"
cat >"$sandbox/bin/awk" <<FAKE
#!/usr/bin/env bash
if [[ -n "\${FAIL_AWK:-}" && "\$*" == *"\$FAIL_AWK"* ]]; then exit 7; fi
exec "$real_awk" "\$@"
FAKE
chmod +x "$sandbox/bin/"*
run() {
  local scenario="$1" expected="$2"
  : >"$sandbox/summary"
  local status=0
  (cd "$sandbox" && PATH="$sandbox/bin:$PATH" SCENARIO="$scenario" \
    DRY_RUN=1 REPO=owner/repo PR=1 RUN_URL=https://example.test/run \
    SNAPSHOT_FILE="$sandbox/snapshot" GITHUB_STEP_SUMMARY="$sandbox/summary" \
    TMPDIR="$sandbox" bash tools/review-gate/acceptance.sh) >"$sandbox/output" 2>&1 || status=$?
  if [[ "$status" != "$expected" ]]; then
    cat "$sandbox/output" >&2
    echo "$scenario: expected exit $expected, got $status" >&2
    exit 1
  fi
}
contains() { grep -Fq -- "$2" "$sandbox/$1" || { cat "$sandbox/$1" >&2; echo "missing: $2" >&2; exit 1; }; }
absent() { if grep -Fq -- "$2" "$sandbox/$1"; then cat "$sandbox/$1" >&2; echo "unexpected: $2" >&2; exit 1; fi; }
run baseline 0
contains output '[dry-run] status success: machine checks passed (CI + review ledger)'
run ci 1
contains output '[dry-run] status failure: CI:'
contains output 'next: run CI for this HEAD'
contains summary 'next: run CI for this HEAD'
absent output 'verifier error:'
for scenario in quickstart-missing quickstart-failed quickstart-skipped; do
  run "$scenario" 1
  contains output '[dry-run] status failure: CI: quickstart / smoke:'
  absent output '[dry-run] status success:'
done
run snapshot 1
contains output '[dry-run] status failure: review snapshot: stale head; next: post a fresh snapshot'
absent output 'verifier error:'
run classifier 0
contains output '[dry-run] status success: machine checks passed (CI + review ledger)'
contains output 'verifier warning: classify-dependency failed'
contains summary 'verifier warning: classify-dependency failed'
absent output 'verifier error:'
run gate-error 2
contains output '[dry-run] status failure: verifier error: gate.sh accept exited 3'
contains summary 'verifier error: gate.sh accept exited 3'
run early-api 2
contains output 'verifier error: unexpected command failure'
contains summary 'verifier error: unexpected command failure'
absent output '[dry-run] status'
run missing 1
contains output '[dry-run] status failure: decision: awaiting human decision: #99 (missing); next:'
contains summary 'decision: awaiting human decision: #99 (missing); next:'
absent output 'verifier error:'
for filter in '.state' '.user.login' '.status' '.id' 'required[]' '.base.repo.default_branch' '.aiChange == true'; do
  export FAIL_JQ="$filter"
  run baseline 2
  contains output '[dry-run] status failure: verifier error:'
  absent output '[dry-run] status success:'
done
for scenario in dependency ai; do
  export FAIL_JQ='.ok == true'
  run "$scenario" 2
  contains output '[dry-run] status failure: verifier error:'
  absent output '[dry-run] status success:'
done
unset FAIL_JQ
for filter in 'reason' 'decision' 'content-hash' 'print $1'; do
  export FAIL_AWK="$filter"
  run baseline 2
  contains output '[dry-run] status failure: verifier error:'
  absent output '[dry-run] status success:'
done
unset FAIL_AWK
run fetched-head 2
contains output '[dry-run] status failure: verifier error:'
absent output '[dry-run] status success:'
echo 'acceptance.test.sh: all scenarios passed'
