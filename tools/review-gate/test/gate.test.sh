#!/bin/sh
# Hooks export repository selectors that must never reach fixture repositories.
# Extract names only; a newline in a value can add a harmless extra unset.
for git_test_env in $(env | sed -n 's/^\(GIT_[A-Za-z0-9_]*\)=.*/\1/p'); do
  unset "$git_test_env"
done
unset git_test_env

# Tests of the review gate (gate.sh), the git hooks' use of it and the Claude
# Code hooks, in throwaway repositories. Needs only git and a POSIX shell,
# like the gate itself. Run: sh tools/review-gate/test/gate.test.sh
#
# The numbered cases are docs/review-contract.md "ゲートが区別するケース".

set -u

HERE=$(cd "$(dirname "$0")" && pwd -P)
SRC=$(cd "$HERE/../../.." && pwd -P)
GATE="$SRC/tools/review-gate/gate.sh"
TAB=$(printf '\t')
TMP="${TMPDIR:-/tmp}/review-gate-test.$$"
PASS=0
FAILED=0
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP"

ok() { PASS=$((PASS + 1)); }
ng() {
  FAILED=$((FAILED + 1))
  printf 'not ok - %s\n' "$*" >&2
}

# expect <status> <name> <command...>: run and compare the exit status.
# Output goes to $TMP/out.
expect() {
  want=$1 name=$2
  shift 2
  "$@" >"$TMP/out" 2>&1
  got=$?
  if [ "$got" -eq "$want" ]; then ok; else ng "$name (exit $got, wanted $want): $(cat "$TMP/out")"; fi
}

# contains <name> <fixed string>: the last output contains it.
contains() {
  if grep -Fq -- "$2" "$TMP/out"; then ok; else ng "$1: output lacks '$2': $(cat "$TMP/out")"; fi
}

gate() { sh "$GATE" "$@"; }

# A fresh repository with one commit on origin/main and a staged change.
new_repo() {
  REPO="$TMP/repo.$1"
  rm -rf "$REPO"
  mkdir -p "$REPO/docs" "$REPO/tools/review-gate"
  cd "$REPO" || exit 1
  git init -q
  git config user.email test@example.com
  git config user.name test
  git config commit.gpgsign false
  git remote add origin https://github.com/example/repo.git
  printf 'contract\n' >docs/review-contract.md
  cp "$GATE" tools/review-gate/gate.sh
  printf 'one\n' >a.txt
  git add -A
  git commit -q -m base
  git update-ref refs/remotes/origin/main HEAD
  printf 'two\n' >>a.txt
  git add a.txt
}

LEDGER() { printf '%s/review-ledger/ledger.tsv\n' "$(cd "$(git rev-parse --git-common-dir)" && pwd -P)"; }

# round <scope> <outputOk> <records...>: write and record a round for the
# current diff. Each record is a tab-separated line.
round() {
  scope=$1 output=$2
  shift 2
  f="$(git rev-parse --git-common-dir)/review-ledger/round.tsv"
  mkdir -p "$(dirname "$f")"
  printf 'round\t%s\t%s\t%s\tcode-reviewer\n' "$scope" "$(gate hash --scope "$scope")" "$output" >"$f"
  for r in "$@"; do printf '%s\n' "$r" >>"$f"; done
  gate record --file "$f"
}

N() { printf 'new\t%s\t%s\tsrc/a.rs\tAGENTS.md rule\tsrc/a.rs:1 evidence\t-\n' "$1" "$2"; }
U() { printf 'update\t%s\t%s\t%s\t%s\t%s\t-\n' "$1" "$2" "$3" "${4:--}" "${5:--}"; }

# Run the real suite under hook-like environments. Compare all Git metadata,
# including config, refs, index and the ledger, without Git refreshing the index.
if [ "${TRIARY_GATE_TEST_NESTED:-0}" != 1 ]; then
  new_repo sentinel
  sentinel=$REPO
  mkdir -p "$sentinel/.git/review-ledger"
  printf 'sentinel ledger\n' >"$sentinel/.git/review-ledger/ledger.tsv"
  git worktree add -q -b sentinel-linked "$TMP/sentinel-linked" HEAD || exit 1
  linked_git_dir=$(git -C "$TMP/sentinel-linked" rev-parse --absolute-git-dir)
  cp -R "$sentinel/.git" "$TMP/sentinel-before" || exit 1
  for sentinel_kind in normal linked; do
    case $sentinel_kind in
      normal) sentinel_dir=$sentinel/.git; sentinel_tree=$sentinel ;;
      linked) sentinel_dir=$linked_git_dir; sentinel_tree=$TMP/sentinel-linked ;;
    esac
    expect 0 "$sentinel_kind: inherited hook environment is isolated" env \
      TRIARY_GATE_TEST_NESTED=1 GIT_DIR="$sentinel_dir" \
      GIT_INDEX_FILE="$sentinel_dir/index" GIT_WORK_TREE="$sentinel_tree" \
      GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.bare GIT_CONFIG_VALUE_0=true \
      sh "$HERE/gate.test.sh"
    expect 0 "$sentinel_kind: all sentinel Git metadata is byte-identical" \
      diff -r "$TMP/sentinel-before" "$sentinel/.git"
  done
fi

# ---- check ----------------------------------------------------------------------

new_repo check
expect 1 "no ledger: commit is blocked" gate check --scope commit
contains "no ledger" "no review recorded for the current commit diff"

expect 0 "a broken round is recorded" round commit false
expect 1 "case 5: missing review output blocks" gate check --scope commit
contains "case 5" "review output missing or broken"

expect 0 "a clean round is recorded" round commit true
expect 0 "a clean review passes" gate check --scope commit

printf 'three\n' >>a.txt
git add a.txt
expect 1 "a changed diff needs a new review" gate check --scope commit

expect 0 "a Critical finding is recorded" round commit true "$(N F1 critical)"
expect 1 "an open Critical blocks" gate check --scope commit
contains "open Critical" "F1 (critical) is open"

printf 'four\n' >>a.txt
git add a.txt
expect 0 "case 1: a round without the Critical is recorded" round commit true
expect 1 "case 1: a Critical that did not reappear still blocks" gate check --scope commit

expect 0 "the Critical is resolved" round commit true "$(U F1 resolved 'fixed; test added')"
expect 0 "a resolved Critical passes" gate check --scope commit

expect 0 "an Important finding is recorded" round commit true "$(N F2 important)"
expect 1 "an open Important blocks" gate check --scope commit
expect 0 "case 2: the Important is rejected with evidence" round commit true "$(U F2 rejected 'false positive: spec says so')"
expect 0 "case 2: a rejected Important passes" gate check --scope commit

expect 0 "case 3: the resolved Critical is reopened" round commit true "$(U F1 open - 'regressed: src/a.rs:9')"
expect 1 "case 3: a reopened Critical blocks" gate check --scope commit
expect 0 "the Critical is resolved again" round commit true "$(U F1 resolved 'fixed again')"

expect 0 "case 4: a Critical is escalated without a decision" round commit true "$(N F3 critical)"
expect 0 "case 4: ... and escalated" round commit true "$(U F3 escalated 'owner decides' - -)"
expect 1 "case 4: an escalation without a decision request blocks" gate check --scope commit
contains "case 4" "F3 (critical) is escalated but no decision request is referenced"
expect 0 "case 4: the decision request is referenced" round commit true "$(U F3 escalated 'owner decides' - '#12')"
expect 0 "case 4: an escalation with a decision request does not block a commit" gate check --scope commit
contains "case 4 note" "F3 awaits a human decision (#12)"

expect 0 "a Minor finding is recorded" round commit true "$(N F4 minor)"
expect 0 "an open Minor does not block" gate check --scope commit

# ---- record rejects rounds that break the contract ------------------------------------

f="$(git rev-parse --git-common-dir)/review-ledger/round.tsv"
printf 'round\tcommit\tdeadbeef\ttrue\tcode-reviewer\n' >"$f"
expect 1 "record: a round for another diff is rejected" gate record --file "$f"
contains "stale round" "Review the current diff"
expect 1 "record: a duplicate id is rejected" round commit true "$(N F1 minor)"
contains "duplicate" "duplicate finding id F1"
expect 1 "record: an update of an unknown finding is rejected" round commit true "$(U F99 resolved done)"
expect 1 "record: a disposition without a reason is rejected" round commit true "$(U F4 resolved -)"
contains "reason" "requires a resolution reason"
expect 1 "record: a Critical cannot be deferred" round commit true "$(U F1 deferred later)"
contains "deferred" "a Critical finding cannot be deferred"
expect 1 "record: reopening needs new evidence" round commit true "$(U F1 open -)"
expect 1 "record: a finding needs basis and evidence" round commit true "$(printf 'new\tF9\tminor\t-\t-\tx\t-')"
expect 1 "record: an invalid severity is rejected" round commit true "$(N F9 Critical)"
expect 1 "record: a record with missing fields is rejected" round commit true "$(printf 'new\tF9\tminor')"
expect 1 "record: an invalid outputOk is rejected" round commit yes
lines=$(wc -l <"$(LEDGER)")
expect 1 "record: one bad record rejects the whole round" round commit true "$(N F9 minor)" "$(U F99 resolved x)"
[ "$(wc -l <"$(LEDGER)")" -eq "$lines" ] && ok || ng "a rejected round changed the ledger"

printf 'not a record\n' >>"$(LEDGER)"
expect 2 "a corrupted ledger is a failure, not an empty ledger" gate check --scope commit
contains "corrupted" "is corrupted"

# ---- push scope, snapshot and remote acceptance ---------------------------------------

new_repo push
git commit -q -m change
expect 1 "push: no review blocks" gate check --scope push
expect 0 "push: a round with an escalation is recorded" round push true "$(N F1 important)"
expect 0 "push: ... escalated with a decision" round push true "$(U F1 escalated 'owner decides' - '#7')"
expect 0 "push: an escalation with a decision request does not block a push" gate check --scope push

gate snapshot --pr 5 --decisions "#3, #4" >"$TMP/snapshot.md"
accept() {
  gate accept --snapshot-file "$1" --repo example/repo --pr 5 --head "$(git rev-parse HEAD)" \
    --merge-base "$(git merge-base origin/main HEAD)" --diff-hash "$(gate range-hash --from "$(git merge-base origin/main HEAD)" --to HEAD)" \
    --contract-version "$(gate contract-version --base origin/main)"
}
expect 1 "case 4: acceptance waits for the decision" accept "$TMP/snapshot.md"
contains "case 4 acceptance" "F1 awaits a human decision (#7)"
contains "decision next action" "next: answer and close the referenced decision issue"
contains "decisions are listed" "decision$TAB#3"
contains "awaited decisions are listed" "decision$TAB#7"

expect 0 "push: the decision is applied" round push true "$(U F1 resolved 'ruling applied')"
expect 0 "snapshot --output writes the comment to a file" gate snapshot --pr 5 --output "$TMP/snapshot.md"
expect 0 "a matching snapshot is accepted" accept "$TMP/snapshot.md"
grep -q "^finding$TAB" "$TMP/snapshot.md" && ng "resolved findings are left out of the snapshot" || ok

sed "s/^pr${TAB}5\$/pr${TAB}6/" "$TMP/snapshot.md" >"$TMP/edited.md"
expect 1 "an edited snapshot is rejected" accept "$TMP/edited.md"
contains "edited" "content hash mismatch"
contains "edited next action" "post a fresh snapshot with gate.sh snapshot after the last push"
expect 1 "no snapshot is rejected" accept /dev/null
contains "no snapshot" "no review ledger snapshot found"
contains "missing next action" "have the current diff reviewed"
tr -d '\r' <"$TMP/snapshot.md" | sed 's/$/\r/' >"$TMP/crlf.md"
expect 0 "a snapshot with CRLF line ends (as GitHub may return it) is accepted" accept "$TMP/crlf.md"

printf 'five\n' >>a.txt
git commit -q -am more
expect 1 "a snapshot for an older head is rejected" accept "$TMP/snapshot.md"
contains "stale head" "snapshot head is"
contains "stale next action" "post a fresh snapshot with gate.sh snapshot after the last push"

# ---- git hooks: the index git commits is what is checked ------------------------------

new_repo hooks
mkdir -p .githooks
cat >.githooks/pre-commit <<'EOF'
#!/bin/sh
exec sh tools/review-gate/gate.sh check --scope commit
EOF
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
expect 1 "pre-commit blocks an unreviewed commit" git commit -q -m x
expect 0 "the staged diff is reviewed" round commit true
printf 'unreviewed\n' >b.txt
git add -N b.txt
printf 'more\n' >>a.txt
expect 1 "commit -a with unreviewed changes is blocked (GIT_INDEX_FILE)" git commit -q -a -m x
expect 0 "the reviewed staged diff commits" git commit -q -m x

# ---- Claude Code hooks ----------------------------------------------------------------

HOOK="$SRC/.claude/hooks/review-gate.sh"
# Only the tools a bare host has: no node, jq or python on PATH.
BARE="$TMP/bare-bin"
mkdir -p "$BARE"
for tool in sh cat tr awk sed grep git dirname mkdir rm mv date wc mktemp; do
  p=$(command -v "$tool") && ln -sf "$p" "$BARE/$tool"
done
input() { printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1"; }

new_repo claude
expect 0 "hook: a command that is not the operation passes at once" sh -c "printf '%s' '$(input 'ls $(pwd)')' | env PATH='$BARE' sh '$HOOK' push"
expect 2 "hook: hooks not enabled blocks a commit" sh -c "printf '%s' '$(input 'git commit -m x')' | env PATH='$BARE' CLAUDE_PROJECT_DIR='$REPO' sh '$HOOK' commit"
contains "hooks not enabled" "make hooks-install"
git config core.hooksPath .githooks
expect 2 "hook: an unreviewed commit is blocked with the next step" sh -c "printf '%s' '$(input 'git commit -m x')' | env PATH='$BARE' CLAUDE_PROJECT_DIR='$REPO' sh '$HOOK' commit"
contains "next step" "code-reviewer subagent"
contains "false match hint" "rewrite it in a simpler form or split it into separate Bash calls and retry."
expect 2 "hook: failure hint is written to stderr" sh -c "printf '%s' '$(input 'git commit')' | env PATH='$BARE' CLAUDE_PROJECT_DIR='$REPO' sh '$HOOK' commit >'$TMP/hook-stdout'"
contains "stderr hint" "does not actually run git commit / git push"
[ ! -s "$TMP/hook-stdout" ] && ok || ng "hook failure wrote to stdout"
hook_json() {
  printf '%s' "$1" | env PATH="$BARE" CLAUDE_PROJECT_DIR="$REPO" sh "$HOOK" "$2"
}
for scope in commit push; do
  expect 2 "hook: unreviewed $scope fails" hook_json "$(input "git $scope")" "$scope"
  for command in 'git commit -m $(pwd)' 'git push $VAR' 'git commit -m `pwd`'; do
    expect 0 "hook: raw expansion input passes for $scope: $command" hook_json "$(input "$command")" "$scope"
  done
  expect 0 "hook: dollar in description passes for $scope" hook_json '{"tool_input":{"command":"git commit","description":"cost $5"}}' "$scope"
done
for scope in '' status invalid; do
  expect 0 "hook: unrelated scope passes: $scope" hook_json "$(input 'git commit')" "$scope"
done
expect 2 "hook: false match still checks the supplied scope" hook_json "$(input 'echo git commit')" commit
contains "false match hint" "does not actually run git commit / git push"
expect 2 "hook: message mentioning bypass settings still requires review" hook_json "$(input 'git commit -m \"drop core.hooksPath and --no-verify\"')" commit
round commit true >/dev/null
expect 0 "hook: a reviewed commit passes on a host without node" sh -c "printf '%s' '$(input 'git commit -m x')' | env PATH='$BARE' CLAUDE_PROJECT_DIR='$REPO' sh '$HOOK' commit"
expect 0 "hook: a message that mentions core.hooksPath or --no-verify is not a bypass" sh -c "printf '%s' '$(input 'git commit -m \"drop the core.hooksPath and --no-verify checks\"')' | env PATH='$BARE' CLAUDE_PROJECT_DIR='$REPO' sh '$HOOK' commit"

# Regression tests use only throwaway repositories, never the source .git.
new_repo migration
mkdir -p .git/review-ledger
printf '{}\n' >.git/review-ledger/ledger.json
for operation in show record check snapshot; do
  expect 2 "legacy JSON blocks $operation" gate "$operation"
  contains "migration instruction" "make ledger-migrate"
done
printf '# unrelated comment\n' >.git/review-ledger/ledger.tsv
expect 2 "unmigrated TSV also blocks" gate show
printf '# migrated from ledger.json 3 1\n' >.git/review-ledger/ledger.tsv
expect 0 "migration marker permits reading" gate show
round commit true "$(N F9 critical)" >/dev/null
expect 1 "migrated unresolved findings still block" gate check --scope commit
contains "legacy finding remains" "F9 (critical) is open"

new_repo readonly
# A git wrapper rejects any attempted temporary file under the common dir.
# This also works as root, where chmod alone cannot prove read-only behavior.
REAL_GIT=$(command -v git)
mkdir -p "$TMP/git-bin"
cat >"$TMP/git-bin/git" <<'EOF'
#!/bin/sh
case $* in
  *hash-object*) for arg do case $arg in */.git/*) exit 90 ;; esac; done ;;
esac
if [ "${FAIL_DIFF:-0}" = 1 ]; then
  case $* in *' diff '*) printf 'partial diff'; exit 7 ;; esac
fi
exec "$REAL_GIT" "$@"
EOF
chmod +x "$TMP/git-bin/git"
export REAL_GIT
expected=$(gate hash --scope commit)
expect 0 "hash works without ledger directory" env PATH="$TMP/git-bin:$PATH" sh "$GATE" hash --scope commit
contains "hash stays identical" "$expected"
expect 2 "partial failed diff must not produce a hash" env FAIL_DIFF=1 PATH="$TMP/git-bin:$PATH" sh "$GATE" hash --scope commit
expect 2 "check propagates diff failure" env FAIL_DIFF=1 PATH="$TMP/git-bin:$PATH" sh "$GATE" check --scope commit
expect 0 "snapshot stdout uses system temporary directory" env PATH="$TMP/git-bin:$PATH" sh "$GATE" snapshot --pr 1
gate snapshot --pr 5 >"$TMP/readonly-snapshot.md"
expect 1 "accept uses system temporary directory" env PATH="$TMP/git-bin:$PATH" sh "$GATE" accept \
  --snapshot-file "$TMP/readonly-snapshot.md" --repo example/repo --pr 5 --head "$(git rev-parse HEAD)" \
  --merge-base "$(git merge-base origin/main HEAD)" --diff-hash "$(gate hash --scope push)" \
  --contract-version "$(gate contract-version --base origin/main)"
contains "accept reached verdict" "no review recorded"
expect 1 "check reads without creating a ledger directory" gate check --scope commit
[ ! -d .git/review-ledger ] && ok || ng "read-only commands created ledger directory"

printf '%s passed, %s failed\n' "$PASS" "$FAILED"
[ "$FAILED" -eq 0 ]
