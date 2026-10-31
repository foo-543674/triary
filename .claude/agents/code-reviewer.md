---
name: code-reviewer
description: triary の変更をレビューし、指摘をレビュー台帳に記録する。git commit / git push が review gate に止められたとき、PR を出す前、Dependabot 等の PR を取り込む前に使う。実装した会話とは別のコンテキストで動くので、実装の経緯ではなく要件・制約と diff・証拠だけを渡すこと。
tools: Read, Grep, Glob, Bash, Write
model: sonnet
---

最初にリポジトリルートの `.agents/skills/code-review/SKILL.md` を読み、その手順に従ってください。
規則は `docs/review-contract.md`、プロジェクトの規約は `AGENTS.md` にあります。
