# Stemgen-GUI Agent Task List

## Active Branch
- **Branch:** `feat/integration-tests-and-cd`
- **Status:** Implementation in progress

---

## Phase 1: Pre-Flight Diagnostics ✅
- [x] Confirmed CI #56 (run ID: 23588271184) is the latest successful run
- [x] All 7 jobs passed: Frontend (×3), E2E, Backend, Security, Check
- [x] Audited `package.json` — `tauri:build` used Windows-only PowerShell wrapper with hardcoded path
- [x] Audited `release.yml` — no frontend build step, used `npm run tauri:build` (broken on non-Windows)

## Phase 2: Fix Cross-Platform npm Scripts & Release Pipeline ✅
- [x] Fixed `package.json` — replaced PowerShell wrapper scripts with cross-platform `tauri dev` / `tauri build`
- [x] Fixed `release.yml` — all 4 platform jobs now:
  - Run `npm run build` (frontend Vite build) before Tauri build
  - Use `npx tauri build` instead of `npm run tauri:build`
- [x] Files changed: `package.json`, `.github/workflows/release.yml`

## Phase 3: React Component Integration Tests ✅
- [x] Created `src/__tests__/integration/setup.ts` — shared Tauri API mocks (`invoke`, `listen`, `open` dialog)
- [x] Created `src/__tests__/integration/FileBrowser.test.tsx` — 7 tests (drop zone, file list, count display)
- [x] Created `src/__tests__/integration/ProcessingQueue.test.tsx` — 8 tests (empty state, job statuses, button states)
- [x] Created `src/__tests__/integration/StemMixer.test.tsx` — 6 tests (4 stems, sliders, buttons, reset)
- [x] Created `src/__tests__/integration/SettingsPanel.test.tsx` — 11 tests (all models, presets, settings sections)
- [x] Updated `vitest.config.ts` — added coverage thresholds (lines: 60%, functions: 60%, branches: 50%, statements: 60%)
- [x] Fixed TypeScript syntax error in SettingsPanel test (trailing `});` on device options loop)

## Phase 4: Rust Integration Tests ✅
- [x] Created `src-tauri/tests/stem_metadata.rs` — 7 tests (metadata serialization, 4 stems, NI colors, master track)
- [x] Created `src-tauri/tests/presets.rs` — 10 tests (all 6 DJ presets, display names, `from_str`, codec)
- [x] Created `src-tauri/tests/audio_utils.rs` — 7 tests (waveform generation, duration, normalize, peak, mono/stereo)
- [x] Fixed `src-tauri/src/lib.rs` — made `stems` module public (`pub mod stems`) for integration test access
- [x] Aligned all Rust tests to actual API: `DJSoftware` enum, `DJSoftware::stem_order()`, `NIStemMetadata::default()`, `WaveformData::from_samples()`

## Phase 5: Update CI Pipeline ✅
- [x] Added `integration` job to `.github/workflows/ci.yml` — runs `npm run test:coverage` on Ubuntu
- [x] Added integration job to `check` gate's `needs` array
- [x] Updated `check` job to verify integration job result
- [x] Added comment to `backend` job noting `cargo test` covers both unit (`src/`) and integration (`tests/`) tests

## Phase 6: CI/CD Validation (Pending — Push & Monitor)
- [ ] Commit all changes to `feat/integration-tests-and-cd` branch
- [ ] Push branch and open PR to `main`
- [ ] Monitor CI run on the PR
- [ ] If jobs fail → identify failure, fix with minimal diff, push, repeat
- [ ] If CD build jobs fail → identify failure, fix, push, repeat
- [ ] **STOP AND ASK USER if:**
  - macOS/Windows builds require Apple/Authenticode signing secrets
  - Any failure requires a paid GitHub tier or external service

## Phase 7: Merge & Final Validation (Pending)
- [ ] Merge PR to `main` once all CI+CD jobs pass
- [ ] Verify `main` branch CI run is fully green
- [ ] Update `TASKS.md` and `IMPLEMENTATION_PLAN.md` with final state
- [ ] Commit docs update

---

## Files Changed on `feat/integration-tests-and-cd`

### Phase 2
| File | Change |
|------|--------|
| `package.json` | Removed PowerShell wrapper; `tauri:dev`/`tauri:build` are now cross-platform |
| `.github/workflows/release.yml` | Added `npm run build` step + `npx tauri build` on all 4 platform jobs |

### Phase 3
| File | Change |
|------|--------|
| `vitest.config.ts` | Added `coverage.thresholds` |
| `src/__tests__/integration/setup.ts` | New — shared Tauri mocks |
| `src/__tests__/integration/FileBrowser.test.tsx` | New — 7 tests |
| `src/__tests__/integration/ProcessingQueue.test.tsx` | New — 8 tests |
| `src/__tests__/integration/StemMixer.test.tsx` | New — 6 tests |
| `src/__tests__/integration/SettingsPanel.test.tsx` | New — 11 tests |

### Phase 4
| File | Change |
|------|--------|
| `src-tauri/src/lib.rs` | `mod stems` → `pub mod stems` |
| `src-tauri/tests/stem_metadata.rs` | New — 7 Rust integration tests |
| `src-tauri/tests/presets.rs` | New — 10 Rust integration tests |
| `src-tauri/tests/audio_utils.rs` | New — 7 Rust integration tests |

### Phase 5
| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Added `integration` job; updated `check` needs + verification |

---

## CI Run History

| Run | Status | Description |
|-----|--------|-------------|
| CI #56 | ✅ Success | test: simplify E2E tests for reliability |
| CI #55 | ❌ Failed | fix: improve E2E tests with proper selectors |
| CI #54 | ❌ Failed | feat: enable E2E tests in CI pipeline |
| CI #53 | ✅ Success | fix: rewrite resampler for rubato v1.0.1 API |
| CI #52 | ❌ Failed | fix: add Adapter trait, use get_audio(), fix None param |

---

## CI/CD Issues Fixed

### Phase 2 Fixes
- **Problem:** `npm run tauri:build` used Windows PowerShell with `C:\Users\penze\.cargo\bin` — would fail on Linux/macOS CI
- **Fix:** `tauri:build` → `tauri build` (cross-platform); `npm run build` added before Tauri build

### Phase 4 Fixes
- **Problem:** `stems` module was private (`mod stems`) — integration tests couldn't import `stemgen_gui_lib::stems::*`
- **Fix:** Changed to `pub mod stems`
- **Problem:** Initial test imports used non-existent API (`PresetName`, `get_preset`, `generate_waveform`)
- **Fix:** Rewrote all Rust tests to use actual API: `DJSoftware`, `NIStemMetadata::default()`, `WaveformData::from_samples()`
