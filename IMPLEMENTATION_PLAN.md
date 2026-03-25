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
