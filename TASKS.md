# Stemgen-GUI AI Agent Task List

This document provides a structured, step-by-step task list for AI agents to continue development on the Stemgen-GUI project. Agents must follow this document in strict phase order. Each phase requires verification of the GitHub Actions CI run before proceeding to the next phase.

---

## 📊 Project Assessment (2026-03-26)

### Current State

| Area | Status | Notes |
|------|--------|-------|
| TypeScript | ✅ PASSING | `npm run check` — zero errors |
| Unit Tests | ✅ PASSING | 30/30 tests pass |
| ESLint | ❌ FAILING | 4 errors, 1 warning |
| Rust Build | ⚠️ UNKNOWN | Cargo not in shell PATH — need to verify |
| CI Pipeline | ❌ FAILING | `frontend` job fails due to ESLint; `backend` untested locally |
| E2E Tests | ⏸️ DISABLED | `if: false` in CI workflow |

### Known ESLint Failures (Block Phase A)

```
src/components/audio/WaveformDisplay.tsx
  110:41  error  'React' is not defined  no-undef

src/hooks/useAudioPlayer.ts
  121:36  error    Empty block statement            no-empty
  157:36  error    Empty block statement            no-empty
  212:36  error    Empty block statement            no-empty
  280:7   warning  'effectiveVolume' is never used  @typescript-eslint/no-unused-vars
```

### Known Rust Risks (Block Phase B)

1. `commands/models.rs` is orphaned — no `pub mod models` in `mod.rs`
2. `cargo fmt` CI step lacks `--check` flag
3. `SincFixedIn::new()` arg order may be wrong for rubato 0.15
4. `download_model` uses deprecated `tauri::Window` instead of `tauri::WebviewWindow`
5. Clippy warnings-as-errors not fully audited

---

## 🎯 Phase Execution Order

```
Phase A → Frontend CI (ESLint fix) → push → wait → verify ✅
    ↓ (only after A is green)
Phase B → Backend CI (Rust fix) → push → wait → verify ✅
    ↓ (only after B is green)
Phase C → E2E Tests → re-enable → push → wait → verify ✅
    ↓ (optional)
Phase D → Post-CI Cleanup
```

**IMPORTANT**: Each phase's GitHub Actions run MUST be checked and confirmed green before moving to the next phase. Do not skip the verification step.

---

## ✅ PHASE A: Fix Frontend CI Failures

### A-1. Fix ESLint `no-undef` in WaveformDisplay.tsx

**File**: `src/components/audio/WaveformDisplay.tsx`

**Issue**: Line 110 references `React` without importing it.

**Fix**: Add `import React from 'react';` at the top of the file. Modern React (17+) with automatic JSX transform should not need this, but ESLint's `no-undef` rule requires it when JSX is used without explicit `React` import in scope.

**Verification**: Run `npm run lint` — error must be gone.

---

### A-2. Fix ESLint `no-empty` errors in useAudioPlayer.ts

**File**: `src/hooks/useAudioPlayer.ts`

**Issues**: Lines 121, 157, 212 have empty `catch` blocks.

**Fix**: Replace each empty catch with meaningful handling:

```typescript
// For error suppression catches, add a comment and/or log:
catch (e) {
  console.error('Audio playback error:', e);
}

// For intentionally empty catches (e.g., browser API not supported):
catch {
  // API not supported in this environment — noop
}
```

ESLint `no-empty` rule allows `catch {}` only if the block is not truly empty. Use comments to clarify intent.

**Verification**: Run `npm run lint` — all three `no-empty` errors must be gone.

---

### A-3. Fix unused variable warning in useAudioPlayer.ts

**File**: `src/hooks/useAudioPlayer.ts`, line 280

**Issue**: `effectiveVolume` is assigned but never used.

**Fix**: Either:
- Prefix with underscore: `_effectiveVolume` to indicate intentionally unused
- OR actually use the variable in the volume adjustment logic (preferred if the code path exists)

**Verification**: Run `npm run lint` — warning count must be 0.

---

### A-4. Verify all frontend checks pass

Run in sequence:

```bash
npm run check    # TypeScript — must exit 0
npm run lint     # ESLint — must exit 0, 0 errors, 0 warnings
npm run test     # Unit tests — must exit 0, 30 tests pass
npm run build    # Vite build — must create dist/
```

All four commands must succeed before committing.

---

### A-5. Create branch and commit Phase A fixes

```bash
git checkout -b fix/frontend-lint
git add src/components/audio/WaveformDisplay.tsx src/hooks/useAudioPlayer.ts
git commit -m "fix: resolve all ESLint errors (no-undef, no-empty, unused vars)"
git push origin fix/frontend-lint
```

---

### A-6. Verify GitHub Actions CI — Frontend Job ⛔

**ACTION REQUIRED**: Navigate to `https://github.com/zenla5/stemgen-gui/actions`

1. Find the newly triggered CI run for the `fix/frontend-lint` branch
2. Wait for the `frontend` job to complete on all three OS targets:
   - `Frontend (ubuntu-latest)`
   - `Frontend (windows-latest)`
   - `Frontend (macos-latest)`
3. All three must show ✅ green checkmark
4. If ANY fail:
   - Click into the failed job
   - Scroll to the bottom where the error output is
   - Read the error message carefully
   - Fix the issue locally
   - Commit and push again
   - **Re-check GitHub Actions**
5. Repeat this cycle until `frontend` job is ✅ on all 3 OS

**DO NOT proceed to Phase B until frontend is green on all 3 OS targets.**

---

## 🔧 PHASE B: Fix Rust Backend CI Failures

### B-1. Add `pub mod models` to commands/mod.rs

**File**: `src-tauri/src/commands/mod.rs`

**Issue**: `src-tauri/src/commands/models.rs` exists but is never compiled because `mod.rs` has no `pub mod models;` declaration.

**Fix**: Add to the module declarations at the top of `mod.rs`:

```rust
pub mod models;
```

And add to the re-exports:

```rust
pub use models::*;
```

**⚠️ Warning**: `models.rs` defines `ModelInfo` and `separation.rs` also defines `ModelInfo`. This will cause a **name collision** on re-export. Resolve it:

- Option A (recommended): Rename `ModelInfo` in `separation.rs` to `SeparationModelInfo` 
- Option B: Keep only one `ModelInfo` and delete the duplicate
- Update all usages in `lib.rs`, `commands/separation.rs`, and any other files

**Verification**: Run `C:\Users\penze\.cargo\bin\cargo check` — must show 0 errors.

---

### B-2. Fix `cargo fmt` in CI to use `--check`

**File**: `.github/workflows/ci.yml`, `backend` job

**Issue**: The step `cargo fmt` without `--check` only reformats files silently. It should fail CI if formatting is wrong.

**Fix**: Change:

```yaml
- name: Check Rust formatting
  run: |
    cd src-tauri && cargo fmt
```

To:

```yaml
- name: Check Rust formatting
  run: |
    cd src-tauri && cargo fmt -- --check
```

---

### B-3. Verify and fix rubato 0.15 API in resampler.rs

**File**: `src-tauri/src/audio/resampler.rs`

**Issue**: The `SincFixedIn::new()` calls may have wrong argument order for rubato 0.15.

The current code:
```rust
SincFixedIn::<f32>::new(
    resample_ratio,  // 1. output_sample_rate / input_sample_rate
    0.5,             // 2. max_resample_ratio_relative
    params,          // 3. interpolation parameters
    num_channels,    // 4. (possibly wrong — should be chunk_size)
    output_frames,   // 5. (possibly wrong — should be nbr_channels)
)
```

Rubato 0.15 signature: `SincFixedIn::new(resample_ratio, max_relative, params, chunk_size, nbr_channels)`

**Fix**: Swap the last two arguments:

```rust
SincFixedIn::<f32>::new(
    resample_ratio,
    0.5,
    params,
    output_frames,   // chunk_size: number of input frames per chunk
    num_channels,    // nbr_channels: number of audio channels
)
```

Do this for both `resample()` and `resample_to_length()` methods.

**Verification**: `cargo check` must pass with no errors related to rubato.

---

### B-4. Fix `download_model` Tauri v2 API

**File**: `src-tauri/src/commands/separation.rs`

**Issue**: `download_model` command uses `window: tauri::Window`. Tauri v2 uses `tauri::WebviewWindow`.

**Fix**:

```rust
#[tauri::command]
pub async fn download_model(
    model_id: String,
    window: tauri::WebviewWindow,  // Changed from tauri::Window
) -> Result<(), String> {
```

Add the import if not present:
```rust
use tauri::WebviewWindow;
```

Or use `tauri::AppHandle` with `emit_to` pattern:
```rust
pub async fn download_model(
    model_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // Use app_handle.emit_to(...) instead of window.emit(...)
```

**Verification**: `cargo check` must pass.

---

### B-5. Audit and fix all Clippy warnings

**Command**:

```bash
C:\Users\penze\.cargo\bin\cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings -A dead_code -A clippy::needless_range_loop -A clippy::wildcard_in_or_patterns
```

**Expected issues to fix**:
- Unused imports
- Unused variables
- Mutable bindings that don't need `mut`
- Potential `Default` trait implementation conflicts
- `db.rs` has `use tracing::info` — verify it's used
- `lib.rs` exports `commands::*` — verify no conflicting re-exports

**Fix each warning one by one**. Common patterns:
- `unused import 'X'` → remove the import
- `variable assigned, never read` → prefix with `_` or remove
- `redundant `mut` on binding` → remove `mut`

**Verification**: Clippy exits with 0 errors.

---

### B-6. Verify Rust build and tests

```bash
C:\Users\penze\.cargo\bin\cargo build --manifest-path src-tauri/Cargo.toml
C:\Users\penze\.cargo\bin\cargo test --manifest-path src-tauri/Cargo.toml
```

All must succeed.

---

### B-7. Verify frontend build still works

```bash
npm run build
```

Must succeed (creates `dist/` directory, needed for Tauri to find `frontendDist`).

---

### B-8. Create branch and commit Phase B fixes

```bash
git checkout -b fix/rust-backend-ci
git add -A
git commit -m "fix: Rust backend compilation — models module, rubato args, Tauri v2 API, clippy"
git push origin fix/rust-backend-ci
```

---

### B-9. Verify GitHub Actions CI — Backend Job ⛔

**ACTION REQUIRED**: Navigate to `https://github.com/zenla5/stemgen-gui/actions`

1. Find the CI run for `fix/rust-backend-ci`
2. Watch the `backend` job specifically (the longest-running job)
3. It runs: format check → clippy → build → cargo test
4. If it fails:
   - Read the exact error message from the job log
   - Fix the specific issue locally
   - Commit with descriptive message: `fix: [brief description of what was fixed]`
   - Push and re-check GitHub Actions
5. Repeat until `backend` job is ✅

Also confirm the `frontend` job from Phase A is still green on all 3 OS.

The `check` job (final gate) should also go green once both `frontend` and `backend` pass.

---

## 🎭 PHASE C: Re-enable and Fix E2E Tests

### C-1. Create Tauri API mocks for E2E

**File**: `src/__tests__/e2e/tauri-mock.ts` (create new)

**Purpose**: The E2E tests run against the Vite dev server (`http://localhost:1420`), not the full Tauri app. Tauri APIs (`invoke`, `listen`, etc.) must be mocked.

**Implementation**:

```typescript
// src/__tests__/e2e/tauri-mock.ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  // Mock Tauri invoke before each test
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as any).__TAURI__ = {
        invoke: (cmd: string, args?: any) => {
          console.log(`[mock] invoke ${cmd}`, args);
          // Return sensible defaults based on command
          switch (cmd) {
            case 'check_dependencies':
              return {
                ffmpeg: true,
                ffmpeg_version: 'mock',
                sox: true,
                sox_version: 'mock',
                python: false,
                python_version: null,
                cuda: false,
                mps: false,
                model_directory: '/tmp/models',
                model_count: 0,
              };
            case 'check_python_deps':
              return {
                python_available: false,
                python_version: null,
                demucs_available: false,
                bs_roformer_available: false,
                cuda_available: false,
              };
            case 'get_models':
              return [];
            case 'get_processing_history':
              return [];
            default:
              return null;
          }
        },
        listen: () => ({ unsubscribe: () => {} }),
      };
    });
    await use(page);
  },
});
```

**Update test imports**: Change `import { test, expect } from '@playwright/test'` to `import { test, expect } from './tauri-mock'` in `app.spec.ts`.

---

### C-2. Update playwright.config.ts for CI

**File**: `playwright.config.ts`

**Changes**:

```typescript
webServer: {
  command: 'npm run dev',
  url: 'http://localhost:1420',
  reuseExistingServer: !process.env.CI,
  timeout: 120 * 1000,
},
// Reduce to chromium-only in CI for speed
projects: process.env.CI
  ? [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
  : [
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
```

---

### C-3. Re-enable E2E job in CI workflow

**File**: `.github/workflows/ci.yml`

**Change in `e2e` job**:

```yaml
# Change from:
e2e:
  name: E2E Tests
  runs-on: ubuntu-latest
  if: false  # DISABLED

# To:
e2e:
  name: E2E Tests
  runs-on: ubuntu-latest
  # if: true  # Remove this line entirely
```

**Add xvfb step** (Ubuntu needs virtual display for Chrome):

```yaml
- name: Install dependencies
  run: npm ci

- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium

- name: Run E2E tests
  run: xvfb-run --auto-servernum --auto-servernum-timeout=60 npx playwright test --project=chromium
```

**Add to `check` job needs**:

```yaml
check:
  name: All Checks Passed
  runs-on: ubuntu-latest
  needs: [frontend, backend, security, e2e]  # Add e2e here
```

---

### C-4. Run E2E tests locally first

```bash
npm run dev &
sleep 10
npx playwright test --project=chromium
```

Fix any failing tests. Common issues:
- Selector changes in UI → update test locators
- Missing Tauri mocks → add to `tauri-mock.ts`
- Race conditions → add `await page.waitForTimeout()` or proper `waitFor` selectors

---

### C-5. Create branch and commit Phase C

```bash
git checkout -b feat/re-enable-e2e
git add -A
git commit -m "feat: re-enable E2E tests with Tauri API mocks and CI xvfb setup"
git push origin feat/re-enable-e2e
```

---

### C-6. Verify GitHub Actions CI — E2E Job ⛔

**ACTION REQUIRED**: Navigate to `https://github.com/zenla5/stemgen-gui/actions`

1. Find the CI run for `feat/re-enable-e2e`
2. Wait for the `e2e` job to complete
3. If it fails:
   - Download the `playwright-results` artifact (uploaded on failure)
   - Read the HTML report and failure screenshots
   - Identify the specific failing test
   - Fix the test locally
   - Commit and push
   - **Re-check GitHub Actions**
4. Repeat until `e2e` job is ✅

**Final verification**: All 5 jobs must be green:
- ✅ `frontend` (3 OS)
- ✅ `backend`
- ✅ `e2e`
- ✅ `security`
- ✅ `check` (final gate)

---

## 🧹 PHASE D: Post-CI Cleanup (Optional)

### D-1. Set initial coverage threshold

**File**: `vitest.config.ts`

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  thresholds: {
    lines: 50,  // Start conservative, raise when more tests added
  },
  // ... existing exclude
}
```

### D-2. Add unit tests for stores

**Files**: `src/stores/appStore.ts`, `src/stores/settingsStore.ts`

Add tests for:
- Initial state values
- Action dispatching (file adding, job queuing, theme changing)
- Store selectors

### D-3. Wire up models.rs Tauri commands

After Phase B's `pub mod models` fix, expose the downloader commands:

In `lib.rs` invoke_handler, add:
```rust
// Model management commands
commands::list_downloaded_models,  // needs to be added to models.rs first
commands::delete_model,              // needs to be added to models.rs first
```

### D-4. Update TASKS.md with final status

Mark all completed phases. Document any known remaining issues.

---

## 🚨 Escalation Rules

**STOP AND ASK USER** if any of these occur:

1. **GitHub Actions has secret/permission errors** — e.g., `GITHUB_TOKEN` insufficient scope, artifact upload permission denied
2. **Rust dependency version conflict requiring `cargo update`** that introduces breaking changes
3. **E2E tests need real file system access or native OS dialogs** that can't be mocked — requires architecture discussion
4. **Coverage threshold causes CI to fail** — do not raise thresholds without more tests
5. **macOS code signing errors in release workflow** — requires Apple developer certificate
6. **Any change to `tauri.conf.json` security.csp** — CSP changes need human review
7. **The agent has spent more than 3 cycles on the same failure** — escalate for human review

---

## Quick Reference Commands

```bash
# Frontend checks
npm run check    # TypeScript
npm run lint     # ESLint  
npm run test     # Unit tests
npm run build    # Vite build

# Rust checks
C:\Users\penze\.cargo\bin\cargo check --manifest-path src-tauri/Cargo.toml
C:\Users\penze\.cargo\bin\cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings -A dead_code -A clippy::needless_range_loop -A clippy::wildcard_in_or_patterns
C:\Users\penze\.cargo\bin\cargo test --manifest-path src-tauri/Cargo.toml
C:\Users\penze\.cargo\bin\cargo fmt --manifest-path src-tauri/Cargo.toml -- --check

# E2E
npm run dev &
npx playwright test --project=chromium

# Git
git checkout -b fix/[branch-name]
git commit -m "[type]: [description]"
git push origin [branch-name]
```
