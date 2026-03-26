# Stemgen-GUI Agent Task List

This document contains a step-by-step task list for AI agents to fix CI/CD issues and set up the project.

## Project Status

### Current CI Run
- **CI #43** (fix: Rust clippy issues in stems module) — IN PROGRESS
- URL: https://github.com/zenla5/stemgen-gui/actions/runs/23578600664

### Completed Fixes
- ✅ Phase A: Frontend CI fixes (ESLint errors)
- ✅ Phase B-1: Added missing `pub mod models` to commands/mod.rs
- ✅ Phase B-2: Simplified models.rs (removed broken code)
- ✅ Phase B-3: Fixed separation.rs (removed duplicate download_model)
- ✅ Phase B-4: Removed download_model from lib.rs invoke handler
- ✅ Phase B-5: Fixed rubato 0.15+ API in resampler.rs
- ✅ Phase B-6: Fixed presets.rs (missing `]` brackets, clippy warnings)
- ✅ Phase B-7: Fixed packer.rs (dead code, clippy warnings)

---

## PHASE A: Frontend CI ✅ COMPLETED
1. Fixed ESLint errors in `src/components/audio/WaveformDisplay.tsx`
2. Fixed ESLint errors in `src/hooks/useAudioPlayer.ts`
3. Fixed ESLint errors in `eslint.config.js`
4. All 3 frontend CI jobs PASSED (ubuntu/windows/macos)

---

## PHASE B: Backend (Rust) CI ✅ FIXES APPLIED, AWAITING CI #43

### Step B-1: Check CI Run Status
```bash
curl -s "https://api.github.com/repos/zenla5/stemgen-gui/actions/runs?per_page=1"
```
- Monitor CI #43 for success/failure
- If failed → check job logs for specific errors

### Step B-2: Fix Rust Compilation Errors
If compilation fails:
1. Read the error message from CI logs
2. Fix the issue:
   - Missing modules → add `pub mod <name>;` to `src-tauri/src/commands/mod.rs`
   - Missing types → ensure all types are defined
   - Import errors → fix paths and use statements
3. Commit and push fixes
4. Re-check CI

### Step B-3: Fix Clippy Lint Errors
Common clippy issues and fixes:
- `dead_code` → Add `#[allow(dead_code)]` or remove unused code
- `unused_imports` → Remove or use the import
- `unused_variables` → Prefix with `_` or remove
- `clippy::similar_names` → Rename variables to be more distinct
- `missing_docs` → Add documentation comments
- `unneeded_struct_pattern` → Use `*self` instead of `ref self`

### Step B-4: Run Local Rust Checks
```bash
cd src-tauri
cargo check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

### Step B-5: Push Fixes
```bash
git checkout -b fix/rust-issues
git add -A
git commit -m "fix: <description of fixes>"
git push origin fix/rust-issues
git checkout main
git merge fix/rust-issues --no-edit
git push origin main
```

### Step B-6: Verify CI Passes
- Check CI runs at: https://github.com/zenla5/stemgen-gui/actions
- All jobs should show ✅ "success"
- If any job fails → check logs and repeat B-2 to B-5

---

## PHASE C: E2E Test Re-enablement

### Step C-1: Review E2E Test Status
```bash
cat src/__tests__/e2e/app.spec.ts
cat playwright.config.ts
```

### Step C-2: Identify E2E Issues
Common issues:
- Missing Tauri API mocks → mock `invoke()` calls
- Missing xvfb on Linux → add to CI workflow
- Missing dependencies → install playwright browsers

### Step C-3: Enable E2E in CI
Edit `.github/workflows/ci.yml`:
```yaml
e2e-tests:
  needs: [frontend, backend]
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Setup xvfb
      run: sudo apt-get install -y xvfb
    - name: Run E2E tests
      run: npm run test:e2e
```

### Step C-4: Fix E2E Test Issues
1. Add Tauri mock helpers in `src/__tests__/e2e/helpers.ts`
2. Mock `window.__TAURI__` global
3. Mock `invoke()` to return test data
4. Run tests locally: `npm run test:e2e`

### Step C-5: Push E2E Changes
```bash
git checkout -b feature/e2e-tests
git add -A
git commit -m "feat: enable E2E tests in CI"
git push origin feature/e2e-tests
git checkout main
git merge feature/e2e-tests --no-edit
git push origin main
```

---

## PHASE D: Post-CI Cleanup (Optional)

### Step D-1: Clean Up Branches
```bash
git branch -d fix/rust-clippy-v2
git push origin --delete fix/rust-clippy-v2
```

### Step D-2: Update TASKS.md
Remove completed steps and keep for future reference.

### Step D-3: Create Release (if ready)
```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## Troubleshooting

### If CI Still Fails
1. Check specific job logs at the run URL
2. Look for:
   - Compilation errors → fix in Rust code
   - Test failures → fix tests or code
   - Timeout issues → increase timeout in workflow
3. Commit fix and push
4. Repeat until CI passes

### If Local Checks Pass but CI Fails
- Check CI environment (different OS, versions)
- Check CI cache settings
- Check for sensitive data needed (secrets)

---

## GitHub Actions Links
- CI Runs: https://github.com/zenla5/stemgen-gui/actions
- Latest Run: https://github.com/zenla5/stemgen-gui/actions/runs/23578600664
- Repository: https://github.com/zenla5/stemgen-gui
