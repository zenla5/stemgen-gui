#!/usr/bin/env bash
#
# verify-branch-protection.sh
#
# Verifies that the LIVE branch-protection policy on the default branch still
# matches the SCRIPTED policy encoded in apply-branch-protection.sh (issue
# #204). Drift would otherwise silently weaken/tighten the merge gate without
# any CI signal.
#
# Instead of re-hardcoding the expected policy here (which would itself be a
# second source of truth that could drift), this script PARSES the expected
# policy out of the PUT payload embedded in apply-branch-protection.sh and
# compares it against the live policy returned by the GitHub API.
#
# Policy fields compared:
#   - required_status_checks.strict
#   - required_status_checks.contexts
#   - required_pull_request_reviews.required_approving_review_count
#   - enforce_admins.enabled
#   - allow_force_pushes.enabled
#   - allow_deletions.enabled
#
# Usage:
#   GITHUB_TOKEN=<token> .github/scripts/verify-branch-protection.sh [owner/repo]
#
# Test mode (no network): feed a canned "live policy" JSON via stdin to verify
# the comparison logic. Example:
#   echo '{"required_status_checks":{"strict":false,"contexts":["All Checks Passed"]},"required_pull_request_reviews":{"required_approving_review_count":0},"enforce_admins":{"enabled":true},"allow_force_pushes":{"enabled":false},"allow_deletions":{"enabled":false}}' \
#     | .github/scripts/verify-branch-protection.sh --test
#
# Requires: gh (authenticated with at least admin:repo/read access to the
# repo's branch-protection), jq.
#
# Exit codes:
#   0 - live policy matches the scripted policy
#   1 - mismatch between live and scripted policy (or a hard error)
#   2 - could not read live protection (missing/inssufficient token)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APPLY_SCRIPT="$REPO_ROOT/.github/scripts/apply-branch-protection.sh"

TEST_MODE=0
if [[ "${1:-}" == "--test" ]]; then
  TEST_MODE=1
  shift || true
fi

if [[ ! -f "$APPLY_SCRIPT" ]]; then
  echo "error: cannot find $APPLY_SCRIPT (expected policy source)" >&2
  exit 1
fi

# On a scheduled run without the admin:repo PAT configured, we cannot read live
# protection; exit 0 ("skip") so a missing secret doesn't turn a weekly run red.
# Manual/workflow_dispatch runs always proceed so the need for the secret is
# visible. (The workflow passes this via env; env, unlike `if:` conditions,
# supports the secrets context.)
if [[ "${BRANCH_PROTECTION_PAT_CONFIGURED:-false}" == "false" && "${GITHUB_EVENT_NAME:-}" == "schedule" ]]; then
  echo "SKIP: BRANCH_PROTECTION_PAT not configured; skipping scheduled verification."
  echo "Configure the BRANCH_PROTECTION_PAT secret (PAT with repo/admin:repo scope) to enable the weekly check."
  exit 0
fi

# --- Determine target repo ---------------------------------------------------
REPO="${1:-}"
if [[ $TEST_MODE -eq 1 ]]; then
  REPO="${REPO:-test/repo}"
elif [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || echo '')"
  if [[ -z "$REPO" ]]; then
    echo "error: could not determine repo; pass owner/repo as first arg" >&2
    exit 1
  fi
fi

DEFAULT_BRANCH="main"
if [[ $TEST_MODE -eq 0 ]]; then
  DEFAULT_BRANCH="$(gh api "repos/$REPO" --jq .default_branch 2>/dev/null)"
  if [[ -z "$DEFAULT_BRANCH" ]]; then
    echo "error: could not determine default branch for $REPO" >&2
    exit 1
  fi
fi

# --- Extract the expected policy from apply-branch-protection.sh -------------
# The expected policy is the JSON heredoc passed to `gh api --method PUT`.
# Parse the block between the `--input - <<JSON` and the terminating `JSON`
# line. This keeps apply-branch-protection.sh as the single source of truth.
EXPECTED_JSON="$(awk '
  /--input - <<JSON/ { in_json=1; next }
  in_json && /^JSON\s*$/ { exit }
  in_json { print }
' "$APPLY_SCRIPT")"

if [[ -z "$EXPECTED_JSON" ]]; then
  echo "error: could not extract the expected policy JSON from $APPLY_SCRIPT" >&2
  exit 1
fi

if ! echo "$EXPECTED_JSON" | jq . >/dev/null 2>&1; then
  echo "error: expected policy JSON extracted from $APPLY_SCRIPT is not valid JSON:" >&2
  echo "$EXPECTED_JSON" >&2
  exit 1
fi

# --- Fetch the live policy ----------------------------------------------------
if [[ $TEST_MODE -eq 1 ]]; then
  LIVE_JSON="$(cat)"
  if [[ -z "$LIVE_JSON" ]]; then echo "error: test mode expects live policy JSON on stdin" >&2; exit 1; fi
else
  set +e
  LIVE_JSON="$(gh api "repos/$REPO/branches/$DEFAULT_BRANCH/protection" 2>/tmp/vbp_gh_err)"
  GH_RC=$?
  set -e

  if [[ $GH_RC -ne 0 ]]; then
    echo "error: could not read live branch protection for $REPO : $DEFAULT_BRANCH (gh rc=$GH_RC)." >&2
    cat /tmp/vbp_gh_err >&2
    echo "This job needs a token with admin:repo (or at least read) access to branch protection." >&2
    echo "Provide it via the BRANCH_PROTECTION_PAT secret (gh CLI reads \$GITHUB_TOKEN)." >&2
    exit 2
  fi
fi

# --- Compare expected vs live (normalized via jq) -----------------------------
# Expected (from the PUT payload) and live (from the GET response) differ in
# shape (e.g. enforce_admins is a bool in PUT vs {enabled:true} in GET), so we
# normalize both sides to the same canonical form.
EXPECTED_NORM="$(echo "$EXPECTED_JSON" | jq -S '. as $e | {strict: $e.required_status_checks.strict, contexts: ($e.required_status_checks.contexts|sort), approvals: $e.required_pull_request_reviews.required_approving_review_count, enforce_admins: $e.enforce_admins, allow_force_pushes: $e.allow_force_pushes, allow_deletions: $e.allow_deletions}')"
LIVE_NORM="$(echo "$LIVE_JSON" | jq -S '. as $l | {strict: $l.required_status_checks.strict, contexts: ($l.required_status_checks.contexts|sort), approvals: $l.required_pull_request_reviews.required_approving_review_count, enforce_admins: $l.enforce_admins.enabled, allow_force_pushes: $l.allow_force_pushes.enabled, allow_deletions: $l.allow_deletions.enabled}')"

echo "Expected policy (from apply-branch-protection.sh):"
echo "$EXPECTED_NORM"
echo
echo "Live policy (from GitHub API):"
echo "$LIVE_NORM"
echo

if [[ "$EXPECTED_NORM" == "$LIVE_NORM" ]]; then
  echo "OK: live branch protection matches the scripted policy."
  echo "  target: $REPO : $DEFAULT_BRANCH"
  exit 0
fi

echo "MISMATCH: live branch protection differs from the scripted policy." >&2
echo "Re-run:  .github/scripts/apply-branch-protection.sh  to restore the intended policy," >&2
echo "or update the script if the policy intent has genuinely changed." >&2
echo
echo "--- diff (expected vs live) ---" >&2
diff <(echo "$EXPECTED_NORM") <(echo "$LIVE_NORM") >&2 || true
exit 1