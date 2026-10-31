#!/usr/bin/env bash
# Claude Code PreToolUse hook for Bash. Explains the git-hook gate to the AI
# before it runs `git commit` / `git push`, and refuses bypass attempts.
# The git hooks in .githooks/ are the real gate; this only makes the reason
# readable to the agent (exit 2 + stderr is fed back to Claude).
# Design: docs/review-contract.md / AGENTS.md "Review gate".
#
# What can actually disable the git hooks, and how each is handled here:
#   1. --no-verify / -n (abbreviations, flag clusters, behind keywords such
#      as { if ! do, behind any launcher such as sudo / xargs / find -exec,
#      inside sh -c / eval, text piped into a shell, configured aliases,
#      messages containing ; & |, line continuations)
#      -> tools/review-gate/src/command.ts tokenizes the command like a shell
#         and inspects every git word in it (rules in that file's header)
#   2. a hooks-path override in any form (git config in any scope, -c,
#      --config-env, editing .git/config)  -> any mention of "hookspath"
#      (case-insensitive) or of .git/config is blocked
#   3. config injected through GIT_CONFIG_COUNT / _KEY_n / _VALUE_n /
#      GIT_CONFIG_PARAMETERS               -> blocked by name
#   3b. defining an alias (git -c alias.x=... / git config alias.x ...)
#      -> any command mentioning both git and "alias." is blocked; aliases
#         that already exist are expanded by classify.ts
#   4. forging the review ledger          -> any shell mention of
#      review-ledger/ledger.json is blocked (only cli.ts writes it);
#      .claude/hooks/protect-git-dir.sh blocks Edit/Write under .git/
# Starting git via an absolute path, env assignments or a launcher does NOT
# disable the git hooks, but it is still recognized so the reason is explained.
# NOTE: shell obfuscation the tokenizer cannot see through (variables holding
# the flag, generated strings, scripts written to a file and executed later),
# commits created through the API (gh api), and edits to the hook files
# themselves are not detectable here. The local gate
# is not tamper-proof by design (docs/review-contract.md
# "この契約が保証しないこと"); the remote acceptance check (no valid ledger
# snapshot -> fail) is the layer that holds.
set -euo pipefail

block() {
  echo "Blocked: $*" >&2
  exit 2
}

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tools="$here/../../tools/review-gate/src"

# Parse the hook input with node (already required by the gate) rather than
# jq, so a missing tool cannot silently disable this layer.
command="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s)?.tool_input?.command??""))}catch{process.exit(3)}})')" ||
  block "could not parse the PreToolUse input; refusing to guess."
[[ -z "$command" ]] && exit 0
lower="${command,,}"

# Classification reads the repository's git aliases, so work from the project.
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

DO_NOT_BYPASS="bypassing or forging the review gate (--no-verify / -n / hooksPath / git config env / ledger edits) is forbidden by AGENTS.md. Fix the cause instead."

# --- whole-command checks: these words have no legitimate use in a command --
if grep -Fq "hookspath" <<<"$lower" ||
  grep -Eq "GIT_CONFIG_(COUNT|KEY_|VALUE_|PARAMETERS)|--config-env" <<<"$command" ||
  grep -Eq "\.git/config|config\.worktree|review-ledger/ledger\.json" <<<"$command" ||
  { grep -Eq "\bgit\b" <<<"$command" && grep -Fq "alias." <<<"$lower"; }; then
  block "$DO_NOT_BYPASS"
fi

# --- per git invocation: tokenized like a shell -----------------------------
# Unparseable text is scanned conservatively inside classify.ts (it reports
# commit/push and flags from the raw text), so it is not blocked by itself.
read -r scope bypass stages_all _unparseable < <(node "$tools/classify.ts" <<<"$command") ||
  block "could not classify the command; refusing to guess."

[[ "$bypass" == "true" ]] && block "$DO_NOT_BYPASS"
[[ "$scope" == "-" ]] && exit 0

if [[ "$(git config --get core.hooksPath || true)" != ".githooks" ]]; then
  block "git hooks are not enabled in this clone. Run 'make hooks-install' (enabling is allowed; changing the hooks path by hand is not)."
fi

# `git commit -a` / `--all` stages at commit time; the review must cover what
# will actually be committed, so ask for explicit staging.
[[ "$stages_all" == "true" ]] &&
  block "stage changes with 'git add' and get the staged diff reviewed before committing (no 'commit -a')."

if ! out="$(node "$tools/cli.ts" check --scope "$scope" 2>&1)"; then
  {
    echo "$out"
    echo ""
    echo "Next step: launch the code-reviewer subagent on the ${scope} diff (it follows .agents/skills/code-review/SKILL.md and records a round with 'record'), address findings, then retry."
  } >&2
  exit 2
fi
exit 0
