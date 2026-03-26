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
- **Vitest** - Unit and integration testing

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

**Unit Tests (`src/lib/__tests__/`)**
- `utils.test.ts` - Utility function tests

**Integration Tests (`src/__tests__/integration/`)**
- `setup.ts` - Shared Tauri API mocks (`invoke`, `listen`, `open` dialog)
- `FileBrowser.test.tsx` - FileBrowser component tests (7 tests)
- `ProcessingQueue.test.tsx` - ProcessingQueue component tests (8 tests)
- `StemMixer.test.tsx` - StemMixer component tests (6 tests)
- `SettingsPanel.test.tsx` - SettingsPanel component tests (11 tests)

**E2E Tests (`src/__tests__/e2e/`)**
- `app.spec.ts` - Complete Playwright test suite (6 smoke tests)
- `helpers.ts` - Test utility functions
- `playwright.config.ts` - Multi-browser config with 60s timeouts

**Rust Integration Tests (`src-tauri/tests/`)**
- `stem_metadata.rs` - NI metadata structure tests (7 tests)
- `presets.rs` - DJ software preset tests (10 tests)
- `audio_utils.rs` - Waveform generation tests (7 tests)

**GitHub Actions (`.github/workflows/`)**
- `ci.yml` - Full CI pipeline: Frontend (×3 OS), Integration, Backend (Rust), E2E, Security, Check gate
- `release.yml` - Cross-platform CD pipeline: Windows, macOS (Intel), macOS (ARM), Linux

### ✅ Phase 4: Configuration

**Tauri Configuration**
- `src-tauri/tauri.conf.json` - Tauri app configuration
- `src-tauri/capabilities/default.json` - Plugin permissions
- `Cargo.toml` - Rust dependencies

## Testing Matrix

| Test Type | Framework | Coverage Threshold | Location |
|-----------|-----------|-------------------|----------|
| Unit Tests | Vitest | — | `src/lib/__tests__/` |
| Integration Tests (React) | Vitest + RTL | Counted in 60% line threshold | `src/__tests__/integration/` |
| Integration Tests (Rust) | cargo test | Included in backend job | `src-tauri/tests/` |
| E2E Tests | Playwright | Smoke-level (no threshold) | `src/__tests__/e2e/` |

**Coverage thresholds (vitest.config.ts):**
```typescript
thresholds: {
  lines: 60,
  functions: 60,
  branches: 50,
  statements: 60,
}
```

## DJ Software Presets

| Software | Stem Order | Codec | Notes |
|----------|-----------|-------|-------|
| Traktor | Drums, Bass, Other, Vocals | ALAC | Native NI format |
| Rekordbox | Drums, Bass, Other, Vocals | AAC | Pioneer format |
| Serato | Vocals, Drums, Bass, Other | AAC | Different order |
| Mixxx | Drums, Bass, Other, Vocals | ALAC | Open source |
| djay | Drums, Bass, Other, Vocals | AAC | Algoriddim |
| VirtualDJ | Vocals, Drums, Bass, Other | AAC | Atomix |

## Stem Colors (NI-Compatible)

| Stem | Color |
|------|-------|
| Drums | `#FF6B6B` |
| Bass | `#4ECDC4` |
| Other | `#FFE66D` |
| Vocals | `#95E1D3` |

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
├── src/                              # React frontend
│   ├── components/                   # React components
│   │   ├── ui/                      # shadcn/ui components
│   │   ├── layout/                  # AppShell, Sidebar, Header, StatusBar
│   │   ├── file-browser/            # File selection & drag-drop
│   │   ├── processing/              # Processing queue
│   │   ├── mixer/                   # Stem mixer
│   │   └── settings/                # Settings panel
│   ├── hooks/                       # Custom React hooks
│   ├── stores/                      # Zustand stores
│   ├── lib/                         # Utilities and types
│   ├── __tests__/
│   │   ├── integration/             # Component integration tests
│   │   └── e2e/                    # Playwright E2E tests
│   └── i18n/                        # Internationalization
├── src-tauri/                        # Rust backend
│   ├── src/
│   │   ├── audio/                   # Audio processing
│   │   ├── stems/                   # NI stem packing
│   │   └── commands/                # Tauri IPC commands
│   ├── tests/                       # Rust integration tests
│   └── capabilities/                # Plugin permissions
├── python/                           # Python sidecar
├── .github/workflows/                # CI/CD pipelines
│   ├── ci.yml                       # CI (Frontend, Integration, Backend, E2E, Security)
│   └── release.yml                  # CD (Windows, macOS, Linux)
└── package.json
```

## Common Commands

```bash
# Development
npm run dev           # Start frontend
npm run tauri:dev    # Start with Tauri

# Building
npm run tauri:build  # Production build

# Testing
npm run test          # Unit tests
npm run test:coverage # With coverage thresholds
npm run test:e2e     # E2E tests
npm run test:e2e:ui  # E2E tests with UI

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
