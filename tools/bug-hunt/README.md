# StemgenGUI Bug-Hunt & Visual QA Harness

A self-contained, AI-driven harness that iterates on the StemgenGUI React UI
until it is *observably* bug-free — giving the agent "eyes" to see the UI instead
of guessing. It drives the app's **real** Vue‑free React UI in a real browser,
screenshots every visible state in both themes, runs automated layout/overflow
checks, and routes work to two separate models:

| Agent | Model | Role |
|-------|-------|------|
| `bug-hunter`   | `openrouter/~deepseek/deepseek-v4-flash-latest` (text)      | fixes found defects, one commit per fix, re-runs gates, never claims done |
| `vision-review` | `openrouter/minimax/minimax-m3` (multimodal)               | opens every screenshot + console log, reports concrete defects |

## Layout

```
tools/bug-hunt/
├── bug_hunt.sh                  # the iterative loop (the only supported entry point)
├── capture-screenshots.ts       # Playwright driver: screenshots + console log + layout checks
├── playwright.bughunt.config.ts # OPTIONAL config override (not required by the loop)
├── README.md
├── bug_hunt.log                 # cumulative run log (generated)
├── hunt-input.txt               # de-duplicated, machine-readable findings (generated)
├── summary.txt                  # GREEN / GIVEUP / STALLED / BUDGET (generated)
├── gate-fail.txt, _gates/       # gate results + per-gate output (generated)
└── screenshots/                 # <state>_<light|dark>.png [+ _mobile], console-errors.log,
                                 #   layout-violations.txt (generated fresh every iteration)
```

## Run it

```bash
cd tools/bug-hunt
./bug_hunt.sh                 # default MAX_ITER=40
MAX_ITER=3 ./bug_hunt.sh      # cap iterations
TOKEN_CAP=2000000 ./bug_hunt.sh   # soft token/cost guard
CREATE_ISSUES=1 ./bug_hunt.sh     # opt-in: file GitHub issues for unfixed bugs
FILE_TOOLING_ISSUES=0 ./bug_hunt.sh   # exclude harness/env findings
MAX_ISSUES=5 ./bug_hunt.sh        # cap distinct issues filed per run
```

Requirements: Node + npm deps installed (`npm i`), `opencode` CLI on PATH with
the two agents configured, `OPENROUTER_API_KEY` set. No Rust/Tauri build needed.

### Issue filing (opt-in via `CREATE_ISSUES=1`)

By default a non-green local run (STALLED / BUDGET / GIVEUP) only leaves findings
in `hunt-input.txt` and `summary.txt`. Set `CREATE_ISSUES=1` to also file one
real GitHub issue per **distinct** unfixed bug against `BUG_HUNT_REPO`. The repo
slug is auto-derived from `git remote get-url origin` (override with
`BUG_HUNT_REPO=owner/repo`). At most `MAX_ISSUES` distinct issues are filed per
run (default 20). Dedup is by a canonical signature (root-cause category + a
normalized description fingerprint spanning a few significant tokens) so the same
root cause seen across many screens files once; clean/n/a noise blocks are never
filed. Dedup also consults already-open issues by title and body; a `gh` search
**or** dedup-parse **error** is treated as "skip, log" — never "create" — so a
transient API failure cannot produce a duplicate. Filing is best-effort —
failures are logged, never fatal — and CI behavior is unchanged (it keeps its own
single give-up Issue and issue-filing stays off there).

> **What gets filed.** At a non-green end, **all** distinct findings present in
> `hunt-input.txt` are filed — **not only product UI bugs**. This deliberately
> includes harness/tooling-level findings: a `vision-review` failure, a missing
> `opencode` CLI on PATH, and gate-failure `crash` blocks (all `[SCREEN]` values
> of `vision` / `gates`). A broken local env can therefore produce `[Bug-Hunt]`
> issues that are not product defects. Set `FILE_TOOLING_ISSUES=0` to drop those
> `vision`/`gates` findings and file only product-level defects. **Review and
> curate** any filed issues before treating them as product-only; drop any that
> describe a tooling/environment problem rather than an app bug.

CI: an optional `.github/workflows/bug-hunt.yml` runs the same loop on a GitHub
runner (manual `workflow_dispatch`; installs `opencode-ai` and reads the repo's
`.opencode/opencode.json`). Note: a GitHub runner is ephemeral and has no push
credentials, so **fixes `bug-hunter` makes in CI are not pushed back** — CI is a
watchdog (proves convergence, uploads findings/screenshots, opens an Issue on
give-up). Run locally to actually land fixes.

Exit status:
- `0` — **GREEN**: all four gates pass **and** a fresh vision review finds no
  defects **and** the automated layout/overflow checks are clean.
- `1` — gave up (iteration cap), stalled (identical findings `STALL_LIMIT=3`
  consecutive iterations), or budget reached — inspect `summary.txt`.

## Definition of done (the ONLY way to stop early)

The loop stops early **only** when *all* of the following hold. It never stops on
the model's word — only on real gate + inspection results:

1. `npm run check` passes
2. `npm run lint` passes
3. `npm run test` passes
4. **E2E gate passes** — `npx playwright test --project=chromium` (see below)
5. A **fresh** `vision-review` reports no defects
6. No layout/overflow violations from the automated checks

> **E2E scope boundary.** `npm run test:e2e` (`playwright test`) runs BOTH the
> `chromium` project (dev-server, the reachable observable React UI) AND the
> `binary` project (drives the **compiled Tauri/Rust app** over CDP). The
> `binary` project is deliberately **out of scope** for this harness — it needs a
> Rust toolchain + built app, and verifying the Rust backend is explicitly out of
> scope. The harness therefore gates on the `chromium` project, which exercises
> the observable UI. `bug_hunt.sh` sets `E2E_CMD` accordingly. If you build the
> Tauri binary and want the full suite, set `E2E_CMD=("npm" "run" "test:e2e")`.

## Screenshot coverage (§3)

Captured for **both light and dark**, desktop 1280×800 + mobile 390×844:

`home_empty`, `browser_files`, `dragover`, `processing`, `mixer`, `mixer_muted`,
`mixer_soloed`, `mixer_80`, `settings`, `history`, `history_empty`, `error`.

State is seeded through the app's own Zustand stores (via Vite's module graph)
and the UI is driven through the real sidebar. No app source is modified.
The `error` state emits a `sidecar-deploy-error` event to render a real error
banner. Console + page errors are captured per state into
`screenshots/console-errors.log`.

## Layout / overflow checks

Programmatic (not vision-based). Every capture evaluates `layoutCheckScript()`
which flags: horizontal document/`main` overflow, any element whose right edge
spills past the viewport, and overlapping rows in key containers. Any violation
is appended to `screenshots/layout-violations.txt` and the capture exits `1`
("loudly"). Verified to fire on a deliberately-oversized element:

```
horizontal overflow: doc.scrollWidth=2000 > viewport 1280
body horizontal overflow: 2000 > 1280
DIV right=2000
```

## Model routing

Defined in the repo at `.opencode/opencode.json` (version-controlled, so every
checkout/CI runner has the same agents) and mirrored in
`~/.config/opencode/opencode.json`:

- `bug-hunter` pinned to `openrouter/~deepseek/deepseek-v4-flash-latest`
  (text-only), `mode: all`.
- `vision-review` pinned to `openrouter/minimax/minimax-m3` (multimodal). It
  accepts image attachments — verified by asking it to describe a real
  screenshot (it reported light theme, Drums/Bass/Other/Vocals, sidebar width,
  transport time).

Loop invocation, exact command form (`opencode run --help` confirms `--agent`,
`--model`, `--file`):

```bash
opencode run "<prompt>" -f <shot1.png> -f <shot2.png> ... --agent vision-review
opencode run "Read hunt-input.txt ..." --agent bug-hunter
```

> **Nested-session caveat.** `bug_hunt.sh` clears
> `OPENCODE_CLIENT/OPENCODE_SERVER_USERNAME/OPENCODE_SERVER_PASSWORD` and sets
> `OPENCODE_CLIENT=cli` so the nested `opencode run` works even when launched
> from inside the desktop app session.

## Machine-readable finding format (`hunt-input.txt`)

```
[SEVERITY] critical|major|minor|cosmetic
[SCREEN]   state_theme (e.g. mixer_dark)
[FILE]     screenshot filename
[CATEGORY] layout|overflow|color|typography|interaction|state|console|crash|other
[DESCRIPTION] one precise sentence
[REPRO]    how to reproduce
```

Sample (from a hunt that found issues — a green run yields an empty file):

```
[SEVERITY] critical
[SCREEN] gates
[FILE] _gates/e2e.log
[CATEGORY] crash
[DESCRIPTION] gate failed (e2e) — see _gates/e2e.log
[REPRO] npm run test:e2e

[SEVERITY] major
[SCREEN] mixer_dark
[FILE] mixer_dark.png
[CATEGORY] overlap
[DESCRIPTION] Vocals slider handle overlaps the volume label
[REPRO] open Mixer in dark theme
```

Findings are normalized into canonical 6-field blocks and de-duplicated
**within** a single iteration (so recurring defects persist across iterations and
the stall detector catches real churn).

## Loop per iteration

1. Run the four gates → per-gate output in `_gates/`.
2. Capture fresh screenshots + console log + layout checks (stale artifacts
   truncated first).
3. Run `vision-review` over every screenshot → `hunt-input.txt` (merged with
   gate failures, console errors, layout violations; de-duplicated).
4. If gates green + no findings → exit `0`.
5. Otherwise `bug-hunter` fixes findings (one commit per fix), and the loop
   re-gates. Convergence guards: `MAX_ITER` (default 40; exit 1 on exhaustion),
   stall detector (identical `hunt-input.txt` 3× → exit 1), soft token guard.

## Safety / idempotence

- Runs on a private `bug-hunt-<timestamp>` branch (never touches `main`; never
  stashes/destroys untracked work).
- Re-runnable from a clean checkout; artifacts are regenerated each iteration.
- Works under NixOS via the system Chromium (`/run/current-system/sw/bin/
  chromium`), falls back to Playwright's bundled Chromium otherwise.

## Out of scope

No app-feature changes, no UI redesign, no Rust/Python/AI-pipeline verification
(the `binary` E2E project). Scope is reachable, observable UI + test-gate bugs.