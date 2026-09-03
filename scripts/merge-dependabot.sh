#!/usr/bin/env bash
#
# merge-dependabot.sh
#
# Auto-merge Dependabot PRs that only move package-lock.json versions *upward*,
# using diff-lockfiles --fail-on-downgrade as the gate.
#
# STRICTLY SERIAL, never parallel. This matters: a bump that looks like an
# upgrade against the base a PR branched from can be a DOWNGRADE against the
# current main once an earlier PR has merged (PR A takes X to 2.0, PR B still
# carries X at 1.5 -> merging B after A downgrades X). So the script:
#
#   * handles ONE PR at a time, oldest first, to completion before the next;
#   * refuses to gate or merge a PR unless its branch point already equals the
#     current main tip (i.e. it contains every prior merge). GitHub's CLEAN
#     merge state does NOT guarantee this -- a branch behind main can still
#     report CLEAN -- so the merge-base is checked directly here;
#   * evaluates the downgrade gate against the *current* main, not the PR's
#     original base;
#   * re-reads main after every merge before touching the next PR.
#
# Per oldest actionable PR:
#   1. Not up to date with main / conflicting -> @dependabot rebase, wait, retry
#   2. diff-lockfiles reports a downgrade        -> @dependabot rebase, wait, retry
#   3. Not mergeable yet (CI not green, blocked) -> wait, retry
#   4. Up to date + no downgrade + CI green
#      (mergeStateStatus CLEAN)                  -> post the markdown diff, merge
#
# Rebases and CI are asynchronous, so waiting on a single PR is retried up to
# MAX_ROUNDS times with SLEEP_BETWEEN seconds between attempts before giving up
# on it (and stopping, since later PRs must merge after this one).
#
# Safe by default: DRY_RUN=1 prints intended actions without commenting/merging.
#
# Run it from inside a checkout of the repo whose Dependabot PRs you want to
# merge (gh and git infer that repo from the checkout). To run it against a
# different repo than the one holding this script, point DIFF_LOCKFILES_BIN at
# this repo's bin/diff-lockfiles.js.
#
# Env knobs:
#   DRY_RUN=1|0          (default 1)  do everything except comment/rebase/merge
#   MAX_ROUNDS=N         (default 10) max consecutive waits on the current PR
#   SLEEP_BETWEEN=SEC    (default 60) pause between waits (for rebases/CI to settle)
#   BASE_BRANCH=name     (default main)
#   DIFF_LOCKFILES_BIN=  (default <this repo>/bin/diff-lockfiles.js) path to the
#                        diff-lockfiles entry point, for running against another repo
#   SKIP_PRS="104 107"   (default empty) PR numbers to never touch, so a PR that
#                        needs a human (e.g. a major bump failing CI) does not
#                        block the serial queue behind it

set -euo pipefail

DRY_RUN="${DRY_RUN:-1}"
MAX_ROUNDS="${MAX_ROUNDS:-10}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-60}"
BASE_BRANCH="${BASE_BRANCH:-main}"
SKIP_PRS="${SKIP_PRS:-}"

# Resolve the diff-lockfiles binary relative to this script (not the cwd), so it
# still works when run from inside another repo's checkout.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIFF_LOCKFILES_BIN="${DIFF_LOCKFILES_BIN:-$SCRIPT_DIR/../bin/diff-lockfiles.js}"
DIFF_LOCKFILES=(node "$DIFF_LOCKFILES_BIN")

log()  { printf '%s\n' "$*" >&2; }
step() { printf '  %s\n' "$*" >&2; }

# GitHub computes mergeability lazily: the first query after a change returns
# UNKNOWN while it recomputes in the background. Poll until it resolves.
get_merge_state() { # pr -> echoes mergeStateStatus (may still be UNKNOWN if slow)
  local pr="$1" state i
  for ((i = 0; i < 8; i++)); do
    state="$(gh pr view "$pr" --json mergeStateStatus --jq .mergeStateStatus)"
    if [[ "$state" != "UNKNOWN" ]]; then printf '%s' "$state"; return 0; fi
    sleep 3
  done
  printf 'UNKNOWN'
}

# --- side-effecting helpers (no-ops under DRY_RUN) ---------------------------

post_comment() { # pr, body
  if [[ "$DRY_RUN" == 1 ]]; then
    step "[dry-run] would comment on #$1:"; printf '%s\n' "$2" | sed 's/^/      | /' >&2
  else
    gh pr comment "$1" --body "$2" >/dev/null
  fi
}

request_rebase() { # pr, reason
  post_comment "$1" "$2

@dependabot rebase"
  step "requested @dependabot rebase on #$1"
}

# A rebase is asynchronous, so the same PR is revisited every SLEEP_BETWEEN
# seconds while we wait for it. Only post a fresh @dependabot rebase when the
# situation has actually changed -- the PR got a new HEAD (a force-push landed)
# or main moved under it -- so we don't spam the PR with identical requests.
declare -A REBASE_REQUESTED=()
maybe_request_rebase() { # pr, situation-key, reason
  if [[ "${REBASE_REQUESTED[$1]:-}" == "$2" ]]; then
    step "rebase already requested for #$1 at this state — waiting"
    return
  fi
  request_rebase "$1" "$3"
  REBASE_REQUESTED[$1]="$2"
}

merge_pr() { # pr -> 0 merged, 1 merge attempt failed (retry later)
  if [[ "$DRY_RUN" == 1 ]]; then
    step "[dry-run] would merge #$1 (merge commit)"
    return 0
  fi
  # A merge can still fail if the PR went stale between the checks and here.
  # Don't let that abort the run; the loop revisits it.
  if gh pr merge "$1" --merge 2>&1; then
    step "merged #$1"
    return 0
  fi
  step "merge attempt failed for #$1 — will retry"
  return 1
}

# --- per-PR logic ------------------------------------------------------------
# Return codes:
#   0 = cannot act on this PR (not a lockfile bump, or a diff error) -> skip it
#   1 = pending: waiting on a rebase / CI for THIS PR, retry it
#   2 = merged: move on to the next PR (main has changed)

process_pr() { # pr
  local pr="$1" head head_sha base main_tip situation state out code

  head="pr-$pr"
  git fetch -q --force origin "pull/$pr/head:$head"
  head_sha="$(git rev-parse "$head")"
  main_tip="$(git rev-parse "origin/$BASE_BRANCH")"
  base="$(git merge-base "origin/$BASE_BRANCH" "$head")"
  # Identifies "this PR against this main"; a rebase or a main move changes it.
  situation="$head_sha:$main_tip"

  # Only touch PRs that actually change a lockfile.
  if ! git diff --name-only "$base" "$head" | grep -q 'package-lock\.json$'; then
    step "no package-lock.json change — skipping"
    return 0
  fi

  # SERIAL GUARD. The PR must already contain the current main tip so its diff
  # is evaluated against everything merged before it. GitHub CLEAN does not
  # imply this, so require merge-base == main tip and rebase otherwise.
  if [[ "$base" != "$main_tip" ]]; then
    maybe_request_rebase "$pr" "$situation" "This branch does not yet include the latest \`$BASE_BRANCH\`. Rebasing so its lockfile changes are evaluated against current \`$BASE_BRANCH\` — a version that looks like an upgrade against an older base can be a downgrade against the current one."
    return 1
  fi

  state="$(get_merge_state "$pr")"
  step "mergeStateStatus=$state (up to date with $BASE_BRANCH)"

  if [[ "$state" == "DIRTY" ]]; then
    maybe_request_rebase "$pr" "$situation" "This branch conflicts with \`$BASE_BRANCH\` and needs a rebase before it can be merged."
    return 1
  fi

  # Downgrade gate, against the CURRENT main tip (== base, guaranteed above).
  # diff-lockfiles exits 2 on a downgrade, 0 when clean, 1 on error.
  out="$("${DIFF_LOCKFILES[@]}" "$main_tip" "$head" --format markdown --fail-on-downgrade)" && code=0 || code=$?
  if [[ "$code" == 2 ]]; then
    maybe_request_rebase "$pr" "$situation" "\`diff-lockfiles\` found a version **downgrade** in this update (evaluated against current \`$BASE_BRANCH\`):

$out

Requesting a rebase to pick up clean upstream versions."
    return 1
  elif [[ "$code" != 0 ]]; then
    step "diff-lockfiles error (exit $code) — skipping this PR"
    return 0
  fi

  # No downgrade. Only merge when CI is green and the PR is mergeable.
  if [[ "$state" != "CLEAN" ]]; then
    step "no downgrade, but not mergeable yet (state=$state) — waiting"
    return 1
  fi

  post_comment "$pr" "### \`diff-lockfiles\` report

No downgrades detected (evaluated against current \`$BASE_BRANCH\`) — merging.

$out"
  if merge_pr "$pr"; then return 2; fi
  return 1
}

# --- main loop (one PR at a time, oldest first) ------------------------------

main() {
  [[ "$DRY_RUN" == 1 ]] && log "== DRY RUN (set DRY_RUN=0 to act) =="

  local -A skip=()
  local waits=0 prs pr candidate rc n

  # Pre-seed the skip set with any PRs the caller wants left alone (SKIP_PRS),
  # so a PR that needs a human does not block the serial queue behind it.
  for n in ${SKIP_PRS//,/ }; do
    skip[$n]=1
    log "Skipping #$n (SKIP_PRS)"
  done

  while :; do
    git fetch -q "origin" "$BASE_BRANCH"

    mapfile -t prs < <(gh pr list --author "app/dependabot" --state open \
      --json number,createdAt --jq 'sort_by(.createdAt) | .[].number')

    # Oldest PR we have not permanently skipped.
    pr=""
    for candidate in "${prs[@]}"; do
      if [[ -z "${skip[$candidate]:-}" ]]; then pr="$candidate"; break; fi
    done

    if [[ -z "$pr" ]]; then
      log "No actionable Dependabot PRs left. Done."
      return 0
    fi

    log "#$pr $(gh pr view "$pr" --json title --jq .title)"
    process_pr "$pr" && rc=$? || rc=$?

    case "$rc" in
      # merged: main changed, re-evaluate next oldest. Mark it handled so a
      # dry run (where the merge is simulated, not real, so the PR stays open)
      # advances instead of re-picking it forever; harmless in a real run since
      # a merged PR leaves the open list anyway.
      2) skip["$pr"]=1; waits=0 ;;
      0) skip["$pr"]=1; waits=0 ;;  # cannot act: skip permanently, move on
      1)                            # waiting on a rebase / CI for this PR
        waits=$((waits + 1))
        if [[ "$waits" -ge "$MAX_ROUNDS" ]]; then
          log "Gave up waiting on #$pr after $MAX_ROUNDS attempts. Stopping (later PRs merge after it). Re-run once it is ready."
          return 0
        fi
        log "Waiting on #$pr (attempt $waits/$MAX_ROUNDS). Sleeping ${SLEEP_BETWEEN}s."
        sleep "$SLEEP_BETWEEN"
        ;;
    esac
  done
}

main "$@"
