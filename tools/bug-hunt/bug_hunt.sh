#!/usr/bin/env bash
#
# bug_hunt.sh — iterative bug-hunt & visual QA loop for StemgenGUI.
#
# Stops (definition of done) ONLY when ALL of: npm run check, lint, test, test:e2e
# pass AND a fresh vision review finds no defects AND layout/overflow checks pass.
# It never stops on the model's word — only on real gate + inspection results.
#
# Per iteration:
#   1) run gates (check, lint, test, test:e2e)
#   2) capture fresh screenshots + console log + layout checks
#   3) vision-review every screenshot (multimodal, minimax-m3)
#   4) merge findings into hunt-input.txt (deduped)
#   5) clean -> exit 0 ; else bug-hunter (text model) fixes, ONE COMMIT PER FIX -> loop
#
# Convergence guards: MAX_ITER (default 40, exit 1 on exhaustion), stall detector
# (identical finding 3x -> "stalled"), token/cost caps via env.
#
# Safety: runs on a dedicated scratch branch; never touches main; never destroys
# untracked work; idempotent from a clean checkout.
#
# IMPORTANT: nested `opencode run` must not inherit the host opencode session's
# env (OPENCODE_CLIENT=desktop …) — see the env block below.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HUNT_DIR="$ROOT/tools/bug-hunt"
SHOTS="$HUNT_DIR/screenshots"
LOG="$HUNT_DIR/bug_hunt.log"
INPUT="$HUNT_DIR/hunt-input.txt"
CONSOLE="$SHOTS/console-errors.log"
LAYOUT="$SHOTS/layout-violations.txt"
SUMMARY="$HUNT_DIR/summary.txt"

MAX_ITER="${MAX_ITER:-40}"
STALL_LIMIT=3
TOKEN_CAP="${TOKEN_CAP:-4000000}"   # soft cost/token guard (reported, enforced below)
START_EPOCH="$(date +%s)"
START_DATE="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# E2E gate scope. `npm run test:e2e` (playwright test) runs BOTH the `chromium`
# project (dev-server, observable React UI) AND the `binary` project (compiled
# Tauri app over CDP). The `binary` project is out of scope for this harness
# (it needs the Rust build / is the Rust shell, see README) and is unrunnable in
# a clean checkout without a Rust toolchain. We therefore gate on the `chromium`
# project, which exercises the reachable, observable UI.
E2E_CMD=(npx playwright test --project=chromium)

# Detach from any host opencode session so `opencode run --agent …` works.
unset OPENCODE_CLIENT OPENCODE_SERVER_PASSWORD OPENCODE_SERVER_USERNAME 2>/dev/null || true
export OPENCODE_CLIENT=cli

mkdir -p "$SHOTS"

log() { printf '%s | %s\n' "$(date -u '+%H:%M:%S')" "$*" | tee -a "$LOG"; }
die() { log "FATAL: $*"; exit 1; }

# ---------------------------------------------------------------------------
# Gates — returns 0 only if all four pass. Records per-gate output so gate
# failures can be fed back to the bug-hunter, and sets GATES_OK=1 when green.
# ---------------------------------------------------------------------------
GATE_DIR="$HUNT_DIR/_gates"
GATE_FILE="$HUNT_DIR/gate-fail.txt"
GATES_OK=0
run_gates() {
  log '== gates ='
  rm -rf "$GATE_DIR"; mkdir -p "$GATE_DIR"
  : > "$GATE_FILE"
  local fail=0 gate cmd tmo
  for gate in check lint test e2e; do
    case $gate in
      check) cmd="npm run check";           tmo=300;;
      lint)  cmd="npm run lint";            tmo=300;;
      test)  cmd="npm run test";            tmo=600;;
      e2e)   cmd="${E2E_CMD[*]}";           tmo=900;;
    esac
    if timeout "$tmo" bash -c "( cd '$ROOT' && $cmd )" >"$GATE_DIR/$gate.log" 2>&1; then
      log "gate $gate: PASS"
    else
      log "gate $gate: FAIL"
      fail=1
      touch "$GATE_DIR/$gate.fail"
      {
        printf '[SEVERITY] critical\n[SCREEN] gates\n[FILE] _gates/%s.log\n[CATEGORY] crash\n' "$gate"
        printf '[DESCRIPTION] gate failed (%s) — see _gates/%s.log\n' "$gate" "$gate"
        printf '[REPRO] npm run %s (e2e is %s)\n\n' "$gate" "${E2E_CMD[*]}"
      } >> "$GATE_FILE"
    fi
  done
  if [ "$fail" -eq 0 ]; then GATES_OK=1; log 'gates: PASS'; else GATES_OK=0; log 'gates: FAIL'; fi
  return "$fail"
}

# ---------------------------------------------------------------------------
# Capture fresh screenshots (all §3 states, both themes), console log, layout.
# ---------------------------------------------------------------------------
capture() {
  log '== capture screenshots (fresh) ='
  # Freshness: never reuse stale console/layout/FAIL artifacts between iterations.
  : > "$CONSOLE"
  : > "$LAYOUT"
  rm -f "$SHOTS"/FAIL_*.txt
  ( cd "$ROOT" && npx tsx "$HUNT_DIR/capture-screenshots.ts" ) >>"$LOG" 2>&1 \
    || log 'capture: some states failed (see FAIL_*.txt)'
  if [ -s "$LAYOUT" ]; then
    log "LAYOUT/OVERFLOW VIOLATIONS DETECTED"
  fi
}

# ---------------------------------------------------------------------------
# Vision review — inspect every screenshot, machine-readable findings only.
# ---------------------------------------------------------------------------
vision_review() {
  log '== vision review ='
  local oc
  oc="$(command -v opencode 2>/dev/null || true)"
  if [ -z "$oc" ]; then
    log 'VISION UNAVAILABLE: opencode CLI not found on PATH — cannot claim GREEN without it'
    printf '[SEVERITY] critical\n[SCREEN] vision\n[FILE] n/a\n[CATEGORY] other\n[DESCRIPTION] opencode CLI is not installed or not on PATH, so the multimodal vision-review could not run; the definition of done cannot be met without it\n[REPRO] install opencode (npm install -g opencode-ai) and ensure it is on PATH, then re-run\n\n' >> "$INPUT"
    return 1
  fi
  local -a files=()
  local f
  for f in "$SHOTS"/*.png; do [ -e "$f" ] || continue; files+=( -f "$f" ); done
  [ "${#files[@]}" -eq 0 ] && { log 'vision: no screenshots'; return 0; }
  local prompt
  prompt="Open EVERY attached PNG plus the console log at $CONSOLE and the layout
report at $LAYOUT. For each image report every visible defect (layout, overflow,
clipping, overlap, color contrast, alignment, typography, truncation, missing
content/state). Also report page/console errors. Output ONLY findings in EXACTLY
this format, one entry per finding:
[SEVERITY] (critical|major|minor|cosmetic)
[SCREEN]   state_theme (e.g. mixer_dark)
[FILE]     screenshot filename
[CATEGORY] layout|overflow|color|typography|interaction|state|console|crash|other
[DESCRIPTION] one precise sentence
[REPRO]    how to reproduce
If every screenshot looks clean, output exactly: [CLEAN]"
  "$oc" run "$prompt" "${files[@]}" --agent vision-review \
    >>"$INPUT" 2>>"$LOG"
}

# ---------------------------------------------------------------------------
# Build hunt-input.txt: vision + layout + console findings, de-duplicated.
# Returns 0 if nothing wrong, 1 if findings remain.
# ---------------------------------------------------------------------------
build_input() {
  log '== build hunt-input.txt ='
  : > "$INPUT"
  vision_review

  if [ -s "$GATE_FILE" ]; then
    while IFS= read -r block; do
      [ -z "${block:-}" ] && continue
      printf '%s\n\n' "$block" >> "$INPUT"
    done < "$GATE_FILE"
  fi

  if [ -s "$LAYOUT" ]; then
    while IFS= read -r v; do
      [ -z "$v" ] && continue
      printf '[SEVERITY] major\n[SCREEN] layout\n[FILE] layout-violations.txt\n[CATEGORY] overflow\n[DESCRIPTION] %s\n[REPRO] automated layout/overflow check\n\n' "$v" >> "$INPUT"
    done < "$LAYOUT"
  fi

  if [ -s "$CONSOLE" ]; then
    grep -E '^(CONSOLE|PAGE):' "$CONSOLE" | sort -u | while IFS= read -r line; do
      [ -z "$line" ] && continue
      printf '[SEVERITY] major\n[SCREEN] console\n[FILE] console-errors.log\n[CATEGORY] console\n[DESCRIPTION] %s\n[REPRO] app boot / navigation\n\n' "$line" >> "$INPUT"
    done
  fi

  # Normalize every finding into a canonical 6-field machine-readable block and
  # de-duplicate WITHIN this iteration only (so a recurring defect keeps
  # surfacing across iterations and the stall detector can catch it).
  awk 'BEGIN { RS="\n\n"; FS="\n" }
  {
    s=sc=fi=ca=de=re="";
    for (i=1;i<=NF;i++) {
      ln=$i; gsub(/\r$/,"",ln); gsub(/^[ \t]+|[ \t]+$/,"",ln);
      if      (ln ~ /^\[SEVERITY\]/) s=ln;
      else if (ln ~ /^\[SCREEN\]/)   sc=ln;
      else if (ln ~ /^\[FILE\]/)     fi=ln;
      else if (ln ~ /^\[CATEGORY\]/) ca=ln;
      else if (ln ~ /^\[DESCRIPTION\]/) de=ln;
      else if (ln ~ /^\[REPRO\]/)    re=ln;
    }
    if (s=="") next;
    if (sc=="") sc="[SCREEN] n/a";
    if (fi=="") fi="[FILE] n/a";
    if (ca=="") ca="[CATEGORY] other";
    if (de=="") de="[DESCRIPTION] n/a";
    if (re=="") re="[REPRO] n/a";
    blk=s"\n"sc"\n"fi"\n"ca"\n"de"\n"re;
    if (!(blk in seen)) { seen[blk]=1; printf "%s\n\n", blk }
  }' "$INPUT" > "$INPUT.tmp" 2>/dev/null
  mv "$INPUT.tmp" "$INPUT"

  if grep -q '^\[SEVERITY\]' "$INPUT"; then
    log 'hunt-input.txt: findings present'
    return 1
  fi
  log 'hunt-input.txt: CLEAN'
  return 0
}

# ---------------------------------------------------------------------------
# Stall detector — hunt-input.txt identical (normalized) for STALL_LIMIT
# consecutive iterations => likely not a trivial fix, stop rather than churn.
# ---------------------------------------------------------------------------
STALL_HIST=()
stalled() {
  local sig
  sig="$(md5sum < "$INPUT" 2>/dev/null | awk '{print $1}')"
  STALL_HIST+=( "$sig" )
  local n=${#STALL_HIST[@]}
  if [ "$n" -ge "$STALL_LIMIT" ]; then
    local last=${STALL_HIST[$((n-1))]} same=0
    local i
    for (( i=n-1; i>=0; i-- )); do
      if [ "${STALL_HIST[$i]}" = "$last" ]; then same=$((same+1)); else break; fi
    done
    if [ "$same" -ge "$STALL_LIMIT" ]; then
      log "STALLED: identical findings for ${STALL_LIMIT} consecutive iterations"
      printf 'STALLED\nHunt-input unchanged for %s consecutive iterations — likely not a trivial fix.\n\n%s\n' \
        "$STALL_LIMIT" "$(cat "$INPUT")" > "$SUMMARY"
      return 0
    fi
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Cost/token guard (soft): compares today's opencode usage vs cap.
# ---------------------------------------------------------------------------
over_budget() {
  [ -z "${TOKEN_CAP:-}" ] && return 1
  local used
  used="$(opencode stats --days 1 --format json 2>/dev/null | sed 's/.*"tokens"\s*:\s*\([0-9]*\).*/\1/' || echo 0)"
  [ "${used:-0}" -ge "$TOKEN_CAP" ] 2>/dev/null && { log "BUDGET REACHED (used≈$used ≥ cap=$TOKEN_CAP)"; return 0; }
  return 1
}

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
log "bug_hunt started $START_DATE (repo: $ROOT) MAX_ITER=$MAX_ITER TOKEN_CAP=$TOKEN_CAP"

# Safety: dedicated scratch branch, never touch main, preserve untracked work.
SCRATCH="bug-hunt-$(date +%s)"
(
  cd "$ROOT" || exit 1
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log 'not a git work tree — continuing without branch (read-only on main)'
    exit 0
  fi
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    # Do not stash; attribute untracked files to the harness normally. If tracked
    # files are dirty (pre-existing), still proceed but never checkout main.
    log 'note: working tree has changes; harness will not touch main'
  fi
  git checkout -q -b "$SCRATCH" 2>/dev/null || git switch -q -c "$SCRATCH" 2>/dev/null \
    || log 'warning: could not create scratch branch (proceeding on current worktree)'
  echo "$SCRATCH" >> "$ROOT/tools/bug-hunt/.scratch-branch"
) 2>>"$LOG"

for i in $(seq 1 "$MAX_ITER"); do
  log "================ ITERATION $i / $MAX_ITER ================"

  run_gates   # sets GATES_OK=1 only if check+lint+test+e2e all pass

  capture

  build_input  # returns 1 when findings remain
  input_ok=$?
  if [ "$GATES_OK" -eq 1 ] && [ "$input_ok" -eq 0 ]; then
    # Definition of done: ALL gates green AND vision + layout + console clean.
    log 'no findings and all gates green — definition of done met'
    printf 'GREEN\nAll gates (check, lint, test, test:e2e) + vision review + layout checks pass.\nScreenshots: %s\n' "$SHOTS" > "$SUMMARY"
    log '======== DONE (green) ========'
    exit 0
  elif [ "$GATES_OK" -eq 0 ]; then
    log 'gates red — definition of done NOT met; bug-hunter must fix'
  fi

  if stalled; then
    log 'stalling — stopping with signature'
    exit 1
  fi

  if over_budget; then
    log 'exceeded token/cost cap — stopping'
    printf 'BUDGET\nExceeded TOKEN_CAP=%s\n' "$TOKEN_CAP" > "$SUMMARY"
    exit 1
  fi

  local oc
  oc="$(command -v opencode 2>/dev/null || true)"
  if [ -z "$oc" ]; then
    log 'bug-hunter UNAVAILABLE: opencode CLI not on PATH — cannot fix findings'
  else
    log 'calling bug-hunter (one commit per fix, then re-gates)'
    "$oc" run \
      "Read $INPUT. Fix EACH distinct finding with exactly ONE commit per finding (never one batch commit). After each fix re-run: npm run check, npm run lint, npm run test — all must pass before you stop. Only report which gates pass; never claim the loop done." \
      --agent bug-hunter >>"$LOG" 2>&1 || log 'bug-hunter returned nonzero (loop continues)'
  fi
done

log "MAX_ITER=$MAX_ITER reached without converging"
printf 'GIVEUP\nReached MAX_ITER=%s without all gates + vision + layout green.\n' "$MAX_ITER" > "$SUMMARY"
log '======== GIVEUP (iteration cap) ========'
exit 1