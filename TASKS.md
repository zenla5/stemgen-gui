# Stemgen-GUI Agent Task List

## Current CI Runs
- **CI #53** (fix: rewrite resampler for rubato v1.0.1 API) — IN PROGRESS
- **CI #54** (feat: enable E2E tests in CI pipeline) — TRIGGERED
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
  - **FIXED**: Rewrote resampler.rs with correct rubato v1.0.1 API:
    - Added `audioadapter` and `audioadapter-buffers` v2 dependencies
    - Fixed `Fft::new()` signature with `FixedSync` parameter
    - Used `InterleavedOwned` buffers for audio adapter compatibility
    - Fixed `main.rs` redundant import warning
    - Used safe `read_sample`/`write_sample` methods

---

## PHASE C: E2E Test Re-enablement ✅

### Completed Steps
- ✅ Reviewed E2E tests and Playwright config
- ✅ Enabled E2E in ci.yml (removed `if: false`)
- ✅ Added e2e to check job's needs array

### Results
- E2E tests run against `npm run dev` frontend only (no Tauri required)
- Playwright tests use Chromium browser on Ubuntu
- Tests include: App Shell, File Browser, Settings Panel, Processing Queue, Keyboard Shortcuts, Responsive Design

---

## PHASE D: Post-CI Cleanup

### Pending Tasks
1. Check CI #53 and CI #54 results
2. Fix any issues found in CI runs
3. Update TASKS.md with final status
4. Clean up old branches if needed
