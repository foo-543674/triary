#!/usr/bin/env bash
# Claude Code PreToolUse hook for file-writing tools (Edit / Write /
# MultiEdit / NotebookEdit). Refuses writes under .git/, which would let the
# agent change the hooks path in .git/config or forge the review ledger
# (.git/review-ledger/ledger.json; only tools/review-gate/src/cli.ts writes it).
# Design: docs/review-contract.md "台帳".
set -euo pipefail

path="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const i=JSON.parse(s)?.tool_input??{};process.stdout.write(String(i.file_path??i.notebook_path??""))}catch{process.exit(3)}})')" || {
  echo "Blocked: could not parse the PreToolUse input; refusing to guess." >&2
  exit 2
}

# A ".." segment can climb from an allowed path to a forbidden one.
if [[ "/$path/" == */../* ]]; then
  echo "Blocked: paths with '..' segments are not allowed for file writes; use a normalized path." >&2
  exit 2
fi

if [[ "$path" == */.git/* || "$path" == .git/* ]]; then
  # The reviewer writes its round JSON next to the ledger; that file is input
  # to `cli.ts record`, which validates it, so it is the only allowed path:
  # directly inside review-ledger/, no further slashes.
  [[ "$path" =~ (^|/)\.git/review-ledger/round[^/]*\.json$ ]] && exit 0
  echo "Blocked: writing under .git/ is not allowed (hooks path, review ledger). Use 'node tools/review-gate/src/cli.ts record' for review rounds." >&2
  exit 2
fi
exit 0
