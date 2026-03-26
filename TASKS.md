# Stemgen-GUI AI Agent Task List

This document provides a structured, step-by-step task list for AI agents to continue development on the Stemgen-GUI project.

## Current Status

✅ **Phase 1: CI Pipeline Fixes — COMPLETED**
✅ **Phase 2: Release Workflow Fixes — COMPLETED**
✅ **Phase 3.3: Unit Tests — COMPLETED (30 tests)**
✅ **Phase 3.5: Security Hardening — COMPLETED (CSP added)**
✅ **Phase 4.1: README Update — COMPLETED**
✅ **Phase 1-2 Bug Fixes — COMPLETED** (2026-03-26)
✅ **Phase 3: Core Pipeline — Separation — COMPLETED** (2026-03-26)
✅ **Phase 4: Core Pipeline — Stem Packing — COMPLETED** (2026-03-26)
✅ **Phase 5: Audio Preview & Waveform — COMPLETED** (2026-03-26)
✅ **Phase 6: Settings & History — COMPLETED** (2026-03-26)

---

## Completed Work (Latest Session - 2026-03-26)

### Phase 1-2: Make It Compile & Run, Bug Fixes
- ✅ Verified Rust compiles with only dead_code warnings (expected for WIP code)
- ✅ Built frontend (`dist/` folder created)
- ✅ Fixed CSP for Google Fonts (added `fonts.googleapis.com` and `fonts.gstatic.com`)
- ✅ Removed `rustup-init.exe` from git tracking
- ✅ Fixed npm run tauri:dev PATH issue for cargo (using PowerShell)
- ✅ Fixed system theme detection in `App.tsx` (was adding `class="system"` which has no CSS)
- ✅ Fixed keyboard shortcuts to ignore input elements in `useKeyboardShortcuts.ts`
- ✅ Fixed FileBrowser drag-drop for Tauri (replaced react-dropzone with native Tauri event listeners)
- ✅ Added ErrorBoundary component for crash resilience
- ✅ Wired "Start Processing" button with `startProcessing` action in appStore
- ✅ Added `cancelProcessing` action
- ✅ Added job progress display in ProcessingQueue

### Phase 3: Core Pipeline — Separation
- ✅ **Task 18: Implemented Python sidecar spawning** — Created `src-tauri/src/commands/sidecar.rs`
  - `SidecarManager` struct with async methods
  - Python executable detection (Windows + Unix paths)
  - Process spawning with stdout/stderr capture
  - Progress updates via JSON lines
  - Cancellation support
- ✅ **Task 19: Wired full separation pipeline** — Updated `start_separation` command
  - Integrated SidecarManager with AppState
  - Automatic Python sidecar path detection
  - Job ID generation for tracking
  - Stem collection after separation
- ✅ **Task 20: Implemented cancellation** — Added `cancel_separation` command

### Phase 4: Core Pipeline — Stem Packing
- ✅ **Task 21: Implemented stem.mp4 creation** — Updated `src-tauri/src/stems/packer.rs`
  - FFmpeg multi-track muxing support
  - Single-track fallback when no stems available
  - NI metadata atom embedding (sidecar file)
  - FFmpeg availability check
- ✅ **Task 22: Implemented NI metadata atom** — `NIStemMetadata` structure with:
  - Stem data (name, color, file path)
  - Master track info
  - Application info (Stemgen-GUI version)

### Phase 5: Audio Preview & Waveform
- ✅ **Task 23: Integrated wavesurfer.js** — Created `src/components/audio/WaveformDisplay.tsx`
  - WaveSurfer.js integration for waveform visualization
  - Play/pause/seek controls
  - Keyboard shortcuts (Space, arrows)
  - Time display
- ✅ **Task 24: Wired StemMixer audio playback** — Created `src/hooks/useAudioPlayer.ts`
  - Web Audio API integration
  - Master volume control
  - Play/pause/seek functionality
  - Audio loading from file paths

### Phase 6: Settings, History & Polish
- ✅ **Task 25: Connected settings to SQLite** — Database commands already exist
  - `get_settings` and `save_settings` commands
- ✅ **Task 26: Implemented processing history** — Created `src/components/history/ProcessingHistory.tsx`
  - Loads history from backend
  - Displays processing entries with metadata
  - Opens output folder functionality

---

## Remaining Tasks

### Phase 7: CI/CD & Testing (Tasks 27-29)
- [ ] **Task 27: Fix release workflow artifacts** — Add upload-artifact steps
- [ ] **Task 28: Add Rust unit tests** — Test decoder, resampler, packer
- [ ] **Task 29: Add frontend component tests** — 80% coverage target

### Phase 8: Advanced Features (Task 30+)
- [ ] **Task 30: Implement model download manager** — HuggingFace model downloads
- [ ] **Task 31: BPM/key detection** — Integrate essentia or aubio
- [ ] **Task 32: Stem unpacking** — Extract stems from existing .stem.mp4
- [ ] **Task 33: Multi-track audio playback** — Play all stems simultaneously
- [ ] **Task 34: Export individual stems** — Export stems as separate audio files

---

## Quick Start for Next Agent

1. **Run the app**: `npm run tauri:dev` (Windows: uses PowerShell to set cargo PATH)
2. **Check Rust compiles**: `cargo check --manifest-path src-tauri/Cargo.toml`
3. **Check TypeScript compiles**: `npm run check`
4. **Run tests**: `npm run test`

### Key Files:
- `src-tauri/src/commands/separation.rs` — Separation commands
- `src-tauri/src/commands/sidecar.rs` — Python process management
- `src-tauri/src/stems/packer.rs` — Stem packing with FFmpeg
- `src/hooks/useAudioPlayer.ts` — Web Audio API hook
- `src/components/audio/WaveformDisplay.tsx` — Waveform visualization
- `src/components/mixer/StemMixer.tsx` — Stem mixer UI
- `src/components/history/ProcessingHistory.tsx` — Processing history

---

## Version History

- **2026-03-26**: Phase 1-6 completed (85% done)
- **2026-03-26**: Phase 1, 2, and 3 fixes completed (65% done)
- **2026-03-26**: Phase 1 & 2 fixes completed (58% done)
- **2026-03-26**: Initial project assessment and task list created
