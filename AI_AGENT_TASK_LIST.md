# Stemgen-GUI AI Agent Task List

> **Version**: 1.0  
> **Last Updated**: 2026-03-26  
> **Branch**: main (all tests passing, CI #69 green)

This document provides a sophisticated, step-by-step task list for AI agents to continue developing Stemgen-GUI, fix bugs, and set up the project.

---

## Table of Contents

1. [Project Overview & Architecture](#1-project-overview--architecture)
2. [CI/CD Pipeline Reference](#2-cicd-pipeline-reference)
3. [Local Development Setup](#3-local-development-setup)
4. [Common Tasks](#4-common-tasks)
5. [Debugging CI Failures](#5-debugging-ci-failures)
6. [Feature Development Workflow](#6-feature-development-workflow)
7. [Known Issues & Gotchas](#7-known-issues--gotchas)
8. [Required Tools & Dependencies](#8-required-tools--dependencies)

---

## 1. Project Overview & Architecture

### What is Stemgen-GUI?
- FOSS desktop application that converts audio files to `.stem.mp4` files for DJ software
- Tech stack: Tauri v2 (Rust + React 18 + TypeScript + Tailwind CSS + Zustand)

### Directory Structure
```
stemgen-gui/
├── src/                    # React frontend
│   ├── components/         # UI components (shadcn/ui)
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand state management
│   ├── lib/                # Utilities, types, constants
│   ├── i18n/               # Internationalization
│   └── __tests__/          # Frontend tests
│       ├── integration/    # React component tests (Vitest + Testing Library)
│       └── e2e/            # Playwright E2E tests
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri IPC commands
│   │   ├── audio/          # Audio processing (symphonia, waveform)
│   │   └── stems/          # Stem metadata, presets, packer
│   └── tests/              # Rust integration tests
├── .github/workflows/      # CI/CD pipelines
│   ├── ci.yml              # Main CI (8 parallel jobs)
│   └── release.yml         # CD (builds & publishes releases)
└── python/                 # AI sidecar (demucs/bs_roformer)
```

### Audio Processing Pipeline
1. **Ingest** → Decode audio, extract metadata/cover art
2. **Convert** → Resample to 44.1kHz, normalize
3. **Separate** → Run AI model → 4 stems (drums, bass, other, vocals)
4. **Preview** → User previews/mixes stems
5. **Encode** → ALAC/AAC encoding
6. **Pack** → Create .stem.mp4 container
7. **Tag** → Write metadata, colors, BPM, key

### NI Stem Format
- 5 audio tracks: master + 4 stems
- Custom `nmde` atom with JSON metadata
- Stem ordering per DJ software (Traktor, rekordbox, Serato, Mixxx, djay, VirtualDJ)

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
| 4 | Integration Tests | ubuntu-latest | ~2-3 min | `npm run test:integration` |
| 5 | E2E Tests | ubuntu-latest | ~5-10 min | `npx playwright test --project=chromium` |
| 6 | Backend (Rust) | ubuntu-latest | ~10-15 min | `cargo fmt`, `cargo clippy`, `cargo build --release`, `cargo test --lib` |
| 7 | Security Audit | ubuntu-latest | ~2 min | `npm audit`, `cargo audit` |
| 8 | All Checks Passed | ubuntu-latest | ~10s | Aggregates all job results |

**SUCCESS**: All 8 jobs must pass.

**CI Run #69** (c02c616 on main): ALL GREEN ✅
- 8/8 jobs passing
- 1275 lines added, 246 removed

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

### Prerequisites
```bash
# Core tools
node >= 20
npm >= 9
rust >= stable
python >= 3.9
git

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
npm run test:unit        # Vitest unit tests
npm run test:integration # React component integration tests
npm run test:e2e        # Playwright E2E tests
npm run test:coverage    # Coverage report

# Linting
npm run lint             # ESLint + Prettier

# Rust
cd src-tauri && cargo build --release
cd src-tauri && cargo test --lib       # Library tests only (no binary needed)
cd src-tauri && cargo clippy --lib --bins
```

### Environment Variables
```bash
# Optional: GPU acceleration
CUDA_HOME=/path/to/cuda    # Windows/Linux NVIDIA
DYLD_LIBRARY_PATH=...       # macOS

# Optional: Custom sidecar
STEMGEN_SIDECAR=/path/to/stemgen_sidecar.py
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

### D. Checking CI Status
```python
# Python script to check CI status
import urllib.request, json

TOKEN = 'ghp_YOUR_TOKEN'
REPO = 'zenla5/stemgen-gui'
url = f'https://api.github.com/repos/{REPO}/actions/runs?branch=main&per_page=3'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
d = json.loads(urllib.request.urlopen(req).read())
for run in d['workflow_runs'][:3]:
    print(f"#{run['run_number']} {run['status']}/{run['conclusion']} id={run['id']}")
```

### E. Checking Specific Job Status
```python
# Get job details
RUN_ID = 23605675955  # Example
url = f'https://api.github.com/repos/{REPO}/actions/runs/{RUN_ID}/jobs'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
d = json.loads(urllib.request.urlopen(req).read())
for job in d['jobs']:
    print(f"{job['name']}: {job.get('conclusion')}")
```

### F. Cancelling a CI Run
```python
import urllib.request

RUN_ID = 23606320129
url = f'https://api.github.com/repos/{REPO}/actions/runs/{RUN_ID}/cancel'
req = urllib.request.Request(url, method='POST', headers={
    'Authorization': f'Bearer {TOKEN}',
    'Accept': 'application/vnd.github+json'
})
resp = urllib.request.urlopen(req)
print(resp.status)
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
   JOB_ID = 68746751443
   url = f'https://api.github.com/repos/{REPO}/actions/jobs/{JOB_ID}'
   req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
   job = json.loads(urllib.request.urlopen(req).read())
   for step in job['steps']:
       print(f"  Step {step['number']}: {step['name']} - {step.get('conclusion')}")
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

### Common CI Failure Patterns

| Failure | Likely Cause | Fix |
|---------|-------------|-----|
| Backend `cargo test` fails | Binary compilation issue | Use `cargo test --lib` (library tests only) |
| Frontend lint fails | TypeScript/ESLint errors | Run `npm run lint` locally and fix |
| Integration tests fail | Mock/setup issues | Check `src/__tests__/integration/setup.ts` |
| E2E tests fail | App doesn't build/start | Verify `npm run tauri:build` works |
| Security audit fails | Vulnerable dependencies | Run `npm audit` and `cargo audit` |
| All Checks Passed fails | Previous run's status | Check all 8 jobs individually |

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

### Step 6: Monitor CI
```python
# Check CI status for your branch
url = f'https://api.github.com/repos/{REPO}/actions/runs?branch=feat/my-new-feature&per_page=1'
# Wait for completion and check conclusion
```

### Step 7: Fix Any CI Failures
- Follow the debugging protocol above
- Push fixes to the same branch
- CI will re-run automatically

### Step 8: Merge to Main
```bash
# Via GitHub PR (recommended)
# Or via command line:
git checkout main
git pull origin main
git merge feat/my-new-feature
git push origin main
```

### Step 9: Verify Main CI
- Wait for CI on main to pass
- Check all 8 jobs pass

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

### Cross-Platform npm Scripts
- Windows: Use `npm run build:win`, `npm run test:win`
- Linux/macOS: Use `npm run build:unix`, `npm run test:unix`
- Don't use `npm run build` or `npm run test` on wrong OS

### Tauri Build Artifacts
- Build artifacts are OS-specific (.exe for Windows, app bundle for macOS, AppImage for Linux)
- Release workflow builds for all platforms
- Don't commit `src-tauri/target/` (add to .gitignore)

### Python Sidecar
- Requires Python 3.9+ with dependencies from `python/requirements.txt`
- Must be in PATH or bundled with the app
- Used for AI model inference (demucs/bs_roformer)

### Stem Metadata
- NI stem metadata is JSON in a custom `nmde` atom
- Full NI compatibility requires low-level MP4 manipulation
- Current implementation uses sidecar `.stem.metadata` files

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
- `vitest` - Unit/integration testing
- `@testing-library/react` - Component testing
- `@playwright/test` - E2E testing
- `@tauri-apps/api` - Tauri frontend API
- `eslint` / `prettier` - Linting/formatting
- `typescript` - Type safety

---

## 9. Contact & Resources

- **Repository**: https://github.com/zenla5/stemgen-gui
- **Main Branch CI**: https://github.com/zenla5/stemgen-gui/actions (branch: main)
- **Latest Green CI Run**: #69 (commit c02c616)

### Useful Links
- Tauri v2 Docs: https://tauri.app/v2/
- Vitest: https://vitest.dev/
- Playwright: https://playwright.dev/
- Rust + Tauri Testing: https://tauri.app/v2/distigen/testing/
