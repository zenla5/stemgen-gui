# Stemgen-GUI Agent Task List

## Current CI Run
- **CI #49** (fix: use Fft resampler for rubato v1 API) — IN PROGRESS
- URL: https://github.com/zenla5/stemgen-gui/actions/runs

## All Fixes Applied
- ✅ Phase A: Frontend CI fixes (ESLint errors)
- ✅ Phase B: Rust backend fixes
  - Added missing `pub use separation::*` to commands/mod.rs
  - Fixed unnecessary_unwrap clippy (use if let)
  - Removed unused imports
  - Added #[allow(unused_imports)] 
  - Upgraded rubato from 0.15 to 1.0
  - Changed to `Fft` resampler for rubato v1 API compatibility

---

## PHASE C: E2E Test Re-enablement (After CI #49 Passes)

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
