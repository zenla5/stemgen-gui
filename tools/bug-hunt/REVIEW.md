# Review prompt — bug-hunt harness PR

Copy the block below into the PR review (or feed it to a reviewing agent/model).
Answer each item explicitly; do not approve until every item is confirmed or a
residual risk is noted.

---

You are reviewing the **bug-hunt & visual QA harness** PR for `stemgen-gui`.
It is *test/QA tooling only* — it must not alter any app feature behavior.

## Scope of the diff
- `tools/bug-hunt/` (bug_hunt.sh, capture-screenshots.ts, README.md, docs, .gitignore)
- `.github/workflows/bug-hunt.yml`
- `package.json` / `package-lock.json` (added `tsx` devDependency only)

## Checklist — verify each
1. **No app behavior change.** Confirm the PR touches only harness tooling, the
   workflow, and the `tsx` devDependency — no `src/`, `src-tauri/`, or config
   that alters app runtime behavior.
2. **Definition of done is machine-enforced.** The loop exits `0` (green) ONLY
   when `npm run check`, `npm run lint`, `npm run test`, and the chromium E2E
   pass AND a fresh `vision-review` reports clean AND layout/overflow checks
   pass — never on the model's word. Confirm `bug_hunt.sh` gates the green exit
   on both `GATES_OK` and a clean `build_input`.
3. **Convergence guards present.** `MAX_ITER` cap (exits 1 on exhaustion), a
   stall detector (identical `hunt-input.txt` 3 consecutive iterations → exit 1),
   soft token guard. Confirm they exist and cannot be bypassed by a model.
4. **E2E scope.** The gate runs `npx playwright test --project=chromium` (the
   reachable, observable UI) and deliberately excludes the `binary` project
   (compiled Tauri/Rust app). This exclusion is documented in README + script.
   Is the decision + documentation acceptable?
5. **Machine-readable + dedup + freshness.** Findings use the 6-field
   `[SEVERITY]/[SCREEN]/[FILE]/[CATEGORY]/[DESCRIPTION]/[REPRO]` format,
   de-duplicated *within* an iteration, and screenshots/console/layout are
   re-generated fresh each iteration (no stale reuse).
6. **Safety.** Harness runs on a private `bug-hunt-*` branch, never `main`,
   never stashes/destroys untracked work; idempotent from a clean checkout.
7. **CI workflow safety.** The workflow uses `OPENROUTER_API_KEY` from secrets,
   installs Playwright chromium, uploads artifacts, and **opens a GitHub Issue
   when the loop gives up.** Confirm:
   - the `binary` project is not run in CI (matches the chromium-only gate);
   - the Issue-opening is acceptable / gated appropriately;
   - scheduled (`cron`) trigger is wanted, or should be `workflow_dispatch`-only.
8. **Dependencies.** Only `tsx` added to `package.json`; lockfile in sync.
9. **Generated artifacts are gitignored** (`tools/bug-hunt/.gitignore`), so
   logs/screenshots/summary are never committed.

## Report
Return a table: item → PASS / NEEDS FIX / RISK, with one line of evidence each.
List any blockers. Recommend: **approve**, **fix-then-approve**, or **changes-required**.