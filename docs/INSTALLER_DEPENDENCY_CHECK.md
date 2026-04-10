# Installer Dependency Check — Design Note

## Context

The Windows NSIS installer (built via Tauri v2's `tauri build --bundles nsis`) does not check for runtime dependencies (Python, FFmpeg) at install time. Users only discover missing prerequisites on first app launch via the `FirstRunWizard`. This document describes the approach to add dependency detection during installation.

## Tauri v2 NSIS Customization Options

### Option A: NSIS Installer Hooks (Tauri-supported)

Tauri v2 supports NSIS hook macros via `bundle.windows.nsis.installerHooks` in `tauri.conf.json`, pointing to a `.nsh` file containing:

- `!macro NSIS_HOOK_PREINSTALL` — runs before file copy
- `!macro NSIS_HOOK_POSTINSTALL` — runs after file copy
- `!macro NSIS_HOOK_PREUNINSTALL` / `!macro NSIS_HOOK_POSTUNINSTALL`

**Limitation**: These hooks execute inline within existing installer steps. Tauri's NSIS bundler does **not** expose a mechanism to insert custom pages (e.g., `!insertmacro MUI_PAGE_CUSTOM`) into the generated page sequence. Attempting to add a custom page via `!define` or `!include` inside a hook is unsupported and may break the build.

**What's possible**: Inside `NSIS_HOOK_PREINSTALL`, we can run silent detection commands (`nsExec::ExecToStack`), log results, and optionally warn with a `MessageBox`. However, we cannot render a rich interactive page with status indicators, checkboxes, or auto-install buttons.

### Option B: PowerShell Post-Install Script (Recommended)

Bundle a PowerShell script with the installer that runs once after installation. This approach:

- Works within Tauri's existing bundle mechanism (add via `bundle.resources` in `tauri.conf.json`)
- Supports full interactive UI via PowerShell `System.Windows.Forms` or Out-Host
- Can write a JSON marker file read by `FirstRunWizard.tsx` at first app launch
- Is independent of Tauri's NSIS script generation, so it won't break on Tauri updates
- Falls back gracefully: if `winget` or `choco` is unavailable, shows manual download links

### Option C: Hybrid Approach

Use `NSIS_HOOK_PREINSTALL` for a lightweight pre-check that only warns (no interactive install), combined with a PowerShell post-install script for the full dependency-install flow. This provides earlier feedback (during install) without fighting Tauri's page constraints.

## Chosen Approach: Option B — PowerShell Post-Install Script

### Rationale

1. **Rich UI requirement**: The task requires a summary page with status indicators and auto-install buttons — only achievable with PowerShell's full GUI support.
2. **No Tauri coupling**: The script doesn't modify the NSIS script, so it survives Tauri version upgrades.
3. **Reuses existing manifest**: `src-tauri/resources/install_manifest.json` already defines all dependency metadata (package IDs, detect commands, install commands per platform).
4. **FirstRunWizard integration**: Writing a JSON marker file lets the wizard skip redundant checks.

### Implementation Plan

#### 1. PowerShell script: `src-tauri/resources/post-install-check.ps1`

```
Function: Detect dependencies by running each detect command from install_manifest.json
Function: Show a summary window with green/red status indicators
Function: Offer "Install Missing" button that runs winget/choco commands
Function: Write marker file: %APPDATA%\stemgen-gui\installer_deps_checked.json
```

#### 2. Bundle configuration in `tauri.conf.json`

```json
{
  "bundle": {
    "resources": {
      "resources/post-install-check.ps1": "post-install-check.ps1",
      "resources/install_manifest.json": "install_manifest.json"
    }
  }
}
```

#### 3. Registration via NSIS Hook or Run key

- **Primary**: Use `NSIS_HOOK_POSTINSTALL` to register a one-time Run key in `HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce` pointing to the bundled PowerShell script.
- **Fallback**: If hooks aren't available, register the Run key from the app's `setup` Tauri command on first launch.

#### 4. Detection logic (from `install_manifest.json`)

For each dependency on `windows`:
- `python`: Run `python --version` or `py --version`
- `ffmpeg`: Run `ffmpeg -version` (check PATH)
- `pytorch`, `demucs`: Defer to first-run (pip packages, too slow for installer)

Only Python and FFmpeg are practical to check/install at setup time. PyTorch and demucs are pip packages that take minutes to install and require network — these remain in the FirstRunWizard's scope.

#### 5. Marker file format

```json
{
  "python": true,
  "ffmpeg": true,
  "pytorch": true,
  "demucs": true,
  "timestamp": "2026-04-10T14:30:00Z",
  "installer_version": "1.4.2"
}
```

If a dependency was not installable, its flag is `false` and the app shows a targeted warning on first launch.

#### 6. FirstRunWizard integration (TASK-018)

- Add a Tauri command `read_installer_dep_marker` that reads the marker file.
- In `FirstRunWizard.tsx`, call this command at startup. If all flags are `true`, skip the dependency-check step entirely and jump to "ready".
- If flags are `false`, show targeted warnings.

### Files to modify/create

| File | Action |
|------|--------|
| `src-tauri/resources/post-install-check.ps1` | Create — PowerShell script |
| `src-tauri/tauri.conf.json` | Edit — add PowerShell script to bundle resources |
| `src-tauri/windows/hooks.nsi` | Create — `NSIS_HOOK_POSTINSTALL` to register RunOnce |
| `src-tauri/src/commands/mod.rs` | Edit — add `read_installer_dep_marker` command |
| `src/components/setup/FirstRunWizard.tsx` | Edit (TASK-018) — read marker and skip if present |
| `.github/workflows/release.yml` | Verify — no changes expected |

### Limitations

1. **RunOnce reliability**: The script runs once on next login. If the user cancels or the script crashes, it won't retry automatically (but the FirstRunWizard covers this).
2. **No elevation**: The PowerShell script runs as the current user (HKCU). Some package managers may need elevation — `winget` handles this with `--silent`.
3. **Windows only**: This approach is Windows-specific. macOS and Linux already have first-run checks that work well.
4. **PyTorch/demucs deferred**: These pip packages are too heavy for the installer. The FirstRunWizard remains the primary mechanism for these.

### Alternatives Considered

- **Post-build NSIS patching**: Modify the generated `.nsi` before compilation. Rejected: fragile, breaks on Tauri updates, hard to maintain.
- **Custom NSIS installer template**: Override Tauri's entire NSIS template. Rejected: massive surface area, loses Tauri improvements on upgrade.
- **MSI custom action**: MSI bundles support custom actions, but Tauri's MSI bundler has even less extensibility than NSIS.

## References

- [Tauri v2 NSIS Bundler Docs](https://tauri.app/distribute/bundles/nsis/)
- [Tauri v2 Bundle Configuration](https://v2.tauri.app/reference/config/#bundleconfig)
- [NSIS Custom Pages](https://nsis.sourceforge.io/Docs/Modern%20UI/Readme.html#custom_pages)
- `src-tauri/resources/install_manifest.json` — existing dependency metadata
- `src/components/setup/FirstRunWizard.tsx` — existing first-run dependency check
