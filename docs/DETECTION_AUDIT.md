# Detection Pipeline Audit

## Overview

Two independent detection pipelines exist that never share data:

| Pipeline | Backend command | Frontend state field | Consumer |
|----------|----------------|---------------------|----------|
| Legacy | `check_dependencies` | `appStore.dependencies` (booleans) | `StatusBar.tsx` |
| Current | `validate_environment` | `appStore.environmentValidation` (rich objects) | `SettingsPanel.tsx` |

`computeEnvironmentReadiness()` was written to be the single source of truth from `environmentValidation`, but `StatusBar` ignores it entirely.

## PackageStatus Serialization Bug (CRITICAL)

### Rust side (`src-tauri/src/commands/mod.rs:453-461`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PackageStatus {
    Available,               // unit variant
    Unavailable(String),     // tuple variant
    Warning(String),
    Missing(String),
}
```

With default (external) serde tagging, unit variants serialize as bare strings:

| Variant | Wire value |
|---------|-----------|
| `Available` | `"available"` (JSON string) |
| `Missing("msg")` | `{"missing": "msg"}` (JSON object) |

### TypeScript side (`src/lib/types.ts:265-297`)

```typescript
export interface PackageStatusAvailable { available: null; }

export function hasPackageStatusKey(status: unknown, key: string): boolean {
  return typeof status === 'object' && status !== null && key in status;
}
```

When `status === "available"` (a string), `typeof status === 'object'` is `false`. The guard always returns `false` for `Available`.

### Impact

- Every dependency that passes all checks is shown as red
- `validateEnvironmentResponse` in `appStore.ts` logs console errors for valid data
- `computeEnvironmentReadiness` returns `false` for all `ok()` checks on healthy deps

## isReady Gate (`src-tauri/src/commands/mod.rs:387-391`)

Currently checks 5 components: python, pytorch, demucs, ffmpeg, ffprobe.

**Missing:** `sidecar_script` is not part of the readiness gate, so the "Environment ready" banner can appear even when the sidecar is not deployed.

## Sidecar Deployment (`src-tauri/src/lib.rs:106-132`)

- Copies `stemgen_sidecar.py` from resource bundle to data dir on startup
- Failure is `tracing::warn!` only — no error surfaced to UI
- No event emitted — frontend cannot react
- In dev builds, resource bundle may not exist, so deployment is silently skipped
- No `deploy_sidecar` command exists for manual repair

## StatusBar (`src/components/layout/StatusBar.tsx`)

- Subscribes to `dependencies` (booleans from `check_dependencies`)
- Does NOT use `environmentValidation` or `computeEnvironmentReadiness`
- Can show "Ready" when Detailed Status shows red

## Install All Missing (`src/components/settings/SettingsPanel.tsx:78-110`)

- Iterates python → pytorch → demucs → ffmpeg sequentially
- `installingDep` tracks only current dep — no batch progress
- Silent skip when `installers.length === 0`
- Re-validates after loop, but result hits same serialization bug

## Model Downloads (`src/components/settings/ModelManager.tsx`)

- No sidecar presence check before `invoke('download_model')`
- Backend error message is generic: `"Sidecar script not found at {:?}"`
