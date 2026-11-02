#!/bin/sh
# Review gate: the review ledger and its verdict, in POSIX sh + awk + git.
#
# The rules are defined in docs/review-contract.md ("台帳" / "ライフサイクル" /
# "完了の判定" / "作業の継続と受け入れ"); this file only encodes them. When the
# contract changes, change the contract first and then this file.
#
# It needs only what a bare clone has (git and a POSIX shell), so the git
# hooks, the Claude Code hook and the reviewer can use it on any host, and the
# remote verifier (acceptance.sh) judges snapshots with the same code
# (philosophy: hooks run on a bare clone; .contexts/bootstrap-decisions.md
# "2026-11-01 再実行 (3.1.0)").
#
# Usage: sh tools/review-gate/gate.sh <command> [options]
#
#   hash      --scope commit|push [--base origin/main]   print the diff hash the gate expects
#   show      [--all]                                    print the ledger (reviewers start here)
#   record    --file <round.tsv> [--base origin/main]    reviewer only: append a review round
#   check     --scope commit|push [--base origin/main]   gate: exit 1 unless the contract is met
#   snapshot  --pr <n> [--base origin/main] [--decisions "#1,#2"] [--output <file>]
#                                                        print (or write) the PR comment body to submit
#   accept    --snapshot-file <f> --repo <r> --pr <n> --head <sha>
#             --merge-base <sha> --diff-hash <h> --contract-version <v>
#                                                        remote verifier: judge a snapshot
#   range-hash --from <sha> --to <sha>                   hash an explicit diff range
#   contract-version [--base <ref>]                      version of the contract and this verifier
#
# Exit status: 0 = pass, 1 = the contract is not met, 2 = broken invocation
# or unreadable input (a failure, never a pass).
#
# Ledger: $(git rev-parse --git-common-dir)/review-ledger/ledger.tsv, an
# append-only log of tab-separated records (`record` appends after migration):
#   round    scope diffHash outputOk reviewer at
#   finding  id severity status decisionRef diffHash at paths basis evidence resolution origin
# The current state of a finding is its last `finding` record; earlier ones
# are its history. Empty optional fields are "-".

set -eu

DEFAULT_BASE=origin/main
CONTRACT_PATH=docs/review-contract.md
VERIFIER_PATH=tools/review-gate
SNAPSHOT_MARKER='<!-- triary-review-snapshot -->'
NOTE='NOTE: review findings are LLM-based and non-deterministic; a finding that does not reappear is not resolved.'
TAB=$(printf '\t')

die() {
  printf 'review-gate: %s\n' "$*" >&2
  exit 2
}

# ---- shared awk ------------------------------------------------------------------

# Validates ledger records (also the ones inside a snapshot). Prints
# "error<TAB>message" for each malformed line.
VALIDATE_AWK='
BEGIN { FS = "\t" }
{ sub(/\r$/, "") }
/^#/ || /^$/ { next }
$1 == "round" {
  if (NF != 6) { print "error" FS "line " NR ": a round record has 6 fields, found " NF; next }
  if ($2 !~ /^(commit|push)$/) print "error" FS "line " NR ": scope must be commit or push"
  if ($4 !~ /^(true|false)$/) print "error" FS "line " NR ": outputOk must be true or false"
  next
}
$1 == "finding" {
  if (NF != 12) { print "error" FS "line " NR ": a finding record has 12 fields, found " NF; next }
  if ($3 !~ /^(critical|important|minor)$/) print "error" FS "line " NR ": invalid severity " $3
  if ($4 !~ /^(open|fixed_unverified|resolved|rejected|deferred|escalated)$/) print "error" FS "line " NR ": invalid status " $4
  next
}
{ print "error" FS "line " NR ": unknown record type " $1 }
'

# Judges ledger records against docs/review-contract.md "完了の判定".
# Variables: scope, hash, mode (local | acceptance).
# Prints "reason<TAB>..." and "awaiting<TAB>id<TAB>decisionRef"; exits 1 when
# any reason was printed.
EVALUATE_AWK='
BEGIN { FS = "\t"; rounds = 0; good = 0; n = 0 }
{ sub(/\r$/, "") }
$1 == "round" { if ($2 == scope && $3 == hash) { rounds++; if ($4 == "true") good++ }; next }
$1 == "finding" {
  if (!($2 in sev)) order[++n] = $2
  sev[$2] = $3; st[$2] = $4; ref[$2] = $5
  next
}
END {
  if (rounds == 0) { print "reason" FS "no review recorded for the current " scope " diff (" hash ")"; exit 1 }
  if (good == 0) { print "reason" FS "review output missing or broken for the current diff; this is a failure, not \"no findings\""; exit 1 }
  bad = 0
  for (i = 1; i <= n; i++) {
    id = order[i]; s = sev[id]; t = st[id]
    if (s == "minor") continue
    if (t == "escalated") {
      if (ref[id] == "-" || ref[id] == "") { print "reason" FS id " (" s ") is escalated but no decision request is referenced"; bad = 1; continue }
      print "awaiting" FS id FS ref[id]
      if (mode == "acceptance") { print "reason" FS id " awaits a human decision (" ref[id] ")"; bad = 1 }
      continue
    }
    if (t == "resolved" || t == "rejected") continue
    if (s == "important" && t == "deferred") continue
    print "reason" FS id " (" s ") is " t
    bad = 1
  }
  exit bad
}
'

# ---- git ---------------------------------------------------------------------------

repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || die "not inside a git work tree"
}

ledger_dir() {
  common=$(git rev-parse --git-common-dir 2>/dev/null) || die "not inside a git repository"
  dir=$(cd "$common" && pwd -P) || die "cannot resolve $common"
  printf '%s/review-ledger\n' "$dir"
}

# Fixed flags so the hash does not depend on the user's git config.
hash_diff() {
  work=$(mktemp -d "${TMPDIR:-/tmp}/review-gate.XXXXXXXXXX") || die "cannot create temporary directory"
  trap 'rm -rf "$work"' 0
  sum=$({
    git -c core.quotePath=true diff --no-color --no-ext-diff --no-renames --binary --full-index \
      --diff-algorithm=myers --indent-heuristic --src-prefix=a/ --dst-prefix=b/ "$@" || printf 'failed\n' >"$work/status"
  } | git hash-object --stdin) || die "git hash-object failed"
  if [ -f "$work/status" ]; then
    die "git diff $* failed"
  fi
  rm -rf "$work"
  trap - 0
  printf '%s\n' "$sum"
}

merge_base_of() {
  git merge-base "$1" HEAD 2>/dev/null || die "no merge base between $1 and HEAD (fetch $1 first)"
}

hash_for_scope() {
  case $1 in
    commit) hash_diff --cached ;;
    push) hash_diff "$(merge_base_of "$2")" HEAD ;;
    *) die "--scope must be commit or push (got $1)" ;;
  esac
}

contract_version_at() {
  c=$(git rev-parse "$1:$CONTRACT_PATH" 2>/dev/null) || die "no $CONTRACT_PATH at $1"
  v=$(git rev-parse "$1:$VERIFIER_PATH" 2>/dev/null) || die "no $VERIFIER_PATH at $1"
  printf 'contract=%s;verifier=%s\n' "$c" "$v"
}

# A ledger that exists but cannot be read is a failure, never an empty ledger.
ledger_file() {
  file="$(ledger_dir)/ledger.tsv"
  if [ -f "$(ledger_dir)/ledger.json" ]; then
    first=$(sed -n '1p' "$file" 2>/dev/null) || first=""
    case $first in
      '# migrated from ledger.json '*) ;;
      *) die "legacy ledger requires migration: run make ledger-migrate" ;;
    esac
  fi
  if [ -f "$file" ]; then
    errors=$(awk "$VALIDATE_AWK" "$file") || die "cannot read $file"
    [ -z "$errors" ] || die "ledger $file is corrupted:
$(printf '%s\n' "$errors" | sed "s/^error$TAB/- /")"
  fi
  printf '%s\n' "$file"
}

# Prints the ledger records, or nothing when there is no ledger yet.
ledger_records() {
  file=$(ledger_file)
  [ -f "$file" ] && cat "$file"
  return 0
}

# ---- commands ----------------------------------------------------------------------

cmd_hash() {
  hash_for_scope "$scope" "$base"
}

cmd_range_hash() {
  [ -n "$from" ] || die "--from is required"
  [ -n "$to" ] || die "--to is required"
  hash_diff "$from" "$to"
}

cmd_contract_version() {
  contract_version_at "${base_given:-HEAD}"
}

cmd_show() {
  records=$(ledger_records)
  if [ "$all" = 1 ]; then
    printf '%s\n' "$records" | sed '/^$/d'
    return 0
  fi
  printf '%s\n' "$records" | awk '
BEGIN { FS = "\t"; n = 0; r = 0; max = 0 }
$1 == "round" { r++; next }
$1 == "finding" {
  if (!($2 in line)) order[++n] = $2
  line[$2] = $0
  num = $2; gsub(/[^0-9]/, "", num); if (num != "" && num + 0 > max) max = num + 0
}
END {
  print "# " r " rounds, " n " findings. Current state of each finding (history: show --all):"
  print "# finding<TAB>id<TAB>severity<TAB>status<TAB>decisionRef<TAB>diffHash<TAB>at<TAB>paths<TAB>basis<TAB>evidence<TAB>resolution<TAB>origin"
  for (i = 1; i <= n; i++) print line[order[i]]
  print "# next id: F" (max + 1)
}'
}

cmd_record() {
  [ -n "$file" ] || die "--file is required"
  [ -r "$file" ] || die "cannot read $file"
  round_scope=$(awk -F "$TAB" '$1 == "round" { print $2; exit }' "$file")
  case $round_scope in
    commit | push) ;;
    *) die "round rejected: the first record must be: round<TAB>commit|push<TAB>diffHash<TAB>outputOk<TAB>reviewer" ;;
  esac
  current=$(hash_for_scope "$round_scope" "$base")
  ledger=$(ledger_file)
  mkdir -p "$(ledger_dir)"
  [ -f "$ledger" ] || : >"$ledger"
  at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  out=$(awk -v ledger="$ledger" -v current="$current" -v at="$at" '
function bad(m) { print "error" OFS m; err = 1 }
function given(x) { return x != "" && x != "-" && x ~ /[^ ]/ }
BEGIN {
  FS = OFS = "\t"; err = 0; m = 0; seen = 0
  while ((getline row < ledger) > 0) {
    k = split(row, f, "\t")
    if (f[1] != "finding") continue
    known[f[2]] = 1; sev[f[2]] = f[3]; st[f[2]] = f[4]; ref[f[2]] = f[5]
    paths[f[2]] = f[8]; basis[f[2]] = f[9]; evid[f[2]] = f[10]; res[f[2]] = f[11]; orig[f[2]] = f[12]
  }
}
{ sub(/\r$/, "") }
/^#/ || /^[ \t]*$/ { next }
!seen {
  if ($1 != "round" || NF != 5) { bad("line " FNR ": the first record must be: round<TAB>scope<TAB>diffHash<TAB>outputOk<TAB>reviewer"); exit }
  if ($3 != current) { bad("the round reviewed " $3 " but the current " $2 " diff is " current ". Review the current diff."); exit }
  if ($4 !~ /^(true|false)$/) bad("outputOk must be true or false")
  if (!given($5)) bad("reviewer is required")
  seen = 1
  out[++m] = "round" OFS $2 OFS current OFS $4 OFS $5 OFS at
  next
}
$1 == "round" { bad("line " FNR ": a submission has exactly one round record"); next }
$1 == "new" {
  if (NF != 7) { bad("line " FNR ": new<TAB>id<TAB>severity<TAB>paths<TAB>basis<TAB>evidence<TAB>origin has 7 fields, found " NF); next }
  id = $2
  if (id !~ /^[A-Za-z0-9_-]+$/) { bad("line " FNR ": invalid finding id " id); next }
  if ((id in known) || (id in added)) bad("duplicate finding id " id "; restate an existing finding by updating it instead")
  if ($3 !~ /^(critical|important|minor)$/) bad(id ": severity must be critical, important or minor")
  if (!given($5) || !given($6)) bad(id ": a finding needs both basis and evidence")
  origin = given($7) ? $7 : "unknown/unknown"
  if (origin !~ /^(pre_existing|caused_by_fix|unknown)\/(confirmed|inferred|unknown)(\/[A-Za-z0-9_-]+)?$/)
    bad(id ": origin must be kind/confidence[/causedBy], e.g. caused_by_fix/confirmed/F3")
  added[id] = 1
  out[++m] = "finding" OFS id OFS $3 OFS "open" OFS "-" OFS current OFS at OFS (given($4) ? $4 : "-") OFS $5 OFS $6 OFS "-" OFS origin
  next
}
$1 == "update" {
  if (NF != 7) { bad("line " FNR ": update<TAB>id<TAB>status<TAB>resolution<TAB>evidence<TAB>decisionRef<TAB>severity has 7 fields, found " NF); next }
  id = $2
  if (!(id in known)) { bad("update refers to unknown finding " id); next }
  if (id in updated) { bad(id ": update a finding once per round"); next }
  updated[id] = 1
  status = $3
  if (status !~ /^(open|fixed_unverified|resolved|rejected|deferred|escalated)$/) { bad(id ": invalid status " status); next }
  s = given($7) ? $7 : sev[id]
  if (s !~ /^(critical|important|minor)$/) bad(id ": invalid severity " s)
  if (status != "open" && !given($4)) bad(id ": status \"" status "\" requires a resolution reason")
  if (s == "critical" && status == "deferred") bad(id ": a Critical finding cannot be deferred")
  if (status == "open" && !given($5)) bad(id ": reopening requires new evidence")
  out[++m] = "finding" OFS id OFS s OFS status OFS (given($6) ? $6 : ref[id]) OFS current OFS at OFS paths[id] OFS basis[id] OFS (given($5) ? $5 : evid[id]) OFS (given($4) ? $4 : res[id]) OFS orig[id]
  next
}
{ bad("line " FNR ": unknown record type " $1 " (round, new or update)") }
END {
  if (!seen && !err) bad("no round record")
  if (err) exit 1
  for (i = 1; i <= m; i++) print "line" OFS out[i]
}' "$file") || {
    printf '%s\n' "$out" | sed -n "s/^error$TAB/review-gate: round rejected: /p" >&2
    exit 1
  }
  tmp="$ledger.tmp.$$"
  cat "$ledger" >"$tmp"
  printf '%s\n' "$out" | sed -n "s/^line$TAB//p" >>"$tmp"
  mv "$tmp" "$ledger"
  printf 'review-gate: recorded %s round for %s\n' "$round_scope" "$current"
}

cmd_check() {
  current=$(hash_for_scope "$scope" "$base")
  records=$(ledger_records)
  status=0
  verdict=$(printf '%s\n' "$records" | awk -v scope="$scope" -v hash="$current" -v mode=local "$EVALUATE_AWK") || status=$?
  printf '%s\n' "$verdict" |
    awk -F "$TAB" '$1 == "awaiting" { print "review-gate: " $2 " awaits a human decision (" $3 "); acceptance will block on it." }' >&2
  [ "$status" -eq 0 ] && return 0
  [ "$status" -eq 1 ] || die "cannot evaluate the ledger"
  {
    printf 'review-gate: %s blocked by docs/review-contract.md.\n' "$scope"
    printf '%s\n' "$verdict" | sed -n "s/^reason$TAB/  - /p"
    printf 'Have a reviewer in a separate context review the diff following .agents/skills/code-review/SKILL.md,\n'
    printf 'then retry. Do not bypass (--no-verify / core.hooksPath) or edit the ledger by hand. %s\n' "$NOTE"
  } >&2
  exit 1
}

cmd_snapshot() {
  [ -n "$pr" ] || die "--pr is required"
  case $pr in *[!0-9]*) die "--pr must be a number" ;; esac
  merge_base=$(merge_base_of "$base")
  diff_hash=$(hash_diff "$merge_base" HEAD)
  repo=$(git config --get remote.origin.url | sed -e 's#^.*github\.com[:/]##' -e 's#\.git$##')
  head=$(git rev-parse HEAD)
  base_sha=$(git rev-parse "$base")
  contract=$(contract_version_at "$base")
  records=$(ledger_records)
  work=$(mktemp -d "${TMPDIR:-/tmp}/review-gate.XXXXXXXXXX") || die "cannot create temporary directory"
  trap 'rm -rf "$work"' 0
  body="$work/snapshot"
  {
    printf 'kind\ttriary-review-snapshot\t2\n'
    printf 'repo\t%s\n' "$repo"
    printf 'pr\t%s\n' "$pr"
    printf 'head\t%s\n' "$head"
    printf 'base\t%s\n' "$base_sha"
    printf 'merge-base\t%s\n' "$merge_base"
    printf 'diff-hash\t%s\n' "$diff_hash"
    printf 'contract\t%s\n' "$contract"
    printf '%s\n' "$decisions" | tr ',' '\n' | sed -e 's/^ *//' -e 's/ *$//' -e '/^$/d' -e "s/^/decision$TAB/"
    # Only the rounds of the submitted diff count, and a resolved finding
    # passes in every mode, so leaving them out cannot change the verdict and
    # keeps the comment under GitHub's size limit (2026-11-01: a 263,298
    # character comment was refused). The full ledger stays in the clone.
    printf '%s\n' "$records" | awk -v hash="$diff_hash" '
BEGIN { FS = "\t"; n = 0 }
$1 == "round" && $3 == hash { print; next }
$1 == "finding" { if (!($2 in line)) order[++n] = $2; line[$2] = $0; st[$2] = $4 }
END { for (i = 1; i <= n; i++) if (st[order[i]] != "resolved") print line[order[i]] }'
  } >"$body"
  content_hash=$(git hash-object -- "$body")
  if [ -n "$output" ]; then exec 3>"$output"; else exec 3>&1; fi
  {
    printf '%s\n' "$SNAPSHOT_MARKER"
    printf 'Review ledger snapshot (see docs/remote-acceptance.md). Do not edit by hand.\n\n'
    printf 'content-hash: %s\n\n' "$content_hash"
    printf '```text\n'
    cat "$body"
    printf '```\n'
  } >&3
  exec 3>&-
  rm -f "$body"
  [ -z "$output" ] || printf 'review-gate: wrote the snapshot for #%s to %s\n' "$pr" "$output" >&2
}

# Prints "reason<TAB>...", "decision<TAB>#n" and "content-hash<TAB>h";
# exits 1 when any reason was printed.
cmd_accept() {
  for v in snapshot_file repo pr head merge_base diff_hash contract_version; do
    eval "val=\${$v}"
    [ -n "$val" ] || die "--$(printf '%s' "$v" | tr _ -) is required"
  done
  [ -r "$snapshot_file" ] || die "cannot read $snapshot_file"
  work=$(mktemp -d "${TMPDIR:-/tmp}/review-gate.XXXXXXXXXX") || die "cannot create temporary directory"
  trap 'rm -rf "$work"' 0
  body="$work/accept"
  awk -v marker="$SNAPSHOT_MARKER" '
{ sub(/\r$/, "") }
index($0, marker) { found = 1 }
found && !inside && $0 == "```text" { inside = 1; next }
inside && $0 == "```" { exit }
inside { print }' "$snapshot_file" >"$body"
  claimed=$(tr -d '\r' <"$snapshot_file" | sed -n 's/^content-hash: \([0-9a-f][0-9a-f]*\)$/\1/p' | sed -n 1p)
  reasons=""
  add_reason() { reasons="$reasons${reasons:+
}reason$TAB$*"; }
  if ! grep -Fq "$SNAPSHOT_MARKER" "$snapshot_file" || [ ! -s "$body" ]; then
    add_reason "no review ledger snapshot found"
  elif [ "$(sed -n 1p "$body")" != "kind${TAB}triary-review-snapshot${TAB}2" ]; then
    add_reason "review ledger snapshot is broken or in an old format (post a new one with gate.sh snapshot)"
  elif [ -z "$claimed" ] || [ "$(git hash-object -- "$body")" != "$claimed" ]; then
    add_reason "review ledger snapshot content hash mismatch (edited or corrupted)"
  else
    field() { awk -F "$TAB" -v k="$1" '$1 == k { print $2; exit }' "$body"; }
    for pair in "repo:$repo" "pr:$pr" "head:$head" "merge-base:$merge_base" "diff-hash:$diff_hash" "contract:$contract_version"; do
      key=${pair%%:*}
      want=${pair#*:}
      got=$(field "$key")
      [ "$got" = "$want" ] || add_reason "snapshot $key is ${got:-missing}, expected $want"
    done
    ledger_part=$(awk -F "$TAB" '$1 == "round" || $1 == "finding"' "$body")
    errors=$(printf '%s\n' "$ledger_part" | awk "$VALIDATE_AWK")
    if [ -n "$errors" ]; then
      add_reason "review ledger snapshot is broken: $(printf '%s\n' "$errors" | sed "s/^error$TAB//" | tr '\n' ';')"
    else
      status=0
      verdict=$(printf '%s\n' "$ledger_part" | awk -v scope=push -v hash="$diff_hash" -v mode=acceptance "$EVALUATE_AWK") || status=$?
      [ "$status" -le 1 ] || { rm -f "$body"; die "cannot evaluate the snapshot"; }
      reasons="$reasons${reasons:+
}$(printf '%s\n' "$verdict" | grep "^reason$TAB" || true)"
      reasons=$(printf '%s\n' "$reasons" | sed '/^$/d')
      printf '%s\n' "$verdict" | awk -F "$TAB" '$1 == "awaiting" { print "decision" FS $3 }'
    fi
    awk -F "$TAB" '$1 == "decision" { print "decision" FS $2 }' "$body"
  fi
  rm -f "$body"
  printf 'content-hash\t%s\n' "${claimed:-none}"
  [ -z "$reasons" ] && return 0
  printf '%s\n' "$reasons"
  exit 1
}

# ---- arguments -----------------------------------------------------------------------

[ $# -gt 0 ] || die "usage: gate.sh <hash|show|record|check|snapshot|accept|range-hash|contract-version> [options]"
command=$1
shift

scope="" base="$DEFAULT_BASE" base_given="" file="" pr="" decisions="" output="" all=0
snapshot_file="" repo="" head="" merge_base="" diff_hash="" contract_version="" from="" to=""
while [ $# -gt 0 ]; do
  case $1 in
    --all) all=1; shift; continue ;;
    --scope | --base | --file | --pr | --decisions | --output | --snapshot-file | --repo | --head | --merge-base | --diff-hash | --contract-version | --from | --to)
      [ $# -ge 2 ] || die "$1 needs a value" ;;
    *) die "unknown option $1" ;;
  esac
  case $1 in
    --scope) scope=$2 ;;
    --base) base=$2; base_given=$2 ;;
    --file) file=$2 ;;
    --pr) pr=$2 ;;
    --decisions) decisions=$2 ;;
    --output) output=$2 ;;
    --snapshot-file) snapshot_file=$2 ;;
    --repo) repo=$2 ;;
    --head) head=$2 ;;
    --merge-base) merge_base=$2 ;;
    --diff-hash) diff_hash=$2 ;;
    --contract-version) contract_version=$2 ;;
    --from) from=$2 ;;
    --to) to=$2 ;;
  esac
  shift 2
done

cd "$(repo_root)"
case $command in
  show | record | check | snapshot) (ledger_file) >/dev/null ;;
esac
case $command in
  hash) cmd_hash ;;
  show) cmd_show ;;
  record) cmd_record ;;
  check) cmd_check ;;
  snapshot) cmd_snapshot ;;
  accept) cmd_accept ;;
  range-hash) cmd_range_hash ;;
  contract-version) cmd_contract_version ;;
  *) die "unknown command $command" ;;
esac
