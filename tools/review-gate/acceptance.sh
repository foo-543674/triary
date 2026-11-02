#!/usr/bin/env bash
# Remote acceptance verifier. Runs from the protected base checkout in
# .github/workflows/acceptance.yml and NEVER executes code from the PR.
# Contract: docs/remote-acceptance.md.
#
# Inputs (env): GH_TOKEN, REPO (owner/name), PR (number), RUN_URL,
#               SNAPSHOT_FILE (where to store the snapshot used),
#               GITHUB_STEP_SUMMARY, DRY_RUN=1 (print statuses instead of posting).
set -Eeuo pipefail

STATUS_CONTEXT="acceptance / verdict"
ALLOWED_SNAPSHOT_AUTHORS='["foo-543674-ai-agent[bot]","foo-543674"]'
REQUIRED_JOBS='[
  "backend / lint (fmt + clippy)",
  "backend / test (nextest)",
  "backend / build (release)",
  "frontend / lint (biome ci)",
  "frontend / test (vitest + storybook smoke)",
  "frontend / build (vite)",
  "openapi / spectral lint",
  "security / cargo audit",
  "security / cargo deny",
  "security / pnpm audit"
]'
CLI=(node tools/review-gate/src/cli.ts)
# The ledger verdict, hashes and snapshots: the same POSIX sh code the git
# hooks use (gate.sh), so local and remote judge with one implementation.
GATE=(sh tools/review-gate/gate.sh)

post_status() {
  local state="$1" description="$2"
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "[dry-run] status $state: ${description:0:140}"
    return
  fi
  gh api -X POST "repos/$REPO/statuses/$HEAD_SHA" \
    -f state="$state" -f context="$STATUS_CONTEXT" \
    -f description="${description:0:140}" -f target_url="$RUN_URL" >/dev/null
}

verifier_warning() {
  local message="verifier warning: $1; treated as $2; next: inspect the run log ($RUN_URL)"
  echo "$message" >&2
  printf '\n%s\n' "$message" >>"$GITHUB_STEP_SUMMARY"
}

verifier_error() {
  trap - ERR
  local message="verifier error: $*; next: inspect the run log ($RUN_URL), repair the verifier or API access, then re-run"
  echo "$message" >&2
  printf '\n### verifier error\n\n%s\n' "$message" >>"$GITHUB_STEP_SUMMARY" || true
  if [[ -n "${HEAD_SHA:-}" ]]; then
    post_status failure "$message" || true
  fi
  exit 2
}

# DO NOT REMOVE OR WEAKEN: an unexpected error must end as a failing status,
# never as a silently missing or pending one. Before HEAD is known, the run
# log and summary report the error; no commit status can be addressed yet.
trap 'error_status=$?; if (( BASH_SUBSHELL == 0 )); then verifier_error "unexpected command failure (exit $error_status) at line $LINENO"; else exit 2; fi' ERR

pr_json="$(gh api "repos/$REPO/pulls/$PR")"
HEAD_SHA="$(jq -r .head.sha <<<"$pr_json")"
BASE_REF="$(jq -r .base.ref <<<"$pr_json")"

pr_state="$(jq -r .state <<<"$pr_json")"
if [[ "$pr_state" != "open" ]]; then
  echo "PR #$PR is not open; nothing to judge."
  exit 0
fi

post_status pending "verifying"

# --- the target version -------------------------------------------------------
# Objects only: fetching does not execute anything from the PR.
git fetch --quiet --no-tags origin "$BASE_REF" "+refs/pull/$PR/head:refs/remotes/pr/head"
BASE_SHA="$(git rev-parse "origin/$BASE_REF")"
fetched_head="$(git rev-parse refs/remotes/pr/head)"
[[ "$fetched_head" == "$HEAD_SHA" ]] || {
  post_status pending "PR head moved while verifying; will re-run"
  exit 0
}
MERGE_BASE="$(git merge-base "$BASE_SHA" "$HEAD_SHA")"
changed_lines="$(gh api --paginate "repos/$REPO/pulls/$PR/files?per_page=100" \
  -q '.[] | .filename, (.previous_filename // empty)')"
mapfile -t changed <<<"$changed_lines"
# Files the change adds, from the judged range itself (step 5: a new screen
# waits for the owner's look).
added_lines="$(git diff --name-only --diff-filter=A "$MERGE_BASE" "$HEAD_SHA")"
mapfile -t added <<<"$added_lines"

# --- 0. is this a dependency update that needs no review ledger? -------------------
# Dependency updates that merge without human approval (#43, owner decision;
# contract: docs/remote-acceptance.md "人間の承認なしでマージしてよい変更").
# DO NOT REMOVE OR WEAKEN: the rules live in tools/review-gate/src/dependency.ts
# (author, files, and every commit authored by Dependabot, committed and signed
# by GitHub). The compare range ends at HEAD_SHA, so the answer is about the
# judged head even if the PR moves meanwhile. Any failure means "not a
# dependency update", i.e. the normal path with a review ledger.
# dependabot_authored: every commit is Dependabot's own whatever the files
# (e.g. GitHub Actions pins); it only drops the snapshot requirement (step 2).
compare_file="$(mktemp)"
dependency_update=false
dependabot_authored=false
if gh api "repos/$REPO/compare/$MERGE_BASE...$HEAD_SHA" >"$compare_file"; then
  pr_author="$(jq -r .user.login <<<"$pr_json")"
  classification="$("${CLI[@]}" classify-dependency --pr-author "$pr_author" \
    --head "$HEAD_SHA" --compare-file "$compare_file" || {
      verifier_warning "classify-dependency failed" "not a dependency update (normal path with a review ledger)"
      echo '{}'
    })"
  dependency_update="$(jq -r 'if .dependencyUpdate == true then "true" else "false" end' <<<"$classification")"
  dependabot_authored="$(jq -r 'if .dependabotAuthored == true then "true" else "false" end' <<<"$classification")"
  jq -r '.reasons[]? | "not a dependency update: " + .' <<<"$classification"
else
  verifier_warning "compare API request failed" "not a dependency update (normal path with a review ledger)"
fi
DIFF_HASH="$("${GATE[@]}" range-hash --from "$MERGE_BASE" --to "$HEAD_SHA")"
CONTRACT_VERSION="$("${GATE[@]}" contract-version --base HEAD)"

reasons=()
awaiting=()

# --- 1. deterministic gates ran on this version and succeeded -------------------
# DO NOT REMOVE OR WEAKEN: a skipped / neutral / missing job is not a success.
# Only runs of the CI workflow file in this repository for this exact SHA count.
ci_run="$(gh api "repos/$REPO/actions/runs?head_sha=$HEAD_SHA&event=pull_request&per_page=50" |
  jq --arg repo "$REPO" '[.workflow_runs[]
      | select(.path == ".github/workflows/ci.yml" and .repository.full_name == $repo)]
    | sort_by(.run_number) | last // empty')"
ci_state="missing"
ci_status=""
if [[ -n "$ci_run" ]]; then ci_status="$(jq -r .status <<<"$ci_run")"; fi
if [[ -z "$ci_run" ]]; then
  reasons+=("CI: no run for $HEAD_SHA; next: run CI for this HEAD and wait for completion")
elif [[ "$ci_status" != "completed" ]]; then
  post_status pending "waiting for CI to complete on ${HEAD_SHA:0:7}"
  echo "CI still running; the workflow_run trigger will re-run this verifier."
  exit 0
else
  ci_id="$(jq -r .id <<<"$ci_run")"
  jobs="$(gh api "repos/$REPO/actions/runs/$ci_id/jobs?per_page=100" | jq '.jobs')"
  bad_job_lines="$(jq -r --argjson required "$REQUIRED_JOBS" '
      . as $jobs
      | ($required[] as $name
          | ($jobs | map(select(.name == $name)) | first) as $job
          | if $job == null then "\($name): missing"
            elif $job.conclusion != "success" then "\($name): \($job.conclusion)"
            else empty end),
        (($jobs | map(select(.name == "integration / newman")) | first) as $newman
          | ($jobs | map(select(.name == "integration / detect")) | first) as $detect
          | if $newman == null then empty
            elif $newman.conclusion == "success" then empty
            elif $newman.conclusion == "skipped" and $detect != null and $detect.conclusion == "success" then empty
            else "integration / newman: \($newman.conclusion)" end)' <<<"$jobs")"
  bad_jobs=()
  if [[ -n "$bad_job_lines" ]]; then mapfile -t bad_jobs <<<"$bad_job_lines"; fi
  if [[ ${#bad_jobs[@]} -eq 0 ]]; then
    ci_state="passed"
  else
    ci_state="failed"
    for job in "${bad_jobs[@]}"; do
      reasons+=("CI: $job; next: fix or re-run the required job and wait for CI success")
    done
  fi
fi

# --- 2. review ledger snapshot matches this version and meets the contract -------
# DO NOT REMOVE OR WEAKEN: no snapshot / broken snapshot / stale snapshot fails.
# The only exception is a PR whose every commit is Dependabot's own, as decided
# in step 0 (#43; extended to every Dependabot ecosystem by owner decision
# 2026-11-01, provisional). No AI wrote it, so there is no AI review to bind.
# Base files it touches (e.g. workflows) still need the code owner (step 4).
# gate.sh accept prints reason / decision / content-hash lines (tab-separated)
# and exits 1 when the snapshot fails the contract; anything else is a
# verifier failure, never a pass.
snapshot_lines=""
snapshot_hash="none"
if [[ "$dependabot_authored" == "true" ]]; then
  : >"$SNAPSHOT_FILE"
  review_state="not required (Dependabot's own commits)"
else
gh api --paginate "repos/$REPO/issues/$PR/comments?per_page=100" |
  jq -rs --argjson allowed "$ALLOWED_SNAPSHOT_AUTHORS" '
    [.[][] | select((.user.login as $u | $allowed | index($u)) and (.body | contains("<!-- triary-review-snapshot -->")))]
    | sort_by(.created_at) | last | .body // ""' >"$SNAPSHOT_FILE"
accept_status=0
snapshot_lines="$("${GATE[@]}" accept --snapshot-file "$SNAPSHOT_FILE" \
  --repo "$REPO" --pr "$PR" --head "$HEAD_SHA" \
  --merge-base "$MERGE_BASE" --diff-hash "$DIFF_HASH" --contract-version "$CONTRACT_VERSION")" || accept_status=$?
[[ "$accept_status" -le 1 ]] || verifier_error "gate.sh accept exited $accept_status"
snapshot_reason_lines="$(awk -F '\t' '$1 == "reason" { print $2 }' <<<"$snapshot_lines")"
snapshot_reasons=()
if [[ -n "$snapshot_reason_lines" ]]; then mapfile -t snapshot_reasons <<<"$snapshot_reason_lines"; fi
[[ ${#snapshot_reasons[@]} -gt 0 ]] && reasons+=("${snapshot_reasons[@]/#/review snapshot: }")
snapshot_hash="$(awk -F '\t' '$1 == "content-hash" { print $2 }' <<<"$snapshot_lines")"
if [[ ${#snapshot_reasons[@]} -eq 0 ]]; then review_state="passed"; else review_state="failed"; fi
fi

# --- 3. no unresolved decision request this change depends on --------------------
decision_lines="$(awk -F '\t' '$1 == "decision" { print $2 }' <<<"$snapshot_lines" | sort -u)"
while read -r ref; do
  [[ -z "$ref" ]] && continue
  number="${ref#\#}"
  if ! [[ "$number" =~ ^[0-9]+$ ]]; then
    reasons+=("decision: reference $ref is not an issue number; next: correct the reference and post a fresh snapshot with gate.sh snapshot")
    continue
  fi
  state="$(gh api "repos/$REPO/issues/$number" -q .state 2>/dev/null || echo missing)"
  [[ "$state" == "closed" ]] || awaiting+=("#$number ($state)")
done <<<"$decision_lines"
[[ ${#awaiting[@]} -gt 0 ]] && reasons+=("decision: awaiting human decision: ${awaiting[*]}; next: answer and close these decision issues, then re-run the verifier")

# --- 4. base files changed -> human approval required (enforced by the ruleset) ---
owned_pattern_lines="$(awk '!/^[[:space:]]*(#|$)/ {print $1}' .github/CODEOWNERS)"
owned_patterns=()
if [[ -n "$owned_pattern_lines" ]]; then mapfile -t owned_patterns <<<"$owned_pattern_lines"; fi
base_changes=()
for file in "${changed[@]}"; do
  for pattern in "${owned_patterns[@]}"; do
    prefix="${pattern#/}"
    if [[ "$file" == "$prefix" || ( "$prefix" == */ && "$file" == "$prefix"* ) ]]; then
      base_changes+=("$file")
      break
    fi
  done
done

# --- supply-chain check before merging without approval -------------------------
# Manifest parts outside the dependency lists, new npm packages, and package
# versions younger than the cooldown send the change to a human (contract:
# docs/dependency-policy.md, docs/remote-acceptance.md). Reads crates.io and the
# npm registry. DO NOT REMOVE OR WEAKEN: any failure means "a human merges".
dependencies_pass() {
  local result
  result="$("${CLI[@]}" check-dependencies --from "$MERGE_BASE" --to "$HEAD_SHA" || {
    verifier_warning "check-dependencies failed" "a human merges"
    echo '{}'
  })"
  jq -r '.reasons[]? | "not merged without approval: " + .' <<<"$result"
  dependencies_ok="$(jq -r '.ok == true' <<<"$result")"
}

# --- result -----------------------------------------------------------------------
{
  echo "## acceptance / verdict for #$PR @ ${HEAD_SHA:0:7}"
  echo
  echo "| item | result |"
  echo "|---|---|"
  echo "| deterministic gates (CI run on this SHA) | $ci_state |"
  echo "| review ledger snapshot | $review_state (content hash: ${snapshot_hash:-none}) |"
  echo "| awaiting human decision | ${awaiting[*]:-none} |"
  if [[ ${#base_changes[@]} -gt 0 ]]; then
    echo "| human approval / acceptance guarantee | **human confirmation required, no acceptance guarantee** (base files: ${base_changes[*]}) |"
    echo "| base files: next action | request code owner approval for the current HEAD; approval is enforced by the ruleset |"
  else
    echo "| human approval / acceptance guarantee | not judged here; see the ruleset (docs/remote-acceptance.md) |"
  fi
  echo
  echo "Merge-blocking state: see docs/remote-acceptance.md. Machine checks passing does not mean every acceptance condition is met."
  if [[ ${#reasons[@]} -gt 0 ]]; then
    echo
    echo "### reasons"
    printf -- '- %s\n' "${reasons[@]}"
  fi
} >>"$GITHUB_STEP_SUMMARY"

if [[ ${#reasons[@]} -gt 0 ]]; then
  post_status failure "${reasons[0]}"
  printf 'acceptance failed:\n'; printf -- '- %s\n' "${reasons[@]}"
  exit 1
fi
if [[ ${#base_changes[@]} -gt 0 ]]; then
  post_status success "machine checks passed; base files changed: code owner approval required, no acceptance guarantee"
elif [[ "$dependency_update" == "true" ]]; then
  dependencies_pass
  if [[ "$dependencies_ok" == "true" ]]; then
    post_status success "machine checks passed (Dependabot dependency update; merges without human approval, #43)"
    # Read by the automerge job in .github/workflows/acceptance.yml.
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
      printf 'automerge=true\nkind=dependency\nhead=%s\n' "$HEAD_SHA" >>"$GITHUB_OUTPUT"
    fi
  else
    post_status success "machine checks passed (Dependabot update; supply-chain check needs a human, see the run)"
  fi
elif [[ "$dependabot_authored" == "true" ]]; then
  # Dependabot's own commits outside the dependency files and base files: no
  # snapshot was required (step 2), and it does not merge without approval.
  post_status success "machine checks passed (CI; Dependabot's own commits, no review ledger required; human approval required)"
else
  # --- 5. a change by the AI that merges without human approval? ------------------
  # Owner decision 2026-11-01 (contract: docs/remote-acceptance.md "人間の承認なしで
  # マージしてよい変更"). Reached only when every check above passed: CI, a
  # review ledger snapshot bound to this head, no open decision, no base file.
  # DO NOT REMOVE OR WEAKEN: the rules live in tools/review-gate/src/ai-change.ts.
  # Any failure means "not this class", i.e. a human approves and merges.
  pr_file="$(mktemp)"
  printf '%s' "$pr_json" >"$pr_file"
  changed_file="$(mktemp)"
  printf '%s\n' "${changed[@]}" >"$changed_file"
  added_file="$(mktemp)"
  printf '%s\n' "${added[@]}" >"$added_file"
  # Who last put the ui-reviewed label on the PR: only the owner's counts.
  ui_reviewed_by="$(gh api --paginate "repos/$REPO/issues/$PR/events?per_page=100" \
    -q '[.[] | select(.event == "labeled" and .label.name == "ui-reviewed") | .actor.login] | last // empty' \
    2>/dev/null | tail -n 1 || {
      verifier_warning "ui-reviewed events lookup failed" "no verified ui-reviewed actor (a human approves and merges when UI review is required)"
      true
    })"
  default_branch="$(jq -r .base.repo.default_branch <<<"$pr_json")"
  base_files="$(IFS=,; echo "${base_changes[*]}")"
  ai_classification="$("${CLI[@]}" classify-ai-change --pr-file "$pr_file" --changed-file "$changed_file" \
    --added-file "$added_file" --ui-reviewed-by "$ui_reviewed_by" \
    --default-branch "$default_branch" \
    --base-files "$base_files" || {
      verifier_warning "classify-ai-change failed" "not this class (a human approves and merges)"
      echo '{}'
    })"
  jq -r '.reasons[]? | "not an AI change that merges without approval: " + .' <<<"$ai_classification"
  ai_change="$(jq -r '.aiChange == true' <<<"$ai_classification")"
  dependencies_ok=false
  if [[ "$ai_change" == "true" ]]; then dependencies_pass; fi
  if [[ "$ai_change" == "true" && "$dependencies_ok" == "true" ]]; then
    post_status success "machine checks passed (CI + review ledger; AI change, merges without human approval)"
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
      printf 'automerge=true\nkind=ai-change\nhead=%s\n' "$HEAD_SHA" >>"$GITHUB_OUTPUT"
    fi
  else
    post_status success "machine checks passed (CI + review ledger)"
  fi
fi
