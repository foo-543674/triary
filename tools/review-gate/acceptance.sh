#!/usr/bin/env bash
# Remote acceptance verifier. Runs from the protected base checkout in
# .github/workflows/acceptance.yml and NEVER executes code from the PR.
# Contract: docs/remote-acceptance.md.
#
# Inputs (env): GH_TOKEN, REPO (owner/name), PR (number), RUN_URL,
#               SNAPSHOT_FILE (where to store the snapshot used),
#               GITHUB_STEP_SUMMARY, DRY_RUN=1 (print statuses instead of posting).
set -euo pipefail

STATUS_CONTEXT="acceptance / verdict"
ALLOWED_SNAPSHOT_AUTHORS='["foo-543674-ai-agent[bot]","foo-543674"]'
REQUIRED_JOBS='[
  "backend / lint (fmt + clippy)",
  "backend / test (nextest)",
  "backend / build (release)",
  "frontend / lint (biome ci)",
  "frontend / test (vitest + storybook smoke)",
  "frontend / build (vite)",
  "openapi / spectral lint"
]'
CLI=(node tools/review-gate/src/cli.ts)

pr_json="$(gh api "repos/$REPO/pulls/$PR")"
HEAD_SHA="$(jq -r .head.sha <<<"$pr_json")"
BASE_REF="$(jq -r .base.ref <<<"$pr_json")"

post_status() {
  local state="$1" description="$2"
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "[dry-run] status $state: ${description:0:139}"
    return
  fi
  gh api -X POST "repos/$REPO/statuses/$HEAD_SHA" \
    -f state="$state" -f context="$STATUS_CONTEXT" \
    -f description="${description:0:139}" -f target_url="$RUN_URL" >/dev/null
}

if [[ "$(jq -r .state <<<"$pr_json")" != "open" ]]; then
  echo "PR #$PR is not open; nothing to judge."
  exit 0
fi

# DO NOT REMOVE OR WEAKEN: an unexpected error must end as a failing status,
# never as a silently missing or pending one.
trap 'post_status failure "verifier error; see the run log" || true' ERR

post_status pending "verifying"

# --- the target version -------------------------------------------------------
# Objects only: fetching does not execute anything from the PR.
git fetch --quiet --no-tags origin "$BASE_REF" "+refs/pull/$PR/head:refs/remotes/pr/head"
BASE_SHA="$(git rev-parse "origin/$BASE_REF")"
[[ "$(git rev-parse refs/remotes/pr/head)" == "$HEAD_SHA" ]] || {
  post_status pending "PR head moved while verifying; will re-run"
  exit 0
}
MERGE_BASE="$(git merge-base "$BASE_SHA" "$HEAD_SHA")"
DIFF_HASH="$("${CLI[@]}" range-hash --from "$MERGE_BASE" --to "$HEAD_SHA")"
CONTRACT_VERSION="$("${CLI[@]}" contract-version --base HEAD)"

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
if [[ -z "$ci_run" ]]; then
  reasons+=("CI has not run for $HEAD_SHA")
elif [[ "$(jq -r .status <<<"$ci_run")" != "completed" ]]; then
  post_status pending "waiting for CI to complete on ${HEAD_SHA:0:7}"
  echo "CI still running; the workflow_run trigger will re-run this verifier."
  exit 0
else
  jobs="$(gh api "repos/$REPO/actions/runs/$(jq -r .id <<<"$ci_run")/jobs?per_page=100" | jq '.jobs')"
  mapfile -t bad_jobs < <(jq -r --argjson required "$REQUIRED_JOBS" '
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
            else "integration / newman: \($newman.conclusion)" end)' <<<"$jobs")
  if [[ ${#bad_jobs[@]} -eq 0 ]]; then
    ci_state="passed"
  else
    ci_state="failed"
    reasons+=("${bad_jobs[@]/#/CI }")
  fi
fi

# --- 2. review ledger snapshot matches this version and meets the contract -------
# DO NOT REMOVE OR WEAKEN: no snapshot / broken snapshot / stale snapshot fails.
gh api --paginate "repos/$REPO/issues/$PR/comments?per_page=100" |
  jq -rs --argjson allowed "$ALLOWED_SNAPSHOT_AUTHORS" '
    [.[][] | select((.user.login as $u | $allowed | index($u)) and (.body | contains("<!-- triary-review-snapshot -->")))]
    | sort_by(.created_at) | last | .body // ""' >"$SNAPSHOT_FILE"
snapshot_verdict="$("${CLI[@]}" accept --snapshot-file "$SNAPSHOT_FILE" \
  --repo "$REPO" --pr "$PR" --head "$HEAD_SHA" --base-sha "$BASE_SHA" \
  --merge-base "$MERGE_BASE" --diff-hash "$DIFF_HASH" --contract-version "$CONTRACT_VERSION" || true)"
[[ -n "$snapshot_verdict" ]] || snapshot_verdict='{"ok":false,"reasons":["verifier produced no output"],"decisionRefs":[],"contentHash":null}'
mapfile -t snapshot_reasons < <(jq -r '.reasons[]' <<<"$snapshot_verdict")
[[ ${#snapshot_reasons[@]} -gt 0 ]] && reasons+=("${snapshot_reasons[@]/#/review }")
review_state="$(jq -r 'if .ok then "passed" else "failed" end' <<<"$snapshot_verdict")"

# --- 3. no unresolved decision request this change depends on --------------------
while read -r ref; do
  [[ -z "$ref" ]] && continue
  number="${ref#\#}"
  if ! [[ "$number" =~ ^[0-9]+$ ]]; then
    reasons+=("decision reference $ref is not an issue number")
    continue
  fi
  state="$(gh api "repos/$REPO/issues/$number" -q .state 2>/dev/null || echo missing)"
  [[ "$state" == "closed" ]] || awaiting+=("#$number ($state)")
done < <(jq -r '.decisionRefs[]' <<<"$snapshot_verdict")
[[ ${#awaiting[@]} -gt 0 ]] && reasons+=("awaiting human decision: ${awaiting[*]}")

# --- 4. base files changed -> human approval required (enforced by the ruleset) ---
mapfile -t owned_patterns < <(grep -Ev '^\s*(#|$)' .github/CODEOWNERS | awk '{print $1}')
mapfile -t changed < <(gh api --paginate "repos/$REPO/pulls/$PR/files?per_page=100" -q '.[].filename')
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

# --- result -----------------------------------------------------------------------
{
  echo "## acceptance / verdict for #$PR @ ${HEAD_SHA:0:7}"
  echo
  echo "| item | result |"
  echo "|---|---|"
  echo "| deterministic gates (CI run on this SHA) | $ci_state |"
  echo "| review ledger snapshot | $review_state (content hash: $(jq -r '.contentHash // "none"' <<<"$snapshot_verdict")) |"
  echo "| awaiting human decision | ${awaiting[*]:-none} |"
  if [[ ${#base_changes[@]} -gt 0 ]]; then
    echo "| human approval / acceptance guarantee | **human confirmation required, no acceptance guarantee** (base files: ${base_changes[*]}) |"
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
else
  post_status success "machine checks passed (CI + review ledger)"
fi
