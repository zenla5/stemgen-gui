#!/usr/bin/env bash
#
# verify-core-job-list.sh
#
# Ensures the "core CI job" list used by the `check` aggregator (defined once as
# the `x-core-jobs` YAML anchor in .github/workflows/ci.yml) does not silently
# drift from the canonical lists referenced in the docs. See issue #203.
#
# Each doc file carries a single machine-readable line of the form:
#   core job ids: <comma-separated job ids>
# This script extracts the anchor from ci.yml and compares it (order-insensitive)
# against every doc's list. Exits non-zero on any mismatch.
#
# Usage:
#   .github/scripts/verify-core-job-list.sh
#
# Requires: bash, grep, sed, tr, sort.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CI_YML="$REPO_ROOT/.github/workflows/ci.yml"

# --- Extract the canonical list from the YAML anchor -------------------------
# The anchor looks like:
#   x-core-jobs: &core-jobs [frontend, integration, backend, ...]
# We capture everything inside the square brackets, split on commas, trim.
ANCHOR_LINE="$(grep -E '^\s*x-core-jobs:\s+&core-jobs\s*\[' "$CI_YML")"
if [[ -z "$ANCHOR_LINE" ]]; then
  echo "error: could not find the 'x-core-jobs' anchor in $CI_YML" >&2
  exit 1
fi

CANONICAL="$(printf '%s' "$ANCHOR_LINE" \
  | sed -E 's/^[^[]*\[//; s/\][^]]*$//' \
  | tr ',' '\n' \
  | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
  | grep -v '^$' \
  | sort -u)"

if [[ -z "$CANONICAL" ]]; then
  echo "error: parsed an empty core-job list from the anchor in $CI_YML" >&2
  exit 1
fi

echo "Canonical core job ids (from .github/workflows/ci.yml):"
printf '  %s\n' "$CANONICAL"

# --- Docs to validate --------------------------------------------------------
DOCS=(
  "$REPO_ROOT/docs/CI_GATE.md"
  "$REPO_ROOT/AGENT_GUIDE.md"
)

rc=0
for doc in "${DOCS[@]}"; do
  [[ -f "$doc" ]] || { echo "error: doc file missing: $doc" >&2; rc=1; continue; }

  DOC_LINE="$(grep -E 'core job ids\s*:' "$doc" | head -n 1 || true)"
  if [[ -z "$DOC_LINE" ]]; then
    echo "error: $doc does not contain a 'core job ids:' line" >&2
    rc=1
    continue
  fi

  DOC_IDS="$(printf '%s' "$DOC_LINE" \
    | sed -E 's/^.*core job ids\s*:\s*//' \
    | tr ',' '\n' \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
    | grep -v '^$' \
    | sort -u)"

  if [[ "$DOC_IDS" == "$CANONICAL" ]]; then
    echo "OK   : $doc"
    continue
  fi

  echo "MISMATCH: $doc"
  echo "  Missing from doc : $(comm -23 <(printf '%s\n' "$CANONICAL") <(printf '%s\n' "$DOC_IDS") | tr '\n' ' ')"
  echo "  Not in canonical : $(comm -13 <(printf '%s\n' "$CANONICAL") <(printf '%s\n' "$DOC_IDS") | tr '\n' ' ')"
  rc=1
done

if [[ "$rc" -ne 0 ]]; then
  echo "error: core CI job list has drifted from the canonical anchor." >&2
  echo "Update the 'core job ids:' line in the flagged docs to match:" >&2
  printf '  %s\n' "$CANONICAL" >&2
  exit 1
fi

echo "Core CI job list is in sync across ci.yml and docs."