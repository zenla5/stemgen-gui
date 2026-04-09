# CI Fix Log — E2E Test Failures

Track the investigation and fix process for CI pipeline failures across sessions.

## Run `24185520357` — 2026-04-09

**Status:** Fix in progress (first push)

### Failures Observed

| Job | Test | Error |
|-----|------|-------|
| E2E Tests (chromium) | `library.spec.ts:6` | `waitForSelector('[data-testid="nav-library"]')` timeout 15s |
| Binary E2E Tests (Windows) | `navigation.spec.ts:79` | `theme-btn-light` not visible after pressing `'4'` |
| All Checks Passed | — | Cascading failure from E2E jobs |

### Investigation

1. **Reviewed CI logs** via `gh run view --log-failed` — identified two distinct test failures
2. **Read both test files** and the components they target (Sidebar, SettingsPanel, keyboard shortcuts)
3. **Traced root cause for Failure 1:**
   - `library.spec.ts` was recently updated (commit `aa9c584`) to use `waitForSelector` instead of `waitForTimeout`
   - The E2E chromium tests run in a fresh Playwright browser with empty `localStorage`
   - `settingsStore.ts` defaults `hasSeenFirstRun: false`
   - When `hasSeenFirstRun` is false, `App.tsx` renders `FirstRunWizard` instead of `AppShell`
   - The wizard has no sidebar, so `nav-library` never appears
   - Binary tests solve this via `navigateSkippingWizard()` which injects `hasSeenFirstRun: true` into localStorage
4. **Traced root cause for Failure 2:**
   - Commit `8e56840` added Library as a 5th nav item and remapped keyboard shortcuts
   - Before: `'4'` → Settings (4 items: files/queue/mixer/settings)
   - After: `'4'` → Library, `'5'` → Settings (5 items)
   - `binary/library.spec.ts` was updated to match (`"shortcut 4 navigates to Library"`)
   - `binary/navigation.spec.ts:75` was NOT updated — still expects `'4'` → Settings

### Fixes Applied

**Fix 1 — `src/__tests__/e2e/library.spec.ts`:**
Added `localStorage` injection in `beforeEach` before page navigation. Injects `hasSeenFirstRun: true` so the `AppShell` (with sidebar) renders instead of `FirstRunWizard`. Mirrors the approach used by binary tests in `helpers.ts:190-199`.

**Fix 2 — `src/__tests__/e2e/binary/navigation.spec.ts:75`:**
Changed keyboard shortcut from `'4'` to `'5'` and updated test name from `"keyboard shortcut 4 navigates to Settings"` to `"keyboard shortcut 5 navigates to Settings"`.

### Push 1 — 2026-04-09

- Committed both fixes
- Pushed to `feature/library-management`
- Monitoring CI run...

### Verification

- [ ] E2E Tests (chromium) pass
- [ ] Binary E2E Tests (Windows) pass
- [ ] All Checks Passed job succeeds
