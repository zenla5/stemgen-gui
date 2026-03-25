# Stemgen-GUI Implementation Plan

## Overview

This document outlines the phased implementation plan for Stemgen-GUI, a free and open source (FOSS) stem file generator GUI.

## Phase 0: Foundation (Current State)

### Completed ✅
- [x] Project scaffolding (Tauri v2 + React + TypeScript + Vite + Tailwind)
- [x] CI/CD pipeline design (GitHub Actions with coverage gates)
- [x] Core UI shell (AppShell, Sidebar, Header, StatusBar)
- [x] File browser with drag & drop
- [x] Processing queue UI
- [x] Stem mixer UI
- [x] Settings panel
- [x] Zustand stores (appStore, settingsStore)
- [x] TypeScript types and constants
- [x] Dark/Light theme system
- [x] i18n setup (English)
- [x] Keyboard shortcuts system
- [x] Rust backend skeleton with commands
- [x] Database schema (SQLite)
- [x] Dependency health check
- [x] README and documentation

### Remaining
- [x] Create app icons (icons folder)
- [ ] Initialize Tauri plugins (capabilities)
- [ ] Add Playwright test config

## Phase 1: Core Pipeline

### 1.1 Audio Processing Backend
- [ ] Implement audio decoding with symphonia
- [ ] Implement resampling to 44.1kHz
- [ ] Implement metadata extraction with lofty
- [ ] Implement cover art extraction

### 1.2 Python Sidecar Integration
- [ ] Create Python wrapper script for demucs
- [ ] Create Python wrapper script for bs_roformer
- [ ] Implement subprocess management in Rust
- [ ] Implement progress streaming via JSON-RPC
- [ ] Implement GPU device detection

### 1.3 NI Stem Format Packer
- [ ] Implement MP4 container creation
- [ ] Implement NI stem metadata atom
- [ ] Implement 5-track stem creation
- [ ] Support ALAC and AAC encoding
- [ ] Support stem ordering per DJ software
- [ ] Implement custom stem colors

### 1.4 Stem Unpacking
- [ ] Implement stem extraction from .stem.mp4
- [ ] Implement metadata reading
- [ ] Implement stem file export

## Phase 2: User Experience

### 2.1 Waveform Visualization
- [ ] Generate waveform data in Rust
- [ ] Render waveforms with Canvas
- [ ] Show stem waveforms

### 2.2 Audio Preview
- [ ] Implement Web Audio API integration
- [ ] Preview original audio
- [ ] Preview individual stems
- [ ] A/B comparison

### 2.3 Batch Processing
- [ ] Implement job queue management
- [ ] Implement parallel processing
- [ ] Implement job cancellation
- [ ] Implement progress reporting

### 2.4 BPM & Key Detection
- [ ] Implement BPM detection (aubio/rust)
- [ ] Implement key detection
- [ ] Embed in output metadata

## Phase 3: Polish & Distribution

### 3.1 Cross-Platform Builds
- [ ] Windows: NSIS installer
- [ ] macOS: DMG bundle
- [ ] Linux: DEB, AppImage, Flatpak

### 3.2 Auto-Updater
- [ ] Configure Tauri updater plugin
- [ ] Set up update server
- [ ] Implement update UI

### 3.3 Desktop Notifications
- [ ] Implement Tauri notification plugin
- [ ] Notify on job completion
- [ ] Notify on errors

### 3.4 Processing History
- [ ] Store history in SQLite
- [ ] Display history UI
- [ ] Implement re-process capability

## Phase 4: Advanced Features

### 4.1 Paid Inference Providers
- [ ] Replicate API integration
- [ ] Modal API integration
- [ ] RunPod API integration

### 4.2 CLI Mode
- [ ] Implement headless mode
- [ ] Document CLI usage
- [ ] Support scripting/automation

### 4.3 Localization
- [ ] Add German translations
- [ ] Add French translations
- [ ] Add Spanish translations
- [ ] Set up Crowdin/Localazy

### 4.4 Audio Analysis Dashboard
- [ ] LUFS measurement
- [ ] Dynamic range analysis
- [ ] Spectral visualization

## Critical Path

```
Phase 0 (Foundation)
    │
    ▼
Phase 1 (Core Pipeline) ──► Phase 2 (UX) ──► Phase 3 (Distribution) ──► Phase 4 (Advanced)
    │
    ├─ Audio Decoding
    ├─ Resampling
    ├─ Metadata Extraction
    ├─ Python Sidecar
    ├─ NI Stem Packer
    └─ GPU Detection
```

## Dependencies Graph

```
Frontend (React)
    │
    ├── Tauri API (@tauri-apps/api)
    ├── UI Components (@radix-ui/*)
    ├── State (Zustand)
    └── Audio (wavesurfer.js)

Backend (Rust)
    │
    ├── Tauri Core
    ├── Audio (symphonia, hound, rubato)
    ├── Metadata (lofty)
    ├── MP4 (mp4 crate)
    ├── Database (rusqlite)
    └── HTTP (reqwest)

Python Sidecar
    │
    ├── demucs
    ├── bs_roformer
    └── mutagen
```

## Testing Strategy

### Unit Tests
- Frontend: Vitest with happy-dom
- Backend: cargo test

### Integration Tests
- Full pipeline test with sample audio
- Stem format validation
- Database migrations

### E2E Tests
- Playwright with Tauri driver
- Critical user flows:
  1. File drop → Queue → Process → Export
  2. Settings change → Preview → Export
  3. History browse → Re-process

### Coverage Requirements
- Frontend: 80% line coverage
- Backend: 80% line coverage
- CI gate: fail if below threshold

## Build Targets

| Platform | Architecture | Format | Status |
|---------|-------------|--------|--------|
| Windows | x64 | .exe (NSIS) | Planned |
| Windows | ARM64 | .exe (NSIS) | Planned |
| macOS | Intel | .dmg | Planned |
| macOS | Apple Silicon | .dmg | Planned |
| Linux | x64 | .deb | Planned |
| Linux | x64 | .AppImage | Planned |
| Linux | x64 | Flatpak | Planned |

## AI Agent Workflow

When implementing features:

1. **Check existing patterns** - Look at similar implementations
2. **Write tests first** - TDD approach for critical paths
3. **Follow type system** - No `any` types, strict TypeScript
4. **Update documentation** - Keep README and code comments current
5. **Add translations** - Include i18n keys for all UI text
6. **Test locally** - Run before committing

## Git Workflow

```
Feature Branch → PR → Review → Merge to develop → Release → Merge to main
```

- `main` - Stable releases only
- `develop` - Integration branch
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches

## Release Process

1. Update version in `package.json` and `Cargo.toml`
2. Update `CHANGELOG.md`
3. Create git tag: `git tag v0.1.0`
4. Push tag: `git push origin v0.1.0`
5. CI/CD builds all platforms
6. Create GitHub Release
7. Upload installer assets
8. Update download links

## Support Matrix

| Feature | Priority | Difficulty | Status |
|---------|----------|------------|--------|
| Drag & Drop | P0 | Easy | Done |
| Batch Processing | P0 | Medium | Partial |
| AI Stem Separation | P0 | Hard | Planned |
| NI Stem Packer | P0 | Hard | Planned |
| DJ Presets | P0 | Easy | Done |
| Waveform Preview | P1 | Medium | Planned |
| Stem Mixer | P1 | Medium | Partial |
| Model Download | P1 | Medium | Planned |
| Auto-Update | P1 | Easy | Planned |
| CLI Mode | P2 | Medium | Planned |
| i18n | P3 | Easy | Planned |

## References

- [Tauri v2 Documentation](https://tauri.app/)
- [React Documentation](https://react.dev/)
- [Demucs GitHub](https://github.com/facebookresearch/demucs)
- [NI Stem Format](https://www.native-instruments.com/)
- [stemgen CLI](https://github.com/axeldelafosse/stemgen)
