# Stemgen-GUI AI Agent Task List

## Project Overview
Stemgen-GUI is a FOSS desktop application that converts audio files into `.stem.mp4` files for DJ software.

## Tech Stack
- Tauri v2 (Rust desktop shell)
- React 18 + TypeScript (frontend)
- Rust (backend)
- Python sidecar (AI inference)

## 10-Phase Development Plan

### Phase 1: Multi-stem audio player ✅
- [x] Audio playback for multiple stems simultaneously
- [x] Volume control per stem
- [x] Mute/solo per stem
- [x] Master volume control
- [x] Waveform visualization

### Phase 2: NI metadata reader ✅
- [x] Read NI stem metadata from .stem.mp4 files
- [x] Parse stem colors and ordering
- [x] Support for different DJ software presets

### Phase 3: Python sidecar health monitoring ✅
- [x] Health check endpoint for sidecar process
- [x] Automatic restart on failure
- [x] Status reporting to UI

### Phase 4: Export/Download Stems ✅
- [x] Export individual stems as audio files
- [x] Export as .stem.mp4 bundle
- [x] Batch export functionality

### Phase 5: Batch Processing ✅
- [x] Queue multiple files for processing
- [x] Parallel processing with configurable threads
- [x] Progress tracking per file

### Phase 6: Keyboard Shortcuts for Playback ✅
- [x] Space: Play/Pause
- [x] 1-4: Solo individual stems
- [x] M: Mute all
- [x] Ctrl+B: Open file browser

### Phase 7: i18n Infrastructure ✅
- [x] i18next integration
- [x] English translations
- [x] German translations
- [x] Language switcher in settings

### Phase 8: Accessibility (a11y) ✅
- [x] ARIA labels on all interactive elements
- [x] Keyboard navigation
- [x] Screen reader support
- [x] Focus indicators

### Phase 9: Plugin Architecture ✅
- [x] Plugin system for custom DJ formats
- [x] DJFormatPlugin interface
- [x] Built-in formats: NI Stem, Pioneer DJ, Serato DJ, Mixxx, djay Pro, VirtualDJ
- [x] PluginManager class
- [x] usePlugins hook

### Phase 10: Remote GPU ✅
- [x] Remote GPU server connection
- [x] REST API integration
- [x] Connection status monitoring
- [x] Job submission and status tracking
- [x] useRemoteGPU hook

## CI/CD Status
- [x] TypeScript check
- [x] ESLint linting
- [x] Unit tests (83 tests passing)
- [x] Integration tests
- [x] E2E tests with Playwright
- [x] GitHub Actions CI pipeline

## Files Created
- `src/lib/plugin.ts` - Plugin system
- `src/lib/remote.ts` - Remote GPU system
- `src/lib/__tests__/plugin.test.ts` - Plugin tests
- Various frontend components and hooks

## Commands
```bash
npm run check     # TypeScript check
npm run lint      # ESLint
npm run test      # Run tests
npm run tauri:dev # Start Tauri dev
```

## Git Commits
- `f9fae60` - fix: CI linting issues
- `faeb47a` - feat: Phase 9 - Plugin Architecture
- `91a32c5` - feat: Phase 10 - Remote GPU Support
