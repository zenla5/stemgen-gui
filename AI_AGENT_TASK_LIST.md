# Stemgen-GUI AI Agent Task List

## Status: 70% Complete (7/10 Phases)

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
- `SettingsPanel` System Status section
- Commits: `a72ab99`, `5d57a85`

### Phase 4: Export/Download Stems ✅
- `export_stem` Rust command using FFmpeg (wav, mp3, flac, aac, alac, ogg)
- `batch_export_stems` Rust command for batch export
- Audio normalization via loudnorm filter
- TypeScript types for export
- Commits: `172195c`, `3c8423b`

### Phase 5: Batch Processing ✅
- Parallel job processing (configurable 1-4 max parallel jobs)
- Batch processing status bar showing active/pending counts
- `cancelAllProcessing`, `pauseProcessing`, `resumeProcessing` actions
- `maxParallelJobs` state and `setMaxParallelJobs` action
- Updated ProcessingQueue UI with batch status and Cancel All button
- Commit: `cefdad6`

### Phase 6: Keyboard Shortcuts for Playback ✅
- Create `playerContext` for global player state
- Update `useKeyboardShortcuts` hook with playback controls:
  - Space: Toggle play/pause
  - Arrow Left: Seek backward 5 seconds
  - Arrow Right: Seek forward 5 seconds
  - Home: Seek to beginning
  - End: Seek to end
- Mac compatibility (Cmd+B for sidebar toggle)
- Commit: `5d7ebbf`

### Phase 7: i18n Infrastructure ✅
- German (de) translation file with full UI strings
- Enhanced i18n/index.ts with browser language detection
- `supportedLanguages` array with native names
- `changeLanguage` function
- `SupportedLanguageCode` type for type safety
- Settings integration with i18n
- Commit: `9af7236`

## Remaining Phases

### Phase 8: Accessibility (a11y)
- ARIA labels on all interactive elements
- Keyboard navigation improvements

### Phase 9: Plugin Architecture
- Plugin system for custom DJ formats
- Plugin API documentation

### Phase 10: Remote GPU
- Connect to remote GPU server for inference
- Authentication and security

## Verification Summary (All Passing ✅)

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| ESLint | ✅ 0 warnings |
| Frontend Tests (vitest) | ✅ 65/65 passed |
| Backend Tests (cargo test) | ✅ 20/20 passed |
| Rust Clippy | ✅ 0 warnings |
| Git commits pushed | ✅ |

## Known Working Patterns
- Use snake_case for Rust backend types
- Use camelCase for TypeScript frontend types
- `DependencyStatus` is an object with boolean properties: `{ ffmpeg, sox, python, cuda, mps, models }`
- `Stem` interface has: `id`, `type` (StemType), `name`, `color`, `volume`, `muted`, `solo`, `file_path?`
- Theme type: `'light' | 'dark' | 'system'`
- Processing queue tests use `getAllByText` for status strings that may appear multiple times
- i18n uses `supportedLanguages` array from `@/stores/settingsStore`
- `SupportedLanguageCode` = `'en' | 'de'`
