# Stemgen-GUI AI Agent Task List

This document provides a structured, step-by-step task list for AI agents to continue development on the Stemgen-GUI project.

## Current Status

✅ **Phase 1: CI Pipeline Fixes — COMPLETED**
✅ **Phase 2: Release Workflow Fixes — COMPLETED**

The following tasks have been completed and pushed to `fix/rust-backend`:
- ESLint configuration fixed (added missing @typescript-eslint packages)
- Frontend type check and lint now pass
- E2E tests properly excluded from vitest
- CI workflow cleaned up (removed broken steps, disabled E2E)
- Release workflow fixed (correct action names, proper artifact upload)

---

## Remaining Tasks

### Phase 3: Code Quality & Bug Fixes

#### Task 3.1: Fix Rust Clippy Warnings
**Priority**: 🔴 Critical  
**Files**: `src-tauri/src/**/*.rs`  
**Prerequisites**: Rust toolchain installed (`cargo`, `rustc`)

**Steps**:
1. Run `cd src-tauri && cargo clippy -- -D warnings` to identify all warnings
2. Expected issues based on code review:
   - `StemPacker::default()` inherent method shadows the `Default` trait impl → remove or rename
   - `use stemgen_gui_lib;` in `main.rs` → change to `stemgen_gui_lib::run()`
   - Unused imports across multiple files
   - `DJSoftware::from_str` method name may conflict with `FromStr` trait convention
3. Fix each warning identified by clippy
4. Run `cargo fmt` to ensure proper formatting
5. Run `cargo test` to ensure no tests are broken
6. Commit with message: "fix: resolve Rust clippy warnings"

#### Task 3.2: Fix Rubato Resampler Implementation
**Priority**: 🟡 Medium  
**Files**: `src-tauri/src/audio/resampler.rs`  
**Prerequisites**: Rust toolchain, understanding of rubato 0.15 API

**Steps**:
1. Verify `SincFixedIn::new()` parameter order for rubato 0.15
   - Expected signature: `(resample_ratio, max_resample_ratio_relative, params, chunk_size, num_channels)`
2. Fix constructor call with correct parameters
3. **Critical**: Deinterleave input samples into `Vec<Vec<f32>>` (one vec per channel) before calling `process()`
4. Reinterleave output after resampling back to single interleaved `Vec<f32>`
5. Add unit test for resampling 48kHz → 44.1kHz
6. Run `cargo test` to verify
7. Commit with message: "fix: correct rubato resampler implementation"

#### Task 3.3: Add Basic Unit Tests
**Priority**: 🟡 Medium  
**Files**: New files in `src/__tests__/`  
**Prerequisites**: None

**Steps**:
1. Create `src/lib/__tests__/utils.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { cn, formatBytes, formatDuration } from '../lib/utils';
   
   describe('cn', () => {
     it('merges class names correctly', () => {
       expect(cn('foo', 'bar')).toBe('foo bar');
       expect(cn('foo', false && 'bar')).toBe('foo');
     });
   });
   
   describe('formatBytes', () => {
     it('formats bytes correctly', () => {
       expect(formatBytes(1024)).toBe('1.0 KB');
       expect(formatBytes(1048576)).toBe('1.0 MB');
     });
   });
   
   describe('formatDuration', () => {
     it('formats seconds correctly', () => {
       expect(formatDuration(90)).toBe('1:30');
       expect(formatDuration(3661)).toBe('1:01:01');
     });
   });
   ```
2. Create `src/stores/__tests__/appStore.test.ts`:
   - Test `createDefaultStems()` returns 4 stems
   - Test `addFiles` filters duplicates
   - Test `updateJob` updates correct job
3. Create `src/stores/__tests__/settingsStore.test.ts`:
   - Test `setTheme` updates theme
   - Test `addExportPreset` adds to array
   - Test `removeExportPreset` removes from array
4. Run `npm run test` to verify tests pass
5. Run `npm run test:coverage` to verify coverage
6. Commit with message: "test: add unit tests for utils and stores"

#### Task 3.4: Clean Up Workspace Cargo.toml Dependencies
**Priority**: 🟢 Low  
**Files**: `Cargo.toml` (workspace root)  
**Prerequisites**: Rust toolchain

**Steps**:
1. Review all dependencies in `[workspace.dependencies]`
2. Remove unused dependencies (confirmed unused from code review):
   - `lodepng`, `kira`, `portable-pty`, `serde_jsonrpc`
   - `glob`, `sha2`, `hex`, `chrono`, `uuid`
   - `parking_lot`, `once_cell`, `url`
   - `criterion`, `tempfile`, `pretty_assertions`
3. Remove duplicate `tauri-api` workspace dependency
4. Run `cargo check` in `src-tauri` to verify nothing breaks
5. Commit with message: "chore: remove unused workspace dependencies"

#### Task 3.5: Security Hardening
**Priority**: 🟢 Low  
**Files**: `src-tauri/tauri.conf.json`, `index.html`  
**Prerequisites**: None

**Steps**:
1. Set proper CSP in `tauri.conf.json`:
   ```json
   "security": {
     "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'"
   }
   ```
2. Consider removing Google Fonts from `index.html` (bundle locally or use system fonts)
3. Commit with message: "security: enable CSP and harden app"

---

### Phase 4: Documentation

#### Task 4.1: Update README with Setup Instructions
**Priority**: 🟡 Medium  
**Files**: `README.md`  
**Prerequisites**: None

**Steps**:
1. Add "Prerequisites" section:
   - Node.js 20+
   - Rust 1.70+
   - FFmpeg (for audio processing)
   - Python 3.9+ (for AI stem separation)
   - CUDA (optional, for GPU acceleration)
2. Add "Local Development Setup" section:
   ```bash
   # Clone the repo
   git clone https://github.com/zenla5/stemgen-gui
   cd stemgen-gui
   
   # Install dependencies
   npm install
   
   # Run type check and lint
   npm run check
   npm run lint
   
   # Run tests
   npm run test
   
   # Start development server (frontend only)
   npm run dev
   
   # Start with Tauri (requires Rust)
   npm run tauri:dev
   ```
3. Add "CI/CD" section explaining the pipeline
4. Add "Contributing" section
5. Commit with message: "docs: add setup and development instructions"

---

## Task Execution Notes

### Prerequisites for Full CI/CD Pipeline

For the complete CI pipeline to work (including Rust backend), the following secrets should be configured in GitHub:
- `CODECOV_TOKEN` (optional, for coverage reporting)
- `COVERALLS_REPO_TOKEN` (optional, for coverage reporting)

The CI pipeline has been designed to work **without** these secrets by making coverage optional.

### Running Tasks in Order

Tasks with dependencies should be executed in this order:
1. **Task 3.1** (Clippy) → must complete before Rust code changes
2. **Task 3.2** (Rubato) → can run independently after 3.1
3. **Task 3.3** (Unit tests) → can run independently
4. **Task 3.4** (Cargo cleanup) → can run independently after 3.1
5. **Task 3.5** (Security) → can run independently
6. **Task 4.1** (README) → can run at any time

### Common Commands

```bash
# Frontend
npm run check       # TypeScript type check
npm run lint        # ESLint
npm run test        # Unit tests
npm run test:coverage  # With coverage report

# Rust backend (requires Rust toolchain)
cd src-tauri && cargo check        # Check compilation
cd src-tauri && cargo clippy       # Lint with clippy
cd src-tauri && cargo fmt          # Format
cd src-tauri && cargo test         # Run tests

# Tauri (full app)
npm run tauri:dev    # Development
npm run tauri:build  # Production build
```

---

## Git Workflow

1. All work continues on branch `fix/rust-backend`
2. After completing each task, commit with a clear message
3. Push changes: `git push origin fix/rust-backend`
4. The CI pipeline will run automatically (frontend checks on all pushes, backend checks when Rust code changes)
5. Once all Phase 3 tasks are complete, create a PR to merge into `main`

---

## AI Agent Privilege Requirements

**Normal Mode (No Special Privileges Needed)**:
- Tasks 3.3 (unit tests), 3.5 (security), 4.1 (docs)
- All frontend changes

**Elevated Mode (System Access)**:
- Task 3.1, 3.2, 3.4 require **Rust toolchain installed** (`cargo`, `rustc`)
  - On Windows: Install from https://rustup.rs
  - The `cargo` command was not found during the initial CI assessment

If an AI agent needs Rust installed, it should **STOP and ask the user** to install Rust before proceeding with Rust-related tasks.

---

## Version History

- **2026-03-26**: Phase 1 & 2 completed (CI pipeline fixes, ESLint fixes, release workflow fixes)
- **2026-03-25**: Initial project assessment and task list created
