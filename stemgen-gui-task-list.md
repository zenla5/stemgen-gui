# Stemgen-GUI — Per-Model Async Checking, 3-Colour Status, & Quality Improvements

*Generated: April 2026 · Repository: stemgen-gui*

---

## Objective(s)

This document captures the results of a full code-audit of the `stemgen-gui` repository (Tauri v2, Rust backend, React/TypeScript frontend, Python sidecar), focusing on three areas:

1. **Newly discovered bugs** — defects not covered by the existing `stemgen-gui-task-list.md` (BUG-09 through BUG-13), including a missing sidecar timeout, a path-resolution inconsistency between two model-directory helpers, and a structural type mismatch in `ModelCard`.
2. **Project quality & testing gaps** — no test for `ModelCard` status states, no GPU-status-aware model selection coverage, and per-model check logic entirely absent from the test suite.
3. **New feature: per-model async availability checking with three-colour status rows** — the current unified model view fires one batch call (`list_downloaded_models`) and blocks the entire panel behind a global spinner. The requested change replaces this with concurrent per-model checks, each showing an individual loading spinner, and presents each row in one of four states: **checking (spinner)**, **green (available, selectable)**, **orange (model present but GPU required and no GPU detected)**, or **red (not installed — one-click download)**. GPU-required models in orange state are not selectable while local inference is active.

### High-Level Architecture of the New Feature

```
Mount
 └─► setModelStatuses({all models → 'checking'})  ← view renders instantly, all rows show spinner
 └─► for each modelId in parallel:
       invoke('check_model_downloaded', {modelId})
        ├─ true  → gpu_required && !gpuPresent → 'gpu-warning' (orange)
        │          gpu_required &&  gpuPresent  → 'available'  (green)
        │         !gpu_required                → 'available'  (green)
        └─ false / error → 'unavailable'  (red, show Download button)
```

GPU presence is derived from the already-available `computeEnvironmentReadiness(environmentValidation).gpuStatus` selector, avoiding any new backend call.

---

## Project Quality & Testing Assessment

### Architecture
The codebase is well-structured for its scale: a clear separation between the Tauri Rust commands layer, the React/Zustand frontend, and the Python sidecar. CI/CD pipelines exist. Internationalization (en/de) is in place. A test suite covers the store, most lib utilities, and key UI components.

### Test Coverage Gaps
- `ModelCard.tsx` has no dedicated test file at all. Its visual states (spinner, green, orange, red), selection logic, and GPU-warning tooltip are completely untested.
- `UnifiedModelSection.test.tsx` mocks `ModelCard` entirely, so integration of status props is never verified.
- The Rust `check_model_downloaded` function has no unit or integration test for the timeout path.
- GPU-aware selection (orange state → local inference disabled) has no test anywhere in the suite.
- The `computeEnvironmentReadiness` store selector is tested in `environmentReadiness.test.ts` but not exercised from within any component test.

### Newly Discovered Bugs

| ID | Severity | File | Description |
|----|----------|------|-------------|
| BUG-09 | High | `src-tauri/src/commands/models.rs` | `check_model_downloaded` has **no timeout** — can hang indefinitely if the Python sidecar stalls. `list_downloaded_models` has a 10 s timeout; the single-model variant must match it. |
| BUG-10 | Medium | `models.rs` vs `mod.rs` | Two independent path helpers: `get_models_dir()` in `models.rs` uses `ProjectDirs::from("dev","stemgen","stemgen-gui").data_dir()` while `get_model_directory()` in `mod.rs` uses `get_data_dir()` (from `probe.rs`). If these resolve to different directories on any platform, downloaded models will not be found by availability checks. |
| BUG-11 | Low | `src/components/settings/ModelCard.tsx` | `AIModel` is imported from `@/lib/types` but `ModelCardData.id` is typed as `string`, not `AIModel`. The cast `model.id as AIModel` papers over the mismatch without compile-time safety. |
| BUG-12 | Medium | `UnifiedModelSection.tsx` / `appStore.ts` | When `environmentValidation` has not yet been loaded (store initialises to `null`), the `downloadModel` guard silently falls into the error branch and shows a misleading "Sidecar missing" error instead of "environment not yet checked". |
| BUG-13 | High | `UnifiedModelSection.tsx` | The `isChecking` prop passed to every `ModelCard` is a **single shared boolean** — once any check is complete the prop flips globally. The new per-model feature requires an independent per-row checking state. |

---

## Step-by-Step Implementation Task List for AI Agents

In the following section there is a detailed, sequentially ordered task list that an AI coding agent can follow to implement. Each task must include all required fields.

---

### Phase 0 — Backend: Bug Fixes & Foundation

---

- [x] **TASK-001** — Fix path-resolution inconsistency between `get_models_dir()` and `get_model_directory()`

  **Description**: In `src-tauri/src/commands/models.rs` the helper `get_models_dir()` computes the models directory via `directories::ProjectDirs::from("dev", "stemgen", "stemgen-gui").data_dir().join("models")`. In `src-tauri/src/commands/mod.rs` the helper `get_model_directory()` computes it via `get_data_dir().join("models")` where `get_data_dir()` is defined in `probe.rs`. Audit both helpers to confirm whether they produce the same absolute path on macOS, Linux, and Windows. If they differ, consolidate them into a single authoritative helper (preferred location: `probe.rs`, exported as `pub fn get_models_dir() -> PathBuf`). Update every call-site in `models.rs`, `mod.rs`, and any other file that computes a model path independently. Add a unit test asserting the path contains both `"stemgen-gui"` and `"models"` segments.

  **Inputs**: `src-tauri/src/commands/models.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/probe.rs`

  **Outputs / deliverables**: A single `pub fn get_models_dir() -> PathBuf` in `probe.rs`; all callers updated; one `#[test]` confirming the path.

  **Acceptance criteria**:
  - `cargo test` passes with no new failures.
  - `grep -rn "data_dir.*models\|join.*models"` in `src-tauri/src` shows exactly one definition and N call-sites that all call the same function.
  - On macOS, the resolved path includes `Application Support/dev.stemgen.stemgen-gui/models` (or equivalent per platform spec).

  **Dependencies**: None.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None beyond the existing Rust toolchain.

---

- [x] **TASK-002** — Add 10-second timeout to `check_model_downloaded`

  **Description**: `check_model_downloaded` in `src-tauri/src/commands/models.rs` spawns a Python sidecar process with `--check-model <model_id>` but wraps it in no timeout. If the sidecar hangs, the Tauri command hangs indefinitely, blocking the frontend spinner for that model row forever. Wrap the `tokio::process::Command::output()` call in `tokio::time::timeout(Duration::from_secs(10), ...)` mirroring the pattern already used in `list_downloaded_models`. If the timeout elapses, return `Err("check-model timed out after 10 s".to_string())`. Add a unit test (mocking or using a sleep subprocess) that verifies the timeout error string is returned within ≤ 12 s.

  **Inputs**: `src-tauri/src/commands/models.rs`

  **Outputs / deliverables**: Updated `check_model_downloaded` with timeout; new `#[test]` for timeout path (can use `cfg(not(windows))` guard if the subprocess approach differs).

  **Acceptance criteria**:
  - `cargo test` passes.
  - The function signature, return type, and `#[tauri::command]` attribute are unchanged.
  - Manual test: if Python is pointed at a script that sleeps 30 s, the command returns an error in ≈ 10 s.

  **Dependencies**: TASK-001 (so paths are consistent before adjusting the command).

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None.

---

- [x] **TASK-003** — Expose GPU detection status as a lightweight Tauri query command

  **Description**: The frontend needs to know whether a GPU (CUDA or MPS) is available without waiting for the full `validate_environment` call, which can be slow. Add a new Tauri command `get_gpu_status() -> Result<GpuStatus, String>` that runs only the GPU-probing portion of `validate_environment` (i.e., calls `probe_pytorch_device()` and `probe_gpu_name()`). Define the return struct:

  ```rust
  #[derive(Debug, Clone, Serialize)]
  #[serde(rename_all = "camelCase")]
  pub struct GpuStatus {
      pub gpu_present: bool,         // true if CUDA or MPS
      pub gpu_device: Option<String>, // "cuda", "mps", or None
      pub gpu_name:   Option<String>, // nvidia-smi name if available
  }
  ```

  Register the command in `src-tauri/src/lib.rs`. Add unit tests for the struct serialisation. If `environmentValidation` is already populated in the frontend store (from a prior `validate_environment` call) the frontend may read `computeEnvironmentReadiness` from the store instead of calling this command — the command exists as a fallback for when the store has not yet been populated.

  **Inputs**: `src-tauri/src/commands/probe.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

  **Outputs / deliverables**: `GpuStatus` struct; `get_gpu_status` command; registered in `lib.rs`; serialisation unit test.

  **Acceptance criteria**:
  - `cargo test` passes.
  - Command appears in `src-tauri/gen/schemas/` after `cargo tauri build` or schema generation.
  - Returns `{ gpuPresent: false, gpuDevice: null, gpuName: null }` on a machine without a GPU (or with CUDA unavailable).

  **Dependencies**: TASK-001.

  **Estimated complexity**: Low–Medium.

  **Privilege / tooling requirements**: None.

---

### Phase 1 — Frontend: Type & Store Changes

---

- [x] **TASK-004** — Define `ModelCheckStatus` union type and update `ModelCardData`

  **Description**: Add the following to `src/lib/types.ts`:

  ```ts
  /** Per-row availability state for the unified model panel. */
  export type ModelCheckStatus =
    | 'checking'      // sidecar call in-flight — show spinner
    | 'available'     // model installed and selectable
    | 'gpu-warning'   // model installed but gpu_required && no GPU detected
    | 'unavailable';  // model not installed — show Download button
  ```

  Update `ModelCardData` (in `src/components/settings/ModelCard.tsx`) to replace the separate `isDownloaded: boolean` and `isChecking: boolean` props with a single `status: ModelCheckStatus` prop. Also fix BUG-11: change `ModelCardData.id` from `string` to `AIModel` so the cast in `handleSelect` is compile-time safe. Update all callers of `ModelCard` to pass `status` instead of the two boolean props.

  **Inputs**: `src/lib/types.ts`, `src/components/settings/ModelCard.tsx`, `src/components/settings/UnifiedModelSection.tsx`

  **Outputs / deliverables**: `ModelCheckStatus` type in `types.ts`; updated `ModelCardData` and `ModelCardProps` interfaces; no runtime behaviour change yet.

  **Acceptance criteria**:
  - `tsc --noEmit` passes with zero new errors.
  - `vitest run` passes (existing tests may need minor mock updates — see TASK-009).
  - `ModelCardData.id` is typed as `AIModel`.

  **Dependencies**: None (pure type change).

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None.

---

- [x] **TASK-005** — Add `modelCheckStatuses` state to `UnifiedModelSection` (local state, not store)

  **Description**: In `UnifiedModelSection.tsx`, replace the current `checking: boolean` state with a per-model status map:

  ```ts
  const [modelStatuses, setModelStatuses] =
    useState<Record<string, ModelCheckStatus>>({});
  ```

  On mount (and on `loadModels` refresh), after `get_models` returns the model list, initialise all entries to `'checking'` in a single `setModelStatuses` call — this causes the view to render immediately with all rows in the spinner state. Remove the old `loading` boolean gate that prevented the panel from rendering at all while `list_downloaded_models` was in-flight (replace with the per-row spinner pattern). Keep the full-panel spinner only for the brief window before `get_models` itself returns (i.e. before we know the model list).

  **Inputs**: `src/components/settings/UnifiedModelSection.tsx`, `src/lib/types.ts`

  **Outputs / deliverables**: Updated `UnifiedModelSection` state shape; `loading` replaced by per-row `modelStatuses`.

  **Acceptance criteria**:
  - After the change, if `get_models` returns in 50 ms and `check_model_downloaded` takes 3 s per model, the panel becomes visible in ≈ 50 ms with all rows showing spinners.
  - `vitest run` passes (tests updated in TASK-009).

  **Dependencies**: TASK-004.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: None.

---

- [x] **TASK-006** — Implement parallel per-model availability checks in `UnifiedModelSection`

  **Description**: After `get_models` returns and `modelStatuses` is initialised to `{all → 'checking'}`, fire one `invoke('check_model_downloaded', { modelId })` call per model concurrently (do **not** `await` them sequentially). For each, on settlement:

  1. Read GPU presence from the Zustand store: `const { gpuStatus } = computeEnvironmentReadiness(useAppStore.getState().environmentValidation)`. If `environmentValidation` is still `null` (environment check not yet run), fall back to `invoke('get_gpu_status')` (TASK-003) and cache the result in a local ref.
  2. Determine `ModelCheckStatus`:
     - `check_model_downloaded` threw or returned `false` → `'unavailable'`
     - returned `true` AND `model.gpu_required` AND `gpuStatus === 'cpu'` → `'gpu-warning'`
     - returned `true` (all other cases) → `'available'`
  3. Call `setModelStatuses(prev => ({ ...prev, [modelId]: newStatus }))` so each row updates independently as its check completes.

  Also keep the `downloadedModels` array in the `appStore` in sync: call `addDownloadedModel` when status becomes `'available'` or `'gpu-warning'`, and ensure `removeDownloadedModel` is still called from `deleteModel`.

  Remove the call to `list_downloaded_models` entirely (it is superseded by the per-model checks). Remove the `listModelsError` state and its warning banner (the per-row status conveys the same information). Remove the `isChecking` prop from `ModelCard` calls (replaced by `status`).

  **Inputs**: `src/components/settings/UnifiedModelSection.tsx`, `src/stores/appStore.ts`, `src/lib/types.ts`

  **Outputs / deliverables**: Updated `loadModels` / mount logic; `list_downloaded_models` call removed; per-model check loop added.

  **Acceptance criteria**:
  - Opening the model panel shows all rows with spinners immediately.
  - Each row transitions independently to its final colour as its check resolves.
  - No row stays in `'checking'` state after 12 s (timeout from TASK-002 propagates).
  - `vitest run` passes (tests updated in TASK-009).

  **Dependencies**: TASK-002, TASK-003, TASK-004, TASK-005.

  **Estimated complexity**: Medium–High.

  **Privilege / tooling requirements**: None.

---

### Phase 2 — Frontend: `ModelCard` Visual & Interaction Changes

---

- [ ] **TASK-007** — Rework `ModelCard` visual rendering for four states

  **Description**: Update `src/components/settings/ModelCard.tsx` to consume `status: ModelCheckStatus` (from TASK-004) instead of `isDownloaded` / `isChecking`. Implement the four visual states:

  **Checking (spinner)**:
  - Left icon area: animated spinner (CSS `animate-spin`, `rounded-full border-2 border-primary border-t-transparent`).
  - Row border: `border-muted`.
  - No action button rendered.
  - `data-testid={`model-card-checking-${model.id}`}`.

  **Available — green**:
  - Left icon: `Check` icon in a green circle (`bg-green-500/20`, `text-green-500`); if this model is the currently selected default, use primary colour instead.
  - Row border: `border-green-500/30 bg-green-500/5` (or `border-primary bg-primary/5` if selected).
  - Action buttons: "Select" + Trash (existing behaviour).
  - `data-testid={`model-card-available-${model.id}`}`.

  **GPU-Warning — orange**:
  - Left icon: `AlertTriangle` from `lucide-react` in an orange circle (`bg-orange-500/20`, `text-orange-500`).
  - Row border: `border-orange-500/30 bg-orange-500/5`.
  - Below the description, add a small inline notice: *"GPU required — will use CPU (slower) or enable a cloud provider."*
  - Action buttons: "Select" is shown but clicking it when `activeProvider === 'local'` opens a confirmation/tooltip (see TASK-008); Trash is shown.
  - `data-testid={`model-card-gpu-warning-${model.id}`}`.

  **Unavailable — red**:
  - Left icon: `X` or `Download` icon in a red circle (`bg-red-500/20`, `text-red-500`).
  - Row border: `border-red-500/30 bg-red-500/5` (or `border-muted` if neutral styling is preferred — match existing "not downloaded" style adjusted to red tint).
  - Action button: one-click "Download" (existing `onDownload` callback).
  - `data-testid={`model-card-unavailable-${model.id}`}`.

  Remove the `isChecking`-driven skeleton/pulse block entirely (replaced by the spinner state above). The skeleton was a full-row replacement; the spinner is just the icon area while info is rendered normally.

  **Inputs**: `src/components/settings/ModelCard.tsx`, `src/stores/settingsStore.ts` (for `activeProvider`).

  **Outputs / deliverables**: Updated `ModelCard` component; all four `data-testid` variants present.

  **Acceptance criteria**:
  - Storybook (or vitest snapshot) shows the four distinct states.
  - `tsc --noEmit` passes.
  - No `isChecking` / `isDownloaded` prop references remain in `ModelCard`.

  **Dependencies**: TASK-004, TASK-006.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: None.

---

- [ ] **TASK-008** — GPU-warning selection guard: prevent selecting a GPU model for local inference without a GPU

  **Description**: In `ModelCard`, when the user clicks "Select" on an orange (`'gpu-warning'`) row and `activeProvider === 'local'`, do **not** silently call `setDefaultModel`. Instead show an inline warning panel directly below the "Select" button:

  ```
  ⚠ No GPU detected. This model will run on CPU and may be very slow.
     [Select anyway]  [Cancel]
  ```

  Implement this as a local `useState<boolean>` toggle (`showGpuConfirm`). "Select anyway" calls `setDefaultModel` and hides the panel. "Cancel" hides the panel without changing the model. If `activeProvider !== 'local'` (cloud inference is active), allow selection without the confirmation (the GPU is not needed for cloud runs).

  Add `data-testid="gpu-confirm-dialog"`, `data-testid="gpu-confirm-select"`, and `data-testid="gpu-confirm-cancel"` to the confirmation elements.

  **Inputs**: `src/components/settings/ModelCard.tsx`, `src/stores/settingsStore.ts`

  **Outputs / deliverables**: GPU confirmation panel in `ModelCard`; `data-testid` attributes; no store changes.

  **Acceptance criteria**:
  - Clicking Select on an orange row with `activeProvider = 'local'` shows the confirmation panel (verified in TASK-011 unit test).
  - Clicking "Select anyway" calls `setDefaultModel(model.id)`.
  - Clicking "Cancel" does not change the model and hides the panel.
  - Clicking Select on an orange row with `activeProvider = 'fal'` calls `setDefaultModel` directly with no confirmation.

  **Dependencies**: TASK-007.

  **Estimated complexity**: Low–Medium.

  **Privilege / tooling requirements**: None.

---

### Phase 3 — Internationalisation

---

- [ ] **TASK-009** — Add i18n keys for all new model-status strings

  **Description**: Add the following keys to `src/i18n/en.json` under the existing `"models"` section:

  ```json
  "checking": "Checking availability…",
  "available": "Available",
  "gpuWarning": "GPU required — will run on CPU (slower) or use a cloud provider.",
  "unavailable": "Not installed",
  "gpuConfirmTitle": "No GPU detected",
  "gpuConfirmBody": "This model requires a GPU for good performance. Running on CPU may be very slow.",
  "gpuConfirmSelectAnyway": "Select anyway",
  "gpuConfirmCancel": "Cancel",
  "downloadOneClick": "Download & Install"
  ```

  Add the German equivalents to `src/i18n/de.json`. Update `ModelCard` and `UnifiedModelSection` to use `t('models.xxx')` from the i18n hook instead of hardcoded English strings for all new copy. Existing hardcoded strings in `ModelCard` that are not yet translated (e.g. "GPU Required" badge, "Selected" badge, download progress text) should also be migrated in this task.

  **Inputs**: `src/i18n/en.json`, `src/i18n/de.json`, `src/components/settings/ModelCard.tsx`, `src/components/settings/UnifiedModelSection.tsx`

  **Outputs / deliverables**: Updated JSON files; ModelCard and UnifiedModelSection using i18n for all new strings.

  **Acceptance criteria**:
  - `vitest run` (i18n tests in `src/i18n/__tests__/index.test.ts`) passes and covers the new keys.
  - All new keys present in both `en.json` and `de.json`.
  - No hardcoded English model-status strings remain in the two component files.

  **Dependencies**: TASK-007, TASK-008.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None.

---

### Phase 4 — Tests

---

- [ ] **TASK-010** — Create `ModelCard.test.tsx` with full coverage of all four status states

  **Description**: Create `src/components/settings/__tests__/ModelCard.test.tsx`. Mock `@tauri-apps/api/core` (for `invoke`), `@/stores/settingsStore`, and `lucide-react`. Write the following test cases:

  1. **`status = 'checking'`**: renders spinner (`data-testid` contains `animate-spin`), renders model name and description, renders no action button.
  2. **`status = 'available'`, not selected**: renders green Check icon area, renders "Select" and Delete buttons, does not render the GPU confirmation panel.
  3. **`status = 'available'`, selected**: renders primary-coloured icon, renders "Selected" badge, renders only Delete button (no "Select").
  4. **`status = 'gpu-warning'`, `activeProvider = 'local'`**: renders orange AlertTriangle icon, clicking "Select" shows `data-testid="gpu-confirm-dialog"`, clicking "Select anyway" calls `setDefaultModel`, clicking "Cancel" hides the dialog.
  5. **`status = 'gpu-warning'`, `activeProvider = 'fal'`**: clicking "Select" calls `setDefaultModel` directly without showing confirmation.
  6. **`status = 'unavailable'`**: renders red icon, renders "Download & Install" button, clicking it calls `onDownload(model.id)`.
  7. **Download in progress**: `isDownloading = true` renders progress bar and "Cancel" button.
  8. **`downloadError` present**: renders error message and Retry button; clicking Retry calls `onRetry(model.id)`.
  9. **BS-RoFormer selected warning**: when `model.id === 'bs_roformer'`, `status = 'available'`, selected — renders the unsupported-local-inference warning banner.

  **Inputs**: `src/components/settings/ModelCard.tsx`, `src/stores/settingsStore.ts`

  **Outputs / deliverables**: `src/components/settings/__tests__/ModelCard.test.tsx` with ≥ 9 test cases, all passing.

  **Acceptance criteria**:
  - `vitest run --reporter=verbose` shows all 9 tests green.
  - Coverage for `ModelCard.tsx` ≥ 85 % lines.

  **Dependencies**: TASK-007, TASK-008.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: None.

---

- [ ] **TASK-011** — Update `UnifiedModelSection.test.tsx` for per-model async checking

  **Description**: Rewrite the existing `UnifiedModelSection.test.tsx` to reflect the new per-model checking architecture. The `ModelCard` mock should now accept `status: ModelCheckStatus` instead of `isDownloaded`/`isChecking`, and expose `data-testid={`status-${model.id}`}` that renders the status string for easy assertion.

  Required test cases (replace or extend existing 8):

  1. **Instant render**: the panel and all model rows appear immediately (before `check_model_downloaded` resolves) — all rows show `status="checking"`.
  2. **Full panel spinner before `get_models` resolves**: the global `models-loading-spinner` is visible until `get_models` returns.
  3. **Per-model green**: when `check_model_downloaded('demucs')` returns `true` and GPU is unavailable, the Demucs row becomes `status="available"` (CPU model, no GPU needed).
  4. **Per-model green with GPU**: when `check_model_downloaded('bs_roformer')` returns `true` and GPU is available (`gpuStatus = 'cuda'`), the row becomes `status="available"`.
  5. **Per-model orange**: when `check_model_downloaded('bs_roformer')` returns `true` and GPU is unavailable (`gpuStatus = 'cpu'`), the row becomes `status="gpu-warning"`.
  6. **Per-model red**: when `check_model_downloaded('htdemucs')` returns `false`, the row becomes `status="unavailable"`.
  7. **Per-model error → red**: when `check_model_downloaded` rejects (sidecar error), the row becomes `status="unavailable"`.
  8. **Independent transitions**: model A resolves to green while model B is still checking — only model A's status changes.
  9. **Download triggers `download_model` invoke**.
  10. **Error banner when `get_models` fails**.
  11. **Refresh button reruns all per-model checks and resets statuses to `'checking'`**.
  12. **Sidecar missing guard** — download blocked with correct error message.

  **Inputs**: `src/components/settings/__tests__/UnifiedModelSection.test.tsx`, `src/components/settings/UnifiedModelSection.tsx`

  **Outputs / deliverables**: Updated test file, all ≥ 12 tests passing.

  **Acceptance criteria**:
  - `vitest run --reporter=verbose` shows all 12 tests green.
  - No test imports `list_downloaded_models` as an expected invoke call (it has been removed).

  **Dependencies**: TASK-006, TASK-010.

  **Estimated complexity**: Medium–High.

  **Privilege / tooling requirements**: None.

---

- [ ] **TASK-012** — Add Rust unit tests for `check_model_downloaded` timeout and path consistency

  **Description**: In `src-tauri/src/commands/models.rs` tests module, add:

  1. **`test_check_model_downloaded_timeout`**: spawn a child process that sleeps for 30 s (use `std::process::Command::new("sleep").arg("30")` on Unix or the equivalent no-op on Windows), wrap it in the same 10 s timeout pattern used in the production code, assert the `Err` string contains `"timed out"`. Guard with `#[cfg(unix)]`.
  2. **`test_models_dir_matches_model_directory`**: call both `get_models_dir()` (from `models.rs`) and `get_models_dir()` (the consolidated function from TASK-001 in `probe.rs`) and assert they resolve to the same path with `assert_eq!`.

  **Inputs**: `src-tauri/src/commands/models.rs`, `src-tauri/src/commands/probe.rs`

  **Outputs / deliverables**: Two new `#[test]` functions; `cargo test` passes.

  **Acceptance criteria**:
  - Both tests pass in CI.
  - The timeout test completes in ≤ 12 s wall time.

  **Dependencies**: TASK-001, TASK-002.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None.

---

- [ ] **TASK-013** — Add `ModelCheckStatus` type tests to `src/lib/__tests__/constants.test.ts` or a new `types.test.ts`

  **Description**: Create `src/lib/__tests__/types.test.ts` (or extend `constants.test.ts`) with tests confirming:

  1. `ModelCheckStatus` admits exactly the four expected literal values and rejects a fifth (TypeScript compile-time check via `@ts-expect-error`).
  2. `hasPackageStatusKey` correctly handles the bare-string `"available"` form (unit variant) and the object `{ available: null }` form, and returns `false` for an empty object, `null`, and `undefined`.
  3. `computeEnvironmentReadiness(null)` returns `gpuStatus: 'unknown'`.
  4. `computeEnvironmentReadiness({ cuda: 'available', ... })` returns `gpuStatus: 'cuda'`.
  5. `computeEnvironmentReadiness({ cuda: { unavailable: '...' }, python: { available: null }, pythonVersion: '3.11' })` returns `gpuStatus: 'cpu'`.

  **Inputs**: `src/lib/types.ts`, `src/stores/appStore.ts` (for `computeEnvironmentReadiness`)

  **Outputs / deliverables**: `src/lib/__tests__/types.test.ts` with ≥ 5 test cases.

  **Acceptance criteria**:
  - `vitest run` passes; all 5 assertions green.

  **Dependencies**: TASK-004.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None.

---

### Phase 5 — Cleanup & Polish

---

- [ ] **TASK-014** — Remove dead `isChecking` / `isDownloaded` props and `list_downloaded_models` call-site

  **Description**: After all prior tasks are complete, do a final sweep:

  1. Confirm `isChecking: boolean` and `isDownloaded: boolean` no longer appear in `ModelCardProps` (replaced by `status: ModelCheckStatus`).
  2. Confirm `list_downloaded_models` is no longer invoked from `UnifiedModelSection`.
  3. Confirm `listModelsError` state and its warning banner are removed from `UnifiedModelSection`.
  4. Confirm the old skeleton/pulse animation block in `ModelCard` is removed.
  5. Run `grep -rn "isChecking\|isDownloaded\|listModelsError\|list_downloaded_models" src/` and assert zero results in the component files (the Tauri command itself may remain in `models.rs` but should not be called from the frontend).
  6. If `list_downloaded_models` Tauri command is now unused, add a `// TODO: remove if unused after v1.x` comment or remove it entirely (check whether the command is referenced in any other frontend code first).

  **Inputs**: `src/components/settings/UnifiedModelSection.tsx`, `src/components/settings/ModelCard.tsx`

  **Outputs / deliverables**: Clean component files; grep sweep passes.

  **Acceptance criteria**:
  - `grep` sweep returns zero hits in component files.
  - `tsc --noEmit` clean.
  - `vitest run` passes.

  **Dependencies**: TASK-006, TASK-007, TASK-011.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None.

---

- [ ] **TASK-015** — Update `CHANGELOG.md` and bump the version

  **Description**: Add a new `## [Unreleased]` or version section to `CHANGELOG.md` that documents:

  - **New feature**: Per-model async availability checking with individual loading spinners.
  - **New feature**: Three-colour model status (green / orange / red) with GPU-aware selection guard.
  - **New feature**: One-click model download button for unavailable (red) models.
  - **Bug fix (BUG-09)**: Added 10 s timeout to `check_model_downloaded` to prevent indefinite hangs.
  - **Bug fix (BUG-10)**: Consolidated `get_models_dir()` / `get_model_directory()` into a single authoritative helper.
  - **Bug fix (BUG-11)**: Fixed dead `AIModel` type cast in `ModelCard`.
  - **Bug fix (BUG-12)**: Fixed misleading "sidecar missing" error when `environmentValidation` is not yet loaded.
  - **i18n**: Added 9 new model-status keys to `en.json` and `de.json`.

  Bump `version` in `package.json` and `src-tauri/tauri.conf.json` by one patch or minor increment (coordinate with the project's versioning policy).

  **Inputs**: `CHANGELOG.md`, `package.json`, `src-tauri/tauri.conf.json`

  **Outputs / deliverables**: Updated `CHANGELOG.md`; bumped version in both config files.

  **Acceptance criteria**:
  - Version strings in `package.json` and `tauri.conf.json` match.
  - `CHANGELOG.md` has a new dated entry covering all items above.

  **Dependencies**: All prior tasks.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None.

---

## Verification & Release

1. **Full Rust test suite**: run `cargo test --workspace` in `src-tauri/` and confirm all tests pass, including the new timeout and path-consistency tests.
2. **Full frontend test suite**: run `vitest run` from the project root and confirm all tests pass, including the new `ModelCard.test.tsx` and updated `UnifiedModelSection.test.tsx`. Coverage for `ModelCard.tsx` must be ≥ 85 % lines.
3. **End-to-end smoke test (model panel)**: open the GUI with a fresh environment (no models downloaded). Confirm: panel renders instantly with all rows showing spinners; rows resolve one-by-one; red rows show "Download & Install"; green rows show "Select" / Delete; orange rows show the GPU warning badge.
4. **GPU-warning guard test**: on a machine without a GPU (or with CUDA disabled), select an orange model row with local inference active — confirm the confirmation dialog appears; confirm "Cancel" dismisses it without changing the default model; confirm "Select anyway" sets the model.
5. **Download flow test**: click "Download & Install" on a red row; confirm the progress bar appears; confirm the row transitions to green on completion; confirm cancellation via the "Cancel" button works and the row returns to red.
6. **i18n verification**: switch the OS locale to German, reopen the model panel, confirm all model-status strings appear in German.
7. **Regression sweep**: confirm no previously passing tests are broken (`vitest run` and `cargo test` both clean).
8. **Type-check**: `tsc --noEmit` produces zero errors.
9. **Lint**: `eslint --max-warnings 0` produces no new warnings.
10. **Update changelog and confirm version bump** — `package.json` and `tauri.conf.json` both contain the new version string.
11. **Tag the release** with `git tag v<new-version>` and push; publish release notes referencing all new feature items and bug IDs BUG-09 through BUG-13.
12. **Verify GitHub CI/CD pipelines** — confirm both the `ci.yml` and `release.yml` workflows succeed on the tagged commit. If either fails, iterate until both are green before considering the release complete.

---

## Operational Constraints

- **Pause-and-ask policy**: If at any point the AI agent needs elevated privileges, access to external services, new library installations, additional MCP server connections, API keys (e.g., for a remote model-version feed), or anything beyond its current sandbox capabilities, it must **immediately stop execution, clearly describe what it needs and why, and wait for explicit approval** before continuing.
- **Incremental commits**: each task should be committed separately with a descriptive commit message referencing the Task ID (e.g. `fix(models): add 10s timeout to check_model_downloaded [TASK-002]`), so progress is reviewable and reversible.
- **No silent failures**: any error in a per-model check must surface explicitly as a red row in the GUI and be logged — never silently swallowed or left in `'checking'` state indefinitely.
- **Backwards compatibility**: the `check_model_downloaded` Tauri command signature must remain unchanged (same name, same arguments, same return type) so that any external integration or script that calls it continues to work.
- **GPU detection dependency order**: TASK-006 relies on `environmentValidation` being available in the store. If it is not yet populated, TASK-006 must fall back to the lightweight `get_gpu_status` command (TASK-003) — do not assume `environmentValidation` is always present.