# Stemgen-GUI Agent Task List

This document contains a step-by-step task list for AI agents to fix CI/CD issues and set up the project.

## Project Status

### Current CI Run
- **CI #46** (fix: upgrade rubato to v1 and fix remaining clippy issues) — IN PROGRESS
- URL: https://github.com/zenla5/stemgen-gui/actions/runs

### All Fixes Applied
- ✅ Phase A: Frontend CI fixes (ESLint errors)
- ✅ Phase B: Rust backend fixes
  - Added missing `pub use separation::*` to commands/mod.rs
  - Fixed unnecessary_unwrap clippy in commands/mod.rs (use if let)
  - Removed unused imports from separation.rs, packer.rs
  - Added #[allow(unused_imports)] to audio/mod.rs
  - Upgraded rubato from 0.15 to 1.0
  - Fixed resampler.rs for rubato v1 API
  - Prefixed unused target_frames with underscore

---

## PHASE A: Frontend CI ✅ COMPLETED
1. Fixed ESLint errors in `WaveformDisplay.tsx`, `useAudioPlayer.ts`, `eslint.config.js`

---

## PHASE B: Backend (Rust) CI ✅ FIXES APPLIED

### All Issues Fixed
1. `pub use separation::*` — exposed separation module
2. `if let Ok(path) = &python_path` — fixed unnecessary_unwrap
3. `#[allow(unused_imports)]` — for waveform module
4. rubato 1.0 upgrade — updated Cargo.toml
5. `SincFixedIn::new()` — rubato v1 API signature
6. `_target_frames` — prefixed unused param

---

## PHASE C: E2E Test Re-enablement (After CI #46 Passes)

### Step C-1: Review E2E Test Status
Check the existing E2E tests and Playwright config.

### Step C-2: Enable E2E in CI
Edit `.github/workflows/ci.yml` to uncomment/enable the e2e-tests job.

### Step C-3: Fix E2E Test Issues
- Add Tauri mock helpers
- Mock `window.__TAURI__` global
- Run tests locally

### Step C-4: Push and Verify
```bash
git add -A && git commit -m "feat: enable E2E tests in CI"
git push origin main
```

---

## PHASE D: Post-CI Cleanup (Optional)

1. Clean up old branches
2. Update TASKS.md

---

## Troubleshooting

### If CI Still Fails
1. Check specific job logs at the run URL
2. Look for compilation errors, test failures, or timeouts
3. Fix and repeat

### GitHub Actions Links
- CI Runs: https://github.com/zenla5/stemgen-gui/actions
- Latest Run: https://github.com/zenla5/stemgen-gui/actions/runs/23578600664
