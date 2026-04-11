# stemgen-gui — Bug-Fix, Quality & Testing Task List

## Objective(s)

This document drives a coordinated improvement pass over **stemgen-gui** (Tauri/React/Rust/Python) that addresses:

1. **Two confirmed user-reported bugs** on Windows 10:
   - First-run wizard dependency rows show no red/green status indicators.
   - Settings → AI Models panel stays on a loading spinner with no models listed.
2. **Additional bugs** discovered during code review.
3. **General code-quality improvements**: eliminate code duplication, tighten error surfaces, refactor stale closures.
4. **Testing improvements**: add missing unit and integration tests, raise coverage thresholds.

All work must be done on a dedicated feature branch, with each task committed individually, CI passing on every commit, and the branch merged only after the full verification checklist at the end is satisfied.

---

## Step-by-Step Implementation Task List for AI Agents

In the following section there is a detailed, sequentially ordered task list that an AI coding agent can follow to implement. Each task must include the specified fields.

---

### 1. [ ] **TASK-001 — Create the feature branch**

**Description**: Check out a new Git branch called `fix/wizard-models-bugs` from the latest `main`. All subsequent tasks are committed to this branch.

**Inputs**: Local clone of the repository, `main` branch.

**Outputs / deliverables**: Branch `fix/wizard-models-bugs` exists locally and is pushed to origin.

**Acceptance criteria**:
- `git branch --show-current` returns `fix/wizard-models-bugs`.
- Branch is visible on GitHub (`origin/fix/wizard-models-bugs`).

**Dependencies**: None.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: None beyond standard Git access.

---

### 2. [ ] **TASK-002 — Extract shared `getDepStatus` utility**

**Description**: Both `src/components/setup/FirstRunWizard.tsx` and `src/components/setup/DependencyCheckPanel.tsx` contain an identical `getDepStatus` function (a discriminated-union parser for `PackageStatus`). Extract it to a new file `src/lib/depStatus.ts` that exports:
- `getDepStatus(pkg: PackageStatus | unknown, successMsg?: string): { status: DepStatus; message?: string }`
- The `DepStatus` string-union type (`'ok' | 'missing' | 'warning' | 'checking' | 'pending'`).

Then replace the two inline definitions with imports from `@/lib/depStatus`.

**Inputs**: `src/components/setup/FirstRunWizard.tsx`, `src/components/setup/DependencyCheckPanel.tsx`, `src/lib/types.ts`.

**Outputs / deliverables**: New file `src/lib/depStatus.ts`; both component files updated to import from it.

**Acceptance criteria**:
- `npx tsc --noEmit` passes with zero errors.
- `npm run lint` passes with zero warnings.
- No copy of `getDepStatus` remains inside either component file.

**Dependencies**: TASK-001.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: None.

---

### 3. [ ] **TASK-003 — Fix: FirstRunWizard "results" step shows all deps as pending (Bug 1)**

**Description**: When the user clicks "Start Check" in `FirstRunWizard.tsx`, dependency checking runs and results are stored in the component's local `dependencies` state. The wizard then transitions to `step === 'results'`, which renders a *fresh* `<DependencyCheckPanel>` with `autoCheckOnMount={false}` and no initial state. Because `DependencyCheckPanel` initialises all its own rows to `'pending'`, all five dependency rows render with the grey pending indicator instead of the red/green/yellow icons the user expects.

Fix by changing the `results` step to pass `autoCheckOnMount={true}` to `DependencyCheckPanel`. Remove the intermediate `step === 'check'` custom rendering block inside `FirstRunWizard` (the panel's own internal checking animation covers this) and let `DependencyCheckPanel` own the full lifecycle from the moment "Start Check" is clicked.

Concretely:
1. Replace the `step === 'check'` JSX block with a single `<DependencyCheckPanel autoCheckOnMount={true} showCheckButton={false} onAllDependenciesOk={onComplete} />`.
2. Remove the wizard's local `dependencies` state, `updateDependency`, and `runDependencyCheck` function entirely — they are no longer needed.
3. Keep the `step === 'welcome'` block (intro text + "Start Check" / "Skip" buttons) as-is, but have the "Start Check" button set `step` to `'check'` immediately.
4. Keep `step === 'results'` for the Continue / Skip buttons; render `<DependencyCheckPanel autoCheckOnMount showCheckButton={false} onAllDependenciesOk={onComplete} />` inside it (the panel will have already completed its check).

> **Alternative if full refactor is too risky**: A minimal fix is to keep the existing flow but pass `autoCheckOnMount={true}` to the `DependencyCheckPanel` rendered in the `results` step. The panel will then re-run the check and render updated indicators.

**Inputs**: `src/components/setup/FirstRunWizard.tsx`, `src/components/setup/DependencyCheckPanel.tsx`, `src/lib/depStatus.ts` (from TASK-002).

**Outputs / deliverables**: Updated `FirstRunWizard.tsx` where the dependency results step always shows correctly-coloured status indicators.

**Acceptance criteria**:
- Render `FirstRunWizard` in a test, mock `invoke('validate_environment')` to return a mix of available/missing statuses, click "Start Check", and assert that dep rows have the correct `data-testid="wizard-dep-status"` text and that status icons for ok/missing/warning deps are present.
- `npx tsc --noEmit` passes.
- `npm run lint` passes.

**Dependencies**: TASK-002.

**Estimated complexity**: Medium.

**Privilege / tooling requirements**: None.

---

### 4. [ ] **TASK-004 — Fix: DependencyCheckPanel installer-prefetch reads stale state**

**Description**: Inside `DependencyCheckPanel.runCheck`, after calling `updateDep(...)` for all packages, the code immediately reads the `deps` state snapshot (captured at the start of `runCheck`) to identify which packages are `'missing'` or `'warning'` and should have their installers pre-fetched:

```ts
const missingDeps = DEPENDENCY_DEFS.filter(d => {
  const dep = deps.find(dd => dd.name === d.name);
  return dep?.status === 'missing' || dep?.status === 'warning';
});
```

Because `deps` is the old snapshot (all items were `'checking'` at that point), this filter always returns zero results and no installers are ever pre-fetched. Fix by computing the `missingDeps` list directly from the `getDepStatus` return values collected during the same iteration, before applying `updateDep`:

```ts
const missingManifestKeys = new Set<string>();
for (const depDef of DEPENDENCY_DEFS) {
  const { status } = getDepStatus(...);
  if (status === 'missing' || status === 'warning') {
    missingManifestKeys.add(depDef.manifestKey);
  }
  updateDep(depDef.name, status, message);
}
// Pre-fetch installers using missingManifestKeys
for (const key of missingManifestKeys) { ... }
```

**Inputs**: `src/components/setup/DependencyCheckPanel.tsx`.

**Outputs / deliverables**: Updated `DependencyCheckPanel.tsx` where installer pre-fetching works correctly after a failed check.

**Acceptance criteria**:
- Unit test: mock `invoke('validate_environment')` to return Python as missing, mock `getAvailableInstallers` to return a dummy installer. After `runCheck`, assert that `getAvailableInstallers` was called with `'python'`.
- `npx tsc --noEmit` passes.

**Dependencies**: TASK-002, TASK-003.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: None.

---

### 5. [ ] **TASK-005 — Fix: Tauri `get_models` command registration mismatch**

**Description**: In `src-tauri/src/commands/models.rs`, the function that returns the list of available AI models is named `get_available_models()` and has **no** `#[tauri::command]` attribute. However, `src-tauri/src/lib.rs` registers `commands::get_models` in `invoke_handler`. Because `pub use models::*` re-exports everything from `models.rs`, there is no `get_models` symbol to export, which would ordinarily cause a compile error and result in the frontend `invoke('get_models')` failing at runtime.

Fix:
1. Add `#[tauri::command]` to `get_available_models()` in `models.rs`.
2. Add a public alias `pub use get_available_models as get_models;` at the bottom of `models.rs` OR rename the function to `get_models`.
3. Verify the handler registration in `lib.rs` still compiles.

> **Stop and ask** before proceeding if the Rust toolchain is not available in the agent's environment — this task requires `cargo build` to verify.

**Inputs**: `src-tauri/src/commands/models.rs`, `src-tauri/src/lib.rs`.

**Outputs / deliverables**: Updated `models.rs` with properly attributed and named command; `cargo build` succeeds.

**Acceptance criteria**:
- `cd src-tauri && cargo build` exits 0 with no errors or warnings about `get_models`.
- `cargo clippy --lib --bins -- -D warnings` passes.
- `cargo test --lib` passes all existing model tests.

**Dependencies**: TASK-001.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: Rust toolchain (`cargo`) must be available. If not, stop and ask.

---

### 6. [ ] **TASK-006 — Fix: UnifiedModelSection — add error state and surface load failures (Bug 2)**

**Description**: `src/components/settings/UnifiedModelSection.tsx` catches errors from `invoke('get_models')` and `invoke('list_downloaded_models')` with a silent `console.error`. On Windows without Python or the sidecar, `list_downloaded_models` returns an error but the UI shows nothing to the user (just an empty model list). Additionally, if `get_models` itself throws, `models` stays empty and there is no feedback.

Fix:
1. Add an `error: string | null` state (initialized to `null`).
2. In the `catch` block of `loadModels`, set `setError(err instanceof Error ? err.message : String(err))`.
3. In the `finally` block, ensure `setLoading(false)` and `setChecking(false)` are always called (they already are — verify this stays true).
4. In the JSX (after `loading` is `false`), render an error banner when `error` is non-null:

```tsx
{error && (
  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2" data-testid="models-load-error">
    <AlertCircle className="h-4 w-4 flex-shrink-0" />
    <span>{error}</span>
    <button onClick={loadModels} className="ml-auto underline text-xs">Retry</button>
  </div>
)}
```

5. If `list_downloaded_models` fails but `get_models` succeeded, show the models without download indicators and display a non-fatal warning banner:

```tsx
{listModelsError && !error && (
  <div data-testid="models-list-warning" className="...">
    Could not check downloaded models — Python or sidecar not available.
  </div>
)}
```

This requires splitting the try block into two independent try/catch blocks so a failure in `list_downloaded_models` does not prevent showing the model list.

**Inputs**: `src/components/settings/UnifiedModelSection.tsx`.

**Outputs / deliverables**: Updated component with visible error and warning banners; loading spinner always clears.

**Acceptance criteria**:
- Unit test: mock `invoke` so `get_models` throws; assert that `data-testid="models-load-error"` is rendered and the loading spinner is gone.
- Unit test: mock `invoke` so `get_models` succeeds but `list_downloaded_models` throws; assert that model cards are rendered AND `data-testid="models-list-warning"` is visible.
- `npm run lint` passes.
- `npx tsc --noEmit` passes.

**Dependencies**: TASK-001, TASK-005.

**Estimated complexity**: Medium.

**Privilege / tooling requirements**: None.

---

### 7. [ ] **TASK-007 — Fix: CUDA manifest key collision in DEPENDENCY_DEFS**

**Description**: In `DependencyCheckPanel.tsx`, `DEPENDENCY_DEFS` has two entries sharing `manifestKey: 'pytorch'` — one for PyTorch and one for CUDA:

```ts
{ name: 'PyTorch', manifestKey: 'pytorch', ... },
{ name: 'CUDA',   manifestKey: 'pytorch', ... },   // ← BUG
```

When both are missing, the installer pre-fetch loop would attempt to fetch the same `pytorch` installer twice, and the "Install" button is incorrectly shown for the CUDA row (CUDA cannot be installed independently; it is bundled with PyTorch's CUDA build).

Fix:
1. Give CUDA a dedicated manifest key `'cuda'` (or keep `'pytorch'` and explicitly suppress the Install button for the CUDA row by checking `dep.manifestKey === 'cuda'`).
2. The simplest correct fix is to set `manifestKey: 'cuda'` and add an empty entry in the install manifest for `cuda` that returns no installers, so the Install button is never shown. Alternatively, add a `canInstall: boolean` flag to `DepRow` and set it to `false` for the CUDA entry.

**Inputs**: `src/components/setup/DependencyCheckPanel.tsx`, `src-tauri/resources/install_manifest.json` (if it needs a `cuda` entry).

**Outputs / deliverables**: Updated `DependencyCheckPanel.tsx` where CUDA never shows a spurious Install button and the installer prefetch does not duplicate PyTorch.

**Acceptance criteria**:
- Unit test: mock both PyTorch and CUDA as missing; assert that no "Install" button appears for the CUDA row.
- `npx tsc --noEmit` passes.

**Dependencies**: TASK-004.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: None.

---

### 8. [ ] **TASK-008 — Fix: `runDependencyCheck` in FirstRunWizard is not properly memoized**

**Description**: `runDependencyCheck` in `FirstRunWizard.tsx` (pre-TASK-003) closes over stale `dependencies` state because it is not wrapped in `useCallback`. After TASK-003 this function may no longer exist; if so, skip this task and mark it complete. If it was kept, wrap it in `useCallback` with correct deps, or convert to a `useRef`-tracked function that reads state via a ref.

**Inputs**: `src/components/setup/FirstRunWizard.tsx`.

**Outputs / deliverables**: Stale-closure risk eliminated.

**Acceptance criteria**:
- No ESLint `react-hooks/exhaustive-deps` warning on the function.
- `npm run lint` passes.

**Dependencies**: TASK-003.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: None.

---

### 9. [ ] **TASK-009 — Add unit tests for `DependencyCheckPanel` (autoCheckOnMount + installer prefetch)**

**Description**: `DependencyCheckPanel` has no dedicated unit tests. Add a test file `src/components/setup/__tests__/DependencyCheckPanel.test.tsx` covering:

1. **Renders all five dependency rows in pending state by default.**
2. **`autoCheckOnMount=true` triggers `validate_environment` on mount** — mock `invoke` and assert it is called.
3. **Rows show correct status icons after a completed check** — mock `validate_environment` to return FFmpeg as missing; assert the FFmpeg row has `status=missing` styling.
4. **Run Check button triggers `validate_environment`** — click "Run Check", assert invoke called.
5. **Install button appears for a missing dep when an installer is available** — mock `getAvailableInstallers` to return a dummy installer and `validate_environment` to mark Python missing; assert `data-testid="install-btn-python"` is in the DOM.
6. **Install button does NOT appear for CUDA** (TASK-007 regression guard).
7. **Summary banner "All dependencies are installed"** appears when all statuses are ok.
8. **Error fallback**: mock `validate_environment` to throw; assert all rows show `'warning'` status.

**Inputs**: `src/components/setup/DependencyCheckPanel.tsx`, `src/lib/depStatus.ts`, `src/stores/appStore.ts` (mock).

**Outputs / deliverables**: New test file with 8+ passing tests.

**Acceptance criteria**:
- `npm run test:unit` passes with all new tests green.
- Coverage for `DependencyCheckPanel.tsx` reaches ≥ 70 %.

**Dependencies**: TASK-003, TASK-004, TASK-007.

**Estimated complexity**: Medium.

**Privilege / tooling requirements**: None.

---

### 10. [ ] **TASK-010 — Add unit tests for `FirstRunWizard` results step**

**Description**: Extend `src/components/setup/__tests__/FirstRunWizard.test.tsx` with a new `describe` block for the results step:

1. **"Start Check" transitions to check step** — click "Start Check", assert check indicators appear.
2. **After mocked validate_environment resolves, results are visible** — mock `invoke('validate_environment')` to return Python as ok and PyTorch as missing; wait for results; assert at least one green and one red indicator is rendered.
3. **"Continue" button calls `onComplete`** in the results step.
4. **"Skip Setup" button calls `onSkip`** in the results step.
5. **Installer dep marker pre-populate**: mock `invoke('read_installer_dep_marker')` to return `{ python: true, ffmpeg: false }`; assert that the Python row shows a positive indicator and FFmpeg shows a warning before the user clicks "Start Check".

**Inputs**: `src/components/setup/__tests__/FirstRunWizard.test.tsx`, `src/components/setup/FirstRunWizard.tsx`.

**Outputs / deliverables**: 5+ new test cases in the existing test file, all passing.

**Acceptance criteria**:
- `npm run test:unit` passes.
- New tests cover the transition from welcome → check → results.

**Dependencies**: TASK-003, TASK-009.

**Estimated complexity**: Medium.

**Privilege / tooling requirements**: None.

---

### 11. [ ] **TASK-011 — Add unit tests for `UnifiedModelSection` error and loading states**

**Description**: Add a test file `src/components/settings/__tests__/UnifiedModelSection.test.tsx` covering:

1. **Loading spinner renders on mount.**
2. **Loading spinner disappears after models load.**
3. **Model cards render when `get_models` succeeds.**
4. **Error banner renders when `get_models` throws** (assert `data-testid="models-load-error"` visible, loading spinner gone).
5. **Warning banner renders when `list_downloaded_models` throws but `get_models` succeeds** (assert `data-testid="models-list-warning"` visible and model cards present).
6. **Retry button calls `loadModels` again** — click the retry button in the error banner, assert `invoke` is called a second time.
7. **Download button triggers `download_model` invoke** for a model that is not downloaded.
8. **Sidecar missing guard** — mock `environmentValidation.sidecarScript` as missing; click download; assert the per-model sidecar error message is shown.

**Inputs**: `src/components/settings/UnifiedModelSection.tsx`, `src/stores/appStore.ts` (mock).

**Outputs / deliverables**: New test file with 8+ passing tests.

**Acceptance criteria**:
- `npm run test:unit` passes.
- Coverage for `UnifiedModelSection.tsx` reaches ≥ 65 %.

**Dependencies**: TASK-006.

**Estimated complexity**: Medium.

**Privilege / tooling requirements**: None.

---

### 12. [ ] **TASK-012 — Add unit tests for `depStatus` shared utility**

**Description**: Add `src/lib/__tests__/depStatus.test.ts` covering all branches of `getDepStatus`:

1. Returns `{ status: 'ok' }` for string `'available'`.
2. Returns `{ status: 'missing' }` for an unrecognised string.
3. Returns `{ status: 'ok' }` for `{ available: true }` object variant.
4. Returns `{ status: 'missing' }` for `{ missing: 'reason' }`.
5. Returns `{ status: 'warning' }` for `{ warning: 'reason' }`.
6. Returns `{ status: 'warning' }` for `{ unavailable: 'reason' }`.
7. Returns `{ status: 'missing' }` for `null` / `undefined`.
8. `successMsg` is used as the message for the `ok` case.

**Inputs**: `src/lib/depStatus.ts`.

**Outputs / deliverables**: New test file, all 8 tests green.

**Acceptance criteria**:
- `npm run test:unit` passes.
- `depStatus.ts` reaches 100 % branch coverage.

**Dependencies**: TASK-002.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: None.

---

### 13. [ ] **TASK-013 — Fix: UnifiedModelSection useEffect dependency stability audit**

**Description**: Audit whether `addDownloadedModel` and `loadModels` (used in the `useEffect` dep array of `UnifiedModelSection`) are stable across renders. Zustand action references are stable, but `loadModels` is a `useCallback` depending on `[setDownloadedModels]`. If `setDownloadedModels` changes identity across renders (e.g., due to a selector issue), `loadModels` will be recreated on every render, causing the effect to re-fire and `setLoading(true)` to be called continuously — matching the reported spinning-forever symptom.

Steps:
1. Verify `setDownloadedModels` is read from the store as an action (stable) rather than derived state (potentially unstable).
2. If unstable, use `useAppStore.getState().setDownloadedModels` inside `loadModels` instead of the hook.
3. Alternatively, remove `setDownloadedModels` from the `useCallback` dependency array if it is provably stable (and add an ESLint suppression comment with explanation).
4. Add a unit test that mounts the component and asserts `invoke('get_models')` is called exactly once after mount (not more), even after a store update.

**Inputs**: `src/components/settings/UnifiedModelSection.tsx`, `src/stores/appStore.ts`.

**Outputs / deliverables**: Updated component; no re-render loop possible.

**Acceptance criteria**:
- Unit test asserts `invoke` called exactly once on mount.
- `npm run lint` passes.
- `npx tsc --noEmit` passes.

**Dependencies**: TASK-006, TASK-011.

**Estimated complexity**: Medium.

**Privilege / tooling requirements**: None.

---

### 14. [ ] **TASK-014 — Add Rust unit tests for `validate_environment` edge cases**

**Description**: `src-tauri/src/commands/mod.rs` has the `validate_environment` command, and `src-tauri/src/commands/probe.rs` has the detection helpers. Add Rust unit tests for:

1. `is_windows_store_stub` returns `true` for a path containing `windowsapps`.
2. `is_windows_store_stub` returns `false` for a normal Python path.
3. `find_python` on a system with no Python in PATH returns `None` (use `which` mock or a custom `find_python` variant that accepts a search path list).
4. `PackageStatus::Available` serialises as bare string `"available"` (already tested; verify still passes).
5. `PackageStatus::Missing(...)` serialises as `{"missing":"..."}` (already tested; verify still passes).
6. `EnvironmentValidation::default()` has `is_ready = false`.

**Inputs**: `src-tauri/src/commands/probe.rs`, `src-tauri/src/commands/mod.rs`.

**Outputs / deliverables**: New or extended `#[cfg(test)]` modules passing with `cargo test --lib`.

**Acceptance criteria**:
- `cargo test --lib 2>&1` exits 0.
- All new tests listed above appear in the output as `ok`.

**Dependencies**: TASK-005.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: Rust toolchain required. Stop and ask if unavailable.

---

### 15. [ ] **TASK-015 — Raise frontend coverage thresholds**

**Description**: After TASK-009 through TASK-013 add new tests, update `vitest.config.ts` coverage thresholds to reflect the improved coverage:

```ts
thresholds: {
  lines: 55,
  functions: 72,
  branches: 75,
  statements: 55,
},
```

Run coverage locally first to confirm the new thresholds are met before committing. If coverage does not yet reach these values, add a few targeted tests to close the gap before raising the threshold.

**Inputs**: `vitest.config.ts`, coverage report from `npm run test:coverage`.

**Outputs / deliverables**: Updated `vitest.config.ts`; `npm run test:unit -- --coverage` exits 0.

**Acceptance criteria**:
- `npm run test:unit -- --coverage` exits 0.
- Coverage report shows all four metrics above their new thresholds.

**Dependencies**: TASK-009, TASK-010, TASK-011, TASK-012, TASK-013.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: None.

---

### 16. [ ] **TASK-016 — Add missing i18n keys for new error strings**

**Description**: TASK-006 and TASK-009 introduce new user-visible error messages hard-coded in English. Add the corresponding keys to `src/i18n/en.json` and `src/i18n/de.json`:

```json
// en.json additions
"models.loadError": "Failed to load models. Check your connection and try again.",
"models.listWarning": "Could not check downloaded models — Python or sidecar not available.",
"deps.couldNotCheck": "Could not check dependency",
"deps.allInstalled": "All dependencies are installed."
```

Update all hard-coded English strings in the components to use `t('...')` from `react-i18next`.

**Inputs**: `src/i18n/en.json`, `src/i18n/de.json`, updated component files.

**Outputs / deliverables**: i18n JSON files updated; component files use translation keys.

**Acceptance criteria**:
- `npx tsc --noEmit` passes.
- `npm run lint` passes.
- `src/i18n/__tests__/index.test.ts` passes (existing i18n tests).

**Dependencies**: TASK-006, TASK-009.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: None. If German translations are uncertain, add a TODO comment and use the English string as a placeholder.

---

### 17. [ ] **TASK-017 — Add binary E2E test case: first-run wizard shows coloured dep indicators**

**Description**: Add a test case to `src/__tests__/e2e/binary/first-run-wizard.spec.ts` (Windows) and `src/__tests__/e2e/binary/linux/first-run-wizard.spec.ts` (Linux) that:

1. Launches the app for the first time (clear app data dir before launch).
2. Confirms the first-run wizard is shown.
3. Clicks "Start Check".
4. Waits for all `data-testid="wizard-dep-status"` elements to contain non-empty text (i.e., not blank pending state).
5. Asserts that at least one dep-status element has a non-grey colour (green/red/yellow) — verify by checking that the rendered `<span>` has one of the Tailwind colour classes `text-green-600`, `text-red-600`, or `text-yellow-600`.

**Inputs**: Existing binary E2E test infrastructure (`src/__tests__/e2e/binary/`).

**Outputs / deliverables**: New test case in both Windows and Linux spec files.

**Acceptance criteria**:
- Test passes in CI on `ubuntu-latest` (where Python/FFmpeg may or may not be present — the test only checks that statuses are non-blank, not which colour).
- `npm run test:e2e:binary` (Linux) or the Windows equivalent exits 0.

**Dependencies**: TASK-003, TASK-009.

**Estimated complexity**: Medium.

**Privilege / tooling requirements**: Playwright and the compiled binary must be available in the test environment. The CI `e2e-binary` job already provides this.

---

### 18. [ ] **TASK-018 — Add binary E2E test case: AI Models section loads without indefinite spinner**

**Description**: Add a test case to the settings E2E spec files that:

1. Launches the app (first-run wizard already skipped in fixture).
2. Navigates to Settings.
3. Locates the "AI Models" section.
4. Waits up to 10 seconds for the loading spinner inside the section to disappear.
5. Asserts that either: (a) model cards are visible, OR (b) an error/warning banner is visible. In both cases the spinner must be gone.

**Inputs**: `src/__tests__/e2e/binary/settings.spec.ts`, `src/__tests__/e2e/binary/linux/settings.spec.ts`.

**Outputs / deliverables**: New test case in both spec files.

**Acceptance criteria**:
- Test passes in CI. The loading spinner must not remain after 10 seconds.

**Dependencies**: TASK-006, TASK-013.

**Estimated complexity**: Medium.

**Privilege / tooling requirements**: Same as TASK-017.

---

### 19. [ ] **TASK-019 — Python sidecar: add `--list-models` and `--check-model` error output tests**

**Description**: The Python test suite covers `--separate` and cloud runners but does not test `--list-models` or `--check-model`. Add tests in `python/tests/test_sidecar_cli.py`:

1. `--list-models` returns valid JSON with at least `id` and `available` keys per item.
2. `--list-models` returns an empty list (not an error) when no models are downloaded.
3. `--check-model htdemucs` returns JSON `{ "available": false }` when the model is not downloaded.
4. `--check-model` with an unknown model ID returns JSON `{ "available": false }` without raising an exception.
5. `--download-model` with `--dry-run` (if supported) or an invalid model ID exits non-zero and prints a useful message to stderr.

**Inputs**: `python/tests/test_sidecar_cli.py`, `python/stemgen_sidecar.py`.

**Outputs / deliverables**: 5+ new Python test functions, all passing.

**Acceptance criteria**:
- `cd python && pytest tests/ -m "not integration" --tb=short -v` exits 0.
- All new tests appear as `PASSED`.

**Dependencies**: TASK-001.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: Python 3.9+ must be available in the environment. The CI `python` job provides this.

---

### 20. [ ] **TASK-020 — Audit and fix `read_installer_dep_marker` on non-Windows paths**

**Description**: `read_installer_dep_marker` uses `get_data_dir()` (the `ProjectDirs` data directory). On Windows this is `%APPDATA%\stemgen-gui\data\`; on macOS it is `~/Library/Application Support/stemgen-gui/`; on Linux it is `~/.local/share/stemgen-gui/`. The NSIS post-install script only writes the marker on Windows, so the marker is never present on other platforms.

Steps:
1. Confirm in `FirstRunWizard.tsx` that a missing marker (`null` return) is handled gracefully — the wizard simply falls through to its default flow. (This is already the case; document it.)
2. Add a comment in `commands/mod.rs` near `read_installer_dep_marker` noting that the marker is Windows-only.
3. Add a Rust unit test asserting that `read_installer_dep_marker()` returns `Ok(None)` when the marker file does not exist.

**Inputs**: `src-tauri/src/commands/mod.rs`, `src/components/setup/FirstRunWizard.tsx`.

**Outputs / deliverables**: Code comment added; Rust unit test added; `cargo test --lib` passes.

**Acceptance criteria**:
- `cargo test --lib` exits 0.
- The wizard's `useEffect` for the marker is confirmed safe when `marker === null`.

**Dependencies**: TASK-005.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: Rust toolchain required.

---

### 21. [ ] **TASK-021 — Update CHANGELOG.md and bump patch version**

**Description**: Update `CHANGELOG.md` with an `## [Unreleased]` section documenting all changes from this pass. Then bump the version in:
- `package.json` (`"version"`)
- `src-tauri/Cargo.toml` (`version = "..."`)
- `src-tauri/tauri.conf.json` (`"version"`)

Use semantic versioning: since these are bug fixes, increment the patch version (e.g., `1.4.3` → `1.4.4`).

**Inputs**: `CHANGELOG.md`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.

**Outputs / deliverables**: All version files bumped consistently; CHANGELOG updated.

**Acceptance criteria**:
- All four files show the same new version string.
- `CHANGELOG.md` lists all bug fixes and improvements from TASK-002 through TASK-020.

**Dependencies**: All prior tasks.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: None.

---

### 22. [x] **TASK-022 — Open PR and verify CI pipeline**

**Description**: Push the `fix/wizard-models-bugs` branch to `origin` and open a pull request targeting `main`. Monitor the CI pipeline (`frontend`, `integration`, `backend`, `e2e`, `e2e-binary`, `python`, `security`, `check`). All jobs must pass. If any job fails, iterate on the branch until it passes before proceeding to merge.

**Inputs**: All committed task outputs, GitHub CI configuration (`.github/workflows/ci.yml`).

**Outputs / deliverables**: Green CI pipeline on the PR; PR approved.

**Acceptance criteria**:
- GitHub CI "All Checks Passed" job reports `success`.
- No warnings or test flakes in any job.

**Dependencies**: TASK-021.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: GitHub write access to push the branch and open a PR.

---

### 23. [ ] **TASK-023 — Merge the PR and tag the release**

**Description**: Once CI is green and the PR is approved, merge `fix/wizard-models-bugs` into `main` using a merge commit (not squash, to preserve individual task commit history). Then:
1. Create an annotated Git tag `v1.4.4` (or whatever the bumped version is) on `main`.
2. Push the tag to `origin`.
3. Verify the `release.yml` CD workflow triggers and produces artefacts.
4. Draft release notes on GitHub summarising every bug fix and improvement.

**Inputs**: Merged `main` branch, `CHANGELOG.md`.

**Outputs / deliverables**: Tag `v1.4.4` on `main`; GitHub Release draft or published.

**Acceptance criteria**:
- `git tag v1.4.4` exists on `main`.
- Release CD workflow completes successfully.
- GitHub Release notes are accurate and complete.

**Dependencies**: TASK-022.

**Estimated complexity**: Low.

**Privilege / tooling requirements**: GitHub write access; release workflow secrets must be configured.

---

## Verification & Release

The following checklist must be completed before the PR is merged (TASK-022).

1. **Dependency wizard smoke test (Windows 10)**: install a fresh build, launch the app, and confirm that after clicking "Start Check" in the first-run wizard all dependency rows show green, red, or yellow indicators — never a plain grey pending dot.

2. **Dependency wizard smoke test (Linux/macOS)**: same flow on at least one non-Windows platform.

3. **AI Models panel smoke test**: navigate to Settings → AI Models. The loading spinner must disappear within 5 seconds. If Python/sidecar are not installed, an appropriate warning or error banner must be shown instead of an indefinite spinner.

4. **Install flow regression**: click "Install" for a missing dependency in `DependencyCheckPanel` (if an installer is available); confirm the install progress renders correctly and the dep status updates after completion.

5. **CUDA row guard**: confirm no "Install" button appears next to the CUDA row, regardless of CUDA status.

6. **Unit test suite**: `npm run test:unit -- --coverage` exits 0 and all four coverage thresholds are met.

7. **Integration test suite**: `npm run test:integration` exits 0.

8. **E2E test suite**: `npx playwright test --project=chromium` exits 0.

9. **Python test suite**: `cd python && pytest tests/ -m "not integration" --tb=short -v` exits 0.

10. **Rust test suite**: `cd src-tauri && cargo test --lib && cargo test --tests` both exit 0.

11. **Rust lint**: `cd src-tauri && cargo clippy --lib --bins -- -D warnings` exits 0 with zero warnings.

12. **TypeScript type check**: `npx tsc --noEmit` exits 0.

13. **Lint**: `npm run lint` exits 0 with zero warnings.

14. **Version consistency**: `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` all show the same version string.

15. **CHANGELOG**: `CHANGELOG.md` contains an entry for every task completed in this pass.

16. **CI green**: all GitHub Actions jobs in the PR are `success` (including `e2e-binary` on both `ubuntu-latest` and `windows-latest`).

17. **Tag and release**: tag `v<new-version>` created, CD workflow successful, release notes published on GitHub.

---

## Operational Constraints

- **Pause-and-ask policy**: If at any point the AI agent needs elevated privileges, access to external services, new library installations, additional MCP server connections, API keys (e.g., for a remote model-version feed), or anything beyond its current sandbox capabilities, it must **immediately stop execution, clearly describe what it needs and why, and wait for explicit approval** before continuing.
- **Incremental commits**: each task should be committed separately with a descriptive commit message referencing the Task ID, so progress is reviewable and reversible. Example: `fix(TASK-003): FirstRunWizard — DependencyCheckPanel shows correct colours in results step`.
- **No silent failures**: any error must surface explicitly in the GUI and logs — never silently swallowed or defaulted to empty. This applies to all new code introduced in this pass.
- **Branch protection**: do not push directly to `main`; all changes go through the feature branch and PR workflow.
- **Rust toolchain**: tasks that modify `src-tauri/**` require `cargo` to be available. If the agent cannot run `cargo build` or `cargo test`, it must stop and ask before committing Rust changes.
- **Windows-specific behaviour**: Bug 1 and Bug 2 were reported on Windows 10. Any Windows-specific code paths (NSIS marker, `CREATE_NO_WINDOW`, Windows Store Python stub detection) must be tested in the CI `windows-latest` runner, not just Linux.
