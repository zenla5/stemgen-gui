#!/usr/bin/env bash
#
# verify-core-job-list.sh
#
# Ensures the "core CI job" list used by the `check` aggregator (the single
# `needs:` list on the `check` job in .github/workflows/ci.yml) does not
# silently drift from the canonical lists referenced in the docs. See issue
# #203. `check` is the sole place in ci.yml that enumerates gating jobs
# (`notify-failure` depends only on `check`), so its `needs:` is the source of
# truth.
#
# Each doc file carries a single machine-readable line of the form:
#   core job ids: <comma-separated job ids>
# This script extracts the `check` job's `needs` list from ci.yml and compares
# it (order-insensitive) against every doc's list. Exits non-zero on any
# mismatch.
#
# Usage:
#   .github/scripts/verify-core-job-list.sh
#
# Requires: bash, grep, sed, tr, sort, awk.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CI_YML="$REPO_ROOT/.github/workflows/ci.yml"

# --- Extract the canonical list from the `check` job's `needs:` ------------
# We anchor explicitly on the `check:` job block instead of picking the largest
# `needs:` list in the file (that heuristic silently breaks if any other job
# ever grows a larger list, or the list is reformatted across lines). Steps:
#   1. Locate the `check:` job header (a top-level key at 2-space indent).
#   2. Bound the job's block at the next top-level key (or EOF if `check` is the
#      last job).
#   3. Find the job-level `needs:` line (`^    needs:`) within that block. This
#      keeps `notify-failure`'s `needs: [check]` from ever being misread.
#   4. Collect the list from the `needs:` line plus any continuation lines
#      indented >= 6 spaces (covers inline `[a, b]`, multi-line flow, and
#      block-style `- a` lists), then emit every bare job-id token, dropping the
#      literal `needs`. The block bound also excludes the `check` step's
#      `needs.X.result` references, which are not list entries.
CHECK_HEADER_LINE="$(grep -nE '^  check:[[:space:]]*(#.*)?$' "$CI_YML" | head -n1 | cut -d: -f1)"
BLOCK_END="$(awk -v s="$CHECK_HEADER_LINE" 'NR > s && /^  [A-Za-z0-9_-]+:/ { print NR; exit }' "$CI_YML")"
TOTAL_LINES="$(wc -l < "$CI_YML")"
BLOCK_END="${BLOCK_END:-$((TOTAL_LINES + 1))}"
CHECK_NEEDS_LINE="$(awk -v s="$CHECK_HEADER_LINE" -v e="$BLOCK_END" 'NR >= s && NR < e && /^    needs:/ { print NR; exit }' "$CI_YML")"

if [[ -z "$CHECK_NEEDS_LINE" ]]; then
  echo "error: could not locate the 'check' job's 'needs:' list in $CI_YML" >&2
  exit 1
fi

CANONICAL="$(awk -v n="$CHECK_NEEDS_LINE" -v e="$BLOCK_END" '
  NR >= n && NR < e {
    match($0, /^ */); ind = RLENGTH;
    if (NR == n || ind >= 6) print;
    else exit;
  }' "$CI_YML" \
  | grep -oE '[A-Za-z0-9_][A-Za-z0-9_-]*' \
  | grep -vx 'needs' \
  | sort -u)"

if [[ -z "$CANONICAL" ]]; then
  echo "error: could not parse the 'check' job's needs list from $CI_YML" >&2
  exit 1
fi

echo "Canonical core job ids (from the check job needs list in .github/workflows/ci.yml):"
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