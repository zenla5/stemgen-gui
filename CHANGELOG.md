# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] — 2026-03-28 — Comprehensive Testing Enhancement

### Added

- **Rust DB Unit Tests** — 8 unit tests for database migrations, history entries, settings CRUD operations
- **Rust AudioConverter Unit Tests** — 12 unit tests for audio format conversion, extension parsing, MIME types
- **Rust Models Unit Tests** — 18 unit tests for model metadata, download URLs, abort flags, serialization
- **Regression Test Suite** — Explicit tests for 5 known bugs (J1, G1, J2, G13, J7)
- **Enhanced E2E Tests** — 18 E2E tests covering keyboard navigation, sidebar toggle, responsive design, accessibility, theme switching
- **NI Stem Metadata Test** — Golden-file test for NI metadata structure (metadata.test.ts)

### Fixed

- **App.test.tsx** — Fixed 2 failing tests (wizard skip callback, Toaster rendering)
- **models.rs test** — Fixed serialization test assertion for DownloadProgressPayload

### Changed

- **CI Coverage Thresholds** — Coverage thresholds raised to 80% for frontend
- **Total Test Count** — 475 frontend tests + 59 Rust tests = 534 total tests

## [1.0.2] — 2026-03-28 — Testing & Settings Improvements

### Added

- **ModelManager integration** — AI Model download manager integrated into SettingsPanel with download buttons
- **ModelManager tests** — Comprehensive unit tests for ModelManager component (15+ tests)
- **SettingsPanel tests** — Expanded unit tests covering interactions, conditional rendering, and all sections
- **FileBrowser tests** — Integration tests covering drag-drop, keyboard navigation, file selection (29 tests)
- **ProcessingHistory tests** — Functional tests for history display with Tauri API mocking

### Fixed

- **Default device** — Changed default processing device from 'cuda' to 'cpu' (safer default, CUDA requires GPU)
- **APP_VERSION** — Version bumped from 0.1.0 to 1.0.1 to match release
- **Integration test mock** — Fixed SettingsPanel integration test by properly mocking ModelManager component
- **Constants test** — Updated default device expectation from 'cuda' to 'cpu'

### Changed

- **Vitest coverage thresholds** — Raised to 80% line coverage for frontend, 60% for backend

## [1.0.1] — 2026-03-28 — Bugfix Release

### Fixed

- **macOS Intel build** — Removed unsupported macOS Intel target from release workflow (requires Apple Developer certificate for notarization)
- **README downloads** — Updated download links to reflect v1.0.1 release

### Changed

- **Version bump** — All package versions updated to 1.0.1

## [1.0.0] — 2026-03-27 — First Production Release

### Added

- **Full DJ Software Support** — Export `.stem.mp4` files compatible with:
  - Native Instruments Traktor Pro
  - Pioneer rekordbox
  - Serato DJ
  - Mixxx
  - djay Pro
  - VirtualDJ
- **Multi-stem audio player** — Preview all 4 stems (drums, bass, other, vocals) with:
  - Per-stem volume, solo, and mute controls
  - Real-time waveform visualization (WaveSurfer.js)
- **Batch processing queue** — Process multiple files with parallel job execution (up to 4 concurrent)
- **NI metadata reader** — Parse and display `.stem.mp4` file metadata (title, artist, BPM, key)
- **Python sidecar health monitoring** — Auto-detect FFmpeg, SoX, Python, PyTorch, AI models; auto-restart subprocess
- **Export/download stems** — Individual stem export (WAV, MP3, FLAC, AAC, ALAC, OGG) and batch export
- **AI Model Manager** — Download/update demucs, BS-RoFormer, HTDemucs, HTDemucs-FT from within the app
- **Keyboard shortcuts** — Space (play/pause), 1-4 (navigate views), Ctrl+B (toggle sidebar), Ctrl+, (settings)
- **i18n infrastructure** — English and German translations via i18next
- **Accessibility** — ARIA labels, keyboard navigation, screen reader support
- **Plugin architecture** — 6 built-in DJ format plugins; extensible for community formats
- **Remote GPU support** — Submit AI separation jobs to a remote GPU server via REST API
- **Dark/Light theme** — System-aware theme with manual override
- **Processing history** — Persistent log of past jobs with re-process capability
- **Desktop notifications** — OS-native alerts when jobs complete

### Changed

- **Rust backend** — Native stem packing via FFmpeg; no Python dependency for final `.stem.mp4` step
- **State management** — Zustand with persistence (localStorage for settings, SQLite for history)
- **CI/CD pipeline** — 8 parallel jobs on every push: frontend (×3 OSes), integration, E2E, Rust backend, security audit
- **Release builds** — Windows (MSI + NSIS), macOS (Intel + Apple Silicon DMG), Linux (AppImage + DEB + RPM)

### Fixed

- Rust integration tests for waveform, presets, and NI metadata
- TypeScript type consistency between frontend and Rust backend
- `cargo test --lib` vs `cargo test --tests` distinction in CI
- Version extraction in release workflow (v-prefix stripping)
- `tauri.conf.json` JSON structure (security block placement)

---

## [0.1.0] — 2026-03-27 — Initial Development Release

### Added

- Project scaffold with Tauri v2 + React 18 + TypeScript
- Rust audio decoder (Symphonia) with MP3, FLAC, WAV, OGG support
- Waveform generation and resampling (44100 Hz target)
- NI `.stem.mp4` metadata structures (Rust + TypeScript)
- 6 DJ software presets with stem ordering
- FFmpeg-based stem packing (multi-track MP4 with metadata sidecar)
- Python sidecar script (demucs/bs_roformer inference wrapper)
- React UI components: AppShell, FileBrowser, StemMixer, ProcessingQueue, SettingsPanel, Header, Sidebar, StatusBar
- 25+ Vitest unit and integration test files
- Playwright E2E smoke tests
- GitHub Actions CI (lint, type check, tests) and Release (4 platforms) pipelines
