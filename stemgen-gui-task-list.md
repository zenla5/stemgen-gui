# Stemgen GUI — Bug Fixes, Quality Improvements & Installer Enhancement Task List

## Objective(s)

This document addresses three categories of work identified through a full code audit of the `stemgen-gui` repository (Tauri v2 + React frontend, Rust backend, Python sidecar):

1. **Two confirmed bugs** causing broken drag-and-drop file import and a hard crash (`exit code: Some(1)`) whenever a local separation job is started (e.g. DEMUCS on CPU).
2. **General project quality and test coverage improvements** — the existing test suite covers serialization and store logic well, but leaves the separation pipeline, sidecar invocation, and the drag-and-drop path almost entirely untested.
3. **Installation wizard enhancement** — the Windows NSIS/MSI installer does not check for runtime dependencies (Python, FFmpeg, etc.) at install time; users only discover missing prerequisites after launching the app for the first time.

All tasks are designed to be executed by AI coding agents on a new feature branch (`fix/bugs-quality-installer`). Each task is self-contained, has a clear acceptance criterion, and references only files already present in the repository.

---

## Step-by-Step Implementation Task List for AI Agents

---

### PHASE 0 — Branch & Scaffolding

---

- [x] **TASK-001 — Create feature branch**

  **Description**: From the latest `main`, create a new Git branch named `fix/bugs-quality-installer`. This branch will contain all commits for this task list. Do not modify `main` directly.

  **Inputs**: Current `main` HEAD.

  **Outputs / deliverables**: Branch `fix/bugs-quality-installer` exists locally and is pushed to `origin`.

  **Acceptance criteria**: `git branch --show-current` outputs `fix/bugs-quality-installer`. CI pipeline starts on push.

  **Dependencies**: None.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None beyond standard `git` access.

---

### PHASE 1 — Bug Fix: Drag-and-Drop File Import

Root cause: In `src/components/file-browser/FileBrowser.tsx`, the Tauri v2 `listen()` callback receives a full `Event<T>` wrapper object, but the handler accesses `event.paths` directly. In Tauri v2, the actual payload is nested at `event.payload`. The handler is also mis-typed as receiving `DragDropPayload` instead of a Tauri `Event<DragDropPayload>`, so `event.paths` is always `undefined` and no files are ever processed.

---

- [x] **TASK-002 — Fix drag-and-drop event payload access in FileBrowser**

  **Description**: In `src/components/file-browser/FileBrowser.tsx`:

  1. Import the Tauri `Event` type from `@tauri-apps/api/event` alongside `listen`.
  2. Change the type signature of the `tauri://drag-drop` handler from `(event: DragDropPayload)` to `(event: Event<DragDropPayload>)` (or the equivalent `{ payload: DragDropPayload }` inline type).
  3. Update the payload access from `event.paths` to `event.payload.paths` in all three locations inside the handler body.
  4. Verify the `tauri://drag-enter` and `tauri://drag-leave` handlers do not need payload access (they do not — no change required there).
  5. Ensure the `DragDropPayload` interface still accurately reflects the Tauri v2 drag-drop event shape: `{ paths: string[]; position?: { x: number; y: number } }`.

  **Inputs**: `src/components/file-browser/FileBrowser.tsx`

  **Outputs / deliverables**: Updated `FileBrowser.tsx` where drag-drop events correctly read `event.payload.paths`.

  **Acceptance criteria**:
  - Unit test (added in TASK-003) passes.
  - Manual check on Windows 10: dragging a `.wav` or `.mp3` file onto the drop zone causes it to appear in the file list.
  - No TypeScript compiler errors (`npx tsc --noEmit`).

  **Dependencies**: TASK-001.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None.

---

- [x] **TASK-003 — Add unit tests for FileBrowser drag-and-drop event handling**

  **Description**: In `src/components/file-browser/__tests__/FileBrowser.test.tsx` (create if absent):

  1. Mock `@tauri-apps/api/event`'s `listen` to capture handlers by event name.
  2. Mock `@tauri-apps/api/core`'s `invoke` to return a fake `AudioFileMetadata` object for `get_audio_info`.
  3. Write a test that simulates a `tauri://drag-drop` event by calling the captured handler with `{ payload: { paths: ['/tmp/test.wav'] } }` and asserts that the file appears in the rendered file list.
  4. Write a second test confirming that a `tauri://drag-drop` event with `{ paths: ['/tmp/test.wav'] }` (old, wrong shape — no `payload` wrapper) does NOT add a file to the list (regression guard).
  5. Write a test for `tauri://drag-enter` that asserts the drop zone gains the active/highlighted CSS class.
  6. Write a test for `tauri://drag-leave` that asserts the drop zone loses the active class.

  **Inputs**: `src/components/file-browser/FileBrowser.tsx`, Vitest + React Testing Library (already configured in `vitest.config.ts`).

  **Outputs / deliverables**: `src/components/file-browser/__tests__/FileBrowser.test.tsx`.

  **Acceptance criteria**: `npx vitest run src/components/file-browser/__tests__/FileBrowser.test.tsx` passes all tests with 0 failures.

  **Dependencies**: TASK-002.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: None.

---

### PHASE 2 — Bug Fix: Separation Process Exits with Code 1

Root cause analysis (multiple bugs in `python/stemgen_sidecar.py`, function `_run_demucs_model`):

**Bug A**: `AudioFile(input_path).read(streams=0)` — In demucs 4.x the `read()` method's first positional keyword is `stems` (not `streams`) and it returns a `torch.Tensor` of shape `(channels, samples)` when resampled to `model.samplerate`. The call also omits the required `samplerate` and `channels` arguments, so the returned tensor may have the wrong sample rate and channel count for the model.

**Bug B**: `mix = wav[0]` — `wav` is already a `(channels, samples)` tensor. `wav[0]` selects the first channel, producing a `(samples,)` 1-D tensor instead of the full stereo tensor.

**Bug C**: `if mix.shape[0] > 2: mix = mix.mean(0)` — After Bug B, `mix.shape[0]` is the number of audio *samples* (e.g. 2 205 000), always >> 2. This mean collapses the entire audio to a scalar, destroying all signal.

**Bug D**: `mix = torch.from_numpy(mix).to(run_device)` — `wav` from `AudioFile.read()` is already a `torch.Tensor`; calling `torch.from_numpy()` on a tensor raises a `TypeError`, which is the direct cause of `exit code: Some(1)`.

**Bug E**: `mix = mix[None, None, ...]` — Even if Bugs A–D were fixed, this would produce shape `(1, 1, samples)`. `apply_model` requires `(batch=1, channels=2, samples)`. The correct form is `mix[None]` (adds one batch dimension to a `(channels, samples)` tensor).

**Bug F**: `source_names = model.sources` is computed but never used; stem output is indexed against the hardcoded list `["drums", "bass", "other", "vocals"]` regardless of what the loaded model reports. This silently produces wrong results for models with non-standard source ordering.

**Bug G (Rust side)**: In `src-tauri/src/commands/sidecar.rs`, `PYTHONUTF8=1` is set only when probing the Python version (`detect_python`), but **not** when spawning the actual separation subprocess. On Windows with non-ASCII file paths this can cause `UnicodeDecodeError` in the sidecar, another path to exit code 1.

---

- [x] **TASK-004 — Fix `_run_demucs_model` audio loading (Bugs A, B, C, D, E)**

  **Description**: Replace the entire "Apply model" block in `_run_demucs_model` (lines roughly 119–139 of `python/stemgen_sidecar.py`) with the correct demucs 4.x API:

  ```python
  # Load audio resampled to model's sample rate and channel count
  wav = AudioFile(input_path).read(
      stems=0,
      samplerate=model.samplerate,
      channels=model.audio_channels,
  )
  # wav is already a torch.Tensor of shape (channels, samples)
  source = str(input_path.stem)

  emit({
      "status": "progress",
      "stage": "separating",
      "progress": 0.3,
      "message": "Running AI separation...",
  })

  with torch.no_grad():
      # wav: (channels, samples) — move to device and normalise
      wav = wav.to(run_device)
      ref = wav.mean(0)
      wav = (wav - ref.mean()) / (ref.std() + 1e-8)
      # apply_model expects (batch, channels, samples)
      sources = apply_model(
          model, wav[None], device=run_device, shifts=shifts, progress=False
      )[0]
  ```

  Remove the now-redundant intermediate `mix` variable entirely.

  **Inputs**: `python/stemgen_sidecar.py`

  **Outputs / deliverables**: Updated `stemgen_sidecar.py`.

  **Acceptance criteria**:
  - `python/tests/test_sidecar_cli.py` (updated in TASK-006) passes.
  - Running `python stemgen_sidecar.py --model demucs --input tests/fixtures/audio/test-short.wav --output /tmp/stems --device cpu` in an environment with demucs installed exits with code 0 and produces four `.wav` files.

  **Dependencies**: TASK-001.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: Requires a Python environment with `demucs`, `torch`, `torchaudio` installed to verify. Agent must stop and ask if these are not available in its sandbox.

---

- [x] **TASK-005 — Fix stem source-name mapping (Bug F)**

  **Description**: In `_run_demucs_model`, replace the hardcoded `stem_names = ["drums", "bass", "other", "vocals"]` with `model.sources` so that the output files always match what the loaded model actually produced:

  ```python
  # Use model-reported source names instead of hardcoded list
  stem_names = list(model.sources)
  ```

  Also update the saving loop to zip `enumerate(stem_names)` directly rather than the old parallel-index pattern, to keep the model source index and output name in lock-step.

  If `model.sources` contains more or fewer than four stems, the saving loop should still succeed — the `stems` dict returned may have more or fewer keys. Document this in a code comment.

  **Inputs**: `python/stemgen_sidecar.py`

  **Outputs / deliverables**: Updated `stemgen_sidecar.py`.

  **Acceptance criteria**: The output dict keys in the `done` JSON line exactly match `model.sources` for the loaded model. Verified by the test added in TASK-006.

  **Dependencies**: TASK-004.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None beyond TASK-004 environment.

---

- [x] **TASK-006 — Add Python sidecar unit tests for demucs audio-loading path**

  **Description**: In `python/tests/test_sidecar_cli.py`, add a new test class `TestRunDemucsModel` with the following tests:

  1. `test_audio_file_read_returns_tensor` — mock `demucs.audio.AudioFile` to return a `torch.zeros(2, 44100)` tensor (stereo, 1 s) and assert that after the loading block, the variable is still a `torch.Tensor` (not a numpy array). This guards against regression of Bug D.
  2. `test_mix_shape_is_batch_channels_samples` — after the loading and normalisation block, assert that the tensor passed to `apply_model` has ndim == 3 and shape[1] == `model.audio_channels`. This guards against Bugs B, C, and E.
  3. `test_stem_names_match_model_sources` — mock `model.sources` as `["drums", "bass", "other", "vocals"]` and assert the returned `stems` dict has exactly those keys.
  4. `test_sidecar_cli_cpu_exit_zero` — an integration test that calls `stemgen_sidecar.py` as a subprocess with `--model demucs --input python/tests/fixtures/test-short.wav --output <tmpdir> --device cpu` and asserts exit code 0 and the existence of four `.wav` output files. Mark with `@pytest.mark.integration` so it can be skipped in CI environments without a GPU/model cache.

  **Inputs**: `python/tests/test_sidecar_cli.py`, `python/pytest.ini`, fixture audio files in `tests/fixtures/audio/`.

  **Outputs / deliverables**: Updated `test_sidecar_cli.py`; updated `pytest.ini` to register the `integration` marker.

  **Acceptance criteria**: `pytest python/tests/test_sidecar_cli.py -m "not integration"` passes. Integration test passes in an environment with demucs installed.

  **Dependencies**: TASK-004, TASK-005.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: Integration test requires `demucs`. Agent must skip/mark the integration test rather than block if not available.

---

- [x] **TASK-007 — Set `PYTHONUTF8=1` on the sidecar spawn command (Bug G)**

  **Description**: In `src-tauri/src/commands/sidecar.rs`, add `.env("PYTHONUTF8", "1")` to the `Command` builder that spawns the actual separation subprocess (the block starting at `let mut cmd = Command::new(python_path)`), immediately before the `.no_window()` call. This mirrors the existing env-var already set during `detect_python` version probing. The env var forces Python's stdout/stderr to UTF-8 regardless of the Windows system locale, preventing `UnicodeDecodeError` on paths containing non-ASCII characters (e.g. accented folder names).

  **Inputs**: `src-tauri/src/commands/sidecar.rs`

  **Outputs / deliverables**: Updated `sidecar.rs`.

  **Acceptance criteria**:
  - `cargo test` in `src-tauri/` passes.
  - Processing a file located at a path with accented or CJK characters (e.g. `C:\Musique\été\track.wav`) does not produce a sidecar error related to encoding. Verified by the test added in TASK-008.

  **Dependencies**: TASK-001.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: Rust toolchain.

---

- [x] **TASK-008 — Add Rust test for UTF-8 env var presence on sidecar spawn**

  **Description**: In `src-tauri/src/commands/sidecar.rs`'s `#[cfg(test)]` block, add a test `test_sidecar_spawn_sets_pythonutf8` that:

  1. Constructs a `Command` using the same builder pattern as `run_separation`.
  2. On non-Windows platforms, spawns `env` (prints environment variables) and asserts `PYTHONUTF8=1` appears in stdout.
  3. On Windows, spawns `cmd /C set PYTHONUTF8` and asserts the output contains `PYTHONUTF8=1`.

  Additionally, add a test `test_sidecar_error_message_surfaced` that runs the sidecar with a non-existent input file and asserts that the `Err` string returned by `run_separation` is non-empty and contains a meaningful message (not just an exit code).

  **Inputs**: `src-tauri/src/commands/sidecar.rs`

  **Outputs / deliverables**: Updated `sidecar.rs` test module.

  **Acceptance criteria**: `cargo test -p stemgen-gui` passes.

  **Dependencies**: TASK-007.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: Rust toolchain.

---

### PHASE 3 — General Quality & Test Coverage

---

- [x] **TASK-009 — Add error-display tests for separation failure in appStore**

  **Description**: In `src/stores/__tests__/appStore.test.ts`, add tests that verify the processing pipeline surfaces errors to the UI:

  1. Mock `invoke('start_separation')` to reject with `"Separation process failed with exit code: Some(1)"`.
  2. Start processing and assert that the job's `status` becomes `"failed"` and `error_message` is non-empty.
  3. Assert the error text is exposed on the `ProcessingJob` object (not silently swallowed).
  4. Assert that after failure, `isProcessing` becomes `false` and the button re-enables.

  **Inputs**: `src/stores/__tests__/appStore.test.ts`, `src/stores/appStore.ts`

  **Outputs / deliverables**: Extended `appStore.test.ts`.

  **Acceptance criteria**: `npx vitest run src/stores/__tests__/appStore.test.ts` passes.

  **Dependencies**: TASK-001.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: None.

---

- [x] **TASK-010 — Add ProcessingQueue component tests for error state display**

  **Description**: Create `src/components/processing/__tests__/ProcessingQueue.test.tsx`:

  1. Render `ProcessingQueue` with a job in `"failed"` status and a non-empty `error_message`.
  2. Assert that the error message text is visible in the rendered output.
  3. Assert that the "Start Processing" button is re-enabled (not disabled) after all jobs are failed/completed.
  4. Assert that a job in `"processing"` state shows a loading indicator.
  5. Assert that the `"Cancel All"` button appears only while `isProcessing` is `true`.

  **Inputs**: `src/components/processing/ProcessingQueue.tsx`, `src/stores/appStore.ts`

  **Outputs / deliverables**: `src/components/processing/__tests__/ProcessingQueue.test.tsx`.

  **Acceptance criteria**: All tests pass via `npx vitest run`.

  **Dependencies**: TASK-001.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: None.

---

- [x] **TASK-011 — Improve error message forwarded from sidecar stderr to UI**

  **Description**: Currently, when the sidecar exits non-zero, `sidecar.rs` returns `"Separation process failed with exit code: Some(1)"` — the raw exit code with no additional context. Improve this by:

  1. In `sidecar.rs`, collect the last 20 lines of sidecar stderr into a `String` buffer (a `Vec<String>` appended to in the stderr-reading `tokio::spawn` task, shared via `Arc<Mutex<Vec<String>>>`).
  2. When the process exits non-zero, include those stderr lines in the `anyhow` error message: `"Separation failed (exit {code}): {stderr_tail}"`.
  3. In `separation.rs` (`start_separation`), forward the full error string returned by `sidecar.run_separation` as-is — do not truncate or wrap it.
  4. In `src/stores/appStore.ts`, store the full error string on the failed `ProcessingJob` as `error_message`.
  5. In `ProcessingQueue.tsx`, render `job.error_message` below the failed job row (collapsed by default, expandable with a "Details" toggle button).

  **Inputs**: `src-tauri/src/commands/sidecar.rs`, `src-tauri/src/commands/separation.rs`, `src/stores/appStore.ts`, `src/components/processing/ProcessingQueue.tsx`

  **Outputs / deliverables**: Updated files across Rust and TypeScript layers; a visible error-detail UI in the processing queue.

  **Acceptance criteria**:
  - When a separation fails, the GUI shows a human-readable error (including Python traceback tail if available) instead of a bare exit code.
  - `cargo test` and `npx vitest run` both pass.

  **Dependencies**: TASK-007.

  **Estimated complexity**: High.

  **Privilege / tooling requirements**: None beyond Rust toolchain.

---

- [x] **TASK-012 — Add Python sidecar dependency-check integration test**

  **Description**: In `python/tests/test_sidecar_cli.py`, add a test `test_check_dependencies_passes_when_packages_present` that:

  1. Imports `stemgen_sidecar` and calls `check_dependencies()` directly.
  2. In environments where `torch`, `torchaudio`, and `demucs` are installed, asserts the function returns `True`.
  3. In environments where one package is missing (mocked via `sys.modules` manipulation), asserts `False` is returned and the emitted JSON contains `"status": "error"` with a non-empty `"error"` key.

  **Inputs**: `python/stemgen_sidecar.py`, `python/tests/test_sidecar_cli.py`

  **Outputs / deliverables**: Extended test file.

  **Acceptance criteria**: `pytest python/tests/` passes (with integration tests skipped if packages absent).

  **Dependencies**: TASK-001.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None.

---

- [x] **TASK-013 — Add Rust unit tests for `collect_stems` edge cases**

  **Description**: In `src-tauri/src/commands/sidecar.rs` test block, add tests for `SidecarManager::collect_stems`:

  1. `test_collect_stems_returns_only_existing_files` — create a temp dir, write only `test_drums.wav` and `test_vocals.wav`, call `collect_stems`, assert exactly 2 stems returned and no error.
  2. `test_collect_stems_errors_when_empty` — call `collect_stems` on an empty temp dir, assert it returns `Err` containing "No stem files were generated".
  3. `test_collect_stems_handles_unicode_source_name` — write `été_drums.wav` etc., assert they are found. (Guards TASK-007 regression.)

  **Inputs**: `src-tauri/src/commands/sidecar.rs`

  **Outputs / deliverables**: Extended test module.

  **Acceptance criteria**: `cargo test` passes.

  **Dependencies**: TASK-001.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: Rust toolchain.

---

- [x] **TASK-014 — Extend CI pipeline to run Python sidecar tests**

  **Description**: In `.github/workflows/ci.yml`, add a `python-tests` job that:

  1. Runs on `ubuntu-latest`.
  2. Sets up Python 3.11 via `actions/setup-python`.
  3. Installs `pip install -r python/requirements-dev.txt`.
  4. Runs `pytest python/tests/ -m "not integration" --tb=short` and fails the job on non-zero exit.
  5. Uploads pytest output as an artifact on failure.

  Ensure the job is listed as a required check so that PRs cannot be merged if Python tests fail.

  **Inputs**: `.github/workflows/ci.yml`

  **Outputs / deliverables**: Updated `ci.yml`.

  **Acceptance criteria**: Pushing the branch triggers the new job in GitHub Actions; it passes on a clean run.

  **Dependencies**: TASK-006, TASK-012.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: GitHub Actions access to edit workflow files. No secrets required for the non-integration tests.

---

- [x] **TASK-015 — Add E2E test for file import via Open Files dialog**

  **Description**: In `src/__tests__/e2e/binary/file-import.spec.ts`, add a test `should add file via open-files dialog` that:

  1. Launches the packaged app.
  2. Clicks the "Open Files" button (`data-testid="open-files-btn"`).
  3. Selects the fixture file `tests/fixtures/audio/test-short.wav` via the native dialog (use `wdio` or Playwright automation for the OS dialog, as already configured in `wdio.conf.ts`).
  4. Asserts that the file list (`data-testid="file-list"`) contains one entry with the filename `test-short.wav`.
  5. Asserts the "Start Processing (1 file)" button is enabled.

  **Inputs**: `src/__tests__/e2e/binary/file-import.spec.ts`, `wdio.conf.ts`, `tests/fixtures/audio/test-short.wav`

  **Outputs / deliverables**: Extended E2E spec.

  **Acceptance criteria**: Test passes in the E2E suite (`npm run test:e2e` or equivalent).

  **Dependencies**: TASK-002.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: Packaged binary must be available; agent must stop and ask if binary build is not possible in sandbox.

---

### PHASE 4 — Installer Dependency Check Wizard (Windows)

The goal is to add a **dependency-check page** to the Windows NSIS installer that detects missing prerequisites and offers to install them automatically via `winget` or `choco`. A parallel "first-run" in-app check already exists (`FirstRunWizard.tsx`) but does not trigger during installation.

---

- [x] **TASK-016 — Research and document NSIS custom-page approach for Tauri**

  **Description**: Before writing NSIS script code, the agent must:

  1. Read `src-tauri/tauri.conf.json` and `.github/workflows/release.yml` to understand exactly how the NSIS bundle is generated (via `tauri build --bundles nsis`).
  2. Determine whether Tauri's NSIS bundler supports a `preinstall_script` hook or custom NSIS pages (check Tauri documentation at https://tauri.app and Tauri's NSIS plugin docs — **agent must use web search**).
  3. Identify the correct mechanism: either a Tauri-supported NSIS script hook or a post-build step that patches the generated `.nsi` script before compilation.
  4. Write a short design note (added as `docs/INSTALLER_DEPENDENCY_CHECK.md`) describing the chosen approach, the NSIS page sequence, and any limitations.

  **Inputs**: `src-tauri/tauri.conf.json`, `.github/workflows/release.yml`, Tauri documentation (via web).

  **Outputs / deliverables**: `docs/INSTALLER_DEPENDENCY_CHECK.md`.

  **Acceptance criteria**: The design note is reviewed and approved before TASK-017 begins. Agent must stop and present the note for human approval before proceeding.

  **Dependencies**: TASK-001.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: Web search access to read current Tauri docs. **Agent must pause and present findings before continuing.**

---

- [x] **TASK-017 — Implement NSIS dependency-check page or post-install launcher**

  **Description**: Based on the approved approach from TASK-016, implement the dependency-check mechanism. The canonical implementation (assuming Tauri's NSIS hook support or a post-build script) must:

  1. **Detect Python**: Run `python --version` (or `py --version`) silently; if exit code is non-zero, flag as missing.
  2. **Detect FFmpeg**: Run `ffmpeg -version` silently; if exit code is non-zero, flag as missing.
  3. **Show a summary page** listing detected and missing dependencies with coloured status indicators (green tick / red cross).
  4. **Offer auto-install**: For each missing dependency, show a checkbox (pre-checked) and a "Install Missing" button. When clicked, attempt install via `winget install --id <package> --silent --accept-package-agreements --accept-source-agreements` (preferred) or `choco install <package> -y` (fallback). Use the same `install_manifest.json` package IDs already defined in `src-tauri/resources/install_manifest.json`.
  5. **Re-check after install**: After the install commands complete, re-run the detection commands and update the status display.
  6. **Allow skip**: Provide a "Skip for now" button that proceeds to the standard completion page without blocking installation.
  7. **Log outcome**: Write a brief install log to `%TEMP%\stemgen-setup-deps.log`.

  If the Tauri NSIS hook is not available, implement this as a `post-install-check.ps1` PowerShell script bundled with the installer that is registered as a `Run` key in `HKCU` for single execution on first login, and update `release.yml` to include the script in the bundle.

  **Inputs**: `src-tauri/resources/install_manifest.json`, `src-tauri/tauri.conf.json`, `.github/workflows/release.yml`, `docs/INSTALLER_DEPENDENCY_CHECK.md`.

  **Outputs / deliverables**: NSIS script fragment or PowerShell post-install script; updated `tauri.conf.json` or `release.yml` as needed.

  **Acceptance criteria**:
  - On a clean Windows 10 VM without Python or FFmpeg, running the installer shows the dependency page and successfully installs the missing tools when the user clicks "Install Missing".
  - Clicking "Skip for now" completes the installation without error.
  - The installer does not hang or crash if `winget` is unavailable.

  **Dependencies**: TASK-016.

  **Estimated complexity**: High.

  **Privilege / tooling requirements**: Windows 10 VM or CI runner with NSIS toolchain. **Agent must stop and ask for a Windows build environment if not available.**

---

- [x] **TASK-018 — Expose dependency-install status to the in-app FirstRunWizard**

  **Description**: When the installer has already installed dependencies (TASK-017), the `FirstRunWizard` shown on first app launch should reflect that — it should not re-prompt for dependencies that were installed at setup time.

  1. After a successful installer dependency check, write a marker file `%APPDATA%\Roaming\stemgen-gui\installer_deps_checked.json` containing `{ "python": true/false, "ffmpeg": true/false, "timestamp": "<ISO8601>" }`.
  2. In `FirstRunWizard.tsx`, read this marker file at wizard startup (via a new Tauri command `read_installer_dep_marker` or via the existing `validate_environment` invoke). If the marker is present and both flags are `true`, skip the dependency-check step and go directly to the "ready" step.
  3. If the marker indicates a dependency failed installer-time install, show a specific warning rather than a generic "missing" status.

  **Inputs**: `src/components/setup/FirstRunWizard.tsx`, `src-tauri/src/commands/mod.rs` (to add the new Tauri command if needed), installer script from TASK-017.

  **Outputs / deliverables**: Updated `FirstRunWizard.tsx`; optional new Tauri command; updated installer script.

  **Acceptance criteria**:
  - After a full install with dependencies pre-installed, the wizard completes the dependency check step automatically without user interaction.
  - `npx vitest run src/components/setup/__tests__/FirstRunWizard.test.tsx` passes (add a test case for the "marker present" path).

  **Dependencies**: TASK-017.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: None beyond TASK-017 environment.

---

- [x] **TASK-019 — Add unit tests for FirstRunWizard installer-marker path**

  **Description**: In `src/components/setup/__tests__/FirstRunWizard.test.tsx`:

  1. Add a test where the mocked `read_installer_dep_marker` Tauri command returns `{ python: true, ffmpeg: true }` — assert the wizard shows "Ready" status for both without running the full check.
  2. Add a test where the marker returns `{ python: false, ffmpeg: true }` — assert Python shows a warning state.
  3. Add a test where the marker is absent (command throws) — assert the wizard falls back to the existing dependency-check flow.

  **Inputs**: `src/components/setup/__tests__/FirstRunWizard.test.tsx`, `src/components/setup/FirstRunWizard.tsx`.

  **Outputs / deliverables**: Extended test file.

  **Acceptance criteria**: `npx vitest run src/components/setup/__tests__/FirstRunWizard.test.tsx` passes.

  **Dependencies**: TASK-018.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None.

---

### PHASE 5 — Cross-Cutting Quality

---

- [x] **TASK-020 — Fix TypeScript strict-mode gaps identified during audit**

  **Description**: Run `npx tsc --noEmit --strict` and fix all newly surfaced type errors introduced by the changes in TASK-002 through TASK-019 (e.g. incorrect event types, optional fields accessed without null guards). Do not introduce new `// @ts-ignore` suppressions. Existing pre-audit suppressions may remain unchanged.

  **Inputs**: Entire `src/` TypeScript tree.

  **Outputs / deliverables**: Zero TypeScript errors under `--strict`.

  **Acceptance criteria**: `npx tsc --noEmit --strict` exits 0.

  **Dependencies**: TASK-002, TASK-018.

  **Estimated complexity**: Medium.

  **Privilege / tooling requirements**: None.

---

- [x] **TASK-021 — Add regression test for non-ASCII source file paths**

  **Description**: In `python/tests/test_sidecar_cli.py`, add a test `test_sidecar_handles_accented_path` that:

  1. Copies `tests/fixtures/audio/test-accented-eau.wav` (already present at `tests/fixtures/audio/test-accented-eau.wav`) to a temp dir path containing accented characters (e.g. `<tmpdir>/été/test-accented-eau.wav`).
  2. Invokes the sidecar subprocess with that path and `--device cpu`.
  3. Asserts exit code 0 and four output `.wav` files.
  4. Mark as `@pytest.mark.integration`.

  **Inputs**: `python/tests/test_sidecar_cli.py`, `tests/fixtures/audio/test-accented-eau.wav`.

  **Outputs / deliverables**: Extended test file.

  **Acceptance criteria**: Test passes with demucs installed; is skipped gracefully without it.

  **Dependencies**: TASK-007.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None (non-integration path requires no packages).

---

- [ ] **TASK-022 — Update CHANGELOG and bump version**

  **Description**:

  1. Add a new `## [Unreleased]` or `## [1.4.2]` section to `CHANGELOG.md` documenting:
     - **Fixed**: Drag-and-drop file import broken due to incorrect Tauri v2 event payload access.
     - **Fixed**: Stem separation always exiting with code 1 (five bugs in `_run_demucs_model` audio-loading code).
     - **Fixed**: Non-ASCII file paths causing `UnicodeDecodeError` in the Python sidecar on Windows.
     - **Fixed**: Separation error messages now include Python stderr tail instead of just exit code.
     - **Added**: Dependency check and auto-install step in the Windows installer wizard.
     - **Added**: FirstRunWizard now reads installer dependency-check results to skip redundant checks.
     - **Improved**: Test coverage for drag-and-drop, separation pipeline, sidecar error handling, and installer wizard.
  2. Bump `version` in `src-tauri/Cargo.toml` (and the workspace root `Cargo.toml` if it defines the version) from `1.4.1` to `1.4.2`.
  3. Bump `version` in `package.json` to `1.4.2`.
  4. Run `cargo build` to update `Cargo.lock`.

  **Inputs**: `CHANGELOG.md`, `src-tauri/Cargo.toml`, `Cargo.toml`, `package.json`.

  **Outputs / deliverables**: Updated changelog and version files.

  **Acceptance criteria**: All three version fields read `1.4.2`; changelog entry is present and accurate.

  **Dependencies**: All prior tasks.

  **Estimated complexity**: Low.

  **Privilege / tooling requirements**: None.

---

## Verification & Release

1. **End-to-end smoke test (Windows 10)**: Install the freshly built NSIS installer on a clean Windows 10 VM without Python or FFmpeg pre-installed. Confirm the installer dependency-check page appears, successfully installs both tools via `winget`, and the app launches without the FirstRunWizard prompting for dependencies again. Then drag-and-drop a `.wav` file onto the file browser, confirm it appears, start processing with DEMUCS on CPU, and confirm the job completes with four stem `.wav` files produced.

2. **End-to-end smoke test (macOS / Linux)**: On macOS and Linux, open the app, use "Open Files" to select `tests/fixtures/audio/test-short.wav`, start processing with DEMUCS on CPU, and confirm a successful result. Confirm drag-and-drop also works (where supported by the OS).

3. **GUI verification**: Open the app and verify the following edge cases render correctly: a file with a non-ASCII name (e.g. `été.wav`), a very long file path (>200 characters), a failed processing job showing the expanded error-detail message, and the FirstRunWizard in "all dependencies present" state.

4. **Regression sweep**: Run the full existing test suite (`npx vitest run`, `cargo test`, `pytest python/tests/ -m "not integration"`) and confirm no previously passing tests are now broken.

5. **CI pipeline green**: Push `fix/bugs-quality-installer` to `origin` and confirm all CI jobs (Rust tests, TypeScript tests, Python tests, lint) pass in GitHub Actions.

6. **Update changelog and bump the version** to `1.4.2` (TASK-022) if not already done.

7. **General release preparation**: Run `scripts/release-prep.js` (if applicable) to validate version consistency across `package.json`, `Cargo.toml`, and `CHANGELOG.md`. Build release artifacts for all three platforms via the release workflow.

8. **Tag the release**: Create and push `git tag v1.4.2`. Publish release notes summarising all five bug fixes, the new installer dependency wizard, and the expanded test coverage.

9. **Verification on GitHub**: Confirm both the CI pipeline and the CD (release) pipeline complete successfully in the GitHub Actions tab. If either fails, iterate on the failing job before merging. Only merge `fix/bugs-quality-installer` → `main` once both pipelines are green.

---

## Operational Constraints

- **Pause-and-ask policy**: If at any point the AI agent needs elevated privileges, access to external services, new library installations, additional MCP server connections, API keys (e.g., for a remote model-version feed), a Windows build environment for NSIS, or anything beyond its current sandbox capabilities, it must **immediately stop execution, clearly describe what it needs and why, and wait for explicit approval** before continuing.
- **Incremental commits**: each task should be committed separately with a descriptive commit message referencing the Task ID (e.g. `fix(drag-drop): TASK-002 correct Tauri v2 event payload access`), so progress is reviewable and reversible.
- **No silent failures**: any error must surface explicitly in the GUI and logs — never silently swallowed or defaulted to empty.
- **No new `// @ts-ignore` suppressions**: TypeScript type errors introduced by these changes must be fixed properly.
- **Integration tests must be skippable**: any test requiring demucs, PyTorch, a packaged binary, or a Windows VM must be marked with a pytest marker or Playwright condition so it can be skipped in restricted CI environments without failing the suite.
