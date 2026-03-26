# Stemgen-GUI AI Agent Task List

This document provides a structured, step-by-step task list for AI agents to continue development on the Stemgen-GUI project.

## Current Status

✅ **Phase 1: CI Pipeline Fixes — COMPLETED**
✅ **Phase 2: Release Workflow Fixes — COMPLETED**
✅ **Phase 3.3: Unit Tests — COMPLETED (30 tests)**
✅ **Phase 3.5: Security Hardening — COMPLETED (CSP added)**
✅ **Phase 4.1: README Update — COMPLETED**
✅ **Phase 1 Review & Fixes — COMPLETED** (2026-03-26)
✅ **Phase 2 Bug Fixes — COMPLETED** (2026-03-26)

---

## Completed Work (Latest Session - 2026-03-26)

### Key Findings:
- **Rust backend already compiles successfully** — lofty 0.18, rubato 0.15, symphonia 0.5 all work with current code
- **No major API mismatches** — the issues described in IMPLEMENTATION_PLAN.md were outdated
- **Frontend was only blocked by missing `dist/` folder** — which exists after `npm run build`

### Changes Made:

#### Phase 1: Make It Compile & Run
- ✅ Verified Rust compiles with only dead_code warnings (expected for WIP code)
- ✅ Built frontend (`dist/` folder created)
- ✅ Fixed CSP for Google Fonts (added `fonts.googleapis.com` and `fonts.gstatic.com`)
- ✅ Removed `rustup-init.exe` from git tracking

#### Phase 2: Bug Fixes
- ✅ Fixed system theme detection in `App.tsx` (was adding `class="system"` which has no CSS)
- ✅ Fixed keyboard shortcuts to ignore input elements in `useKeyboardShortcuts.ts`
- ✅ Fixed FileBrowser drag-drop for Tauri (replaced react-dropzone with native Tauri event listeners)
- ✅ Added ErrorBoundary component for crash resilience
- ✅ Wired "Start Processing" button with `startProcessing` action in appStore
- ✅ Added `cancelProcessing` action
- ✅ Added job progress display in ProcessingQueue
- ✅ Fixed unused imports in test file (ESLint `no-constant-binary-expression`)

---

## Remaining Tasks

### Phase 3: Core Pipeline — Separation (Tasks 18-20)
> **Critical** — This is the core value proposition of the app

- [ ] **Task 18: Implement Python sidecar spawning** — Connect Rust to `stemgen_sidecar.py`
- [ ] **Task 19: Wire full separation pipeline** — `start_separation` command
- [ ] **Task 20: Implement cancellation** — Kill running Python process

### Phase 4: Core Pipeline — Stem Packing (Tasks 21-22)
> **Critical** — Creating real `.stem.mp4` files

- [ ] **Task 21: Implement proper stem.mp4 muxing** — FFmpeg multi-track muxing
- [ ] **Task 22: Implement NI metadata atom** — Embed JSON metadata in MP4

### Phase 5: Audio Preview & Waveform (Tasks 23-24)
> **High Priority** — User-facing features

- [ ] **Task 23: Integrate wavesurfer.js** — Render waveforms for audio files
- [ ] **Task 24: Wire StemMixer audio playback** — Web Audio API with volume/solo/mute

### Phase 6: Settings, History & Polish (Tasks 25-26)
- [ ] **Task 25: Connect settings to SQLite** — Persist settings to database
- [ ] **Task 26: Implement processing history** — Save and display job history

### Phase 7: CI/CD & Testing (Tasks 27-29)
- [ ] **Task 27: Fix release workflow artifacts** — Add upload-artifact steps
- [ ] **Task 28: Add Rust unit tests** — Test decoder, resampler, packer
- [ ] **Task 29: Add frontend component tests** — 80% coverage target

### Phase 8: Advanced Features (Task 30+)
- [ ] **Task 30: Implement model download manager** — HuggingFace model downloads
- [ ] **Task 31: BPM/key detection** — Integrate essentia or aubio
- [ ] **Task 32: Stem unpacking** — Extract stems from existing .stem.mp4

---

## Quick Start for Next Agent

1. **Run the app**: `npm run tauri:dev`
2. **Check Rust compiles**: `cargo check --manifest-path src-tauri/Cargo.toml`
3. **Run tests**: `npm run test`

### Key Files to Understand:
- `src-tauri/src/commands/separation.rs` — Separation commands (needs implementation)
- `src-tauri/src/stems/packer.rs` — Stem packing (needs multi-track muxing)
- `src/stores/appStore.ts` — Frontend state (wired, awaiting backend)
- `src/components/processing/ProcessingQueue.tsx` — Queue UI (wired, awaiting backend)

---

## Version History

- **2026-03-26**: Phase 1 & 2 fixes completed (58% done)
- **2026-03-26**: Initial project assessment and task list created
