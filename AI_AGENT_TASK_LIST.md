# Stemgen-GUI AI Agent Task List

> **Version**: 2.0  
> **Last Updated**: 2026-03-26  
> **Branch**: main (CI pending — changes not yet pushed)
> **Tests**: ✅ 61/61 passing (30 unit + 31 integration)

This document provides a sophisticated, step-by-step task list for AI agents to continue developing Stemgen-GUI, fix bugs, and set up the project.

---

## Table of Contents

1. [What Was Fixed](#1-what-was-fixed)
2. [CI/CD Pipeline Reference](#2-cicd-pipeline-reference)
3. [Local Development Setup](#3-local-development-setup)
4. [Common Tasks](#4-common-tasks)
5. [Debugging CI Failures](#5-debugging-ci-failures)
6. [Feature Development Workflow](#6-feature-development-workflow)
7. [Known Issues & Gotchas](#7-known-issues--gotchas)
8. [Required Tools & Dependencies](#8-required-tools--dependencies)

---

## 1. What Was Fixed

### v2.0 Changes (Not Yet Pushed to CI)

| # | Fix | Files Changed |
|---|-----|--------------|
| 1 | **Created missing `python/stemgen_sidecar.py`** — full Python sidecar with demucs/htdemucs/htdemucs_ft support, JSON progress emission | `python/stemgen_sidecar.py` |
| 2 | **Fixed CSP** for `asset:` URLs — added `media-src` and `asset:` to `connect-src` | `src-tauri/tauri.conf.json` |
| 3 | **Fixed WaveformDisplay** to use `convertFileSrc()` instead of manual `asset://localhost/` URL construction | `src/components/audio/WaveformDisplay.tsx` |
| 4 | **Fixed useAudioPlayer** to use `convertFileSrc()` for proper Tauri asset serving | `src/hooks/useAudioPlayer.ts` |
| 5 | **Wired end-to-end pipeline** in `appStore.ts`: removed single-job guard, added stem path population, `pack_stems` call, `add_to_history` call, mixer navigation | `src/stores/appStore.ts` |
| 6 | **Fixed broken `create_multi_track_stem`** — rewrote dead code into proper FFmpeg multi-track command with `-map` and per-stream metadata | `src-tauri/src/stems/packer.rs` |
| 7 | **Added progress event emission** to `SidecarManager` — parses sidecar JSON and emits `separation-progress` events to frontend via Tauri | `src-tauri/src/commands/sidecar.rs` |
| 8 | **Added `AppHandle` to `SidecarManager`** and initialized it in `lib.rs` setup | `src-tauri/src/lib.rs`, `src-tauri/src/commands/sidecar.rs` |
| 9 | **Added missing TypeScript types** for backend API responses | `src/lib/types.ts` |

### Previously Done (CI #69 Baseline)

- Full CI/CD pipeline (8 parallel jobs)
- All UI components scaffolded and tested
- Rust backend audio/stem modules
- State management (Zustand)
- 61 tests passing

---

## 2. CI/CD Pipeline Reference

### CI Pipeline (`.github/workflows/ci.yml`)

**Trigger**: Push to any branch, PR to main/develop  
**Total Jobs**: 8 parallel + 1 final check

| Job | Name | Runs On | Time | Key Commands |
|-----|------|---------|------|-------------|
| 1 | Frontend (ubuntu-latest) | ubuntu-latest | ~2-3 min | `npm run check`, `npm run lint`, `npm run test:unit` |
| 2 | Frontend (windows-latest) | windows-latest | ~2-3 min | Same as above |
| 3 | Frontend (macos-latest) | macos-latest | ~2-3 min | Same as above |
| 4 | Integration Tests | ubuntu-latest | ~2-3 min | `npm run test:integration -- --coverage` |
| 5 | E2E Tests | ubuntu-latest | ~5-10 min | `npx playwright test --project=chromium` |
| 6 | Backend (Rust) | ubuntu-latest | ~10-15 min | `cargo fmt`, `cargo clippy`, `cargo build --release`, `cargo test --lib` |
| 7 | Security Audit | ubuntu-latest | ~2 min | `npm audit`, `cargo audit` |
| 8 | All Checks Passed | ubuntu-latest | ~10s | Aggregates all job results |

**SUCCESS**: All 8 jobs must pass.

### CD Pipeline (`.github/workflows/release.yml`)

**Trigger**: Push tag matching `v*` (e.g., `v0.1.0`)  
**Jobs**: Build Tauri app for Windows, macOS, Linux → Upload releases

### Key CI Debugging Facts

1. **Artifact downloads require GitHub App token** - GITHUB_TOKEN (classic PAT) cannot download Azure blob artifact URLs (401 error). Always use the GitHub API JSON endpoints instead.
2. **Rust `cargo test` needs `--lib` flag** - The Tauri binary requires a JS runtime during test compilation, which is not available in CI. Use `cargo test --lib` to run library tests only.
3. **Backend job takes ~15 min** - Compiling Rust dependencies + GTK takes significant time. Be patient.
4. **E2E tests take ~5-10 min** - Playwright browsers are slow to install.
5. **Check job is always `failure` on failure** - Even if all jobs succeed, if a previous run's check job failed, the new check job also fails.

---

## 3. Local Development Setup

### Rust & Cargo Installation

**IMPORTANT**: Rust is installed via `rustup`, not standalone. The `rustup-init.exe` file is a bootstrap installer that downloads and installs the actual Rust toolchain.

#### Windows
1. Download `rustup-init.exe` from https://rustup.rs/
2. Run it and follow the prompts
3. Restart your terminal/shell after installation
4. Verify: `rustc --version` and `cargo --version`

#### Linux/macOS
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env  # or restart terminal
```

### Prerequisites
```bash
# Core tools
node >= 20
npm >= 9
rust >= stable       # Installed via rustup (rustup-init.exe on Windows)
python >= 3.9
git

# Verify Rust installation
rustc --version      # Should show stable version
cargo --version      # Should show cargo version
rustup show          # Shows installed toolchains

# Optional (for full Tauri dev)
# Windows: Visual Studio Build Tools with C++ workload
# Linux: libgtk-3-dev, libgdk-pixbuf2.0-dev, etc.
# macOS: Xcode CLI tools
```

### Commands
```bash
# Install dependencies
npm ci

# Frontend development (hot reload)
npm run tauri:dev

# Frontend only
npm run dev

# Build for production
npm run tauri:build

# Tests
npm run test:unit        # Vitest unit tests (30 tests)
npm run test:integration # React component integration tests (31 tests)
npm run test:e2e        # Playwright E2E tests
npm run test:coverage    # Coverage report

# Linting
npm run lint             # ESLint + Prettier
npm run check            # TypeScript type check

# Rust
cd src-tauri && cargo build --release
cd src-tauri && cargo test --lib       # Library tests only (no binary needed)
cd src-tauri && cargo clippy --lib --bins
```

---

## 4. Common Tasks

### A. Running the Application
```bash
npm run tauri:dev
```

### B. Running Tests
```bash
# All tests
npm run test:unit && npm run test:integration && npm run test:e2e

# With coverage
npm run test:coverage

# Rust tests (library only)
cd src-tauri && cargo test --lib
```

### C. Building for Release
```bash
# Create a tag
git tag v0.1.0
git push origin v0.1.0
# This triggers release.yml automatically
```

---

## 5. Debugging CI Failures

### Step-by-Step CI Debugging Protocol

1. **Check the jobs list** to identify which job failed:
   ```python
   # Get all jobs for a run
   url = f'https://api.github.com/repos/{REPO}/actions/runs/{RUN_ID}/jobs'
   # List job names and conclusions
   ```

2. **Check step-level results** within the failed job:
   ```python
   # Get job ID from jobs list
   url = f'https://api.github.com/repos/{REPO}/actions/jobs/{JOB_ID}'
   # Check steps array with conclusions
   ```

3. **For Backend (Rust) failures**:
   - If clippy/fmt/build fail → Check Rust code for errors
   - If tests fail → Use `cargo test --lib` locally to reproduce
   - Note: Cannot download CI artifacts with GITHUB_TOKEN (401 error on Azure blob URLs)

4. **For Frontend failures**:
   - Check npm scripts in `package.json`
   - Run `npm run lint` and `npm run check` locally
   - Run integration tests locally

5. **For E2E failures**:
   - Check Playwright configuration
   - Verify the app builds and starts correctly
   - Check for race conditions or timing issues

---

## 6. Feature Development Workflow

### Step 1: Create Feature Branch
```bash
git checkout -b feat/my-new-feature
```

### Step 2: Implement Changes
- Write code following existing patterns
- Add tests for new functionality
- Update types in `src/lib/types.ts`
- Add Rust code in `src-tauri/src/`

### Step 3: Add Tests
```bash
# Frontend component tests
# Create: src/__tests__/integration/MyComponent.test.tsx

# Rust integration tests
# Create: src-tauri/tests/my_feature.rs
# Import: use stemgen_gui_lib::{module}::{item};
```

### Step 4: Run Tests Locally
```bash
npm run test:unit
npm run test:integration
cd src-tauri && cargo test --lib
```

### Step 5: Commit & Push
```bash
git add .
git commit -m "feat: add my new feature with tests"
git push origin feat/my-new-feature
```

---

## 7. Known Issues & Gotchas

### GitHub Token Limitations
- **GITHUB_TOKEN cannot download CI artifacts** (401 Azure blob error)
- Use GitHub API JSON endpoints for job/step details
- Use workflow dispatch for manual CI triggers

### Rust Test Binary
- `cargo test` compiles the Tauri binary which needs a JS runtime
- In CI (no display/JS runtime), use `cargo test --lib` instead
- This runs all `#[cfg(test)]` modules in `src-tauri/src/`
- Integration tests in `src-tauri/tests/` need `cargo test` but will fail without JS

### Tauri Build Artifacts
- Build artifacts are OS-specific (.exe for Windows, app bundle for macOS, AppImage for Linux)
- Release workflow builds for all platforms
- Don't commit `src-tauri/target/` (add to .gitignore)

### Python Sidecar
- Requires Python 3.9+ with dependencies from `python/requirements.txt`
- Must be in PATH or bundled with the app
- Used for AI model inference (demucs/bs_roformer)
- Progress events emitted as JSON lines to stdout → forwarded to frontend via Tauri events

### Stem Metadata
- NI stem metadata is written as a sidecar `.stem.metadata` file
- The multi-track packer creates proper 5-stream MP4 with FFmpeg
- For full NI compatibility, `nmde` custom atom embedding could be implemented

---

## 8. Required Tools & Dependencies

### System Dependencies
| OS | Packages |
|----|----------|
| Windows | Visual Studio Build Tools (C++), Python 3.9+ |
| Linux | libgtk-3-dev, libgdk-pixbuf2.0-dev, libjavascriptcoregtk-4.1-dev, libsoup-3.0-dev, libwebkit2gtk-4.1-dev, libglib2.0-dev, libcairo2-dev, libssl-dev, pkg-config, libasound2-dev, libdbus-1-dev |
| macOS | Xcode CLI tools |

### Rust Crates (Key)
- `tauri` - Desktop shell
- `symphonia` - Audio decoding
- `rusqlite` - SQLite database
- `tokio` - Async runtime
- `serde`/`serde_json` - Serialization
- `tracing` - Logging
- `mp4` - MP4 container manipulation
- `hound` - WAV reading/writing
- `rubato` - Audio resampling

### NPM Packages (Key)
- `react` / `react-dom` - UI framework
- `zustand` - State management
- `tailwindcss` - Styling
- `vitest` - Unit and integration testing
- `@testing-library/react` - Component testing
- `@playwright/test` - E2E testing
- `@tauri-apps/api` - Tauri frontend API
- `eslint` / `prettier` - Linting/formatting
- `typescript` - Type safety

---

## 9. Contact & Resources

- **Repository**: https://github.com/zenla5/stemgen-gui
- **Main Branch CI**: https://github.com/zenla5/stemgen-gui/actions (branch: main)

### Useful Links
- Tauri v2 Docs: https://tauri.app/v2/
- Vitest: https://vitest.dev/
- Playwright: https://playwright.dev/
- Rust + Tauri Testing: https://tauri.app/v2/distigen/testing/
