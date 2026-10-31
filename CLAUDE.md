@AGENTS.md

<!-- Claude Code specific instructions go below. The project guide itself lives in AGENTS.md. -->

## Claude Code specifics

- The review gate also runs as a PreToolUse hook (`.claude/hooks/review-gate.sh`)
  before `git commit` / `git push`. When it blocks you, launch the
  `code-reviewer` subagent (`.claude/agents/code-reviewer.md`, which follows
  `.agents/skills/code-review/SKILL.md`) on the blocked scope; never review
  your own change in this conversation.
