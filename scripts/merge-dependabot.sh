#!/usr/bin/env bash
#
# merge-dependabot.sh
#
# Auto-merge Dependabot PRs that only move package-lock.json versions *upward*.
# For each open Dependabot PR, oldest first:
#
#   1. Conflicting with main?      -> ask @dependabot rebase, revisit next round
#   2. Behind main?                -> ask @dependabot rebase, revisit next round
#   3. diff-lockfiles downgrade?   -> ask @dependabot rebase, revisit next round
#   4. No downgrade + CI green
#      (mergeStateStatus CLEAN)     -> post the markdown diff, then merge (merge commit)
#   5. Anything else (checks still
#      running, blocked, unknown)   -> leave it, revisit next round
#
# Because rebases and CI are asynchronous, the whole sweep repeats up to
# MAX_ROUNDS times with SLEEP_BETWEEN seconds between rounds, until every PR is
# either merged or parked waiting on something outside our control.
#
# Safe by default: DRY_RUN=1 prints intended actions without commenting/merging.
#
# Env knobs:
#   DRY_RUN=1|0        (default 1)  do everything except comment/rebase/merge
#   MAX_ROUNDS=N       (default 5)  how many sweeps before giving up on stragglers
#   SLEEP_BETWEEN=SEC  (default 60) pause between sweeps (for rebases/CI to settle)
#   BASE_BRANCH=name   (default main)

set -euo pipefail

DRY_RUN="${DRY_RUN:-1}"
MAX_ROUNDS="${MAX_ROUNDS:-5}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-60}"
BASE_BRANCH="${BASE_BRANCH:-main}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
DIFF_LOCKFILES=(node "$REPO_ROOT/bin/diff-lockfiles.js")

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

merge_pr() { # pr -> 0 merged, 1 merge attempt failed (retry later)
  if [[ "$DRY_RUN" == 1 ]]; then
    step "[dry-run] would merge #$1 (merge commit)"
    return 0
  fi
  # A merge can fail if the PR went stale/conflicting since the state check
  # (these lockfiles overlap). Don't let that abort the whole sweep.
  if gh pr merge "$1" --merge 2>&1; then
    step "merged #$1"
    return 0
  fi
  step "merge attempt failed for #$1 — will retry next round"
  return 1
}

# --- per-PR logic ------------------------------------------------------------
# Return codes: 0 = settled this round (merged / skipped / rebase requested),
#               1 = still pending, worth another round.

process_pr() { # pr
  local pr="$1" head base state out code

  head="pr-$pr"
  git fetch -q --force origin "pull/$pr/head:$head"
  base="$(git merge-base "origin/$BASE_BRANCH" "$head")"

  # Only touch PRs that actually change a lockfile.
  if ! git diff --name-only "$base" "$head" | grep -q 'package-lock\.json$'; then
    step "no package-lock.json change — skipping"
    return 0
  fi

  state="$(get_merge_state "$pr")"
  step "mergeStateStatus=$state"

  case "$state" in
    DIRTY)
      request_rebase "$pr" "This branch conflicts with \`$BASE_BRANCH\` and needs a rebase before it can be merged."
      return 1 ;;
    BEHIND)
      request_rebase "$pr" "This branch is behind \`$BASE_BRANCH\` and needs a rebase before it can be merged."
      return 1 ;;
  esac

  # Downgrade gate. diff-lockfiles exits 2 on a downgrade, 0 clean, 1 on error.
  out="$("${DIFF_LOCKFILES[@]}" "$base" "$head" --format markdown --fail-on-downgrade)" && code=0 || code=$?
  if [[ "$code" == 2 ]]; then
    request_rebase "$pr" "\`diff-lockfiles\` found a version **downgrade** in this update:

$out

Requesting a rebase to pick up clean upstream versions."
    return 1
  elif [[ "$code" != 0 ]]; then
    step "diff-lockfiles error (exit $code) — leaving PR untouched"
    return 0
  fi

  # No downgrade. Only merge when CI is green and the PR is mergeable.
  if [[ "$state" != "CLEAN" ]]; then
    step "no downgrade, but not mergeable yet (state=$state) — will retry"
    return 1
  fi

  post_comment "$pr" "### \`diff-lockfiles\` report

No downgrades detected — merging.

$out"
  # If the merge fails (PR went stale since the state check), report pending so
  # the sweep loop revisits it — by then it's usually BEHIND and gets a rebase.
  merge_pr "$pr" || return 1
  return 0
}

# --- main sweep loop ---------------------------------------------------------

main() {
  [[ "$DRY_RUN" == 1 ]] && log "== DRY RUN (set DRY_RUN=0 to act) =="

  local round pending prs pr
  for ((round = 1; round <= MAX_ROUNDS; round++)); do
    git fetch -q "origin" "$BASE_BRANCH"

    mapfile -t prs < <(gh pr list --author "app/dependabot" --state open \
      --json number,createdAt --jq 'sort_by(.createdAt) | .[].number')

    if [[ ${#prs[@]} -eq 0 ]]; then
      log "No open Dependabot PRs. Done."
      return 0
    fi

    log "== Round $round/$MAX_ROUNDS — ${#prs[@]} open Dependabot PR(s): ${prs[*]} =="
    pending=0
    for pr in "${prs[@]}"; do
      log "#$pr $(gh pr view "$pr" --json title --jq .title)"
      if ! process_pr "$pr"; then pending=1; fi
    done

    if [[ "$pending" == 0 ]]; then
      log "Nothing left to wait on. Done."
      return 0
    fi
    if [[ "$round" -lt "$MAX_ROUNDS" ]]; then
      log "Some PRs pending (rebase/CI). Sleeping ${SLEEP_BETWEEN}s before round $((round + 1))."
      sleep "$SLEEP_BETWEEN"
    fi
  done

  log "Reached MAX_ROUNDS=$MAX_ROUNDS with PRs still pending. Re-run later to finish."
}

main "$@"
