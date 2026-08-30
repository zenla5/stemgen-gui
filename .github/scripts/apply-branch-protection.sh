#!/usr/bin/env bash
#
# apply-branch-protection.sh
#
# Enables branch protection on the default branch (main) requiring the full CI
# gate. Idempotent — safe to re-run.
#
# Policy (mirrors issue #194):
#   - Require status checks to pass before merging (the "All Checks Passed"
#     aggregator job from .github/workflows/ci.yml).
#   - Require a pull request before merging, with a required approving review
#     count of 0. There is currently only one author/reviewer account (zenla5),
#     and GitHub does not count an author's own review, so requiring 1 approval
#     would make every self-authored PR unmergeable. The effective gate is
#     therefore the "All Checks Passed" status check. Raise this back to 1 if a
#     second reviewer identity (BOT App / maintainer account) is added.
#   - Enforce the above for admins too.
#   - Force pushes and deletions are disabled.
#   - `strict` is deliberately left off so dependency bump PRs (npm dependabot
#     package-lock.json churn) don't have to rebase on every upstream merge —
#     see the trade-off noted in #194.
#
# Usage:
#   .github/scripts/apply-branch-protection.sh [owner/repo]
#
# Requires: gh (authenticated with admin scope on the repo), jq.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || echo '')}"
if [[ -z "$REPO" ]]; then
  echo "error: could not determine repo; pass owner/repo as first arg" >&2
  exit 1
fi

DEFAULT_BRANCH="$(gh api "repos/$REPO" --jq .default_branch)"

echo "Applying branch protection to $REPO : $DEFAULT_BRANCH"

gh api \
  --method PUT \
  "repos/$REPO/branches/$DEFAULT_BRANCH/protection" \
  --input - <<JSON
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["All Checks Passed"]
  },
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false
  },
  "enforce_admins": true,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "allow_auto_merge": false,
  "required_linear_history": false,
  "required_conversation_resolution": true
}
JSON

echo "Branch protection applied."

echo "--- current protection summary ---"
gh api "repos/$REPO/branches/$DEFAULT_BRANCH/protection" \
  --jq '{required_status_checks, required_pull_request_reviews: {required_approving_review_count: .required_pull_request_reviews.required_approving_review_count, require_code_owner_reviews: .required_pull_request_reviews.require_code_owner_reviews}, enforce_admins: .enforce_admins.enabled, allow_force_pushes: .allow_force_pushes.enabled, allow_deletions: .allow_deletions.enabled}'
