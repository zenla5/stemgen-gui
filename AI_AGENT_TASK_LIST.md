# Stemgen-GUI AI Agent Task List

## Status: In Progress (40%)

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

## In Progress

### Phase 4: Export/Download Stems ⚠️ (Partial - Backend Only)
- `export_stem` Rust command using FFmpeg (wav, mp3, flac, aac, alac, ogg)
- `batch_export_stems` Rust command for batch export
- Audio normalization via loudnorm filter
- **Frontend integration PENDING**: TypeScript types need alignment
- Commit: `172195c`

## Remaining Phases

### Phase 5: Batch Processing
- Process multiple files in parallel
- Queue management improvements

### Phase 6: Keyboard Shortcuts for Playback
- Spacebar for play/pause
- Arrow keys for seeking

### Phase 7: i18n Infrastructure
- i18next setup complete (already in project)
- Additional language files needed

### Phase 8: Accessibility (a11y)
- ARIA labels on all interactive elements
- Keyboard navigation improvements

### Phase 9: Plugin Architecture
- Plugin system for custom DJ formats
- Plugin API documentation

### Phase 10: Remote GPU
- Connect to remote GPU server for inference
- Authentication and security

## Important Notes for AI Agents

### Current TypeScript Errors
After Phase 4 changes, there are TypeScript errors in `types.ts` due to type structure conflicts:
- `DependencyStatus` was changed from object to union type
- `Stem` interface conflicts with component usage
- `ProcessingSettings` field naming conflicts
- `AudioFileMetadata` structure changes

### CI Status
- Rust tests: 20/20 passing ✅
- Clippy: 0 warnings ✅
- TypeScript: Needs fixes ⚠️
- ESLint: Not yet run

### Known Working Patterns
- Use snake_case for Rust backend types (snake_case)
- Use camelCase for TypeScript frontend types
- `DependencyStatus` should be an object with boolean properties
- `Stem` should have `id` property for component compatibility
