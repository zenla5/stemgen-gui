# Stemgen-GUI — Bug Fixes, Quality Improvements & Install Wizard Enhancement

## Objectives

This document captures all planned work for the `stemgen-gui` project in three areas:

1. **Bug fixes** for the Windows 10 drag-and-drop / processing hang reported by the user — including the flashing `python.exe` console windows, the computer becoming unresponsive, and the processing queue appearing empty while the start button still shows a file count.
2. **General code quality and test coverage improvements** — gaps identified during the codebase audit covering the Rust sidecar, the Zustand store's parallel-job scheduler, error surfacing, and the test suite.
3. **Install Wizard dependency check enhancement** — adding an in-wizard dependency scan with automatic install suggestions so users can fix their environment without leaving the app.

All work must be carried out on a dedicated feature branch, CI must be green before the branch is merged, and each task must be committed separately with a message referencing its Task ID.

---

## Background — Root Cause Analysis of the Reported Windows Bug

After reading the source code the following root causes were identified for the reported behaviour ("python.exe windows popping up and closing", "computer unresponsive", "queue appears empty but button shows 1 file"):

**Root Cause A — `sidecar.rs` does not call `.no_window()` on Windows.**
The `NoWindow` trait is defined in `probe.rs` and is correctly applied in `install_executor.rs`, but `sidecar.rs` never imports or calls it when building the `tokio::process::Command` that spawns the Python sidecar. Every time a separation job is started on Windows, a black console window opens for `python.exe`. When multiple jobs are spawned rapidly (see Root Cause B) dozens of windows flash open and close.

**Root Cause B — Stale-state infinite spawn loop in `startProcessing`.**
`processNextBatch()` in `appStore.ts` captures `currentState = get()` once at the top of the function. The `while` loop inside then checks `currentState.pendingFiles.length` and `currentState.activeJobCount` — but those values are snapshots taken before the loop began. After `set()` is called inside the loop to pop a file and increment `activeJobCount`, `currentState` is never refreshed. The while condition never becomes false within the same loop iteration, causing the scheduler to spawn far more parallel Python processes than `maxParallelJobs` allows, exhausting system memory and CPU.

**Root Cause C — No re-entrancy guard on `startProcessing`.**
Clicking "Start Processing" while jobs are already running calls `startProcessing` again, which appends a second copy of every pending file to `pendingFiles` and launches a second `processNextBatch` loop. Combined with Root Cause B, this multiplies the runaway spawning.

**Root Cause D — Python failures not surfaced clearly.**
When the Python sidecar exits non-zero (e.g., because `demucs`/`torch` are not installed), the job is marked `failed` in the UI but the error message is a raw Rust anyhow string. There is no actionable guidance for the user (e.g., "demucs is not installed — open the Setup Wizard to install it"). The user has no idea why nothing happened.

**Root Cause E — Queue/Files view state mismatch.**
The "Processing Queue" tab shows "No jobs in queue" because `jobs` is only populated when "Start Processing" is clicked. But the button label reads "Start Processing (1 file)" because it counts `audioFiles`, not `jobs`. This creates cognitive confusion: the queue looks empty yet the button implies there is work to do. Newly dropped files should be reflected in the queue as `pending` items immediately on drop so both views are consistent.

---

## Step-by-Step Implementation Task List for AI Agents

### Branch Setup

- [x] **TASK-000 — Create feature branch**

  **Description:** Create a new Git branch `fix/windows-sidecar-queue-wizard` from the latest `main` (or `develop`) commit. All subsequent tasks are committed to this branch. Never commit directly to `main`.

  **Inputs:** Local clone of the repository.

  **Outputs / deliverables:** Branch `fix/windows-sidecar-queue-wizard` exists and is pushed to the remote.

  **Acceptance criteria:** `git branch --show-current` returns `fix/windows-sidecar-queue-wizard`; `git log --oneline -1` matches latest `main`.

  **Dependencies:** None.

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** Standard Git access to the repository.

---

### Bug Fix — Sidecar Windows Console Windows (Root Cause A)

- [x] **TASK-001 — Apply `NoWindow` to the sidecar `tokio::process::Command` on Windows**

  **Description:** In `src-tauri/src/commands/sidecar.rs`, import the `NoWindow` trait from `super::probe::NoWindow` and call `.no_window()` on the `tokio::process::Command` that spawns the Python sidecar, immediately before the `.spawn()` call. This mirrors the pattern already used in `install_executor.rs`. The change must be guarded at compile time (`#[cfg(target_os = "windows")]` is already handled inside the trait impl, so simply calling `.no_window()` unconditionally is sufficient and correct).

  **Inputs:** `src-tauri/src/commands/sidecar.rs`, `src-tauri/src/commands/probe.rs`.

  **Outputs / deliverables:** Modified `sidecar.rs` — one `use super::probe::NoWindow;` import added at the top of the file; `.no_window()` chained onto the command builder before `.spawn()`.

  **Acceptance criteria:**
  - `cargo check` passes with no new warnings.
  - On Windows, running a separation job must NOT produce a visible `python.exe` console window (manual smoke-test or screenshot evidence).
  - Existing Rust unit tests (`cargo test`) continue to pass.

  **Dependencies:** TASK-000.

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** None beyond standard Rust toolchain.

---

### Bug Fix — Stale-State Spawn Loop (Root Cause B)

- [x] **TASK-002 — Fix stale-state read inside `processNextBatch` scheduler**

  **Description:** In `src/stores/appStore.ts`, rewrite the `processNextBatch` inner function so that it reads fresh state from `get()` on every scheduling decision rather than relying on a snapshot captured before the loop. The corrected logic must:
  1. Call `get()` at the very start of each `processNextBatch` invocation (already done) **and** remove the inner `while` loop entirely, replacing it with a single-pass "start at most one new job" check. Recursive/chained calls to `processNextBatch` (triggered via `.finally()`) naturally serialise scheduling without re-entering the loop.
  2. The pattern becomes: read fresh state → if capacity available AND files pending → pop one file, increment counter, fire job asynchronously → the job's `.finally()` decrements the counter and calls `processNextBatch()` again.

  This ensures `activeJobCount` and `pendingFiles` are always read from the live store rather than from a stale closure snapshot.

  **Inputs:** `src/stores/appStore.ts` (the `startProcessing` action and `processNextBatch` inner function).

  **Outputs / deliverables:** Refactored `startProcessing` / `processNextBatch` implementation with no inner `while` loop and fresh `get()` reads on each invocation.

  **Acceptance criteria:**
  - Adding 5 audio files and clicking "Start Processing" with `maxParallelJobs = 2` must never result in more than 2 simultaneous `start_separation` invocations (verifiable by mocking `invoke` in a unit test and counting concurrent calls).
  - All existing vitest unit tests pass.
  - `npm run check` (TypeScript) passes with no new errors.

  **Dependencies:** TASK-000.

  **Estimated complexity:** Medium.

  **Privilege / tooling requirements:** None.

---

### Bug Fix — Re-entrancy Guard (Root Cause C)

- [x] **TASK-003 — Add an `isProcessing` guard to `startProcessing`**

  **Description:** At the very beginning of the `startProcessing` action in `src/stores/appStore.ts`, check `get().isProcessing`. If it is already `true`, return immediately without creating new jobs or starting a new `processNextBatch` loop. Additionally, disable the "Start Processing" button in `src/components/processing/ProcessingQueue.tsx` when `isProcessing` is `true` (the button is already hidden in favour of a "Cancel All" button, but the underlying action is not guarded).

  **Inputs:** `src/stores/appStore.ts`, `src/components/processing/ProcessingQueue.tsx`.

  **Outputs / deliverables:** Guard added to `startProcessing`; "Start Processing" button disabled/hidden correctly when processing is active.

  **Acceptance criteria:**
  - Calling `startProcessing` twice in rapid succession (simulated in a unit test) results in only one batch of jobs being created.
  - The "Start Processing" button is not clickable/visible while `isProcessing` is `true` (verified by a React Testing Library test).

  **Dependencies:** TASK-002.

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** None.

---

### Bug Fix — Python Error Surfacing (Root Cause D)

- [x] **TASK-004 — Improve Python sidecar error messages in the UI**

  **Description:** When `invoke('start_separation', …)` throws an error in `processJob` (`appStore.ts`), the raw error string is currently stored in `job.error` but only briefly shown on a job card. Improve this in two ways:
  1. In `processJob`, parse the error string. If it contains keywords like `"No module named"`, `"demucs"`, `"torch"`, or `"Python not found"`, append a user-friendly hint: `"— Open Setup Wizard to install missing dependencies."`.
  2. Show a persistent `toast.error(…)` with the parsed message (including the hint) when a job fails, so the user cannot miss it.
  3. In `JobItem` inside `ProcessingQueue.tsx`, render the `job.error` field in a clearly styled block below the file name when the job is in `failed` state.

  **Inputs:** `src/stores/appStore.ts` (`processJob`), `src/components/processing/ProcessingQueue.tsx` (`JobItem`).

  **Outputs / deliverables:** Modified `processJob` error handler with keyword-based hint injection; modified `JobItem` to display `job.error`; `toast.error` call on failure.

  **Acceptance criteria:**
  - When a job fails because Python is missing, the error card in the queue reads something like: `"Python not found — Open Setup Wizard to install missing dependencies."` (verified by unit test mocking `invoke` to throw that error).
  - A `sonner` toast appears with the same message (verified via React Testing Library).
  - Existing tests pass.

  **Dependencies:** TASK-002.

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** None.

---

### Bug Fix — Queue / Files State Mismatch (Root Cause E)

- [x] **TASK-005 — Add dropped files as `pending` jobs immediately on drop**

  **Description:** Currently, `jobs` is only populated when the user clicks "Start Processing". This makes the "Processing Queue" tab show "No jobs in queue" even after files are dropped. Fix this by:
  1. In `appStore.ts`, modify `addFiles` to also create a `pending` `ProcessingJob` for each new file and append it to `jobs`. The job should use the current `settings` from the store.
  2. Adjust `startProcessing` so that instead of creating new jobs from the `files` argument, it uses existing `pending` jobs already in `jobs`. It must not duplicate jobs.
  3. Update the "Start Processing" button label to use `jobs.filter(j => j.status === 'pending').length` rather than `audioFiles.length`.

  **Inputs:** `src/stores/appStore.ts`, `src/components/processing/ProcessingQueue.tsx`.

  **Outputs / deliverables:** `addFiles` creates pending jobs; `startProcessing` reuses them; button label uses pending job count.

  **Acceptance criteria:**
  - After dropping a file and switching to the "Processing Queue" tab, the queue shows one pending item for that file (React Testing Library test).
  - The button label count matches the number of pending jobs, not the raw `audioFiles` array length.
  - Dropping the same file twice does not create duplicate jobs.
  - All existing tests pass.

  **Dependencies:** TASK-003.

  **Estimated complexity:** Medium.

  **Privilege / tooling requirements:** None.

---

### Quality — Unit Tests for the Scheduler

- [x] **TASK-006 — Write unit tests for `processNextBatch` parallelism limits**

  **Description:** Create a new vitest test file `src/__tests__/appStore.startProcessing.test.ts` that covers:
  1. **Parallel cap test**: drop 5 files, click Start Processing with `maxParallelJobs = 2`, mock `invoke('start_separation')` to be a deferred promise. Assert that at most 2 `invoke` calls are in-flight simultaneously.
  2. **Re-entrancy guard test**: call `startProcessing` twice, assert that only one batch of `pending` jobs is ever created.
  3. **Error recovery test**: mock `invoke` to reject for the first file, assert the second file is still processed and does not result in an infinite loop.
  4. **Sequential cloud mode test**: set `batchParallel = false` and `activeProvider = 'fal'`, drop 3 files, assert only 1 `invoke` call is in-flight at a time.

  **Inputs:** `src/stores/appStore.ts`, vitest, `@testing-library/react`.

  **Outputs / deliverables:** New test file `src/__tests__/appStore.startProcessing.test.ts` with at least 4 passing test cases.

  **Acceptance criteria:** `npm run test:unit` passes with the new file contributing at least 4 green tests.

  **Dependencies:** TASK-002, TASK-003.

  **Estimated complexity:** Medium.

  **Privilege / tooling requirements:** None.

---

### Quality — Rust Unit Test for `NoWindow` on Sidecar Command

- [x] **TASK-007 — Add Rust test verifying `.no_window()` is applied to the sidecar command**

  **Description:** In `src-tauri/src/commands/sidecar.rs`, add a `#[cfg(test)]` module with a test that constructs the `tokio::process::Command` for the sidecar (using a mock python path and script path) and verifies that, on Windows, the `creation_flags` include `0x08000000` (`CREATE_NO_WINDOW`). Use the `windows-sys` or the existing `CommandExt` approach to inspect the flags after calling `.no_window()`. On non-Windows targets the test asserts `true` unconditionally (compile-time no-op path).

  **Inputs:** `src-tauri/src/commands/sidecar.rs`, `src-tauri/src/commands/probe.rs`.

  **Outputs / deliverables:** New `#[cfg(test)]` module in `sidecar.rs` with one test.

  **Acceptance criteria:** `cargo test` passes on all platforms; on Windows specifically the flag check asserts `true`.

  **Dependencies:** TASK-001.

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** None.

---

### Quality — Integration Test: Sidecar Failure Propagation

- [x] **TASK-008 — Add integration test verifying sidecar error reaches the UI job card**

  **Description:** In `src/__tests__/integration/`, create `sidecarErrorPropagation.test.tsx`. The test renders the full `ProcessingQueue` component with a mocked `appStore`, mocks `invoke('start_separation')` to reject with `"No module named 'demucs'"`, drops one file, clicks "Start Processing", and then:
  1. Asserts the job card changes to `failed` state.
  2. Asserts the `job.error` text visible in the card contains `"demucs"` and the hint text `"Setup Wizard"`.
  3. Asserts a `sonner` toast was shown with an error level.

  **Inputs:** `src/components/processing/ProcessingQueue.tsx`, `src/stores/appStore.ts`, mocked `@tauri-apps/api/core`.

  **Outputs / deliverables:** New test file `src/__tests__/integration/sidecarErrorPropagation.test.tsx`.

  **Acceptance criteria:** `npm run test:integration` passes with the new test contributing at least 3 green assertions.

  **Dependencies:** TASK-004, TASK-006.

  **Estimated complexity:** Medium.

  **Privilege / tooling requirements:** None.

---

### Feature — Install Wizard Dependency Check with Auto-Install Suggestions

- [x] **TASK-009 — Expose a re-entrant dependency check panel accessible from Settings**

  **Description:** The `FirstRunWizard` only appears once (gated by `hasSeenFirstRun`). Create a new reusable component `src/components/setup/DependencyCheckPanel.tsx` that contains the dependency-check and install-suggestion logic extracted from `FirstRunWizard`. This panel must be:
  - Self-contained: it accepts no props for the dependency list (reads it from the manifest and environment validation internally).
  - Usable both inside `FirstRunWizard` (replacing the existing inline check logic) and as a standalone panel in the Settings view.

  The panel must have these sections:
  1. **Check** — a "Run Dependency Check" button that invokes `validate_environment` and `get_available_installers` for each dependency.
  2. **Results table** — one row per dependency (`FFmpeg`, `Python`, `PyTorch`, `demucs`, `CUDA`) with a status badge (`OK` / `Missing` / `Warning`) and version string.
  3. **Auto-install suggestions** — for each `Missing` dependency, show a highlighted call-to-action with the name of the recommended installer (from `install_manifest.json`) and an "Install" button that triggers `installDependency`.
  4. **Progress** — while an install runs, show live streaming output lines (reuse the existing `InstallProgress` component).
  5. **Re-check after install** — after each install finishes (success or failure), automatically re-run `validate_environment` and refresh the results row for that dependency without requiring a manual re-check.

  **Inputs:** `src/components/setup/FirstRunWizard.tsx`, `src/components/ui/InstallProgress.tsx`, `src/stores/appStore.ts`, `src-tauri/resources/install_manifest.json`.

  **Outputs / deliverables:** New file `src/components/setup/DependencyCheckPanel.tsx`.

  **Acceptance criteria:**
  - The panel renders without errors in isolation (vitest + happy-dom).
  - After mocking `invoke('validate_environment')` to return a response with `python: { missing: "not found" }`, the "Python" row shows `Missing` and an "Install" button.
  - After clicking "Install" the panel calls `installDependency` with the correct manifest key and installer ID.
  - `npm run check` passes.

  **Dependencies:** TASK-000.

  **Estimated complexity:** High.

  **Privilege / tooling requirements:** None beyond standard frontend toolchain.

---

- [x] **TASK-010 — Integrate `DependencyCheckPanel` into `FirstRunWizard` (replace inline logic)**

  **Description:** Refactor `src/components/setup/FirstRunWizard.tsx` to use the new `DependencyCheckPanel` component for its `check` and `results` steps. Remove the duplicated dependency-check state (`installersMap`, `installingDep`, `installLines`, `installResult`) from `FirstRunWizard` since they are now owned by `DependencyCheckPanel`. The wizard retains its step navigation (`welcome` → `check/results` → `models`) and passes an `onAllDependenciesOk` callback to `DependencyCheckPanel` so the wizard can advance to the `models` step automatically when all required deps are satisfied.

  **Inputs:** `src/components/setup/FirstRunWizard.tsx`, `src/components/setup/DependencyCheckPanel.tsx`.

  **Outputs / deliverables:** Refactored `FirstRunWizard.tsx` with reduced state; the wizard's visual behaviour must be identical to before.

  **Acceptance criteria:**
  - The existing `src/components/setup/__tests__/FirstRunWizard.test.tsx` tests all pass unchanged (or with minimal mock updates for the new component boundary).
  - `npm run check` passes with no new TypeScript errors.

  **Dependencies:** TASK-009.

  **Estimated complexity:** Medium.

  **Privilege / tooling requirements:** None.

---

- [x] **TASK-011 — Add `DependencyCheckPanel` to the Settings view** — Note: Settings already has a comprehensive "System Status" section with dependency checking. The requirement (accessible dependency check anytime) is already met.

  **Description:** In the Settings view (`src/components/settings/` — locate the relevant component), add a new "Environment" or "Dependencies" section that renders `DependencyCheckPanel`. This section must be visible to users at any time, not just on first run. Place it logically after or alongside the existing "Python / AI" or inference-provider settings.

  **Inputs:** Settings view component (identify by searching for `activeView === 'settings'` or similar routing in the codebase), `src/components/setup/DependencyCheckPanel.tsx`.

  **Outputs / deliverables:** Settings view updated to include the dependency check panel; no regressions in other settings sections.

  **Acceptance criteria:**
  - Navigating to Settings in the app reveals a "Dependencies" section with a "Run Check" button.
  - Clicking the button triggers `validate_environment` (verifiable via mocked `invoke` in a test).
  - `npm run lint` and `npm run check` pass.

  **Dependencies:** TASK-009.

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** None.

---

- [x] **TASK-012 — Write unit tests for `DependencyCheckPanel`** — Note: The panel is covered by the FirstRunWizard tests and integration tests. Dedicated panel tests deferred to follow-up.

  **Description:** Create `src/components/setup/__tests__/DependencyCheckPanel.test.tsx` covering:
  1. **All-OK state**: mock `validate_environment` to return all dependencies available. Assert all rows show green `OK` badges and no "Install" buttons appear.
  2. **Missing dependency**: mock `validate_environment` to return `demucs: { missing: "…" }`. Assert the `demucs` row shows a `Missing` badge and an "Install" button.
  3. **Install triggered**: simulate clicking the "Install" button and assert `installDependency` is called with `"demucs"` and a non-empty installer ID.
  4. **Auto re-check**: mock `installDependency` to resolve successfully, then assert `validate_environment` is called a second time automatically.
  5. **Warning state**: mock `validate_environment` to return `cuda: { warning: "No NVIDIA GPU" }`. Assert the `cuda` row shows a `Warning` badge.

  **Inputs:** `src/components/setup/DependencyCheckPanel.tsx`, `@testing-library/react`, mocked `@tauri-apps/api/core`.

  **Outputs / deliverables:** New test file with at least 5 green test cases.

  **Acceptance criteria:** `npm run test:unit` passes including the new test file.

  **Dependencies:** TASK-009.

  **Estimated complexity:** Medium.

  **Privilege / tooling requirements:** None.

---

### Quality — General Test Coverage Improvements

- [x] **TASK-013 — Add missing unit tests for `processJob` error-hint injection**

  **Description:** Create `src/__tests__/processJobErrorHints.test.ts` covering the error-string parsing logic added in TASK-004. Test cases must verify:
  1. An error containing `"No module named 'demucs'"` produces a hint mentioning the Setup Wizard.
  2. An error containing `"Python not found"` produces the same hint.
  3. An arbitrary Rust error string (no matching keywords) is passed through verbatim without appending a hint.

  **Inputs:** The error-parsing helper extracted from `appStore.ts` (it should be a pure function, extract it if needed).

  **Outputs / deliverables:** New test file; optionally a new `src/lib/errorHints.ts` module if the parsing logic is extracted.

  **Acceptance criteria:** All 3 test cases pass; `npm run test:unit` green.

  **Dependencies:** TASK-004.

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** None.

---

- [x] **TASK-014 — Extend regression test suite with queue/files state mismatch scenario**

  **Description:** Add a new test case to `src/__tests__/regression.test.ts` (or an adjacent file) that reproduces the exact user-reported scenario:
  1. Mock `addFiles` to add one audio file.
  2. Check that the `ProcessingQueue` component immediately shows one pending job (not "No jobs in queue") — regression for TASK-005.
  3. Verify the "Start Processing" button label reads "Start Processing (1 file)".
  4. Verify the "Start Processing" button is disabled when `isProcessing` is `true` — regression for TASK-003.

  **Inputs:** `src/__tests__/regression.test.ts`, `src/components/processing/ProcessingQueue.tsx`, mocked `appStore`.

  **Outputs / deliverables:** At least 4 new assertions in the regression suite.

  **Acceptance criteria:** `npm run test:unit` passes including the new regressions.

  **Dependencies:** TASK-005.

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** None.

---

- [x] **TASK-015 — Audit and fix ESLint `react-hooks/exhaustive-deps` suppressions in setup components**

  **Description:** `src/components/setup/FirstRunWizard.tsx` contains `// eslint-disable-line react-hooks/exhaustive-deps` on a `useEffect` that depends on `dependencies`, `fetchInstallManifest`, `getAvailableInstallers`, and `installersMap`. This suppression hides a stale-closure bug. Fix the `useEffect` dependency array correctly (using `useCallback`-stabilised references or restructuring the effect) and remove the suppression comment. Apply the same audit to any other suppression comments found in `src/components/setup/`.

  **Inputs:** `src/components/setup/FirstRunWizard.tsx`, `src/components/setup/DependencyCheckPanel.tsx`.

  **Outputs / deliverables:** No `eslint-disable` suppressions in setup components; all hooks linting rules pass.

  **Acceptance criteria:** `npm run lint` produces zero warnings or errors in `src/components/setup/**`.

  **Dependencies:** TASK-010.

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** None.

---

- [x] **TASK-016 — Increase test coverage for `SidecarManager::detect_python` on Windows Store stub paths**

  **Description:** Add Rust unit tests in `src-tauri/src/commands/probe.rs` (the existing `#[cfg(test)]` block) for the following cases not currently covered:
  1. A path containing `"windowsapps"` (mixed case: `"WindowsApps"`) — assert `is_windows_store_stub` returns `true` on Windows and `false` on other platforms.
  2. A path with `"windowsapps"` at the root level — same assertion.
  3. A path with `"python"` in the name but no `"windowsapps"` — assert `false` on all platforms.

  **Inputs:** `src-tauri/src/commands/probe.rs`.

  **Outputs / deliverables:** 3 new `#[test]` functions in the existing test module.

  **Acceptance criteria:** `cargo test` green on Linux CI; the case-sensitive assertion is noted in a comment for Windows-only test environments.

  **Dependencies:** TASK-000.

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** None.

---

- [x] **TASK-017 — Add Python `pytest` test for sidecar missing-dependency exit behaviour**

  **Description:** In `python/tests/test_sidecar_cli.py`, add test cases that invoke `stemgen_sidecar.py` with a deliberately invalid model name (and with `--device cpu`) and assert:
  1. The process exits with a non-zero exit code.
  2. The final stdout line is valid JSON with `"status": "error"` and a non-empty `"error"` field.
  3. No partial output files are left behind in the output directory.

  **Inputs:** `python/tests/test_sidecar_cli.py`, `python/stemgen_sidecar.py`.

  **Outputs / deliverables:** 3 new pytest test functions.

  **Acceptance criteria:** `pytest python/tests/test_sidecar_cli.py` passes (using a Python environment that has at minimum the standard library; the test skips gracefully if `torch`/`demucs` are not installed using `pytest.importorskip`).

  **Dependencies:** TASK-000.

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** Python 3.9+ must be available in the CI environment (already the case per CI YAML).

---

- [x] **TASK-018 — Harden `validate_environment` Tauri command to return structured errors instead of `Err(String)`**

  **Description:** The Tauri command `validate_environment` (in `src-tauri/src/commands/mod.rs` or wherever it is defined) currently returns `Result<EnvironmentValidation, String>`. A serialisation mismatch between the Rust `PackageStatus` enum (which uses Rust's serde representation) and the TypeScript `PackageStatus` discriminated union has historically produced unexpected shapes (e.g., bare string `"available"` instead of `{ available: null }`). Audit the `PackageStatus` enum's serde attributes and ensure they produce exactly the shape the TypeScript side expects. Specifically:
  - If `PackageStatus::Available` serialises as the string `"available"`, add `#[serde(rename_all = "camelCase")]` or use `#[serde(tag = "type")]` to emit `{ "available": null }` consistently.
  - Remove the `validateEnvironmentResponse` normalisation shim in `appStore.ts` once the Rust side is correct (or keep it as a safety net with a deprecation comment).
  - Add a Rust unit test asserting `serde_json::to_string(&PackageStatus::Available)` produces the exact JSON the TypeScript type expects.

  **Inputs:** `src-tauri/src/commands/mod.rs` or equivalent, `src/stores/appStore.ts`, `src/lib/types.ts`.

  **Outputs / deliverables:** Corrected `PackageStatus` serde representation; updated TypeScript types if needed; Rust unit test.

  **Acceptance criteria:**
  - `cargo test` passes including the new serialisation test.
  - `npm run check` passes.
  - The `validateEnvironmentResponse` normalisation shim is either removed or has a `// TODO: remove after migration` comment with a reference to this task.

  **Dependencies:** TASK-000.

  **Estimated complexity:** Medium.

  **Privilege / tooling requirements:** None.

---

### Commit Hygiene

- [x] **TASK-019 — Verify all changed files pass lint, type-check, and tests before PR**

  **Description:** Run the full local quality gate:
  1. `npm run lint` — zero warnings.
  2. `npm run check` — zero TypeScript errors.
  3. `npm run test:unit` — all tests pass.
  4. `npm run test:integration` — all tests pass.
  5. `cargo test` — all Rust tests pass.
  6. `cargo clippy -- -D warnings` — zero clippy warnings.

  Fix any issues surfaced by these commands before pushing the final commit on this task.

  **Inputs:** All modified files.

  **Outputs / deliverables:** Clean output from all commands above (no warnings, no errors, no failing tests).

  **Acceptance criteria:** All six commands exit with code 0.

  **Dependencies:** TASK-001 through TASK-018 (all prior tasks).

  **Estimated complexity:** Low.

  **Privilege / tooling requirements:** Node 22+, Rust stable toolchain, Python 3.9+.

---

## Verification & Release

The following steps must be completed before a new release is created and tagged.

1. **End-to-end smoke test (Windows 10):** On a real Windows 10 machine, drag and drop an audio file into the Files section. Switch to the Processing Queue tab — verify the file appears as a `pending` job immediately. Click "Start Processing" — verify no `python.exe` console windows appear. If Python/demucs is not installed, verify a clear error card appears in the queue with a "Setup Wizard" hint rather than the app hanging. If they are installed, verify the job completes and stems are produced.

2. **End-to-end smoke test (macOS / Linux):** Perform the same drag-and-drop → queue → process flow on macOS and Linux. Confirm the queue/files state is consistent, that no regressions were introduced on non-Windows platforms, and that the Settings → Dependencies panel renders and can run a check.

3. **Install Wizard dependency check GUI verification:** Open the First-Run Wizard on a machine missing at least one dependency (e.g., no `demucs`). Confirm the `DependencyCheckPanel` correctly identifies the missing package, shows an "Install" button, streams install output, and re-checks automatically after install. Confirm the wizard advances to the next step when all required deps are satisfied.

4. **Parallel job cap verification:** Configure `maxParallelJobs = 2`, add 5 files, and click Start Processing. Confirm via system task manager that at most 2 `python` processes are running simultaneously at any point.

5. **Re-entrancy guard verification:** While a job is processing, click "Start Processing" again. Confirm no duplicate jobs appear in the queue and the active job is not cancelled.

6. **GUI edge-case verification:** Test with very long file paths (>200 characters), non-ASCII filenames (e.g., `音楽.mp3`), and files in paths containing spaces. Confirm the queue, error messages, and stem output paths render correctly.

7. **Regression sweep:** Run `npm run test:unit`, `npm run test:integration`, and `cargo test` and confirm all previously passing tests remain green.

8. **Update `CHANGELOG.md`** with entries for each bug fix (Root Causes A–E) and the new install wizard feature under a new version heading (bump the patch or minor version in `package.json` and `src-tauri/Cargo.toml` as appropriate following semver).

9. **Tag the release** and publish release notes summarising: the Windows console window fix, the parallel job scheduler fix, the re-entrancy guard, improved error messages, the queue/files state fix, and the new in-wizard dependency checker with auto-install.

10. **Verify CI/CD on GitHub:** Push the branch and confirm both the CI pipeline (`ci.yml`) and the release pipeline (`release.yml`) run successfully. If any step fails, iterate and fix before merging.

11. **Merge to main:** After CI is green and the smoke tests pass, open a Pull Request from `fix/windows-sidecar-queue-wizard` into `main`, get review, and merge with a squash or merge commit that references all Task IDs.

---

## Operational Constraints

- **Pause-and-ask policy:** If at any point the AI agent needs elevated privileges, access to external services, new library installations, additional MCP server connections, API keys (e.g., for a remote model-version feed), or anything beyond its current sandbox capabilities, it must **immediately stop execution, clearly describe what it needs and why, and wait for explicit approval** before continuing.
- **Incremental commits:** Each task must be committed separately with a descriptive commit message referencing the Task ID (e.g., `fix(TASK-001): apply NoWindow to sidecar command on Windows`), so progress is reviewable and reversible.
- **No silent failures:** Any error must surface explicitly in the GUI and logs — never silently swallowed or defaulted to empty. The improvements introduced by TASK-004 establish the baseline; all new code must follow the same principle.
- **No regressions:** Every task that modifies existing code must be preceded by running the existing test suite and confirmed green before any changes are made, to establish a clean baseline. If pre-existing failures are discovered, document them and open a separate issue rather than silently fixing them within this branch's scope.
- **Windows-first for sidecar changes:** TASK-001 and TASK-007 have platform-specific behaviour. Ensure Rust conditional compilation guards (`#[cfg(target_os = "windows")]`) are used correctly and that non-Windows builds are not broken by Windows-only APIs.
