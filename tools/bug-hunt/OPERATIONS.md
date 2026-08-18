# Bug-hunt harness — operations runbook

How to run, monitor, and reason about the harness. Also includes an operator
prompt template for an agent/LLM that monitors a run.

## Status: runnable
The harness is **complete and runnable**. It was proven end-to-end on this
machine: `cd tools/bug-hunt && ./bug_hunt.sh` → `EXIT=0` (GREEN) with
`npm run check`, `lint`, `test`, and the chromium E2E all passing, a clean
`vision-review`, and no layout violations.

## Prerequisites
- `npm install` (dev deps; includes `tsx`).
- `opencode` CLI on `PATH`, agents configured in `~/.config/opencode/opencode.json`
  (`bug-hunter`, `vision-review`).
- `OPENROUTER_API_KEY` exported.
- Optional (only for full-suite / real-app work): Rust toolchain + Tauri/WebKit
  deps + display (see README "E2E scope boundary" and the Tauri note below).
- **NixOS inotify caveat**: the `localsearch` indexer can exhaust the inotify
  watch limit (`ENOSPC: file watchers`) and break the Vite dev server. If that
  happens, stop it first:
  ```bash
  LSP=$(pgrep -f localsearch-cli | head -1); [ -n "$LSP" ] && kill "$LSP"
  cat /proc/sys/fs/inotify/max_user_watches   # want lots of headroom free
  ```

## Run
```bash
cd tools/bug-hunt
./bug_hunt.sh                  # default MAX_ITER=40
MAX_ITER=5 ./bug_hunt.sh       # bounded trial
TOKEN_CAP=2000000 ./bug_hunt.sh  # soft token/cost guard
```
The loop: gates → fresh capture → vision-review → merge to `hunt-input.txt` →
green if gates+vision+layout clean, else `bug-hunter` fixes (one commit per
fix) → repeat.

## Exit codes & how to read them
| Code | Meaning | Where to look |
|------|---------|---------------|
| `0`  | GREEN: gates + vision + layout all clean | `summary.txt` says `GREEN` |
| `1`  | Gave up: `MAX_ITER` exhausted, **stalled** (identical `hunt-input.txt` 3×), or budget | `summary.txt` (`GIVEUP`/`STALLED`/`BUDGET`) |
| hangs | Never expected — gates are `timeout`-bounded; report it | `bug_hunt.log` |

## Monitor
- `bug_hunt.log` — cumulative run log (harness messages + gate `_gates/*.log`).
- `hunt-input.txt` — the machine-readable findings fed to `bug-hunter`. Empty ⇒ clean.
- `gate-fail.txt`, `_gates/*.log` — gate results and per-gate output.
- `screenshots/*.png` — full §3 coverage, light+dark, desktop+mobile.
- `screenshots/console-errors.log` — browser + page errors per state.
- `screenshots/layout-violations.txt` — only present when overflow/layout checks fire.
- `summary.txt` — final disposition (GREEN/GIVEUP/STALLED/BUDGET).

While a run is active you can watch progress with:
```bash
tail -f tools/bug-hunt/bug_hunt.log
grep -a "ITERATION\|gates: PASS\|gates: FAIL\|DONE\|STALLED" tools/bug-hunt/bug_hunt.log
```

## Operator / monitoring prompt (for an agent or a human operator)

```
You are monitoring a StemgenGUI bug-hunt run in $PWD/tools/bug-hunt.
Check each gap and report status concisely:
1. Is bug_hunt.sh still running? (pgrep -f bug_hunt.sh)
2. Current progress: last ITERATION, recent "gates: PASS/FAIL", whether it is in
   gates / capture / vision-review / bug-hunter phase.
3. Is hunt-input.txt currently non-empty? If so, list the distinct findings
   (SCREEN + CATEGORY + DESCRIPTION) and how many iterations they have persisted.
4. Any GATE FAIL entries in bug_hunt.log or gate-fail.txt? Which gate(s)?
5. Any layout-violations.txt content or console-errors in screenshots/console-errors.log?
6. If the run produced summary.txt, read it and report the disposition.
7. Alert ONLY if: the loop has been on the SAME finding for 3+ iterations
   (stall), a gate keeps failing, MAX_ITER is near exhaustion, or summary.txt
   says STALLED/GIVEUP. Do not interpret clean green states as a problem.
Report as a short checklist. Do not modify anything.
```

## Tauri / full-suite note (only if you want the `binary` E2E, otherwise skip)
The `binary` project needs a compiled Tauri app with CDP (`--features devtools`)
and a display. If you add it (set `E2E_CMD=("npm" "run" "test:e2e")`), you need
the system libs — see `Tauri setup on NixOS` snippet in README/notes.

## Next steps (recommended)
1. Review the PR using `tools/bug-hunt/REVIEW.md`; merge once approved.
2. Before relying on CI: decide trigger (workflow_dispatch-only vs scheduled) and
   whether you want automatic Issue creation on give-up.
3. Do a small bounded trial (`MAX_ITER=5`) and confirm the exit code + artifacts.
4. Only if you want the full Rust suite: install Tauri/WebKit deps and build the
   binary once (out of scope for the current harness gate).