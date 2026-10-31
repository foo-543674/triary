#!/usr/bin/env bash
# Claude Code PreToolUse hook for Bash. Explains the git-hook gate to the AI
# before it runs `git commit` / `git push`, and refuses bypass attempts.
# The git hooks in .githooks/ are the real gate; this only makes the reason
# readable to the agent (exit 2 + stderr is fed back to Claude).
# Design: docs/review-contract.md / AGENTS.md "Review gate".
#
# What can actually disable the git hooks, and how each is handled here:
#   1. --no-verify / -n (and abbreviations / flag clusters)  -> blocked
#   2. a hooksPath override in any form (git config in any scope, -c,
#      --config-env, editing .git/config)                    -> any mention of
#      "hookspath" (case-insensitive) or of .git/config is blocked
#   3. config injected through GIT_CONFIG_COUNT / _KEY_n / _VALUE_n /
#      GIT_CONFIG_PARAMETERS                                 -> blocked by name
#   4. forging the review ledger                             -> any shell
#      mention of review-ledger/ledger.json is blocked (only cli.ts writes it);
#      .claude/hooks/protect-git-dir.sh blocks Edit/Write under .git/
# Starting git via an absolute path, env assignments or `command` does NOT
# disable the git hooks, but it is still detected so the reason is explained.
# NOTE: shell obfuscation (split strings, variables holding the flag), commits
# created through the API (gh api), and edits to the hook files themselves are
# not detectable here. The local gate is not tamper-proof by design
# (docs/review-contract.md "この契約が保証しないこと"); the remote acceptance
# check (no valid ledger snapshot -> fail) is the layer that holds.
set -euo pipefail

block() {
  echo "Blocked: $*" >&2
  exit 2
}

# Parse the hook input with node (already required by the gate) rather than
# jq, so a missing tool cannot silently disable this layer.
command="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s)?.tool_input?.command??""))}catch{process.exit(3)}})')" ||
  block "could not parse the PreToolUse input; refusing to guess."
[[ -z "$command" ]] && exit 0
lower="${command,,}"

DO_NOT_BYPASS="bypassing or forging the review gate (--no-verify / -n / hooksPath / git config env / ledger edits) is forbidden by AGENTS.md. Fix the cause instead."

# --- bypass vectors: matched anywhere, because a false block is cheap -------
if grep -Eq "\bgit\b.*\b(commit|push)\b.*([[:space:]]--no-v|[[:space:]]-[a-zA-Z]*n[a-zA-Z]*([[:space:]]|$))" <<<"$command" ||
  grep -Fq "hookspath" <<<"$lower" ||
  grep -Eq "GIT_CONFIG_(COUNT|KEY_|VALUE_|PARAMETERS)|--config-env" <<<"$command" ||
  grep -Eq "\.git/config|config\.worktree|review-ledger/ledger\.json" <<<"$command"; then
  block "$DO_NOT_BYPASS"
fi

# --- how git is started: separator, env assignments, `command`/`builtin`/
#     `exec` or a backslash, an optional path, then any global options --------
sep='(^|[;&|(`]|&&|\|\||\$\()[[:space:]]*'
assignments='([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*'
launcher='((command|builtin|exec)[[:space:]]+|\\)?'
binary='([^[:space:];&|()]*/)?git'
options='([[:space:]]+-[^[:space:]]*([[:space:]]+[^[:space:]-][^[:space:]]*)?)*'
git_sub="${sep}${assignments}${launcher}${binary}${options}[[:space:]]+"

# Indirect invocations hide the subcommand from this hook.
if grep -Eq "\b(bash|sh|zsh|dash|eval|xargs|env|nohup|sudo|timeout|nice)\b.*\bgit\b.*\b(commit|push)\b" <<<"$command" &&
  ! grep -Eq "${git_sub}(commit|push)\b" <<<"$command"; then
  block "run 'git commit' / 'git push' directly (not through bash -c, eval, xargs, env ...) so the review gate can check it."
fi

scope=""
grep -Eq "${git_sub}commit\b" <<<"$command" && scope="commit"
grep -Eq "${git_sub}push\b" <<<"$command" && scope="push"
[[ -z "$scope" ]] && exit 0

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

if [[ "$(git config --get core.hooksPath || true)" != ".githooks" ]]; then
  block "git hooks are not enabled in this clone. Run 'make hooks-install' (enabling is allowed; changing the hooks path by hand is not)."
fi

# `git commit -a` / `--all` stages at commit time; the review must cover what
# will actually be committed, so ask for explicit staging.
if [[ "$scope" == "commit" ]] && grep -Eq "${git_sub}commit\b.*([[:space:]]-[a-zA-Z]*a[a-zA-Z]*([[:space:]]|$)|[[:space:]]--all\b)" <<<"$command"; then
  block "stage changes with 'git add' and get the staged diff reviewed before committing (no 'commit -a')."
fi

if ! out="$(node tools/review-gate/src/cli.ts check --scope "$scope" 2>&1)"; then
  {
    echo "$out"
    echo ""
    echo "Next step: launch the code-reviewer subagent on the ${scope} diff (it follows .agents/skills/code-review/SKILL.md and records a round with 'record'), address findings, then retry."
  } >&2
  exit 2
fi
exit 0
