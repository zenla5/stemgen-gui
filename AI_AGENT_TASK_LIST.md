# Stemgen-GUI AI Agent Task List

> **Version**: 2.1
> **Last Updated**: 2026-03-27
> **Branch**: main
> **Tests**: ✅ 61/61 passing (30 unit + 31 integration)
> **CI**: ✅ CI #78 PASSED (clippy fixes) | CI #79 in-progress (docs)

---

## Table of Contents

1. [Current Phase: Multi-Stem Audio Player](#1-current-phase-multi-stem-audio-player)
2. [CI/CD Pipeline Reference](#2-cicd-pipeline-reference)
3. [Local Development Setup](#3-local-development-setup)
4. [Common Tasks](#4-common-tasks)
5. [Debugging CI Failures](#5-debugging-ci-failures)
6. [Feature Development Workflow](#6-feature-development-workflow)
7. [Known Issues & Gotchas](#7-known-issues--gotchas)
8. [Required Tools & Dependencies](#8-required-tools--dependencies)

---

## 1. Current Phase: Multi-Stem Audio Player

### Problem

Currently `StemMixer` only plays the master/original audio file. The per-stem volume/mute/solo sliders are cosmetic — they don't affect playback. The `useStemMixer` hook in `useAudioPlayer.ts` calculates effective volumes but never applies them.

### Goal

Implement proper multi-stem playback using Web Audio API with individual `GainNode` per stem, allowing real-time volume, mute, and solo control for each stem.

### Architecture

```
useAudioPlayer.ts
├── useMultiStemPlayer (NEW — replaces useAudioPlayer for mixer)
│   ├── Loads all 4 stem files via fetch + convertFileSrc
│   ├── Creates AudioBufferSourceNode per stem
│   ├── Creates GainNode per stem (connects stem → gain → master → destination)
│   ├── Manages master playback (play/pause/seek)
│   ├── Sync: all stems share AudioContext timing
│   └── Returns: stemGainNodes, master state, play/pause/seek controls
│
├── useStemMixer (refactor existing)
│   └── Reads stem state from store, applies to GainNode.gain.value
│
├── StemMixer.tsx (update)
│   └── Uses useMultiStemPlayer instead of useAudioPlayer
│       - Per-stem volume sliders → write to GainNode
│       - Mute/Solo buttons → write to GainNode
│       - Mini waveform per stem card
│       - Shared play/pause/seek bar
│
└── StemWaveformDisplay (NEW — shared waveform component)
    └── Canvas-based waveform visualization
        - Single stem → canvas bar chart of RMS values
        - Integrated into StemMixer card header
        - Click to seek (if stem selected for preview)
```

### Step-by-Step Implementation

#### Step 1: Create `useMultiStemPlayer` Hook
**File**: `src/hooks/useMultiStemPlayer.ts` (NEW)

```typescript
interface MultiStemPlayerReturn {
  // State
  state: MultiStemPlayerState;
  // Loading
  loadStems: (stems: { type: StemType; path: string }[]) => Promise<void>;
  // Playback
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  // Volume
  setMasterVolume: (volume: number) => void;
  setStemVolume: (stemType: StemType, volume: number) => void;
  setStemMuted: (stemType: StemType, muted: boolean) => void;
  setStemSolo: (stemType: StemType, solo: boolean) => void;
  // Data
  stemWaveforms: Record<StemType, WaveformData>;
  // Cleanup
  cleanup: () => void;
}
```

**Key implementation notes:**
- Use `convertFileSrc(filePath)` for each stem file
- `fetch()` the asset URL → `arrayBuffer` → `decodeAudioData`
- One `AudioBuffer` per stem stored in `Map<StemType, AudioBuffer>`
- One `GainNode` per stem: `source.connect(gain).connect(masterGain).connect(destination)`
- On play: create `AudioBufferSourceNode` for each stem, `start(0, pausedAt)`
- On seek: update `pausedAt`, restart all sources from new position
- On volume change: update `gainNode.gain.value` (takes effect immediately)
- Solo logic: if any stem has `solo=true`, mute all non-solo stems
- Return waveform data: compute from `AudioBuffer.getChannelData()` → downsampled RMS peaks

#### Step 2: Create `StemWaveformDisplay` Component
**File**: `src/components/audio/StemWaveformDisplay.tsx` (NEW)

Canvas-based waveform rendering:
- Input: `AudioBuffer` or `Float32Array` of RMS values
- Render: vertical bars colored by `stem.color`
- Click: seek to position
- Height: configurable (default 32px for mixer cards, 80px for preview)
- Use `requestAnimationFrame` for smooth seeking indicator

#### Step 3: Update `StemMixer.tsx`
- Replace `useAudioPlayer` with `useMultiStemPlayer`
- Pass stem file paths from `currentStems[].file_path`
- Per-stem card: add `StemWaveformDisplay` at top
- Volume sliders: call `setStemVolume(type, value)` instead of just updating store
- Mute/Solo buttons: call `setStemMuted/setStemSolo`
- Playback bar at bottom: unified controls affecting all stems
- Waveform display: show selected stem or master mix

#### Step 4: Add TypeScript Types
```typescript
// src/lib/types.ts
export interface MultiStemPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoaded: boolean;
  loadingProgress: number; // 0-1 for loading stems
  loadedStems: StemType[];
}
```

#### Step 5: Update Integration Test
**File**: `src/__tests__/integration/StemMixer.test.tsx`

Add tests for:
- All 4 stem gain nodes created
- Volume slider changes apply to GainNode
- Mute button sets gain to 0
- Solo button mutes non-solo stems
- Seeking updates currentTime and restarts all sources

#### Step 6: Run Clippy and Tests
```bash
cd src-tauri && cargo clippy --lib --bins -- -D warnings
npm run test:unit
npm run test:integration
```

### Files to Modify
| File | Change |
|------|--------|
| `src/hooks/useMultiStemPlayer.ts` | **NEW** — multi-stem audio player hook |
| `src/components/audio/StemWaveformDisplay.tsx` | **NEW** — canvas waveform renderer |
| `src/components/audio/index.ts` | Add `StemWaveformDisplay` export |
| `src/components/mixer/StemMixer.tsx` | Use `useMultiStemPlayer`, add per-stem waveforms |
| `src/lib/types.ts` | Add `MultiStemPlayerState` type |
| `src/__tests__/integration/StemMixer.test.tsx` | Add multi-stem playback tests |

### Verification
- [ ] Clippy passes: `cargo clippy --lib --bins -- -D warnings`
- [ ] Unit tests pass: `npm run test:unit`
- [ ] Integration tests pass: `npm run test:integration`
- [ ] StemMixer renders all 4 stem cards with waveforms
- [ ] Volume slider changes are audible in real-time
- [ ] Mute/Solo work correctly
- [ ] Seeking syncs all stems
- [ ] Commit and push (run clippy first!)

---

## ⚠️ CRITICAL: Always Run Clippy Before Committing

**AI agents MUST run clippy linting locally and verify it passes BEFORE committing or pushing any Rust code changes.**

```bash
cd src-tauri && cargo clippy --lib --bins -- -D warnings
```

**Why this is mandatory:**
- CI uses `cargo clippy` with `-D warnings` (treats warnings as errors)
- Running clippy locally catches issues that `cargo build` misses
- The `-D warnings` flag ensures ALL warnings are treated as errors, matching CI behavior
- This prevents wasted CI cycles and repeated fix-push-fix cycles
- **ALWAYS wait for the command to finish and confirm `Finished` with 0 warnings before proceeding**

**Common clippy errors to watch for:**
- `dead_code` — unused fields/functions (add `#[allow(dead_code)]` or remove dead code)
- `unused_imports` — import not used (remove the import)
- `wildcard_in_or_patterns` — `_` makes other patterns redundant (use just `_`)
- `temporary_value_dropped_while_borrowed` — lifetime issues (bind to `let` first)
- Missing trait imports (e.g., `use tauri::Emitter` for `emit()` method)

**Workflow for any Rust change:**
```
1. Make your code changes
2. Run: cd src-tauri && cargo clippy --lib --bins -- -D warnings
3. Wait for "Finished" output (no errors/warnings)
4. If errors → fix them and re-run clippy
5. Only then: git add . && git commit && git push
```

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
cd src-tauri && cargo clippy --lib --bins -- -D warnings  # LINT BEFORE COMMIT
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

1. **Check the jobs list** to identify which job failed
2. **Check step-level results** within the failed job
3. **For Backend (Rust) failures**: Check clippy/fmt/build → use `cargo clippy --lib --bins -- -D warnings` locally
4. **For Frontend failures**: Run `npm run lint` and `npm run check` locally
5. **For E2E failures**: Check Playwright configuration and timing issues

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
cd src-tauri && cargo clippy --lib --bins -- -D warnings  # CRITICAL
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

### Rust Test Binary
- `cargo test` compiles the Tauri binary which needs a JS runtime
- In CI, use `cargo test --lib` instead
- Integration tests in `src-tauri/tests/` need `cargo test` but will fail without JS

### Python Sidecar
- Requires Python 3.9+ with dependencies from `python/requirements.txt`
- Used for AI model inference (demucs/bs_roformer)
- Progress events emitted as JSON lines to stdout → forwarded to frontend via Tauri events

---

## 8. Required Tools & Dependencies

### System Dependencies
| OS | Packages |
|----|----------|
| Windows | Visual Studio Build Tools (C++), Python 3.9+ |
| Linux | libgtk-3-dev, libgdk-pixbuf2.0-dev, libjavascriptcoregtk-4.1-dev, libsoup-3.0-dev, libwebkit2gtk-4.1-dev |
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
- `wavesurfer.js` - Audio waveform visualization
- `eslint` / `prettier` - Linting/formatting
- `typescript` - Type safety

---

## 9. Contact & Resources

- **Repository**: https://github.com/zenla5/stemgen-gui
- **Main Branch CI**: https://github.com/zenla5/stemgen-gui/actions
