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
# Requires: bash, grep, sed, tr, sort.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CI_YML="$REPO_ROOT/.github/workflows/ci.yml"

# --- Extract the canonical list from the `check` job's `needs:` ------------
# The `check` aggregator declares the largest `needs:` list in the file (it
# lists every gating job). `notify-failure` also declares `needs: [check]`, but
# that is a single-element list. We pick the `needs:` line with the most
# comma-separated job ids, which is unambiguously `check`'s.
CHECK_NEEDS_LINE="$(grep -nE '\s+needs:\s*\[' "$CI_YML" \
  | while IFS=: read -r ln _; do
      printf '%s %s\n' "$(sed -n "${ln}p" "$CI_YML" | grep -o ',' | wc -l)" "$ln"
    done \
  | sort -k1,1nr | head -n1 | awk '{print $2;}')"

if [[ -z "$CHECK_NEEDS_LINE" ]]; then
  echo "error: could not locate a 'needs: [ ... ]' list in $CI_YML" >&2
  exit 1
fi

NEEDS_RAW="$(sed -n "${CHECK_NEEDS_LINE}p" "$CI_YML")"
CANONICAL="$(printf '%s' "$NEEDS_RAW" \
  | sed -E 's/^.*needs:\s*\[//; s/\]\s*$//' \
  | tr ',' '\n' \
  | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
  | grep -v '^$' \
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