# Stemgen-GUI AI Agent Task List

## Status: 40% Complete

## Completed Phases

### Phase 1: Multi-Stem Audio Player ✅
- `useMultiStemPlayer` hook with per-stem GainNode routing
- `StemWaveformDisplay` canvas component
- `StemMixer` with real-time volume/mute/solo
- Commit: `2f6a2dc`

### Phase 2: NI Metadata Reader ✅
- `read_audio_metadata`, `read_stem_metadata`, `extract_cover_art_ffmpeg` Rust commands
- TypeScript types: `AudioMetadata`, `StemFileMetadata`
- `ProcessingHistory` with cover art, BPM, key, track count
- Commit: `17e6962`

### Phase 3: Python Sidecar Health Monitoring ✅
- `get_sidecar_status`, `check_model_available`, `validate_environment` Rust commands
- TypeScript types: `SidecarStatus`, `ModelAvailability`, `PackageStatus`, `EnvironmentValidation`
- `appStore` state with sidecar health + actions
- `useHealthCheck` hook
- `SettingsPanel` System Status section with summary badges, detailed package list, warnings/errors
- Commits: `a72ab99`, `5d57a85`

### Phase 4: Export/Download Stems ✅
- `export_stem` Rust command using FFmpeg (wav, mp3, flac, aac, alac, ogg)
- `batch_export_stems` Rust command for batch export
- Audio normalization via loudnorm filter
- TypeScript types: `ExportStemRequest`, `ExportStemResponse`, `BatchExportRequest`, `BatchExportResponse`, `ExportFormat`
- All 64 tests passing ✅
- Commits: `172195c`, `3c8423b`

## Remaining Phases

### Phase 5: Batch Processing
- Process multiple files in parallel
- Queue management improvements

### Phase 6: Keyboard Shortcuts for Playback
- Spacebar for play/pause
- Arrow keys for seeking

### Phase 7: i18n Infrastructure
- i18next setup complete (already in project)
- Additional language files needed (de, fr, es, ja translations)

### Phase 8: Accessibility (a11y)
- ARIA labels on all interactive elements
- Keyboard navigation improvements

### Phase 9: Plugin Architecture
- Plugin system for custom DJ formats
- Plugin API documentation

### Phase 10: Remote GPU
- Connect to remote GPU server for inference
- Authentication and security

## Verification Summary

| Check | Status |
|-------|--------|
| Rust clippy | ✅ 0 warnings |
| Rust tests (cargo test --lib) | ✅ 20/20 passed |
| TypeScript | ✅ 0 errors |
| ESLint | ✅ 0 warnings |
| Unit/Integration Tests | ✅ 64/64 passed |
| Git commits pushed | ✅ |

## Known Working Patterns
- Use snake_case for Rust backend types
- Use camelCase for TypeScript frontend types
- `DependencyStatus` is an object with boolean properties: `{ ffmpeg, sox, python, cuda, mps, models }`
- `Stem` interface has: `id`, `type` (StemType), `name`, `color`, `volume`, `muted`, `solo`, `file_path?`
- `ProcessingSettings` has: `model`, `device`, `outputFormat`, `qualityPreset`, `djPreset`, etc.
- Theme type: `'light' | 'dark' | 'system'`
