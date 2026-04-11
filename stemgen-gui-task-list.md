# Stemgen-GUI — Comprehensive Bug-Fix, Quality & Installer Enhancement Task List

*Generated: April 2026 · Repository: stemgen-gui · Branch target: `fix/wizard-models-bugs`*

## Objective(s)

This document captures every confirmed bug, latent defect, and quality gap discovered during a full code audit of the `stemgen-gui` repository (Tauri v2 + React/TypeScript frontend, Rust backend, Python sidecar). It translates those findings into a sequentially ordered, self-contained task list that AI coding agents can execute independently on a dedicated feature branch.

Three categories of work are addressed:

1. **Critical separation-pipeline bugs** — concrete defects that prevent the primary use case (processing an audio file) from succeeding on a fresh install.
2. **Latent / secondary bugs** — issues that do not always surface immediately but will cause incorrect output or hard failures under specific conditions.
3. **Project quality & test coverage improvements** — gaps in the CI pipeline, missing dependency checks, low coverage thresholds, and absent integration tests.

### Root-Cause Summary of the Reported Error

The user reported: *"I selected Demucs to process on CPU, but got: `ModuleNotFoundError: No module named 'soundfile'`."*

The traceback shows that `run_bs_roformer()` was called even though the user believed they selected "Demucs". This has two overlapping causes:

- `DEFAULT_PROCESSING_SETTINGS.model` is hardcoded to `'bs_roformer'` in `src/lib/constants.ts`, and `settingsStore.defaultModel` is also `'bs_roformer'`. On a fresh install the user's actual active model is `bs_roformer` unless they explicitly change it — but the UI label "Demucs" may have been visible in another context (e.g. a preset), causing confusion.
- `run_bs_roformer()` is an incomplete stub that unconditionally calls `sys.exit(1)` after emitting an error. Before reaching the stub guard, it executes `import soundfile as sf` at the module top — but `soundfile` is never listed in `install_manifest.json`, so the Setup Wizard never installs it. The import therefore raises `ModuleNotFoundError` before the stub's own error message can even be emitted.

---

## Confirmed Bug Catalogue

The following bugs were verified directly in source code. They are ordered by severity and cross-referenced to tasks below.

| ID | Severity | File | Description |
|----|----------|------|-------------|
| BUG-01 | Critical | `install_manifest.json` | `soundfile` absent from installer manifest — Setup Wizard never installs it |
| BUG-02 | High | `stemgen_sidecar.py` | `check_dependencies()` does not check `soundfile`, `librosa`, or `mutagen` |
| BUG-03 | High | `constants.ts`, `settingsStore.ts` | Default model is `bs_roformer` — a non-functional stub |
| BUG-04 | High | `stemgen_sidecar.py:210` | `run_bs_roformer()` imports `soundfile` bare before its own guard — crashes before emitting structured error |
| BUG-05 | Medium | `stemgen_sidecar.py:178` | Sample rate hardcoded to `44100` instead of `model.samplerate` |
| BUG-06 | Medium | `sidecar.rs:317` | `collect_stems()` hardcodes `["drums","bass","other","vocals"]` — breaks non-standard model stem names |
| BUG-07 | High | `FileBrowser.tsx` | Drag-drop reads `event.paths` instead of `event.payload.paths` (Tauri v2 API change) |
| BUG-08 | Low | `errorHints.ts` | `soundfile` missing from `DEPENDENCY_KEYWORDS` — Setup Wizard hint not shown for soundfile errors |

### BUG-01 · `soundfile` missing from `install_manifest.json` (Critical)

**File:** `src-tauri/resources/install_manifest.json`

`run_bs_roformer()` (`stemgen_sidecar.py:210`) imports `soundfile` at function entry. The package `soundfile==0.12.1` appears in `python/requirements.txt` but has no entry in `install_manifest.json`. The Setup Wizard only installs what is listed in the manifest, so `soundfile` is never present after a GUI-guided install. Any invocation of `bs_roformer` crashes with `ModuleNotFoundError` before any user-facing error can be produced. Fixed by **TASK-001**.

### BUG-02 · `check_dependencies()` incomplete — does not verify `soundfile`, `librosa`, or `mutagen` (High)

**File:** `python/stemgen_sidecar.py`, `def check_dependencies()`

The pre-flight check only verifies `torch`, `torchaudio`, and `demucs`. It does not check `soundfile` (required by `bs_roformer`), `librosa`, or `mutagen`. Missing packages only produce an error at the point of use, deep inside a model runner, rather than in a clear preflight message. Fixed by **TASK-003**.

### BUG-03 · Default model is `'bs_roformer'` — a broken stub (High)

**Files:** `src/lib/constants.ts` (`DEFAULT_PROCESSING_SETTINGS.model`), `src/stores/settingsStore.ts` (`defaultModel`)

Both the processing defaults and the settings store initialise the active model to `'bs_roformer'`. `run_bs_roformer()` is a known-broken stub (it always calls `sys.exit(1)`) and requires packages the installer does not provide. A new user who has never opened Settings will always hit the broken path. Fixed by **TASK-004**.

### BUG-04 · `run_bs_roformer()` stub imports `soundfile` before its own guard (High)

**File:** `python/stemgen_sidecar.py`, `def run_bs_roformer()`

The function begins with `import soundfile as sf` at line 210. This import executes before the `try/except ImportError` block that guards the `bs_roformer` package import. Because `soundfile` is not installed (BUG-01), Python raises `ModuleNotFoundError` at the import line and the process terminates with an unformatted traceback to stderr rather than a structured JSON error on stdout. The Rust layer surfaces this traceback as the error message shown to the user. Fixed by **TASK-002**.

### BUG-05 · Hardcoded sample rate `44100` Hz in `_run_demucs_model()` (Medium)

**File:** `python/stemgen_sidecar.py:178`

Audio is loaded at `model.samplerate` (correct), but stems are saved with `torchaudio.save(..., 44100)` (hardcoded). If a future model uses a different native sample rate the output WAV files will be mislabelled. `htdemucs` happens to use 44100 Hz so the bug is latent today, but it will silently produce incorrect files when any other rate is used. Fixed by **TASK-005**.

### BUG-06 · `collect_stems()` hardcodes stem names in Rust (Medium)

**File:** `src-tauri/src/commands/sidecar.rs`, `fn collect_stems()`

The Rust stem collector looks for exactly `["drums", "bass", "other", "vocals"]`. The Python sidecar derives stem names from `model.sources` (which may vary). If a model produces stems with different names the Rust layer will not find any files and will return "No stem files were generated". Fixed by **TASK-008**.

### BUG-07 · Drag-and-drop payload access uses wrong nesting (High)

**File:** `src/components/file-browser/FileBrowser.tsx`

The `tauri://drag-drop` handler is typed as `(event: DragDropPayload)` and accesses `event.paths` directly. In Tauri v2 the callback receives `Event<T>` and the actual payload is at `event.payload.paths`. `event.paths` is always `undefined` so no dragged files are ever processed. Fixed by **TASK-006**.

### BUG-08 · `soundfile` keyword missing from `errorHints` `DEPENDENCY_KEYWORDS` (Low)

**File:** `src/lib/errorHints.ts`

The `DEPENDENCY_KEYWORDS` array does not include `'soundfile'`. If the `ModuleNotFoundError` for `soundfile` reaches the frontend (as it does today), the "Open Setup Wizard" hint is not appended to the error message because the keyword match fails. Fixed by **TASK-009**.

---

## Step-by-Step Implementation Task List for AI Agents

Each task must be committed separately with a descriptive commit message referencing the Task ID. Complete tasks in the order listed — dependencies are explicit.

---

### PHASE 1 — Critical Bug Fixes (separation pipeline)

---

- [x] **TASK-001 — Add `soundfile` to `install_manifest.json` (BUG-01)**

  **Description:** Add a new top-level dependency entry `"soundfile"` to `src-tauri/resources/install_manifest.json` following the same schema as the existing `"demucs"` entry. The entry must include platform-specific `pip install` commands for `windows`, `macos`, and `linux`. `detect_command` should be `"python"` (Windows) / `"python3"` (macOS/Linux); `detect_args` should be `["-c", "import soundfile"]`. `install_args` must be `["-m", "pip", "install", "--user", "soundfile"]`. Place the entry after `"demucs"` and before any optional entries.

  **Inputs:** `src-tauri/resources/install_manifest.json`

  **Outputs / Deliverables:** Updated `install_manifest.json` with a `"soundfile"` dependency entry for all three platforms.

  **Acceptance Criteria:**
  1. JSON is valid (`python -m json.tool install_manifest.json` exits 0).
  2. The entry is present under `dependencies.soundfile` with non-empty `detect_command` and `install_command` for `windows`, `macos`, and `linux`.
  3. Existing entries are unchanged.

  **Dependencies:** None.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-002 — Fix `run_bs_roformer()` — move `soundfile` import inside try block and remove dead stub (BUG-04)**

  **Description:** In `python/stemgen_sidecar.py`, inside `run_bs_roformer()`:
  1. Remove the bare `import soundfile as sf` line from the top of the function body — it is dead code (`sf` is never used in the current stub).
  2. Wrap the `from bs_roformer import BSRoformer` import inside the existing `try/except ImportError` block.
  3. The function currently always calls `sys.exit(1)` after emitting a "model weights not available" error — this is intentional for now (`bs_roformer` is not yet fully implemented). Ensure the error JSON emitted includes a clear actionable message: `"BS-RoFormer is not yet supported for local inference. Please choose Demucs, HT-Demucs, or HT-Demucs FT, or use a cloud provider."`
  4. Add the `model_id` field to the error JSON: `{"status": "error", "model_id": "bs_roformer", "error": "..."}`.

  **Inputs:** `python/stemgen_sidecar.py`

  **Outputs / Deliverables:** Updated `stemgen_sidecar.py` where `run_bs_roformer()` no longer imports `soundfile` at module level and emits a clear, structured JSON error before exiting.

  **Acceptance Criteria:**
  1. Running `python stemgen_sidecar.py --model bs_roformer --input /tmp/x.wav --output /tmp/out --device cpu` (with `bs_roformer` not installed) prints a valid JSON line with `status="error"` to stdout and exits non-zero — no traceback on stderr.
  2. `import stemgen_sidecar` succeeds even when `soundfile` is not installed.
  3. Existing demucs tests still pass.

  **Dependencies:** None.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-003 — Expand `check_dependencies()` to cover all required packages per model (BUG-02)**

  **Description:** In `python/stemgen_sidecar.py`, update `check_dependencies(model: str = "demucs")` to accept an optional `model` parameter and verify only the packages required by the requested model:
  - `demucs` / `htdemucs` / `htdemucs_ft`: `torch`, `torchaudio`, `demucs`
  - `bs_roformer`: `torch`, `torchaudio`, `bs_roformer`, `soundfile`

  The function should continue to return `bool` and emit a structured JSON error listing all missing packages with a corrected install hint specific to the model. Call `check_dependencies(args.model)` in `main()` before `run_separation()`. Update the install hint string to include the correct `pip` package names for each missing item.

  **Inputs:** `python/stemgen_sidecar.py`

  **Outputs / Deliverables:** Updated `stemgen_sidecar.py` with an improved `check_dependencies()` function.

  **Acceptance Criteria:**
  1. When `soundfile` is absent and `model=bs_roformer`, the function returns `False` and emits JSON with `error` containing `"soundfile"` and a `pip install` hint.
  2. When only demucs packages are installed and `model=demucs`, the function returns `True`.
  3. Existing `TestCheckDependencies` tests still pass.
  4. New unit tests (added in TASK-012) cover the model-specific paths.

  **Dependencies:** TASK-002.

  **Estimated Complexity:** Medium.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-004 — Change default model from `bs_roformer` to `demucs` (BUG-03)**

  **Description:** In two files:
  1. `src/lib/constants.ts` — change `DEFAULT_PROCESSING_SETTINGS.model` from `'bs_roformer'` to `'demucs'`.
  2. `src/stores/settingsStore.ts` — change the initial `defaultModel` value from `'bs_roformer'` to `'demucs'`.

  Verify that no other file hardcodes a model default of `'bs_roformer'` (search the entire `src/` tree). Update any test snapshots that assert the old default.

  **Inputs:** `src/lib/constants.ts`, `src/stores/settingsStore.ts`, `src/**/__tests__/**`

  **Outputs / Deliverables:** Updated `constants.ts` and `settingsStore.ts`. Updated or re-generated test snapshots if applicable.

  **Acceptance Criteria:**
  1. `grep -r "bs_roformer" src/lib/constants.ts` returns no lines containing `defaultModel` or `DEFAULT_PROCESSING_SETTINGS`.
  2. `npm run test:unit` passes with zero failures.
  3. A fresh Zustand store instance reports `defaultModel === "demucs"` when inspected in a unit test.

  **Dependencies:** None.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-005 — Fix hardcoded sample rate in `_run_demucs_model()` (BUG-05)**

  **Description:** In `python/stemgen_sidecar.py`, inside `_run_demucs_model()`, change the `torchaudio.save()` call on line ~178 from the hardcoded rate `44100` to `model.samplerate`. The variable `model` is already in scope at that point. Verify that `model.samplerate` is also used when loading the audio (it already is, on the `AudioFile.read()` call) so that the save rate matches the load rate.

  **Inputs:** `python/stemgen_sidecar.py`

  **Outputs / Deliverables:** Updated `stemgen_sidecar.py` where saved WAV files use `model.samplerate`.

  **Acceptance Criteria:**
  1. `grep "44100" python/stemgen_sidecar.py` returns zero matches.
  2. A test (added in TASK-012) mocks `model.samplerate = 48000` and asserts that `torchaudio.save` is called with `48000`.
  3. Existing demucs tests pass.

  **Dependencies:** None.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-006 — Fix drag-and-drop payload nesting in `FileBrowser.tsx` (BUG-07)**

  **Description:** In `src/components/file-browser/FileBrowser.tsx`:
  1. Import the Tauri `Event<T>` wrapper type from `@tauri-apps/api/event` alongside the existing `listen` import.
  2. Update the `tauri://drag-drop` listener callback type from `(event: DragDropPayload)` to `(event: Event<DragDropPayload>)`.
  3. Update all accesses of `event.paths` inside the handler body to `event.payload.paths`.
  4. Confirm that `tauri://drag-enter` and `tauri://drag-leave` handlers do not access payload (they should not need changing).

  **Inputs:** `src/components/file-browser/FileBrowser.tsx`

  **Outputs / Deliverables:** Updated `FileBrowser.tsx` where drag-drop events correctly read `event.payload.paths`.

  **Acceptance Criteria:**
  1. TypeScript compilation (`npm run check`) passes with zero errors.
  2. The unit test added in TASK-014 simulates a drag-drop event and asserts that the file path inside `payload.paths` is processed.

  **Dependencies:** None.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-007 — Add `soundfile` to `errorHints` `DEPENDENCY_KEYWORDS` (BUG-08)**

  **Description:** In `src/lib/errorHints.ts`, add the string `'soundfile'` to the `DEPENDENCY_KEYWORDS` array so that `ModuleNotFoundError: No module named 'soundfile'` is matched and the "Open Setup Wizard" hint is appended to the error message displayed in the GUI.

  **Inputs:** `src/lib/errorHints.ts`

  **Outputs / Deliverables:** Updated `errorHints.ts` with `soundfile` in `DEPENDENCY_KEYWORDS`.

  **Acceptance Criteria:**
  1. `formatJobError("ModuleNotFoundError: No module named 'soundfile'")` returns a string ending with the Setup Wizard hint.
  2. Existing `errorHints` tests still pass.
  3. A new test in `src/lib/__tests__/errorHints.test.ts` asserts the `soundfile` match explicitly.

  **Dependencies:** None.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

### PHASE 2 — Secondary Bug Fixes

---

- [x] **TASK-008 — Fix `collect_stems()` hardcoded stem names in Rust (BUG-06)**

  **Description:** In `src-tauri/src/commands/sidecar.rs`, `fn collect_stems()`:
  1. Replace the static array `["drums", "bass", "other", "vocals"]` with a directory scan: iterate all `.wav` files in `output_dir`, filter for files whose name matches `{source_stem}_{anything}.wav`, and extract the stem name from the suffix.
  2. The function should still return an error if zero matching files are found.
  3. Preserve the existing test `test_collect_stems_returns_only_existing_files` (update it if the interface changes).

  This makes Rust tolerant of models that produce stems with different names (e.g. `"guitar"`, `"piano"`).

  **Inputs:** `src-tauri/src/commands/sidecar.rs`

  **Outputs / Deliverables:** Updated `sidecar.rs` with a dynamic stem collector.

  **Acceptance Criteria:**
  1. `cargo test` passes with all existing sidecar tests.
  2. A new Rust unit test creates output files named `track_guitar.wav` and `track_piano.wav` in a temp dir and asserts that `collect_stems` returns two results with `stem_type` `"guitar"` and `"piano"`.
  3. A test with zero matching files still returns an `Err`.

  **Dependencies:** None.

  **Estimated Complexity:** Medium.

  **Privilege / Tooling Requirements:** Requires Rust toolchain (`cargo`).

---

- [x] **TASK-009 — Add `librosa` and `mutagen` to `install_manifest.json`**

  **Description:** `librosa==0.10.2.post1` and `mutagen==1.47.0` appear in `python/requirements.txt` but are absent from `install_manifest.json`. Although neither is imported by the current model runners at startup, they are declared runtime dependencies and should be installable via the Setup Wizard to avoid future breakage. Add entries for both packages following the same schema as the `soundfile` entry added in TASK-001.

  **Inputs:** `src-tauri/resources/install_manifest.json`

  **Outputs / Deliverables:** Updated `install_manifest.json` with `librosa` and `mutagen` entries.

  **Acceptance Criteria:**
  1. JSON validates (`python -m json.tool` exits 0).
  2. Both entries present under `dependencies.librosa` and `dependencies.mutagen` with correct `detect_args` (`["-c", "import librosa"]` and `["-c", "import mutagen"]`) for all three platforms.

  **Dependencies:** TASK-001.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-010 — Improve separation error surfacing: propagate structured JSON errors from Python to the GUI**

  **Description:** When the Python sidecar exits non-zero and has already emitted a structured JSON error line to stdout, the Rust layer currently ignores that and surfaces raw stderr text instead. In `src-tauri/src/commands/sidecar.rs`, update the error branch of `run_separation()` to:
  1. Check if the `stderr_tail` is a valid JSON object with an `"error"` key — if so, extract and use that value as the primary message.
  2. Otherwise fall back to the existing raw `stderr_tail` surfacing.

  This ensures that structured errors from the Python sidecar are displayed cleanly in the GUI rather than as raw tracebacks.

  **Inputs:** `src-tauri/src/commands/sidecar.rs`

  **Outputs / Deliverables:** Updated `sidecar.rs` with structured-JSON error extraction.

  **Acceptance Criteria:**
  1. `cargo test` passes.
  2. A unit test (Rust) provides a fake `stderr_tail` of `'{"status":"error","error":"my error"}'` and asserts the returned `Err` string is `"my error"` (not the raw JSON).

  **Dependencies:** TASK-002.

  **Estimated Complexity:** Medium.

  **Privilege / Tooling Requirements:** Requires Rust toolchain.

---

- [x] **TASK-011 — Validate `--check-model` for `bs_roformer` in Python sidecar**

  **Description:** The `--check-model` mode (used by the GUI to check if a model is cached locally) calls `demucs.pretrained.get_model()` — this path is only valid for demucs-family models. For `bs_roformer`, it should immediately return `{"available": false, "model_id": "bs_roformer", "reason": "not_implemented"}`. In the `--check-model` handler in `main()`, add an early branch: if `args.check_model.lower() in ("bs_roformer", "bs-roformer")`, print the not-implemented JSON and `sys.exit(0)`.

  **Inputs:** `python/stemgen_sidecar.py`

  **Outputs / Deliverables:** Updated `stemgen_sidecar.py` with `bs_roformer` guard in `--check-model` path.

  **Acceptance Criteria:**
  1. Running `python stemgen_sidecar.py --check-model bs_roformer` prints valid JSON with `available=false` and exits `0`.
  2. Running `python stemgen_sidecar.py --check-model demucs` still calls `get_model()` as before.
  3. Unit test added in TASK-012 covers this branch.

  **Dependencies:** TASK-002.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

### PHASE 3 — Test Coverage Improvements (Python)

---

- [x] **TASK-012 — Add Python unit tests for all bug-fix paths in `stemgen_sidecar.py`**

  **Description:** In `python/tests/test_sidecar_cli.py`, add new test classes / methods covering:
  - (a) `run_bs_roformer` emits structured JSON error when `bs_roformer` package is absent (no traceback to stderr).
  - (b) `run_bs_roformer` emits structured JSON error when `bs_roformer` is present but weights unavailable.
  - (c) `check_dependencies(model="bs_roformer")` returns `False` and emits JSON containing `"soundfile"` when `soundfile` is missing.
  - (d) `check_dependencies(model="demucs")` returns `True` when `torch`, `torchaudio`, `demucs` are present.
  - (e) `_run_demucs_model()` calls `torchaudio.save` with `model.samplerate`, not hardcoded `44100` (use `monkeypatch`/`MagicMock`).
  - (f) `--check-model bs_roformer` outputs JSON with `available=false` and exits `0`.
  - (g) `main()` with `model=demucs` and all deps missing emits error JSON referencing `"demucs"`, not `"bs_roformer"`.

  All new tests must be marked `@pytest.mark.unit` (not integration) so they run in CI without GPU.

  **Inputs:** `python/tests/test_sidecar_cli.py`, `python/stemgen_sidecar.py`

  **Outputs / Deliverables:** Extended test file with 7+ new test methods.

  **Acceptance Criteria:** `cd python && pytest tests/ -m "not integration" -v` exits `0` with all new tests collected and passing.

  **Dependencies:** TASK-003, TASK-004, TASK-005, TASK-011.

  **Estimated Complexity:** Medium.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-013 — Add Python integration smoke test for demucs CPU separation**

  **Description:** In `python/tests/test_sidecar_cli.py` (or a new file `python/tests/test_integration.py`), add one integration test marked `@pytest.mark.integration` that:
  1. Invokes the sidecar as a subprocess: `python stemgen_sidecar.py --model demucs --input tests/fixtures/test-short.wav --output /tmp/stemgen_test_out --device cpu`.
  2. Asserts that the process exits with code `0`.
  3. Asserts that four WAV files (`test-short_drums.wav`, `test-short_bass.wav`, `test-short_other.wav`, `test-short_vocals.wav`) exist in the output directory.
  4. Asserts that each WAV file is `> 0` bytes.

  This test is excluded from the standard CI run (which uses `-m "not integration"`) and is intended for local verification and release gating.

  **Inputs:** `python/stemgen_sidecar.py`, `tests/fixtures/audio/test-short.wav` (already exists in repo)

  **Outputs / Deliverables:** New integration test file or extended `test_sidecar_cli.py`.

  **Acceptance Criteria:** Running `pytest -m integration` in an environment with `demucs` + `torch` installed exits `0` and all assertions pass.

  **Dependencies:** TASK-005.

  **Estimated Complexity:** Medium.

  **Privilege / Tooling Requirements:** Requires `demucs`, `torch`, `torchaudio` installed in the test environment.

---

### PHASE 4 — Test Coverage Improvements (Frontend TypeScript)

---

- [x] **TASK-014 — Add frontend unit test for drag-and-drop payload fix**

  **Description:** In `src/components/file-browser/__tests__/` (create directory if absent), add a new test file `FileBrowser.dragdrop.test.tsx`. The test should:
  1. Mock `@tauri-apps/api/event` so that `listen()` captures the registered callback.
  2. Trigger the callback with an event object of shape `{ payload: { paths: ["/tmp/test.wav"] } }`.
  3. Assert that the store's `addFile` (or equivalent) action was called with `"/tmp/test.wav"`.
  4. Separately trigger with `{ paths: ["/tmp/wrong.wav"] }` (no `payload` nesting) and assert that no file was added, confirming the old broken path is not re-introduced.

  **Inputs:** `src/components/file-browser/FileBrowser.tsx`, `src/stores/appStore.ts`

  **Outputs / Deliverables:** New test file `src/components/file-browser/__tests__/FileBrowser.dragdrop.test.tsx`.

  **Acceptance Criteria:** `npm run test:unit` passes with the new test collected and passing.

  **Dependencies:** TASK-006.

  **Estimated Complexity:** Medium.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-015 — Add frontend unit tests for `errorHints` `soundfile` keyword**

  **Description:** In `src/lib/__tests__/errorHints.test.ts`, add test cases:
  - (a) `formatJobError` with a `soundfile` `ModuleNotFoundError` message returns a string with the Setup Wizard hint.
  - (b) `formatJobError` with an unrelated error string returns the string unchanged.
  - (c) `formatJobError` with a `demucs`-related error still returns the hint (regression guard).

  **Inputs:** `src/lib/__tests__/errorHints.test.ts`, `src/lib/errorHints.ts`

  **Outputs / Deliverables:** Extended `errorHints.test.ts` with 3+ new test cases.

  **Acceptance Criteria:** `npm run test:unit` passes.

  **Dependencies:** TASK-007.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-016 — Add unit tests for `settingsStore` default model change**

  **Description:** In `src/stores/__tests__/settingsStore.test.ts`, add a test that:
  1. Imports the fresh store and reads the initial `defaultModel` value.
  2. Asserts it equals `"demucs"` (not `"bs_roformer"`).
  3. Calls `setDefaultModel("bs_roformer")` and asserts the store updates correctly.
  4. Calls `setDefaultModel("demucs")` again and asserts the store reverts.

  **Inputs:** `src/stores/__tests__/settingsStore.test.ts`, `src/stores/settingsStore.ts`

  **Outputs / Deliverables:** Extended `settingsStore.test.ts`.

  **Acceptance Criteria:** `npm run test:unit` passes.

  **Dependencies:** TASK-004.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-017 — Add regression guard for `DEFAULT_PROCESSING_SETTINGS` in `constants.test.ts`**

  **Description:** In `src/lib/__tests__/constants.test.ts`, add a test that asserts `DEFAULT_PROCESSING_SETTINGS.model === "demucs"`. This acts as a regression guard to prevent the default being silently changed back to a broken model.

  **Inputs:** `src/lib/__tests__/constants.test.ts`

  **Outputs / Deliverables:** Extended `constants.test.ts` with one additional assertion.

  **Acceptance Criteria:** `npm run test:unit` passes.

  **Dependencies:** TASK-004.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

### PHASE 5 — Test Coverage Improvements (Rust)

---

- [x] **TASK-018 — Add Rust unit tests for dynamic `collect_stems()`**

  **Description:** In `src-tauri/src/commands/sidecar.rs` (test module at the bottom), add:
  - (a) `test_collect_stems_non_standard_names` — creates `track_guitar.wav` and `track_piano.wav` in a temp dir, calls `collect_stems()`, asserts two results with `stem_type` `"guitar"` and `"piano"`.
  - (b) `test_collect_stems_standard_names_still_work` — existing four-stem test remains valid after the refactor.
  - (c) `test_collect_stems_no_files_returns_error` — temp dir is empty, asserts `Err`.

  **Inputs:** `src-tauri/src/commands/sidecar.rs`

  **Outputs / Deliverables:** Extended test module with 3 new unit tests.

  **Acceptance Criteria:** `cargo test` in `src-tauri/` exits `0` with all new tests passing.

  **Dependencies:** TASK-008.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** Requires Rust toolchain.

---

- [x] **TASK-019 — Add Rust unit test for structured JSON error extraction from stderr**

  **Description:** In `src-tauri/src/commands/sidecar.rs`, add a unit test that exercises the JSON-extraction helper introduced in TASK-010:
  - (a) Input: `stderr_tail = '{"status":"error","error":"my structured error"}'` → asserts the returned error string is `"my structured error"`.
  - (b) Input: `stderr_tail = "plain traceback text"` → asserts the returned string is `"plain traceback text"`.
  - (c) Input: `stderr_tail = '{invalid json}'` → asserts the fallback raw string is returned.

  **Inputs:** `src-tauri/src/commands/sidecar.rs`

  **Outputs / Deliverables:** Extended test module with 3 new unit tests for JSON error extraction.

  **Acceptance Criteria:** `cargo test` exits `0`.

  **Dependencies:** TASK-010.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** Requires Rust toolchain.

---

### PHASE 6 — CI Pipeline & Coverage Thresholds

---

- [x] **TASK-020 — Add `soundfile` import check to Python CI dependency installation**

  **Description:** In `.github/workflows/ci.yml`, in the Python job's `pip install` step, add `soundfile` to the installation command so that CI tests can import it. Also add a post-install verification step: `python -c "import soundfile; import demucs; print('Deps OK')"` and fail the job if that command fails.

  **Inputs:** `.github/workflows/ci.yml`

  **Outputs / Deliverables:** Updated `ci.yml` Python job.

  **Acceptance Criteria:** The CI Python job installs `soundfile` without error. The verification step prints `"Deps OK"`. No existing steps are removed.

  **Dependencies:** TASK-001.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None (YAML edit only).

---

- [x] **TASK-021 — Raise vitest coverage thresholds to reflect improved test suite**

  **Description:** After all Phase 3–5 tests are added and passing, update `vitest.config.ts` `coverage.thresholds` to the highest values that all tests currently achieve (run `npm run test:unit -- --coverage` to measure). The new thresholds must be at least: `lines ≥ 55`, `functions ≥ 70`, `branches ≥ 72`, `statements ≥ 55`. Do not set thresholds higher than the current actual values or CI will fail.

  **Inputs:** `vitest.config.ts`, output of `npm run test:unit -- --coverage`

  **Outputs / Deliverables:** Updated `vitest.config.ts` with raised thresholds.

  **Dependencies:** TASK-014, TASK-015, TASK-016, TASK-017.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-022 — Add Python pytest coverage reporting to CI**

  **Description:** In `.github/workflows/ci.yml`, update the Python test step to collect coverage: replace `pytest tests/ -m "not integration" --tb=short -v` with `pytest tests/ -m "not integration" --tb=short -v --cov=stemgen_sidecar --cov-report=term-missing --cov-fail-under=40`. This enforces a minimum 40% line coverage baseline on the sidecar. Update `python/requirements-dev.txt` to add `pytest-cov` if not already present.

  **Inputs:** `.github/workflows/ci.yml`, `python/requirements-dev.txt`

  **Outputs / Deliverables:** Updated `ci.yml` Python job and `requirements-dev.txt`.

  **Acceptance Criteria:** CI Python job exits `0` and prints a coverage report. If coverage drops below 40% the job fails.

  **Dependencies:** TASK-012.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

### PHASE 7 — UI / UX Hardening

---

- [x] **TASK-023 — Display a warning banner in the GUI when `bs_roformer` is selected as active model**

  **Description:** In the Settings panel (or model selector component), display a visible inline warning when the user selects `bs_roformer` as their model: *"BS-RoFormer local inference is not yet supported. Choose Demucs, HT-Demucs, or HT-Demucs FT for local processing, or enable a cloud provider."* The warning should appear immediately on selection, not only after a failed job. Use the existing `AlertDialog` or a yellow/amber inline banner consistent with the existing UI design system. The `bs_roformer` option should remain selectable (for cloud provider use cases) but the warning must be visible.

  **Inputs:** `src/components/settings/` (model selector), `src/components/ui/`

  **Outputs / Deliverables:** Updated settings component with conditional `bs_roformer` warning.

  **Acceptance Criteria:**
  1. Selecting `bs_roformer` in the settings UI shows the warning text.
  2. Selecting `demucs`, `htdemucs`, or `htdemucs_ft` does not show the warning.
  3. `npm run test:unit` passes.
  4. TypeScript compilation passes.

  **Dependencies:** TASK-004.

  **Estimated Complexity:** Medium.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-024 — Show actionable "Open Setup Wizard" button in job error messages**

  **Description:** The `formatJobError()` function already appends the text `"— Open Setup Wizard to install missing dependencies."` when a dependency keyword is detected. However, in the processing queue UI this is rendered as plain text with no clickable action. Update the job error display component (identify it via the rendering of `error_message` from the queue store) to:
  1. Detect the Setup Wizard hint suffix in the error string.
  2. Strip the hint suffix from the displayed text.
  3. Append a small "Open Setup Wizard" button that invokes the existing `openSetupWizard()` action from the app store.

  **Inputs:** `src/components/processing/` or `src/components/queue/` (job error display), `src/stores/appStore.ts`

  **Outputs / Deliverables:** Updated processing/queue component with actionable button.

  **Acceptance Criteria:**
  1. When a job has an error containing the hint suffix, the UI shows the clean error text and a button.
  2. Clicking the button triggers the `openSetupWizard()` store action.
  3. `npm run test:unit` passes.

  **Dependencies:** TASK-007.

  **Estimated Complexity:** Medium.

  **Privilege / Tooling Requirements:** None.

---

### PHASE 8 — Documentation

---

- [x] **TASK-025 — Update `CHANGELOG.md` with all bug fixes and improvements**

  **Description:** Add a new version entry at the top of `CHANGELOG.md` (use the next logical semver — if current is `0.x.y`, bump to `0.x.y+1` or `0.(x+1).0` depending on scope). The entry must list every bug fix (BUG-01 through BUG-08 with one-sentence summaries), the new test coverage improvements, and the UI/UX changes introduced in this task list.

  **Inputs:** `CHANGELOG.md`

  **Outputs / Deliverables:** Updated `CHANGELOG.md` with a new version entry.

  **Acceptance Criteria:** The new entry is the first non-comment block in the file. It includes all bug fix IDs and a "Test Coverage" section.

  **Dependencies:** All prior phases.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

- [x] **TASK-026 — Update `README.md`: document supported models and known limitations**

  **Description:** In `README.md`, update or add an "AI Models" section that clearly states:
  - `demucs`, `htdemucs`, `htdemucs_ft` are fully supported for local CPU/GPU inference.
  - `bs_roformer` is available for cloud inference (`fal`, `replicate`) but local inference is not yet implemented.

  Also add a "Troubleshooting" subsection listing the most common errors (`soundfile` missing, Python not found) and their remedies.

  **Inputs:** `README.md`

  **Outputs / Deliverables:** Updated `README.md`.

  **Acceptance Criteria:** The README contains an "AI Models" table with a "Local Support" column, and a "Troubleshooting" section with at least the `soundfile` and Python-not-found entries.

  **Dependencies:** TASK-025.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

### PHASE 9 — Release Preparation & Merge

---

- [x] **TASK-027 — Bump version in `package.json` and `Cargo.toml`**

  **Description:** Update the `version` field in both `package.json` and `src-tauri/Cargo.toml` (and `src-tauri/tauri.conf.json` if a `version` field is present there) to the new version decided in TASK-025. The three files must all carry the same version string.

  **Inputs:** `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`

  **Outputs / Deliverables:** Updated version fields in all three files.

  **Acceptance Criteria:** `node -e "console.log(require('./package.json').version)"` matches the `CHANGELOG.md` entry version. `cargo metadata --format-version 1 | jq -r '.packages[] | select(.name=="stemgen-gui") | .version'` matches.

  **Dependencies:** TASK-025.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** None.

---

- [ ] **TASK-028 — Open Pull Request from `fix/wizard-models-bugs` → `main` and verify CI**

  **Description:**
  1. Push the final commit of TASK-027 to `origin/fix/wizard-models-bugs`.
  2. Open a Pull Request targeting `main`. Title: `"fix: separation pipeline bugs, default model, test coverage (BUG-01 through BUG-08)"`.
  3. PR description must reference every Task ID and Bug ID.
  4. Wait for all CI jobs (frontend, python, rust) to pass. If any fail, fix them on the branch before proceeding.
  5. Request review and merge only after CI is fully green.

  **Inputs:** All committed changes on `fix/wizard-models-bugs`.

  **Outputs / Deliverables:** Merged PR on `main`. All CI jobs green.

  **Acceptance Criteria:** GitHub shows `CI: passed` on the merge commit of `main`. No regressions in any CI job.

  **Dependencies:** TASK-027 and all prior tasks.

  **Estimated Complexity:** Low.

  **Privilege / Tooling Requirements:** Requires repository write access and PR review.

---

## Verification & Release

The following checks must all pass before the branch is merged and a release is tagged.

1. **End-to-end smoke test (Windows)** — on a clean Windows 10 machine with no prior stemgen installation, install the app, run the Setup Wizard, then process a short `.wav` file using the default model (Demucs / CPU). Confirm four stem WAV files are created and all are playable, with zero error dialogs.
2. **End-to-end smoke test (macOS + Linux)** — repeat on macOS (Apple Silicon, MPS path) and Linux (CPU path) to confirm cross-platform correctness.
3. **bs_roformer warning test** — select BS-RoFormer as the model in Settings and confirm the inline warning banner is visible. Attempt to start a local separation job and confirm the structured JSON error message is displayed in the GUI (not a raw traceback).
4. **Drag-and-drop test** — drag a supported audio file onto the FileBrowser panel and confirm the file is accepted and added to the queue.
5. **GUI verification** — confirm the GUI renders correctly including: very long model names, missing optional fields, non-ASCII source paths (e.g. `été.wav`), and paths with spaces.
6. **Unit test suite** — run `npm run test:unit -- --coverage` and confirm all tests pass and all four coverage thresholds are met.
7. **Python sidecar tests** — run `cd python && pytest tests/ -m "not integration" --cov=stemgen_sidecar --cov-fail-under=40` and confirm all tests pass.
8. **Rust tests** — run `cargo test` in `src-tauri/` and confirm all tests pass.
9. **TypeScript type check** — run `npm run check` and confirm zero type errors.
10. **Lint** — run `npm run lint` and confirm zero lint errors.
11. **`install_manifest.json` validation** — run `python -m json.tool src-tauri/resources/install_manifest.json` and confirm the file is valid JSON with `soundfile`, `librosa`, and `mutagen` entries present.
12. **Update CHANGELOG and bump version** — confirm TASK-025 and TASK-027 are done and the version is consistent across all three files.
13. **Tag the release** — create a Git tag matching the new version (e.g. `v0.x.y`) and push it. Write release notes summarising every bug fix, test improvement, and UI change.
14. **GitHub CI/CD verification** — confirm that both the CI pipeline and the release/CD pipeline run successfully on GitHub Actions after the tag is pushed. If any pipeline job fails, iterate until both are fully green before announcing the release.

---

## Operational Constraints

- **Pause-and-ask policy**: If at any point the AI agent needs elevated privileges, access to external services, new library installations, additional MCP server connections, API keys, or anything beyond its current sandbox capabilities, it must **immediately stop execution, clearly describe what it needs and why, and wait for explicit approval** before continuing.
- **Incremental commits**: each task must be committed separately with a descriptive commit message referencing the Task ID (e.g. `"fix(sidecar): remove dead soundfile import in run_bs_roformer [TASK-002]"`), so progress is reviewable and reversible.
- **No silent failures**: any error must surface explicitly in the GUI and logs — never silently swallowed or defaulted to an empty value.
- **Test-before-merge discipline**: no task is considered complete until its associated acceptance criteria tests pass locally. Do not merge tasks whose tests are still failing.
- **Do not modify `main` directly**: all changes go through the `fix/wizard-models-bugs` branch and the PR process defined in TASK-028.
- **JSON validity**: every modification to `install_manifest.json` must be validated with `python -m json.tool` before committing.