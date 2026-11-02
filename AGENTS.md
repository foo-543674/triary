# triary project guide

A workout-logging and scoring PWA. Personal project, doubles as a programming
learning playground.

This file is the single source of project instructions for every AI tool.
`CLAUDE.md` and `GEMINI.md` import it (`@AGENTS.md`); `.cursorrules` and
`.github/copilot-instructions.md` are derived copies kept in line by hand
(NOTE: unverified whether Cursor / Copilot can import other files; we do not
rely on it).
Change this file first, then update the derived files without dropping their
tool-specific additions. The history of these decisions is in
`.contexts/bootstrap-decisions.md`.

## Architecture overview

- **Backend**: Rust + Axum + MySQL (`backend/`)
- **Frontend**: TypeScript + SolidJS + Tailwind CSS + CSS Modules, served as a
  PWA (`frontend/`)
- **DB**: MySQL 8.0. Migrations are **plain SQL** (managed via `sqlx-cli`); we
  do not use ORM model-based generation.
- **API**: Schema first. The OpenAPI definition lives under `openapi/`, and
  documentation and types are derived from it.
- **User data policy**: We do not collect personal information.
- **Authentication strategy**: Cookie + server session, same-origin delivery,
  `SameSite=Lax`. Session token is a 256-bit random; deleting the row in
  `user_sessions` revokes it immediately.

## Development workflow

- **TDD**: drive development from tests. Skip tests for things the Rust type
  system already guarantees, and lean on property-based tests
  (`proptest` / `fast-check`).
- **Vertical slice first**: prefer end-to-end thin slices over layered
  build-up. A blank-page route counts as a slice.
- **API is schema first**: write the OpenAPI definition before the
  implementation.
- **Integration tests are language agnostic** (Postman / Newman) so the test
  assets survive a future backend rewrite in another language.
- **Frontend lint / format is Biome only**. ESLint and Prettier are not used.
- **Migrations are SQL based** to avoid tightly coupling models with the DB
  schema in a running service.
- **Errors from user input are values**: `Result` / `Either`; exceptions and
  `panic!` are for bugs only.
- **Mark the verification state of statements**: when a comment, config file
  or document describes how an external tool or environment behaves, say
  whether it was observed or not. Unverified claims get `NOTE:` plus how to
  check them. Never state as fact anything that decides whether a destructive
  operation is safe. Later sessions read what is written as fact.
- **Avoid escapes** (vague boxes, stringified numeric structures, exclusive
  enums for orthogonal dimensions, premature abstraction, absorbing design
  problems in tests, exceptions for validation errors, asserting unverified
  specs, reusing old vocabulary without checking, merging things that only
  look alike, collapsing a distinction to make a conflict go away). If you
  must escape, write an ADR with why, alternatives, and a revisit trigger.

## Layer rules (enforced by architecture tests)

Backend layers and their origin (see `.contexts/architecture.md` for the
full rationale):

| Layer | Origin | One-line definition |
|---|---|---|
| `domain` | existed in the paper-ledger era | business logic that would exist even without an app |
| `application` | only exists because we built an app | persistence, transaction boundaries, authorization, logging |
| `infrastructure` | the outside world | concrete implementations of ports declared by `domain` / `application` |
| `interfaces` | external protocol boundary | HTTP / CLI adapters, DTO conversion, auth middleware |

Hard rules:
- `domain` must not import `axum`, `axum_extra`, `sqlx`, `tower`,
  `tower_http`, `tracing`, `tracing_subscriber`, `hyper`, or any other
  infrastructure crate.
- `application` must not import infrastructure crates either; it depends on
  ports defined in `domain` / `application`.
- Repository traits live in `application/ports/`; concrete implementations
  live in `infrastructure/repositories/`.
- `Clock`, `PasswordHasher` and other "real-world concept" ports live in
  `domain` (they predate the app).
- ORM-generated types (e.g. `sqlx::FromRow` rows) must not appear in the
  signatures of `domain` or `application` items.
- Forbidden structural vocabulary in type names anywhere: `Service`,
  `Manager`, `Helper`, `Util`, `Utils`, `Processor`, `Worker`, `Engine`.
  `Handler` is allowed only inside `interfaces::http`.

These rules are checked by `backend/tests/architecture.rs` (run by
`cargo nextest run` in `backend/`) and by `pnpm run arch:test` in
`frontend/`; `make arch-test` runs both through `./dev`.

## Quality lenses applied

The full lens set comes from the `foo-skills` plugin (see
`.contexts/bootstrap-decisions.md` for which `perspectives/` were selected
and why). The ones most often consulted on this project:

- **architecture**: layer origins, port placement, error boundaries
- **api-design**: HTTP status reserved for protocol concerns; errors as
  `errors[]` array (never single-error envelopes)
- **data-modeling**: typed columns (DATE, DECIMAL, INTERVAL); orthogonal
  dimensions as independent columns; no Nullable escape
- **error-handling**: `Result<_, Vec<Violation>>` (field, code) for collected validation;
  `panic!` is a bug only, never control flow
- **disposability**: external types do not appear in `domain` / `application`
  signatures
- **testing**: test names describe behavior; cover 0, 1, N-1, N, N+1; mock
  external dependencies only
- **functional**: pure core, impure shell; high-order functions over
  imperative loops; `Option` / `Result` over `null`
- **component / state-design**: state lives outside presentational
  components; discriminated unions over flag soup
- **naming**: `get` is pure, `fetch` does I/O; one concept one word
- **readability**: nesting <= 3, function <= 50 lines; guard clauses up front
- **debugging**: ask "since when / triggered by what" first; separate observed
  facts from guesses ("unverified:"); observe logs and diffs yourself before
  reasoning about specs
- **security**: parameterized queries; resource ownership check on every
  protected endpoint; argon2id for passwords

## Quality gates

The remote CI is a backstop, not the first feedback loop. Run the checks for
every task type you touched before pushing. If you get the same category of
finding twice in a row, stop fixing one by one and sweep the whole codebase
for that category.

### Minimum check set per task type

| Task type | Minimum checks |
|---|---|
| backend change | in `backend/`: `../dev cargo fmt --all -- --check` + `../dev cargo clippy --all-targets --all-features` + `../dev cargo nextest run` (includes the architecture tests) |
| frontend change | in `frontend/`: `../dev pnpm run lint:ci` + `../dev pnpm run typecheck` + `../dev pnpm run test:run` + `../dev pnpm run arch:test` (+ `../dev pnpm run build-storybook` when stories or Storybook config change) |
| review gate tool (`tools/review-gate/`) | `make gate-test` |
| dev entrypoint (`dev`, `tools/dev-image/`) | `make dev-test` (the image itself is built and checked by `.github/workflows/dev-image.yml` on the PR) |
| docs / design docs (`.contexts/`, `docs/`) | grep the related documents for the same terms (HTTP status, field names, error codes) and make them agree |
| OpenAPI (`openapi/`) | `./dev npx -y @stoplight/spectral-cli lint openapi/openapi.yaml` + `make api-generate` + check the referencing docs and handlers |
| DB migration | `make db-migrate-test` + `make db-prepare` + re-run the backend tests |

### Review gate (commit / push are stopped by hooks)

`git commit` and `git push` are guarded by the git hooks in `.githooks/`
(enable once per clone with `make hooks-install`; the devcontainer does it
for you) and by the Claude Code hook `.claude/hooks/review-gate.sh`. The rules
are in `docs/review-contract.md`. When a hook stops you, do this and **do not
bypass it**:

1. Deterministic gate failure (format / lint / types / tests / architecture
   tests): fix it on the spot and retry.
2. "no review recorded": have a reviewer in a **separate context** review the
   target diff following `.agents/skills/code-review/SKILL.md` (Claude Code:
   the `code-reviewer` subagent; Codex: a separate session; other tools: a
   separate session or the human). `commit` reviews the staged diff, `push`
   reviews the diff against `origin/main`. Findings go into the review ledger
   with IDs. Only the reviewer changes the ledger; writing or editing it by
   hand is forbidden.
3. Fix findings and hand the reviewer evidence (tests etc.); a changed diff
   needs a new round. How findings are dispositioned, escalated, re-reviewed
   and when a change counts as complete is defined in
   `docs/review-contract.md`; follow it rather than this summary. When an
   Important finding is rejected or deferred, also write the reason in the
   commit message body (the ledger is not tracked).

Forbidden: `--no-verify` / `-n`, changing `core.hooksPath`, disabling or
weakening a hook, hand-written review records, `git commit -a` (stage
explicitly so the reviewed diff is what gets committed). Steps marked
`# DO NOT REMOVE OR WEAKEN:` must stay: treating "not reviewed" as success
turns the gate into a no-op. Review output is LLM-based and
non-deterministic; settle doubtful findings with evidence (tests,
counterexamples, specs), not by re-running. Never relax rules, acceptance
criteria or verifiers just to close a finding.

### PR acceptance (remote)

The remote does not review again. After pushing, post the review ledger
snapshot to the PR as a comment:

```bash
sh tools/review-gate/gate.sh snapshot --pr <number> [--decisions "#12,#15"] --output .git/review-ledger/snapshot.md
gh pr comment <number> --body-file .git/review-ledger/snapshot.md
```

`--decisions` lists the unresolved decision requests this change depends on.
The protected workflow `.github/workflows/acceptance.yml` then publishes the
`acceptance / verdict` status. What it checks and through which path is
defined in `docs/remote-acceptance.md`. If it fails, fix the cause (missing or
stale snapshot, gate failure, unapproved base-file change) and resubmit. Never
weaken the verifier, CODEOWNERS or the ruleset to get through.

Whether GitHub actually blocks merges right now is recorded only in
`docs/remote-acceptance.md` ("マージを止められるか"); read it there instead of
relying on a copy. Until it says rulesets block the merge: treat a passing
verdict as "machine checks passed", not as human approval or an acceptance
guarantee, never approve PRs yourself (the verifier's automerge job below is
not you), and keep to the merge conditions below as discipline.

#### Merging without human approval

`docs/remote-acceptance.md` ("人間の承認なしでマージしてよい変更") is the
source. Two classes merge without human approval once the verdict passes:
Dependabot's Rust / npm dependency updates (owner decision in #43), and
changes by the AI (`foo-543674-ai-agent[bot]`) against `main` that touch no
base file in `.github/CODEOWNERS` (owner decision 2026-11-01: quality comes
from the review gate and the scripted guardrails, not from a human reading
every PR). For those, the protected `acceptance / automerge` job in
`.github/workflows/acceptance.yml` approves as GitHub Actions and enables
auto-merge. Changes to base files (the rules, verifiers and guardrails that
bind the AI, plus the CI configuration listed in `ai-change.ts` and the
manifest parts other than the dependency lists), new npm packages, package
versions younger than the cooldown, and GitHub Actions updates still need the
owner's approval. The owner can hold a PR back
with the `hold-merge` label (reliable only before its verdict passes).
UI review: the owner looks only at new screens and large layout changes.
The verifier detects a new screen (an added route module); when opening a
PR, judge whether it is a large layout change and, if so, open it with the
`needs-ui-review` label (`gh pr create --label needs-ui-review`) so it waits
for the owner's `ui-reviewed` label. Add the label at creation: once the
verdict passes, auto-merge is too fast to stop. Do not add `ui-reviewed`
yourself (it only counts when the owner adds it). The
"Stop and confirm first" items below do not stop a merge by themselves: list
their decision issue in the snapshot's `decisions` so the open issue holds
the PR. The AI never approves
or merges a PR itself; the rules below are about what the AI may propose, and
about checking what the job did.

So the AI's job does not end at opening a PR: drive it to the merge. Keep the
verdict green (fix CI, post a fresh snapshot after every push), and for a PR
stack, after each merge update the next PR onto `main`, have its diff
reviewed again and post its snapshot. Branches need not be up to date
before merging (owner decision 2026-11-02, `docs/remote-acceptance.md`):
do not update a PR just because `main` moved. When a PR that changes
`docs/review-contract.md` or `tools/review-gate/` (what the snapshot's
`contractVersion` covers) merges, re-run the verdict of every open PR
(`workflow_dispatch` of `acceptance.yml` with the PR number) so they are
judged under the new contract. When other rules change (this file, the
other contracts, workflows), look through the open PRs yourself and
re-review or fix the ones the new rule affects; fixing after the merge is
fine. Check the daily CI run on `main` for breakage that only the
combination of PRs causes.

- Never activate a revision of the conditions yourself, including one that
  narrows the scope. Propose it and get human approval. The only thing you
  may do immediately is pause approval-free merging without changing the
  conditions.
- Your own claim that a change is in scope is not evidence; collect the
  evidence the conditions name.
- Until the full ruleset is verified, GitHub does not check the verdict for
  you: do not ask for a merge (and never merge yourself) when the verdict
  fails, evidence is missing, a decision it depends on is open, or a
  condition revision is unapproved, even if an approval exists. Never push to
  `main` directly instead.
- List what the automerge job merged in your status report (change,
  condition version, verification evidence, open items, how to revert).
  Report serious incidents immediately.
- Do not mix changes that need approval with changes that merge without it in
  one PR: the whole PR then needs approval. Split the part that needs approval
  into its own PR.

#### Opening PRs and asking for approval

Ask for a human approval in a form the human can judge on the spot from the
PR alone. Do not make the human look up or remember the premises.

- **Make one PR depend on another only when its content really depends on
  it.** Work whose content is independent branches from `main`, not from the
  previous work branch. A needless dependency hides the diff to look at and
  makes the human manage the approval order.
- When the content does depend on an unmerged PR, first try to break the
  dependency (land the shared part as a small independent PR, split
  differently). If you cannot, stack the PR on that PR's branch and open it;
  do not keep the work only locally.
- A stacked PR shows only its own diff (its base is the lower PR's branch),
  and its description says what it depends on and what to look at. After the
  lower PR merges, the AI retargets the base, re-verifies and keeps the merge
  order.
- **Ask a human to approve only PRs that can be judged on their own right
  now.** Do not hand the human conditional asks ("approve #yy after #zz
  merges", "approve in N days"). The AI and the machinery (Dependabot
  cooldowns, the verifier, auto-merge) hold order and waiting conditions, and
  the PR goes into an ask only once they are met. A change waiting on a
  condition is still opened, as a Draft, with what it waits for in the
  description; holding it back removes the human's chance to notice whether
  it is needed at all. A Draft is not an ask; the AI takes it out of Draft
  and asks once the condition is met.
- **Before asking, check yourself that every check on the current HEAD has
  completed and passed** (`gh pr checks`). If one failed, find the cause in
  the log and fix it first; never make the human investigate a failing check.
- If a failure the AI cannot fix remains (a UI diff that needs a human, an
  outage), the ask says which check fails, why, why the AI cannot fix it, how
  it affects mergeability, and what the human should do. Do not ask for
  approval on a PR with a failure you cannot explain.
- The ask names the places in the diff that need the human's judgement
  (file, line, setting key) and why they need approval (which condition they
  hit). Do not make the human read the parts that merge without approval.

## AI delegation scope

### Decide and proceed without asking

- Implementation details (function/variable names, algorithm choice, library
  internals)
- Adding / fixing tests (not relaxing the expected values of acceptance tests)
- Refactoring within the green-test envelope
- lint / format fixes
- Updating in-line documentation and comments, and descriptions of the
  current state

Revising rules, acceptance criteria or verifiers (this file, the contracts in
`docs/`, architecture tests, hooks, CI, `.claude/settings.json`) is not part
of normal work authority. No revision authority is delegated yet: propose the
change with its grounds and scope, keep the history of earlier verdicts, and
get it approved through the usual PR review (these are base files under
CODEOWNERS).

### Do it yourself (never ask the human to run it)

Read-only and verification commands allowed in `.claude/settings.json` are
yours to run: logs and results (`gh run list`, `gh run view --log-failed`,
`gh pr view`, `gh issue view`), repository state (`git log`, `git diff`,
`git status`, `git show`), code search, tests / lint / type checks. Decide the
next step from the result yourself. Ask the human only for interactive
authentication, destructive production operations, or commands that are not
allowed.

### How to run commands (so no confirmation prompt stops the work)

Running a command that is not allowed waits for a human confirmation and
stops the whole session; the human is usually away, so one prompt costs one
round trip. Run commands in a form the allow rules match:

- Create and edit files with the AI tool's file editing (Claude Code: Edit /
  Write), not with `sed -i`, `awk`, `perl -i`, redirects (`>`, `>>`) or
  heredocs.
- Read and search files with the AI tool's read / search features or with a
  single allowed command.
- One command per call. Do not chain with `&&`, `;`, `|`, `$(...)` or
  `cd ... &&`: the allow rules are matched against each chained command, and
  one unallowed part (`cd`, `head`, `xargs`, ...) stops the whole call. Pass
  paths as arguments instead of `cd`.
- When you need a command that is not allowed, first look for an allowed way
  (the `./dev` entrypoint, the AI tool's features). If none exists and you
  need it repeatedly, file adding it to `.claude/settings.json` as a decision
  request and go on with work that does not need it. Do not run a command you
  know will prompt.

### Asking for decisions

Do not hand a decision back just because something is undefined. Make the
best call from what we want, what we want to avoid, and the current evidence.
Ask the human only when the delegated scope cannot decide: goals conflict and
evidence cannot settle it, a permission is missing, the uncertainty cannot be
resolved within acceptable cost / time / impact, or a rule / acceptance
criterion / verifier has to be revised.

Before handing a decision back, check that you can say which of these
conditions it meets and what in the situation made it so. If you cannot, it
is not a place to stop: decide yourself, go on, and leave the decision and
its reason in the PR description or similar.

**Design the asks so they need few round trips.** Do not send decisions and
human-only tasks (settings, authentication, granting permissions, commands
the AI cannot run) one by one as you notice them; collect them first and
hand them over together, with:

- the list of what the human does (order, dependencies, what can run in
  parallel), including checks the human can run, with their results to send
  back in one go
- where the conflict is that needs the human's judgement (references to the
  decision requests)
- how far things must get for the AI to resume, and what to send back then
- if round trips remain where the next step depends on a result, what each
  round trip checks and how many to expect; if it looks like more, say so
  with the reason and the new estimate as soon as you notice

**Asking does not stop the work.** The human is often away.

1. Move ahead with work that does not depend on the decision. A pending PR
   merge is also a pending decision: do not wait for it. When the next work
   depends on that PR, follow "Opening PRs and asking for approval" (stack
   only when the content depends on it).
2. Build the dependent part as a small, easy-to-replace provisional version.
   Make it visibly provisional in the code and note how to replace it.
3. Each time you stack more on a provisional version, re-check the
   replacement cost. If it would exceed about one working day of rework,
   switch to independent work instead. When no safe work is left, report that
   and wait.
4. File the decision request in the **decision queue: GitHub Issues with the
   label `needs-decision`**. One issue per decision with: the question, why
   you stopped (which condition above it meets and what in the situation made
   it so), the perspective to decide on (what to weigh against what),
   options with a recommendation and its reason, what you built provisionally,
   the replacement cost, what is blocked on it (which PR merge, etc.), and its
   premises (target version, facts relied on). Order open requests by impact
   so the human can answer them together when back. Update the issue when
   premises, recommendation or cost change; close stale ones with a note.
5. Every status report lists the open decisions and the PRs waiting for an
   approval, each in a form that can be judged on its own (check status, what
   to look at), so the human can answer in one go. Draft PRs waiting on a
   condition are listed separately as "waiting" (what they wait for, when it
   is likely met); they ask nothing of the human.
6. When a ruling arrives, check that its premises still hold before applying
   it. After replacing the provisional version and getting the replacement
   reviewed, record the ruling and close the issue.

Do not do these before the ruling: irreversible operations, anything that
affects the user's working environment, external effects (publishing,
sending, deploying, production), relaxing rules / acceptance criteria /
verifiers. Commits and pushes to work branches and filing decision requests
are fine. Read from the workflow trigger definitions on 2026-10-31 (not
observed by running them): pushing a branch with no PR triggers no workflow;
opening or updating a PR runs CI, the acceptance verifier (once
`acceptance.yml` is on `main`) and a Storybook preview publish to Chromatic
(`.github/workflows/chromatic.yml`). Nothing is deployed to production.
Re-check this when a deploy workflow is added. A change with an open decision
it depends on is not complete; do not merge it as provisional, even where
GitHub would not stop you.

### Stop and confirm first (file it as above and keep working)

- Adding a new npm package (its install-time scripts are not guarded yet).
  Cargo crates and version updates of existing packages need no
  confirmation as long as the vetting and ledger procedure in
  `docs/dependency-policy.md` is followed (#65, owner decision 2026-11-01);
  the verifier still sends young versions to the owner
- Operations that affect the user's working environment (stopping or
  recreating containers, deleting volumes, rewriting branch history). Before
  deciding "it's only for verification", observe whether you actually started
  it yourself
- Changes to layer structure or architecture rules
- Breaking changes to the OpenAPI schema or any `/api/v1/*` endpoint
- Authentication / authorization / cryptography decisions
- Anything in `.contexts/*.md` (rewriting design decisions)
- Ambiguous requirements
- Narrowing an agreed scope. Finish the agreed scope first and then ask
  whether to narrow it; read a vague "not needed now" as a comment on the
  means, not as dropping the feature

## Design artifacts: who owns what

Each artifact owns exactly one area. **Reference other artifacts; never copy
their content.** Copies drift, and reviews fill up with drift findings.

| Phase | Artifact | Owns (write it only here) | Format |
|---|---|---|---|
| Requirements | `.contexts/requirements.md`, `.contexts/specification.md` | what we want, acceptance criteria, boundary values | prose (`.md`) |
| Principles / rules | this file, `docs/review-contract.md`, `docs/remote-acceptance.md` | rules that bind the whole project | prose (`.md`) |
| Design: API contract | `openapi/openapi.yaml` | endpoints, requests / responses, error codes | OpenAPI; `.contexts/api-design.md` only adds rationale |
| Design: persistence | `backend/migrations/*.sql` | tables, columns, constraints, DDL | SQL; `.contexts/data-model.md` only adds rationale |
| Design: structure | `.contexts/architecture.md` | layers, aggregates, dependency direction | prose + architecture tests |
| Plan | `.contexts/implementation-plan.md` | slice order, task dependencies, per-PR scope and DoD **only** | `.md` with bare references to the other artifacts |
| Implementation | code + tests (incl. Newman) | proof that the requirements are met | code |

The implementation plan says only what, in which order, and how far. SQL,
response examples, error codes, boundary values and preset data belong to the
design artifacts; methodology, PR flow, review protocol, quality gates and the
CI / review split belong here. If you find a gap in methodology, fix this file
(and report it to foo-skills if its raw material could have prevented it).

The three planning levels differ in purpose, not size:

| Level | Optimizes for | Rule of thumb |
|---|---|---|
| Slice | value a user can recognize (a user story) | one end-to-end path works |
| Task | manageable development unit, no context switching | about a day |
| PR | ease of review | 3–5 files for a human; settles within 3 AI review rounds |

One slice = N tasks, one task = M PRs. Do not shortcut "task = PR".

## Natural language

| Where | Language |
|---|---|
| Design docs and contracts (`.contexts/`, `docs/`, ADRs) | Japanese (file names in English) |
| This file, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md`, `README.md` | English (existing style) |
| Source code, code comments, identifiers, file names | **English only** |
| Commit messages (subject / body / trailers) | **English only** |
| Issues, PR titles and descriptions | Japanese or English |

Japanese conversations, issues or PR descriptions never change the
"English only" rows.

## Commit convention

### Prefix

| prefix | use |
|---|---|
| `[feat]` | new feature |
| `[fix]` | bug fix |
| `[update]` | enhancement to an existing feature |
| `[improve]` | non-functional improvement (perf, DX, ...) |
| `[refactor]` | structural change without behavior change |
| `[chore]` | maintenance (deps, version bumps, ...) |
| `[docs]` | documentation only |
| `[test]` | tests only |
| `[style]` | formatting / style only |

### Language

Subject, body and trailers are **English only**, even when the conversation
or the issue is in Japanese.

### Granularity

- Stage by intent, not by file. One commit, one purpose.
- Do not mix unrelated changes (e.g. a feature commit also bumping deps).
- Split by intent while addressing review findings too: fix, verify, commit,
  then the next category. Do not bundle by round or by time.
- Before committing, run the minimum check set for the task type (see
  "Quality gates"); the hooks enforce the deterministic part and the review
  gate.

## Common commands

Language toolchains (cargo, sqlx, node packages, pnpm, ...) live only in the
dev image (`tools/dev-image/Dockerfile`). Run every language command through
the `./dev` entrypoint at the repository root (`../dev` from `backend/` or
`frontend/`); the hooks, the `Makefile` and CI do the same. Do not install a
toolchain on your machine or in the AI execution environment to work around a failing `./dev`;
fix the entrypoint or the image instead. Do not run the toolchains directly
either, even where they happen to be installed; `.claude/settings.json`
denies them and allows `./dev` / `../dev` instead. Why:
`.contexts/bootstrap-decisions.md` "2026-10-31 再実行 (3.0.1)".

What handles the repository itself (the git hooks, the Claude Code hooks, the
review gate `tools/review-gate/gate.sh` and its tests) needs only git and a
POSIX shell, so a bare clone can commit and push with docker or podman as the
only extra; nothing there may require Node, Python, jq or the project's
languages. Gates prepare what they need (e.g. the frontend dependencies)
instead of asking for it. Why: `.contexts/bootstrap-decisions.md`
"2026-11-01 再実行 (3.1.0)".

"(in `backend/`)" means: run it from that directory, changing into it with
its own `cd` call first, not chained with `&&` ("How to run commands").
`./dev bash -c '...'` below is one command for the allow rules; chaining
inside it is fine.

| Command | Purpose |
|---|---|
| `make help` | List available make targets |
| `make infra-up` | Start local infra (MySQL dev/test) |
| `make infra-down` | Stop local infra |
| `make infra-reset` | Reset data volumes and restart |
| `make db-migrate` | Apply migrations to the development DB |
| `make db-migrate-test` | Apply migrations to the test DB |
| `make db-prepare` | Regenerate sqlx offline metadata |
| `make api-generate` | Regenerate frontend types from OpenAPI |
| `../dev cargo nextest run` (in `backend/`) | Rust unit + architecture tests |
| `../dev cargo clippy --all-targets` (in `backend/`) | Rust lint |
| `../dev cargo fmt --all` (in `backend/`) | Rust format |
| `../dev pnpm install` (in `frontend/`) | Install frontend dependencies (needed before the `pnpm run` commands below; the hooks install them themselves) |
| `../dev pnpm run lint:ci` (in `frontend/`) | Biome lint + format check |
| `../dev pnpm run typecheck` (in `frontend/`) | TypeScript type check |
| `../dev pnpm run test:run` (in `frontend/`) | Frontend unit tests |
| `../dev pnpm run arch:test` (in `frontend/`) | Frontend architecture tests (dependency-cruiser) |
| `make arch-test` | Architecture tests for both backend and frontend |
| `make hooks-install` | Enable the review-gate git hooks (`.githooks/`) in this clone |
| `make gate-test` | Test the review gate (git + sh) and the remote verifier's TypeScript (in the dev image) |
| `make dev-test` | Type-check and test the `./dev` entrypoint (in the dev image) |
| `./dev <command>` | Run a command through the POSIX sh entrypoint (rootless Podman, including single-UID mode, or docker; directly inside the dev image). Image tag calculation requires host `sha256sum` or `shasum`. NOTE: the devcontainer build remains unverified; rebuild and open it to check (#56). Each non-direct call starts a container; chain several commands in one `./dev bash -c '...'` when that matters |
| `./dev --image-ref` | Print the image this checkout uses (tag = hash of `tools/dev-image/Dockerfile`; published from `main` by `.github/workflows/dev-image.yml`) |
| `sh tools/review-gate/gate.sh check --scope commit` | Ask the review gate whether the staged diff may be committed |
| `../dev pnpm run dev` (in `frontend/`) | Frontend dev server. NOTE: unverified (not opened from a browser through `./dev`). For rootless Podman networking, see the networking comment in `dev`; under docker `make run-frontend` publishes it on the host's `127.0.0.1:3000` and reaches the backend started by `make run-backend` by name (`TRIARY_DEV_PUBLISH` / `TRIARY_DEV_NAME` in `./dev`; README "Setup"). Use the make targets to run the app |

## devcontainer and local infra

The devcontainer and local infrastructure are **loosely coupled**. The
devcontainer starts on its own and reaches MySQL through `triary-network`
(declared `external: true`). When the work in front of you does not need a
database, you do not have to run `make infra-up`.

## Reference documents

- `.contexts/concept.md`: project concept and product background
- `.contexts/requirements.md`: functional and non-functional requirements
- `.contexts/specification.md`: user stories and acceptance criteria
- `.contexts/architecture.md`: layer/aggregate/CQRS decisions, ADRs
- `.contexts/api-design.md`: HTTP API contract
- `.contexts/data-model.md`: persistence model, ID strategy, indexes
- `.contexts/implementation-plan.md`: slice ordering, Phase 0 setup, per-slice
  scope / prerequisites / task breakdown / DoD — start here when you're told
  "implement the next thing"
- `.contexts/setup-plan.md`: environment build plan
- `.contexts/bootstrap-decisions.md`: AI context bootstrap decisions
- `.contexts/security-overrides.md`: ledger for the pnpm.overrides patches
- `docs/dependency-policy.md`: supply-chain rules for adding crates / npm
  packages and which approvals exist; the vetting records are in
  `docs/dependency-ledger.md`
- `openapi/openapi.yaml`: OpenAPI schema (the source of truth for the API)
- `docs/review-contract.md`: how review findings are recorded and when a
  change is complete
- `docs/remote-acceptance.md`: remote acceptance, protected base files,
  merging without human approval
- `.agents/skills/code-review/SKILL.md`: the review procedure every reviewer
  follows

## Design principles (when in doubt)

- Layer by **origin** of the concern, not by a Clean-Architecture template.
- A vocabulary word used as a structural concept must pass the
  "verb + object responsibility in one sentence" test. Banned: `Service`,
  `Manager`, `Helper`, `Util`, `Utils`, `Processor`, `Worker`, `Engine`.
- Avoid escape patterns: vague boxes for unknowns, stringifying numeric
  structures, exhaustive enums for orthogonal dimensions, premature
  abstractions. If you must escape, leave a note in `.contexts/` saying why.
- Disposability: every external dependency should have an isolation strategy
  (wrapper / import-restriction / layer separation / coexistence).
- Tech-stack changes go through a doc under `.contexts/` first.
