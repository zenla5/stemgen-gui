# Stemgen-GUI Implementation Plan

## Overview

**Stemgen-GUI** is a free and open source (FOSS) desktop application that converts audio files (MP3, FLAC, WAV, OGG, etc.) into `.stem.mp4` files for use with DJ software.

## Tech Stack

- **Tauri v2** - Desktop shell (Rust)
- **React 18** - Frontend UI
- **TypeScript** - Type-safe frontend
- **Rust** - High-performance backend
- **Python sidecar** - AI model inference (demucs/bs_roformer)
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **Playwright** - E2E testing

## Implemented Features

### ✅ Phase 1: Audio Processing Backend

#### Rust Backend (`src-tauri/src/`)

**Audio Processing (`audio/`)**
- `decoder.rs` - Audio decoding using symphonia (MP3, FLAC, WAV, OGG, AAC, AIFF, WMA, Opus)
- `resampler.rs` - High-quality resampling to 44.1kHz using rubato
- `converter.rs` - FFmpeg-based format conversion (WAV, FLAC, MP3, AAC, ALAC, OGG)
- `waveform.rs` - Waveform generation for visualization

**NI Stem Packing (`stems/`)**
- `metadata.rs` - NI stem metadata structure with colors
- `presets.rs` - DJ software presets (Traktor, Rekordbox, Serato, Mixxx, djay, VirtualDJ)
- `packer.rs` - `.stem.mp4` creation with proper stem ordering

**Commands (`commands/`)**
- `mod.rs` - Command exports and dependency checking
- `db.rs` - SQLite database operations
- `audio.rs` - Audio info commands
- `separation.rs` - Stem separation and packing commands

#### Python Sidecar (`python/`)

- `stemgen_sidecar.py` - AI stem separation wrapper (demucs, bs_roformer)
- `requirements.txt` - Python dependencies

### ✅ Phase 2: Frontend UI Components

#### Core Files (`src/`)

**Types & Constants (`lib/`)**
- `types.ts` - TypeScript types for all data structures
- `constants.ts` - Stem colors, DJ presets, AI models, shortcuts
- `utils.ts` - Utility functions (cn, formatBytes, formatDuration)

**State Management (`stores/`)**
- `appStore.ts` - App state (files, jobs, stems, dependencies)
- `settingsStore.ts` - Settings state (theme, models, presets)

**Layout Components (`components/layout/`)**
- `AppShell.tsx` - Main app shell with drag-drop overlay
- `Header.tsx` - Header with theme toggle, GitHub link
- `Sidebar.tsx` - Navigation sidebar (Files, Queue, Mixer, Settings)
- `StatusBar.tsx` - Dependency status display

**Feature Components (`components/`)**
- `file-browser/FileBrowser.tsx` - Drag & drop file selection
- `processing/ProcessingQueue.tsx` - Job queue with status icons
- `mixer/StemMixer.tsx` - 4-stem mixer with volume/solo/mute
- `settings/SettingsPanel.tsx` - Full settings UI

**Hooks (`hooks/`)**
- `useHealthCheck.ts` - Dependency checking on mount
- `useKeyboardShortcuts.ts` - Keyboard navigation (1-4, Ctrl+B)

**i18n (`i18n/`)**
- `index.ts` - i18next configuration
- `en.json` - English translations

### ✅ Phase 3: Testing & CI/CD

**E2E Tests (`src/__tests__/e2e/`)**
- `app.spec.ts` - Complete Playwright test suite
- `helpers.ts` - Test utility functions
- `playwright.config.ts` - Multi-browser config

**GitHub Actions (`.github/workflows/`)**
- `ci.yml` - Full CI pipeline with 80% coverage threshold
- `release.yml` - Release workflow

### ✅ Phase 4: Configuration

**Tauri Configuration**
- `src-tauri/tauri.conf.json` - Tauri app configuration
- `src-tauri/capabilities/default.json` - Plugin permissions
- `Cargo.toml` - Rust dependencies

## DJ Software Presets

| Software | Stem Order | Codec |
|----------|-----------|-------|
| Traktor | drums, bass, other, vocals | ALAC |
| Rekordbox | drums, bass, other, vocals | AAC |
| Serato | vocals, drums, bass, other | AAC |
| Mixxx | drums, bass, other, vocals | ALAC |
| djay | drums, bass, other, vocals | AAC |
| VirtualDJ | vocals, drums, bass, other | AAC |

## Stem Colors (NI-Compatible)

```typescript
const STEM_COLORS = {
  drums: '#FF6B6B',  // Red
  bass: '#4ECDC4',     // Teal
  other: '#FFE66D',   // Yellow
  vocals: '#95E1D3',  // Mint green
};
```

## AI Models

| Model | Quality | Speed |
|-------|---------|-------|
| demucs | Draft | Fast |
| bs_roformer | Standard | Medium |
| htdemucs | Standard | Slow |
| htdemucs_ft | Master | Slow |

## Directory Structure

```
stemgen-gui/
├── src/                          # React frontend
│   ├── components/               # React components
│   │   ├── ui/                  # shadcn/ui components
│   │   ├── layout/              # AppShell, Sidebar, Header, StatusBar
│   │   ├── file-browser/        # File selection & drag-drop
│   │   ├── processing/           # Processing queue
│   │   ├── mixer/               # Stem mixer
│   │   └── settings/            # Settings panel
│   ├── hooks/                   # Custom React hooks
│   ├── stores/                  # Zustand stores
│   ├── lib/                     # Utilities and types
│   └── i18n/                   # Internationalization
├── src-tauri/                   # Rust backend
│   ├── src/
│   │   ├── audio/               # Audio processing
│   │   ├── stems/              # NI stem packing
│   │   └── commands/            # Tauri IPC commands
│   └── capabilities/            # Plugin permissions
├── python/                       # Python sidecar
├── .github/workflows/           # CI/CD pipelines
└── package.json
```

## CI/CD Issues & Fixes

The CI pipeline requires fixes for the following issues. Create a dedicated branch `fix/rust-backend` to address these:

### 🔴 Critical: Rust Backend Compilation (58 errors)

**Create a new branch:** `fix/rust-backend`

**Issues to fix:**

#### 1. Frontend Dist Missing
```
The `frontendDist` configuration is set to `"../dist"` but this path doesn't exist
```
**Fix:** Add `npm run build` step before `cargo build` in CI, or update `tauri.conf.json` to disable frontend validation.

#### 2. Rubato API Changes
```
error[E0432]: unresolved import `rubato::InterpolationParameters`, `rubato::InterpolationType`
```
**Fix:** Update `src-tauri/src/audio/resampler.rs` to use new rubato API:
- `InterpolationParameters` → `SincInterpolationParameters`
- `InterpolationType` → `SincInterpolationType`
- `SincFixedIn::new()` takes different arguments in newer versions

#### 3. Lofty API Changes
```
error[E0432]: could not find `prelude` in `lofty`
error[E0599]: no method named `properties` found
error[E0599]: no method named `primary_tag` found
```
**Fix:** Update `src-tauri/src/commands/audio.rs`:
- Add `use lofty::AudioFile;`
- Add `use lofty::TaggedFileExt;`
- Update method calls to match lofty v0.18 API

#### 4. Symphonia API Changes
```
error[E0277]: trait `MediaSource` is not implemented for `BufReader<File>`
error[E0599]: no method named `iter` found for `AudioPlanes`
```
**Fix:** Update `src-tauri/src/audio/decoder.rs`:
- Use `File` directly instead of `BufReader<File>`
- Fix `planes()` method calls for symphonia v0.5

#### 5. Missing DB Commands
```
error[E0433]: could not find `get_processing_history` in `commands`
error[E0433]: could not find `add_to_history` in `commands`
```
**Fix:** Implement missing commands in `src-tauri/src/commands/db.rs`:
- `get_processing_history`
- `add_to_history`
- `get_settings`
- `save_settings`

#### 6. Missing Tracing Import
```
error: cannot find macro `info` in this scope
```
**Fix:** Add `use tracing::info;` to `src-tauri/src/commands/db.rs`

#### 7. Private Module Exports
```
error[E0603]: module `waveform` is private
error[E0603]: trait `Resampler` is private
```
**Fix:** Update visibility in `src-tauri/src/audio/mod.rs`:
- Make `waveform` module public
- Export `Resampler` trait properly

#### 8. Various Unused Imports
**Fix:** Remove unused imports across files:
- `converter::*`, `waveform::*` in mod.rs
- `error` in commands
- `AppState`, `State` in mod.rs
- `TrackInfo` in packer.rs
- `mut` on `ordered_stems` variable

#### 9. Variable Move Error
```
error[E0382]: borrow of moved value: `request.output_path`
```
**Fix:** Clone or borrow properly in `src-tauri/src/commands/separation.rs`

#### 10. Build Step
```
frontendDist path doesn't exist
```
**Fix:** Add frontend build step:
```yaml
- name: Build frontend
  run: npm run build

- name: Build Rust backend
  run: cd src-tauri && cargo build --release
```

### 🟡 Non-Critical: ESLint Configuration

**Issues:** TypeScript parsing errors due to missing parser
**Fix:** Already fixed - added `@typescript-eslint/parser` to `eslint.config.js`

### 🟡 Non-Critical: Testing Library Missing

**Issues:** `@testing-library/jest-dom` not in dependencies
**Fix:** Already fixed - added to `package.json`:
- `@testing-library/jest-dom`
- `@testing-library/react`

---

## Pending Features

### High Priority (P1)

- [ ] Full AI separation pipeline (connect Python sidecar to Rust)
- [ ] BPM/key detection
- [ ] Stem unpacking for existing .stem.mp4 files
- [ ] Audio preview with waveform visualization
- [ ] Model download manager

### Medium Priority (P2)

- [ ] Auto-update system (Tauri updater)
- [ ] Processing history with quick re-process
- [ ] Export presets management
- [ ] Individual stem export (WAV/FLAC/MP3)
- [ ] Desktop notifications

### Lower Priority (P3)

- [ ] CLI mode for scripting
- [ ] Multi-language support (i18n)
- [ ] Audio analysis dashboard (LUFS, dynamic range)
- [ ] Custom stem renaming

## Common Commands

```bash
# Development
npm run dev           # Start frontend
npm run tauri:dev    # Start with Tauri

# Building
npm run tauri:build  # Production build

# Testing
npm run test          # Unit tests
npm run test:e2e     # E2E tests
npm run test:coverage # With coverage

# Linting
npm run lint          # Frontend lint
cargo clippy         # Backend lint
```

## Dependencies

The app requires these system dependencies:
- **FFmpeg** - Audio/video processing
- **SoX** - Audio format conversion
- **Python 3.9+** - For AI model inference
- **CUDA** (optional) - GPU acceleration

## License

GPL-3.0
