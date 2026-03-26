# Stemgen-GUI AI Agent Task List

This document provides a structured, step-by-step task list for AI agents to continue development on the Stemgen-GUI project.

## Current Status

✅ **Phase 1: CI Pipeline Fixes — COMPLETED**
✅ **Phase 2: Release Workflow Fixes — COMPLETED**
✅ **Phase 3.3: Unit Tests — COMPLETED (30 tests)**
✅ **Phase 3.5: Security Hardening — COMPLETED (CSP added)**
✅ **Phase 4.1: README Update — COMPLETED**
✅ **Phase 1-2 Bug Fixes — COMPLETED** (2026-03-26)
✅ **Phase 3: Core Pipeline — Separation — COMPLETED**
✅ **Phase 4: Core Pipeline — Stem Packing — COMPLETED**
✅ **Phase 5: Audio Preview & Waveform — COMPLETED**
✅ **Phase 6: Settings & History — COMPLETED**
✅ **Phase 7: CI/CD & Testing — COMPLETED**
✅ **Phase 8: Advanced Features — COMPLETED**

---

## Completed Work (Latest Session - 2026-03-26)

### Phase 7: CI/CD & Testing
- ✅ Fixed release workflow with artifact upload steps
- ✅ Added Rust unit tests for decoder, presets, metadata
- ✅ Updated CI workflow allowances for dead_code warnings

### Phase 8: Advanced Features
- ✅ **Task 30: Implemented model download manager** — Created `src-tauri/src/commands/models.rs`
  - HuggingFace model downloading
  - Progress tracking via events
  - Model deletion support
  - Downloaded models listing
- ✅ **Task 30b: Model Manager UI** — Created `src/components/settings/ModelManager.tsx`
  - Download/delete UI for AI models
  - Progress display
  - Model information display

---

## Project Status Summary

The Stemgen-GUI project is now at a **MVP (Minimum Viable Product)** stage with:

### Core Features (Implemented)
- Audio file selection (MP3, FLAC, WAV, OGG, etc.)
- Stem separation via Python sidecar (demucs/bs_roformer)
- .stem.mp4 creation with NI metadata
- Audio preview with waveform visualization
- Stem mixer with volume/mute/solo controls
- Processing history
- Settings persistence

### Infrastructure (Implemented)
- Cross-platform builds (Windows, macOS, Linux)
- CI/CD with GitHub Actions
- Release workflow with artifact uploads
- Rust unit tests
- TypeScript type checking

### Remaining (Future Work)
- Multi-track audio playback (play all stems simultaneously)
- BPM/key detection integration
- Stem unpacking from existing .stem.mp4
- Export individual stems
- Model download UI integration with backend

---

## Quick Start for Next Agent

1. **Run the app**: `npm run tauri:dev`
2. **Check Rust compiles**: `cargo check --manifest-path src-tauri/Cargo.toml`
3. **Check TypeScript compiles**: `npm run check`
4. **Run tests**: `npm run test`

### Key Files:
- `src-tauri/src/commands/separation.rs` — Separation commands
- `src-tauri/src/commands/sidecar.rs` — Python process management
- `src-tauri/src/commands/models.rs` — Model download manager
- `src-tauri/src/stems/packer.rs` — Stem packing with FFmpeg
- `src/hooks/useAudioPlayer.ts` — Web Audio API hook
- `src/components/audio/WaveformDisplay.tsx` — Waveform visualization
- `src/components/settings/ModelManager.tsx` — Model download UI

---

## Version History

- **2026-03-26**: All phases completed (MVP ready)
- **2026-03-26**: Phase 1-6 completed (85% done)
- **2026-03-26**: Phase 1, 2, and 3 fixes completed (65% done)
- **2026-03-26**: Phase 1 & 2 fixes completed (58% done)
- **2026-03-26**: Initial project assessment and task list created
