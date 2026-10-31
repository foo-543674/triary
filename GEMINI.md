@AGENTS.md

<!-- Gemini CLI specific instructions go below. The project guide itself lives in AGENTS.md. -->

## Gemini CLI specifics

- This repository configures no Gemini CLI hooks (Gemini CLI does support
  hooks; none are set up here). The git hooks in `.githooks/` still stop
  unreviewed changes. When they do, have a separate
  session review the diff following `.agents/skills/code-review/SKILL.md`
  and record the round before retrying. If no separate context is available,
  treat the review as not done.
