@AGENTS.md

<!-- Claude Code specific instructions go below. The project guide itself lives in AGENTS.md. -->

## Claude Code specifics

- The review gate also runs as a PreToolUse hook (`.claude/hooks/review-gate.sh`)
  for Claude Code's `if` matches of `git commit` / `git push`, with the accepted
  skips and false matches recorded in `.contexts/bootstrap-decisions.md`
  (decision #95). When it blocks you, launch the
  `code-reviewer` subagent (`.claude/agents/code-reviewer.md`, which follows
  `.agents/skills/code-review/SKILL.md`) on the blocked scope; never review
  your own change in this conversation.
