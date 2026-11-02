#!/bin/sh
# Explain the review gate early, relying on Claude Code's `if` matching.
# Skip raw input containing $ or backticks; git hooks and remote acceptance
# provide the safety net. See decision #95 and .contexts/bootstrap-decisions.md
# "2026-11-01 再実行 (3.1.0)". Needs only a POSIX shell and git.

input=$(cat)
# Raw JSON is sufficient: a $ or backtick in another field (e.g. description)
# also passes. This accepted miss avoids parsing JSON or shell syntax.
case $input in *'$'* | *'`'*) exit 0 ;; esac
scope=${1:-}
case $scope in commit | push) ;; *) exit 0 ;; esac

block() {
  printf 'Blocked: %s\n' "$*" >&2
  exit 2
}

# Bypass flags (--no-verify / -n / -c core.hooksPath) are denied in
# settings.json, not matched here: a text search of the whole command would
# also stop a commit whose message merely mentions them.

root=${CLAUDE_PROJECT_DIR:-}
[ -n "$root" ] || root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

[ "$(git config --get core.hooksPath 2>/dev/null)" = ".githooks" ] ||
  block "git hooks are not enabled in this clone. Run 'make hooks-install' (enabling is allowed; changing the hooks path by hand is not)."

# DO NOT REMOVE OR WEAKEN: "no review recorded" must stop the commit / push
# here too; treating it as success hides the reason from the AI.
if ! out=$(sh tools/review-gate/gate.sh check --scope "$scope" 2>&1); then
  printf '%s\n\nNext step: launch the code-reviewer subagent on the %s diff (it follows .agents/skills/code-review/SKILL.md and records a round with gate.sh record), address findings, then retry.\n' "$out" "$scope" >&2
  printf '%s\n' 'If this command does not actually run git commit / git push (a false match), rewrite it in a simpler form or split it into separate Bash calls and retry.' >&2
  exit 2
fi
exit 0
