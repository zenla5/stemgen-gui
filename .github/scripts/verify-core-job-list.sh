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
#   .github/scripts/verify-core-job-list.sh              # verify ci.yml vs docs
#   .github/scripts/verify-core-job-list.sh --self-test  # parser regression tests
#
# Requires: bash, grep, sed, tr, sort, awk.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CI_YML="$REPO_ROOT/.github/workflows/ci.yml"

# --- Extract the canonical list from a CI file's `check` job ----------------
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
#      literal `needs`. Collection stops at the first line after `needs:` with
#      fewer than 6 leading spaces (e.g. `if: always()` or the next job key),
#      which also excludes the `check` step's `needs.X.result` references.
#
# Prints the sorted, deduplicated set of job ids (one per line) to stdout and
# returns 0. Returns 1 (with a message on stderr) if the list cannot be located.
extract_core_job_ids() {
  local ci_yml="$1"
  local check_header_line block_end total_lines check_needs_line ids

  check_header_line="$(grep -nE '^  check:[[:space:]]*(#.*)?$' "$ci_yml" | head -n1 | cut -d: -f1)"
  block_end="$(awk -v s="$check_header_line" 'NR > s && /^  [A-Za-z0-9_-]+:/ { print NR; exit }' "$ci_yml")"
  total_lines="$(wc -l < "$ci_yml")"
  block_end="${block_end:-$((total_lines + 1))}"
  check_needs_line="$(awk -v s="$check_header_line" -v e="$block_end" 'NR >= s && NR < e && /^    needs:/ { print NR; exit }' "$ci_yml")"

  if [[ -z "$check_needs_line" ]]; then
    echo "error: could not locate the 'check' job's 'needs:' list in $ci_yml" >&2
    return 1
  fi

  ids="$(awk -v n="$check_needs_line" -v e="$block_end" '
    NR >= n && NR < e {
      match($0, /^ */); ind = RLENGTH;
      if (NR == n || ind >= 6) print;
      else exit;
    }' "$ci_yml" \
    | grep -oE '[A-Za-z0-9_][A-Za-z0-9_-]*' \
    | grep -vx 'needs' \
    | sort -u)"

  if [[ -z "$ids" ]]; then
    echo "error: could not parse the 'check' job's needs list from $ci_yml" >&2
    return 1
  fi

  printf '%s\n' "$ids"
}

# --- Self-test mode (issue #210) ---------------------------------------------
# Feeds synthetic ci.yml fragments through extract_core_job_ids and asserts the
# expected job-id set for each. Protects the parser against future reformats of
# the real ci.yml: inline `[a, b]`, multi-line flow, block-style `- a` lists, a
# decoy job with a larger `needs:` list, `check` as the last job, and
# `needs.X.result` references inside the `check` steps. A regression to the old
# "longest needs line" heuristic fails the decoy case.
self_test() {
  local rc=0
  # Global (not local) so the EXIT cleanup trap can still expand it after
  # self_test returns; under `set -u` a dead local would be an unbound var.
  SELF_TEST_TMPDIR="$(mktemp -d)"
  tmpdir="$SELF_TEST_TMPDIR"
  trap 'rm -rf "$SELF_TEST_TMPDIR"' EXIT

  assert_ids() {
    local name="$1" expected="$2" file="$3" got
    got="$(extract_core_job_ids "$file" || true)"
    if [[ "$(printf '%s\n' "$expected" | sort -u)" == "$(printf '%s\n' "$got" | sort -u)" ]]; then
      echo "PASS: $name"
    else
      echo "FAIL: $name"
      echo "  expected: $(printf '%s\n' "$expected" | sort -u | tr '\n' ' ')"
      echo "  got     : $(printf '%s\n' "$got" | sort -u | tr '\n' ' ')"
      rc=1
    fi
  }

  cat > "$tmpdir/inline.yml" <<'EOF'
  some-job:
    needs: [decoy]
  check:
    needs: [alpha, beta, gamma]
    if: always()
EOF
  assert_ids "inline [a, b, c] list" $'alpha\nbeta\ngamma' "$tmpdir/inline.yml"

  cat > "$tmpdir/multiline.yml" <<'EOF'
  check:
    needs: [
      alpha,
      beta,
      gamma
    ]
    if: always()
EOF
  assert_ids "multi-line flow list" $'alpha\nbeta\ngamma' "$tmpdir/multiline.yml"

  cat > "$tmpdir/block.yml" <<'EOF'
  check:
    needs:
      - alpha
      - beta
      - gamma
    if: always()
EOF
  assert_ids "block-style list" $'alpha\nbeta\ngamma' "$tmpdir/block.yml"

  cat > "$tmpdir/decoy.yml" <<'EOF'
  heavy-job:
    needs: [a, b, c, d, e, f, g, h, i]
    if: always()
  check:
    needs: [alpha, beta]
    if: always()
  tail-job:
    needs: [check]
EOF
  assert_ids "decoy larger needs: on another job" $'alpha\nbeta' "$tmpdir/decoy.yml"

  cat > "$tmpdir/check-last.yml" <<'EOF'
  check:
    needs: [alpha, beta]
EOF
  assert_ids "check as last job (EOF fallback)" $'alpha\nbeta' "$tmpdir/check-last.yml"

  cat > "$tmpdir/needs-refs.yml" <<'EOF'
  check:
    name: All Checks Passed
    needs: [alpha, beta]
    if: always()
    steps:
      - name: verify
        run: |
          if [[ "${{ needs.alpha.result }}" == "failure" ]]; then exit 1; fi
          if [[ "${{ needs.beta.result }}" == "cancelled" ]]; then exit 1; fi
EOF
  assert_ids "needs.X.result refs in steps ignored" $'alpha\nbeta' "$tmpdir/needs-refs.yml"

  if [[ "$rc" -ne 0 ]]; then
    echo "error: one or more verify-core-job-list.sh self-tests failed." >&2
    return 1
  fi
  echo "verify-core-job-list.sh --self-test: OK"
  return 0
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit $?
fi

CANONICAL="$(extract_core_job_ids "$CI_YML")"

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
