# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-XX-XX — First Production Release

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
