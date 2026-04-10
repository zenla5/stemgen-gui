# Cloud Inference Providers — Implementation Task List

## Objective(s)

This document drives the implementation of the **Cloud Inference Providers** feature for **stemgen-gui** as specified in `FEATURE_SPEC_cloud_inference_providers.md`.

**Primary objective:** Allow users to choose fal.ai or Replicate as a cloud-hosted GPU inference backend directly from the Settings panel. Once configured with an API key the app routes stem-separation jobs to the selected provider transparently — preserving the existing local-inference path and the entire downstream pipeline (audio decoding, stem mixing, `.stem.mp4` packaging).

**Secondary objective:** Improve overall project quality and test coverage in areas discovered during the pre-implementation audit, so that the new feature lands on a solid, well-tested foundation.

### Pre-implementation Quality Audit Findings

| Area | Finding |
|---|---|
| Python sidecar | `run_demucs` and `run_htdemucs` share ~95 % identical code; heavy duplication is a maintenance hazard. |
| Python sidecar | No Python unit tests exist at all; the entire sidecar is untested outside of E2E runs. |
| Python sidecar | `--device` choices are hard-coded to `[cpu, cuda, mps]` in `argparse`; adding `cloud` requires removing the constraint or restructuring. |
| Rust `separation.rs` | `start_separation` does not pass provider or API-key flags to the sidecar spawn; this must be extended. |
| Rust `sidecar.rs` | `run_separation` signature only accepts `model` and `device`; it needs `provider` and `api_key` parameters. |
| `settingsStore.ts` | No inference-provider fields; must be extended. |
| Settings UI | No keychain/secure-storage integration exists yet; needs new Tauri plugin or crate. |
| Localisation | All new user-visible strings must be added to `src/i18n/en.json` and `src/i18n/de.json`. |
| CI | The existing CI pipeline must pass on the feature branch before merge. |

---

## Step-by-Step Implementation Task List for AI Agents

---

### TASK-00 — Create feature branch

- [x] **TASK-00: Create the feature branch**
- **Description:** From the latest `main` branch, create and check out a new Git branch named `feature/cloud-inference-providers`. All subsequent commits for this feature must target this branch.
- **Inputs:** Current `main` branch of the repository.
- **Outputs / deliverables:** Branch `feature/cloud-inference-providers` pushed to the remote.
- **Acceptance criteria:** `git branch --show-current` outputs `feature/cloud-inference-providers`; the branch is visible on the remote.
- **Dependencies:** None.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** Normal Git access. No elevated permissions needed.

---

### TASK-01 — Refactor duplicated local runner code in the Python sidecar

- [x] **TASK-01: Refactor `run_demucs` / `run_htdemucs` / `run_htdemucs_ft` into a shared helper in `stemgen_sidecar.py`**
- **Description:** The three local demucs runners (`run_demucs`, `run_htdemucs`, `run_htdemucs_ft`) share approximately 95 % identical code (device selection, model loading, audio loading, `apply_model` call, WAV saving loop). Extract the shared logic into a private helper function `_run_demucs_model(input_path, output_dir, device, model_name, shifts)`. Each of the three public runner functions becomes a thin wrapper that specifies `model_name` and `shifts` and delegates to the helper. The helper emits the same JSON progress lines as before. The public function signatures (`run_demucs`, `run_htdemucs`, `run_htdemucs_ft`) must remain unchanged so that `run_separation` dispatch is unaffected.
- **Inputs:** `python/stemgen_sidecar.py` (existing file).
- **Outputs / deliverables:** Modified `python/stemgen_sidecar.py` with deduplicated runner code.
- **Acceptance criteria:**
  1. `python/stemgen_sidecar.py` passes `flake8 --max-line-length=120` with zero errors.
  2. `run_demucs`, `run_htdemucs`, `run_htdemucs_ft` are still callable and dispatch correctly via `run_separation`.
  3. No change to the JSON output protocol (`status`, `stage`, `progress`, `message` fields).
- **Dependencies:** TASK-00.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-02 — Add Python unit-test infrastructure

- [x] **TASK-02: Create `python/tests/` directory with pytest configuration and first smoke tests**
- **Description:** Create the directory `python/tests/` with an `__init__.py` and `conftest.py`. Add a `pytest.ini` (or `pyproject.toml` `[tool.pytest.ini_options]` section) at the `python/` level. Write basic smoke tests in `python/tests/test_sidecar_cli.py` that:
  - Import `stemgen_sidecar` and confirm `emit()` writes valid JSON to stdout (capture with `capsys`).
  - Call `check_dependencies()` and confirm it returns a boolean.
  - Confirm `run_separation("unknown_model", ...)` calls `sys.exit(1)` (use `pytest.raises(SystemExit)`).
  Add `pytest` and `pytest-cov` (pinned to compatible versions) to a new `python/requirements-dev.txt`. Document running the tests with `cd python && pytest` in the project `README.md` under a new **Testing** sub-section.
- **Inputs:** `python/` directory (existing structure).
- **Outputs / deliverables:** `python/tests/__init__.py`, `python/tests/conftest.py`, `python/tests/test_sidecar_cli.py`, `python/requirements-dev.txt`, updated `README.md`.
- **Acceptance criteria:**
  1. `cd python && pip install -r requirements-dev.txt && pytest tests/` exits 0 with at least 3 passing tests and 0 failures.
  2. `pytest --co -q` lists all test functions without errors.
- **Dependencies:** TASK-01.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** Standard `pip install` for dev dependencies.

---

### TASK-03 — Extend `argparse` in the sidecar to support cloud flags

- [x] **TASK-03: Add `--provider`, `--api-key` CLI flags and relax `--device` constraint**
- **Description:** In `python/stemgen_sidecar.py`, modify the `argparse` setup in `main()`:
  1. Change `--device` from `choices=["cpu", "cuda", "mps"]` to `choices=["cpu", "cuda", "mps", "cloud"]` so that passing `--device cloud` is accepted.
  2. Add `--provider` with `choices=["fal", "replicate"]` and `default=None`.
  3. Add `--api-key` with `type=str` and `default=None`.
  4. After parsing, validate: if `args.device == "cloud"` and `args.provider is None`, emit `{"status": "error", "error": "No API key set — go to Settings → Inference"}` and `sys.exit(1)`. Similarly if `args.api_key` is `None` or empty, emit the same error.
  5. Update the docstring at the top of the file to describe the new flags.
- **Inputs:** `python/stemgen_sidecar.py`.
- **Outputs / deliverables:** Modified `python/stemgen_sidecar.py`.
- **Acceptance criteria:**
  1. `python stemgen_sidecar.py --help` shows `--provider` and `--api-key` without error.
  2. `python stemgen_sidecar.py --model htdemucs --input /tmp/x.wav --output /tmp --device cloud` exits non-zero and stdout contains `"No API key set"`.
  3. `python stemgen_sidecar.py --model htdemucs --input /tmp/x.wav --output /tmp --device cloud --provider fal` (without `--api-key`) exits non-zero with the same error.
  4. New unit tests in `python/tests/test_sidecar_cli.py` cover all three cases above.
- **Dependencies:** TASK-02.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-04 — Add `fal-client` and `replicate` to Python requirements

- [x] **TASK-04: Update `python/requirements.txt` with cloud-provider dependencies**
- **Description:** Append the following entries to `python/requirements.txt`:
  ```
  # Cloud inference providers (imported lazily; not required for local inference)
  fal-client>=0.5.0
  replicate>=0.31.0
  requests>=2.31.0
  ```
  Add a comment explaining lazy-import strategy so local-only users are not forced to install these if they prefer a minimal install. Do **not** add these to the primary `--index-url` torch section; they are pure-Python packages from PyPI.
- **Inputs:** `python/requirements.txt`.
- **Outputs / deliverables:** Modified `python/requirements.txt`.
- **Acceptance criteria:**
  1. `pip install -r python/requirements.txt` completes without errors on a clean Python 3.11 environment (network access required — agent must **stop and ask** if it cannot reach PyPI).
  2. `import fal_client` and `import replicate` succeed after install.
- **Dependencies:** TASK-03.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** **Requires internet access to PyPI.** If the sandbox has no network, agent must stop and ask the developer to run the `pip install` manually.

---

### TASK-05 — Implement the `run_fal` cloud runner in the sidecar

- [x] **TASK-05: Implement `run_fal()` in `python/stemgen_sidecar.py`**
- **Description:** Add the function `run_fal(input_path: Path, output_dir: Path, model: str, api_key: str) -> Dict[str, Path]` to `stemgen_sidecar.py` following the pseudocode in spec §7.2. Key requirements:
  - Import `fal_client` and `requests` inside the function body (lazy import).
  - Map model names via `fal_model_map` as specified.
  - Emit JSON progress lines for `uploading` (0.05), `queued` (0.10), `separating` (0.20–0.80 via `on_queue_update`), `downloading` (0.85 per stem), `saving` (0.90–0.99).
  - Download each stem URL to `output_dir / f"{input_path.stem}_{stem_name}.wav"` using `requests.get(..., timeout=120)`.
  - On `requests.HTTPError` with status 401 emit `{"status": "error", "error": "API key rejected by fal.ai — check Settings", "fallback_hint": "switch_to_local"}` and re-raise.
  - On any `requests.ConnectionError` / `requests.Timeout`, retry once with a 5-second sleep, then emit `{"status": "error", "error": "Upload failed — check your internet connection", "fallback_hint": "switch_to_local"}` and re-raise.
  - On provider-side failure (non-2xx from fal.ai), emit `{"status": "error", "error": "Provider returned an error: <message>", "fallback_hint": "switch_to_local"}` and raise `RuntimeError`.
  - Implement a global 300-second timeout watchdog: if the entire function body (from upload start to last stem saved) exceeds 300 s, emit `{"status": "error", "error": "Provider timed out — try again or use Local", "fallback_hint": "switch_to_local"}` and raise `TimeoutError`.
  - All errors must include the `fallback_hint` field as per spec §8.
  - Wire `run_fal` into `run_separation` dispatch so that `device == "cloud"` and `provider == "fal"` calls it.
- **Inputs:** `python/stemgen_sidecar.py`, spec §7.2.
- **Outputs / deliverables:** Modified `python/stemgen_sidecar.py`.
- **Acceptance criteria:**
  1. `run_fal` function exists and is importable.
  2. New unit tests in `python/tests/test_cloud_runners.py` mock `fal_client` and `requests` and verify: correct progress events are emitted in correct order; 401 HTTP response → error with `fallback_hint`; connection error → single retry then error.
  3. All existing sidecar tests still pass.
- **Dependencies:** TASK-04.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** None (tests mock all network calls).

---

### TASK-06 — Implement the `run_replicate` cloud runner in the sidecar

- [x] **TASK-06: Implement `run_replicate()` in `python/stemgen_sidecar.py`**
- **Description:** Add the function `run_replicate(input_path: Path, output_dir: Path, model: str, api_key: str, version_hash: str) -> Dict[str, Path]` following spec §7.3. Key requirements:
  - `version_hash` is a required parameter (passed from Rust via a new `--provider-version` CLI arg — see TASK-07).
  - Import `replicate` and `requests` lazily inside the function.
  - Map model names via `replicate_model_map` as specified.
  - Emit progress for `uploading` (0.05), `queued` (0.10), `separating` (0.20–0.80 via poll loop).
  - Poll every 3 seconds using `prediction.reload()`.
  - **During the polling loop,** instead of emitting a fixed `0.50` progress, compute estimated progress as `min(0.20 + 0.60 * (elapsed / 120.0), 0.79)` — where `elapsed` is seconds since job submission and `120` is an assumed median job length — so that the bar moves continuously rather than jumping to 50 % and freezing.
  - On `status == "failed"` or `status == "canceled"`, emit error with `fallback_hint`.
  - Download stems from `prediction.output["stems"]` list following the spec schema.
  - All error conditions from spec §8 must be handled identically to `run_fal` (401 → key rejected, network error → retry once, timeout after 300 s).
  - Wire into `run_separation`: `device == "cloud"` and `provider == "replicate"` calls it.
- **Inputs:** `python/stemgen_sidecar.py`, spec §7.3.
- **Outputs / deliverables:** Modified `python/stemgen_sidecar.py`.
- **Acceptance criteria:**
  1. `run_replicate` exists and is importable.
  2. Unit tests in `python/tests/test_cloud_runners.py` mock the `replicate` client and `requests` and verify: progress events emitted in order; `failed` prediction → error with `fallback_hint`; download retried once on `ConnectionError`.
  3. All existing sidecar tests pass.
- **Dependencies:** TASK-05.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** None.

---

### TASK-07 — Add `--provider-version` CLI flag for Replicate version hash

- [x] **TASK-07: Extend `argparse` with `--provider-version` flag**
- **Description:** Add `--provider-version` (`type=str`, `default=None`) to `argparse` in `main()`. When `provider == "replicate"`, validate that `args.provider_version` is a non-empty string; emit `{"status": "error", "error": "No Replicate version selected — choose a version in Settings", "fallback_hint": "switch_to_local"}` and `sys.exit(1)` if it is missing. Pass `args.provider_version` through to `run_replicate` as the `version_hash` parameter.
- **Inputs:** `python/stemgen_sidecar.py`.
- **Outputs / deliverables:** Modified `python/stemgen_sidecar.py`.
- **Acceptance criteria:**
  1. `--provider-version` appears in `--help`.
  2. Calling with `--device cloud --provider replicate --api-key X` (no `--provider-version`) exits non-zero with the correct error message.
  3. Unit test covers this case.
- **Dependencies:** TASK-06.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-08 — Add `InferenceProvider` types and settings to Rust

- [x] **TASK-08: Add `InferenceProvider` enum, `InferenceProviderConfig` struct, and DB/config persistence to Rust**
- **Description:** In `src-tauri/src/`, create a new module file `src-tauri/src/inference_provider.rs` (and register it in `lib.rs`). Define:
  ```rust
  #[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
  pub enum InferenceProvider { #[default] Local, Fal, Replicate }

  #[derive(Debug, Clone, Serialize, Deserialize, Default)]
  pub struct InferenceProviderConfig {
      pub active_provider: InferenceProvider,
      pub fal_configured: bool,      // true if a key is stored in keychain
      pub replicate_configured: bool,
      pub replicate_version_hash: Option<String>,
      pub batch_parallel: bool,       // false = sequential (default)
      pub cloud_duration_warn_minutes: Option<u32>, // None = disabled; default Some(15)
      pub cloud_duration_hard_cap_minutes: Option<u32>, // None = disabled
      pub privacy_notice_shown: bool,
  }
  ```
  Persist `InferenceProviderConfig` (minus any key material) to the existing SQLite database using the pattern already used in `commands/db.rs`. Add a `get_inference_provider_config` and `set_inference_provider_config` helper in `inference_provider.rs` that reads/writes a single JSON blob row keyed `"inference_provider_config"` in the existing `settings` table. Add a migration guard so the row is created with defaults if absent.
- **Inputs:** `src-tauri/src/lib.rs`, `src-tauri/src/commands/db.rs`, spec §5.4.
- **Outputs / deliverables:** `src-tauri/src/inference_provider.rs`, modified `lib.rs`.
- **Acceptance criteria:**
  1. `cargo build` succeeds with no new warnings.
  2. `cargo test` passes (add at least one Rust unit test asserting `InferenceProviderConfig::default()` serialises and deserialises correctly).
- **Dependencies:** TASK-00.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** None.

---

### TASK-09 — Integrate OS keychain for API key storage (Rust)

- [x] **TASK-09: Add secure API-key storage via the `keyring` crate**
- **Description:** Add `keyring = "2"` to `src-tauri/Cargo.toml` (workspace `[dependencies]`). In `src-tauri/src/inference_provider.rs`, implement two helper functions:
  ```rust
  pub fn store_api_key(provider: &str, key: &str) -> Result<(), String>
  pub fn load_api_key(provider: &str) -> Result<Option<String>, String>
  pub fn delete_api_key(provider: &str) -> Result<(), String>
  ```
  Using the `keyring` crate with service name `"stemgen-gui"` and the user name `provider` (e.g., `"fal"` or `"replicate"`). `load_api_key` must return `Ok(None)` — not an error — when no entry exists. **API keys must never be written to SQLite, logs, or Tauri event payloads.** Add a lint guard comment near each function reminding future maintainers of this invariant.
  **Stop and ask** before proceeding if the `keyring` crate is not available or if the CI environment lacks a keychain daemon (the tests for this task must mock the keychain or be gated with `#[cfg(not(ci))]`).
- **Inputs:** `src-tauri/Cargo.toml`, `src-tauri/src/inference_provider.rs`.
- **Outputs / deliverables:** Modified `Cargo.toml`, modified `inference_provider.rs`.
- **Acceptance criteria:**
  1. `cargo build` succeeds.
  2. Unit test: store a key for `"fal"`, load it back, confirm match, delete it, confirm `load_api_key` returns `Ok(None)`.
  3. `grep -r "api_key" src-tauri/src/commands/db.rs` returns no results.
- **Dependencies:** TASK-08.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** `keyring` crate requires OS-level access to the system keychain. **Stop and ask** if running in a headless/CI environment that lacks a keychain daemon.

---

### TASK-10 — Implement Tauri commands for provider configuration

- [x] **TASK-10: Add four new Tauri commands for provider config management**
- **Description:** In a new file `src-tauri/src/commands/provider.rs`, implement and `#[tauri::command]`-annotate:
  1. `get_inference_provider_config(state) -> Result<InferenceProviderConfig, String>` — reads from DB, returns config (no keys).
  2. `set_inference_provider(provider: String, state) -> Result<(), String>` — updates `active_provider` in DB config.
  3. `set_provider_api_key(provider: String, key: String, state) -> Result<(), String>` — calls `store_api_key`, then updates `fal_configured` / `replicate_configured` flag in DB. **Never logs the key.**
  4. `clear_provider_api_key(provider: String, state) -> Result<(), String>` — calls `delete_api_key`, sets `configured` flag to false.
  5. `test_provider_connection(provider: String, state) -> Result<serde_json::Value, String>` — loads the API key from keychain, makes a lightweight HEAD/validation call to the provider, and returns `{"ok": true}` or `{"ok": false, "error": "<message>"}`. For fal.ai, validate by calling `GET https://fal.run/fal-ai/demucs` with the key and checking for a non-401 response. For Replicate, call `GET https://api.replicate.com/v1/account` with the token.
  Register all five commands in `src-tauri/src/lib.rs` inside `tauri::Builder::invoke_handler`.
- **Inputs:** `src-tauri/src/lib.rs`, `src-tauri/src/inference_provider.rs`.
- **Outputs / deliverables:** `src-tauri/src/commands/provider.rs`, modified `lib.rs`.
- **Acceptance criteria:**
  1. `cargo build` succeeds.
  2. All five command names appear in `tauri::Builder::invoke_handler`.
  3. Rust unit tests: `get_inference_provider_config` with a fresh DB returns defaults; `set_inference_provider("fal")` persists and can be read back.
  4. `grep -rn "api_key\|key" src-tauri/src/commands/provider.rs` must not show any logging of key values.
- **Dependencies:** TASK-09.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** Requires network access for `test_provider_connection`. The function itself is runtime-only; tests must mock HTTP.

---

### TASK-11 — Extend `SidecarManager::run_separation` to pass cloud flags

- [x] **TASK-11: Extend `sidecar.rs` and `separation.rs` to propagate cloud provider flags**
- **Description:**
  1. In `src-tauri/src/commands/sidecar.rs`, extend `SidecarManager::run_separation(...)` to accept two new optional parameters: `provider: Option<String>` and `api_key: Option<String>`, and (for Replicate) `provider_version: Option<String>`. When `device == "cloud"`, append `--provider <provider>`, `--api-key <api_key>`, and (if present) `--provider-version <hash>` to the sidecar spawn arguments. **API key must not be logged** — use `tracing::debug!("Spawning with provider: {}", provider)` but never log the key.
  2. In `src-tauri/src/commands/separation.rs`, update `start_separation` to:
     - Read `InferenceProviderConfig` from the DB via `get_inference_provider_config`.
     - If `active_provider != Local`, set `device = "cloud"`, load the API key from the keychain, and pass it through. If the key is missing, return `Err("No API key configured for this provider — go to Settings → Inference".to_string())` immediately without spawning the sidecar.
     - Pass `replicate_version_hash` from config to `run_separation` when provider is Replicate.
  3. Also extend `SeparationSettings` struct in `separation.rs` to include `provider: Option<String>` and `replicate_version_hash: Option<String>` (both optional for backwards compatibility with existing callers).
- **Inputs:** `src-tauri/src/commands/sidecar.rs`, `src-tauri/src/commands/separation.rs`.
- **Outputs / deliverables:** Modified `sidecar.rs`, `separation.rs`.
- **Acceptance criteria:**
  1. `cargo build` succeeds.
  2. Existing Rust unit tests in `separation.rs` still pass.
  3. New unit test: calling `start_separation` with `InferenceProvider::Fal` but no stored key returns an `Err` containing "No API key configured".
  4. Grep confirms the API key string is not passed to any `tracing::` macro.
- **Dependencies:** TASK-10.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** None.

---

### TASK-12 — Fetch Replicate version list Tauri command

- [x] **TASK-12: Add `fetch_replicate_versions` Tauri command**
- **Description:** In `src-tauri/src/commands/provider.rs`, add:
  ```rust
  #[tauri::command]
  pub async fn fetch_replicate_versions(api_key: String) -> Result<Vec<ReplicateVersion>, String>
  ```
  where `ReplicateVersion` is:
  ```rust
  pub struct ReplicateVersion {
      pub id: String,           // e.g. "b26a4313..."
      pub created_at: String,   // ISO-8601
      pub is_latest: bool,
  }
  ```
  The command calls `GET https://api.replicate.com/v1/models/ryan5453/demucs/versions` with `Authorization: Token <api_key>`, parses the response, sorts by `created_at` descending, marks the first as `is_latest`, and returns the list. If the call fails (network error or non-200), return `Err(...)`. Register in `lib.rs`.
- **Inputs:** `src-tauri/src/commands/provider.rs`, spec §11 (open question 5 answer).
- **Outputs / deliverables:** Modified `provider.rs` and `lib.rs`.
- **Acceptance criteria:**
  1. `cargo build` succeeds.
  2. Unit test mocking the HTTP response confirms: sorted order correct; `is_latest` set on first element only; empty list handled gracefully.
- **Dependencies:** TASK-11.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** Requires network at runtime; tests must mock HTTP.

---

### TASK-13 — Extend `settingsStore.ts` with inference provider state

- [x] **TASK-13: Add inference-provider fields and actions to `settingsStore.ts`**
- **Description:** Extend the `SettingsState` interface in `src/stores/settingsStore.ts` with:
  ```typescript
  activeProvider: 'local' | 'fal' | 'replicate';
  falConfigured: boolean;
  replicateConfigured: boolean;
  replicateVersionHash: string | null;
  batchParallel: boolean;
  cloudDurationWarnMinutes: number | null;   // null = disabled; default 15
  cloudDurationHardCapMinutes: number | null; // null = disabled
  privacyNoticeShown: boolean;
  ```
  Add corresponding setter actions. The store must call the Tauri `get_inference_provider_config` command on init (in a `useEffect` or via a `loadProviderConfig` action) to hydrate these fields from Rust/DB. Add `setActiveProvider`, `setReplicateVersionHash`, `setBatchParallel`, `setCloudDurationWarnMinutes`, `setCloudDurationHardCapMinutes`, `markPrivacyNoticeShown` actions that each call the corresponding Tauri command and update local state on success. Keys are never stored in the Zustand store or `localStorage`.
- **Inputs:** `src/stores/settingsStore.ts`, Tauri commands from TASK-10.
- **Outputs / deliverables:** Modified `src/stores/settingsStore.ts`.
- **Acceptance criteria:**
  1. TypeScript compiles: `npm run check` passes.
  2. Existing store unit tests in `src/stores/__tests__/settingsStore.test.ts` still pass.
  3. New unit tests assert: default `activeProvider` is `'local'`; `setActiveProvider('fal')` calls `invoke('set_inference_provider', { provider: 'fal' })`; key values are absent from store state at all times.
- **Dependencies:** TASK-12.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** None.

---

### TASK-14 — Add all new i18n strings (EN + DE)

- [x] **TASK-14: Add English and German localisation strings for every new UI element**
- **Description:** Add the following keys to `src/i18n/en.json` (English) and provide accurate German translations for every key in `src/i18n/de.json`. Group them under a new top-level `"inference"` namespace. Required keys (at minimum):
  - `inference.sectionTitle`, `inference.providerLabel`
  - `inference.providers.local`, `inference.providers.fal`, `inference.providers.replicate`
  - `inference.apiKeyLabel.fal`, `inference.apiKeyLabel.replicate`
  - `inference.testConnection`, `inference.clearKey`
  - `inference.connectionOk`, `inference.connectionFailed`
  - `inference.costEstimate` (with `{{cost}}` interpolation)
  - `inference.statusBar.label` (e.g. `"☁ {{provider}}"`)
  - `inference.privacyModal.title`, `inference.privacyModal.body` (with `{{provider}}` and `{{policyUrl}}`), `inference.privacyModal.dontShowAgain`, `inference.privacyModal.confirm`
  - `inference.versionDropdown.label`, `inference.versionDropdown.refresh`, `inference.versionDropdown.olderVersionWarning`, `inference.versionDropdown.newerVersionWarning`
  - `inference.errors.noKey`, `inference.errors.keyRejected`, `inference.errors.uploadFailed`, `inference.errors.providerError`, `inference.errors.downloadFailed`, `inference.errors.timeout`
  - `inference.fallback.switchToLocal`
  - `inference.durationWarning` (with `{{minutes}}` and `{{provider}}`)
  - `inference.offlineFallback`
  - `inference.batchMode.label`, `inference.batchMode.sequential`, `inference.batchMode.parallel`
- **Inputs:** `src/i18n/en.json`, `src/i18n/de.json`.
- **Outputs / deliverables:** Modified JSON files.
- **Acceptance criteria:**
  1. `npm run test` includes the i18n test suite (`src/i18n/__tests__/index.test.ts`) which confirms all new keys present in both locales.
  2. No existing i18n keys are removed or renamed.
- **Dependencies:** TASK-00.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-15 — Build the `InferenceSection` UI component

- [x] **TASK-15: Create `src/components/settings/InferenceSection.tsx`**
- **Description:** Create a new React component `InferenceSection` that renders the entire "Inference" settings section described in spec §6.1. The component must:
  - Display a radio group with three options: **Local (CPU / GPU)**, **fal.ai**, **Replicate**. Selecting any option immediately calls `setActiveProvider`.
  - When **fal.ai** is selected, display:
    - A masked password input for the API key (input type `"password"`; clicking it clears it for re-entry as per spec).
    - A **Test Connection** button that calls `invoke('test_provider_connection', { provider: 'fal' })`, shows a spinner while pending, then displays ✅ `t('inference.connectionOk')` or ❌ `t('inference.connectionFailed')`.
    - A **Clear** button that calls `invoke('clear_provider_api_key', { provider: 'fal' })`.
    - An estimated cost line: `t('inference.costEstimate', { cost: '$0.02' })` (hardcoded approximate for now; updated dynamically in TASK-18).
  - When **Replicate** is selected, display the same API-key row plus a version dropdown (see TASK-16).
  - If a provider is selected but not configured (key not stored), show a warning badge on the radio option.
  - All visible text uses `useTranslation()` with keys from TASK-14.
  - Export the component as a named export.
- **Inputs:** `src/stores/settingsStore.ts`, `src/i18n/*.json`, Tauri commands, spec §6.1.
- **Outputs / deliverables:** `src/components/settings/InferenceSection.tsx`.
- **Acceptance criteria:**
  1. TypeScript compiles: `npm run check` passes.
  2. Unit tests in `src/components/settings/__tests__/InferenceSection.test.tsx`: rendering with `activeProvider = 'local'` shows no key input; rendering with `'fal'` shows key input and test button; clicking Test Connection triggers `invoke`; API key value is never accessible as a readable DOM text node.
- **Dependencies:** TASK-13, TASK-14.
- **Estimated complexity:** High.
- **Privilege / tooling requirements:** None.

---

### TASK-16 — Build the Replicate version-selection dropdown sub-component

- [x] **TASK-16: Create `ReplicateVersionDropdown` sub-component inside `InferenceSection`**
- **Description:** Add a `ReplicateVersionDropdown` sub-component (may be co-located in `InferenceSection.tsx` or a separate file). It:
  - Shows a `<select>` (or Radix `Select`) populated with versions fetched via `invoke('fetch_replicate_versions', { apiKey })`.
  - Fetches the version list **once when the Inference panel opens** (parent passes an `open: boolean` prop; fetch triggers when `open` becomes `true`) and whenever the user clicks a **Refresh** button.
  - Shows a loading spinner during fetch.
  - Displays each version as `<id-short> — <date>` where `id-short` is the first 8 characters of the hash.
  - When the selected version is not the latest, renders the "older version warning" i18n string inline in amber.
  - When the selected version is newer than the app build date (compare ISO date from API against `import.meta.env.VITE_BUILD_DATE`), renders the "newer version warning" in amber.
  - Saves the selected hash via `settingsStore.setReplicateVersionHash(hash)`.
- **Inputs:** `src/components/settings/InferenceSection.tsx`, Tauri command `fetch_replicate_versions`, spec §11 (Q5 answer).
- **Outputs / deliverables:** Modified or new component file.
- **Acceptance criteria:**
  1. TypeScript compiles.
  2. Unit tests: mock `invoke('fetch_replicate_versions')` → renders options; selecting a non-latest version shows amber warning; selecting a version newer than a mocked build date shows the other amber warning.
- **Dependencies:** TASK-15.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** Requires `VITE_BUILD_DATE` env variable to be set during build (add to `vite.config.ts` and CI build step).

---

### TASK-17 — Integrate `InferenceSection` into `SettingsPanel`

- [x] **TASK-17: Mount `InferenceSection` inside `SettingsPanel.tsx`**
- **Description:** In `src/components/settings/SettingsPanel.tsx`, import `InferenceSection` and render it after the existing Output/Format settings section, inside the same scrollable container. Pass `open` prop reflecting whether the Settings panel is currently visible. Wrap with a section divider matching existing divider styling.
- **Inputs:** `src/components/settings/SettingsPanel.tsx`, `InferenceSection.tsx`.
- **Outputs / deliverables:** Modified `src/components/settings/SettingsPanel.tsx`.
- **Acceptance criteria:**
  1. TypeScript compiles.
  2. Existing `SettingsPanel.unit.test.tsx` tests pass.
  3. New snapshot or integration test confirms `InferenceSection` renders within `SettingsPanel`.
- **Dependencies:** TASK-16.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-18 — Dynamic cost estimate per-model

- [x] **TASK-18: Make the cost estimate in `InferenceSection` update based on the active AI model**
- **Description:** Create a utility `src/lib/cloudCostEstimate.ts` that exports a function `estimateCost(provider: 'fal' | 'replicate', model: string): string` returning a formatted approximate cost string (e.g. `"~$0.02"`). Hardcode the cost table from the spec (fal.ai: $0.01–$0.05 / run; Replicate: $0.004–$0.036 / run). Use the current `defaultModel` from `settingsStore` to select the row. The estimate must update reactively whenever `defaultModel` changes. Render the estimate as the `cost` interpolation in `t('inference.costEstimate', { cost })`.
- **Inputs:** `src/lib/cloudCostEstimate.ts` (new), `src/components/settings/InferenceSection.tsx`, spec §6.1 cost estimate note.
- **Outputs / deliverables:** `src/lib/cloudCostEstimate.ts`, modified `InferenceSection.tsx`.
- **Acceptance criteria:**
  1. Unit tests in `src/lib/__tests__/cloudCostEstimate.test.ts` cover: known model returns expected string; unknown model returns a safe default; both providers covered.
  2. TypeScript compiles.
- **Dependencies:** TASK-17.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-19 — Cloud-provider indicator in the status bar

- [x] **TASK-19: Add cloud-provider indicator to the bottom status bar**
- **Description:** Locate the existing bottom status bar component (search for where system-level status text is rendered, likely in `src/components/` or the main layout). When `settingsStore.activeProvider !== 'local'`, render a small element: a cloud icon (`Cloud` from `lucide-react`) followed by the provider name string from `t('inference.statusBar.label', { provider: activeProvider })`. Use a tooltip (Radix `Tooltip`) that displays the privacy notice summary: `t('inference.privacyModal.body', { provider, policyUrl })` truncated to 120 characters. The indicator must not render at all when provider is `'local'`.
- **Inputs:** Status bar component (to be located), `src/stores/settingsStore.ts`, `src/i18n/*.json`.
- **Outputs / deliverables:** Modified status bar component.
- **Acceptance criteria:**
  1. TypeScript compiles.
  2. Unit test: `activeProvider = 'fal'` → cloud indicator renders with text "fal.ai"; `activeProvider = 'local'` → indicator absent.
- **Dependencies:** TASK-17.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-20 — Privacy notice modal

- [x] **TASK-20: Create `CloudPrivacyModal` component and show it the first time a cloud provider is activated**
- **Description:** Create `src/components/settings/CloudPrivacyModal.tsx`. It renders a Radix `AlertDialog` with:
  - Title: `t('inference.privacyModal.title')`.
  - Body: `t('inference.privacyModal.body', { provider, policyUrl })` where `policyUrl` is `"https://fal.ai/privacy"` for fal.ai and `"https://replicate.com/privacy"` for Replicate.
  - A checkbox "Don't show again" bound to local state.
  - A "Confirm" button that closes the modal and, if "Don't show again" is checked, calls `settingsStore.markPrivacyNoticeShown()` (which calls the Tauri command to persist the flag).
  Show this modal in `InferenceSection` whenever `settingsStore.activeProvider` changes from `'local'` to a cloud value AND `settingsStore.privacyNoticeShown === false`.
- **Inputs:** `src/components/settings/InferenceSection.tsx`, `src/stores/settingsStore.ts`, `src/i18n/*.json`.
- **Outputs / deliverables:** `src/components/settings/CloudPrivacyModal.tsx`, modified `InferenceSection.tsx`.
- **Acceptance criteria:**
  1. TypeScript compiles.
  2. Unit tests: modal renders when `activeProvider` switches to `'fal'` and `privacyNoticeShown = false`; does not render when `privacyNoticeShown = true`; checking "don't show again" and confirming calls `markPrivacyNoticeShown`.
- **Dependencies:** TASK-17.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-21 — Cloud progress: pulsing animation during GPU phase

- [x] **TASK-21: Replace numeric progress with pulsing animation during cloud "separating" stage**
- **Description:** Identify the existing progress bar component used during separation (likely in the separation/batch flow). When the sidecar emits `{"status": "progress", "stage": "separating"}` AND `settingsStore.activeProvider !== 'local'`, switch the progress bar from its numeric fill mode to a CSS-animated indeterminate "pulse" mode (tailwind's `animate-pulse` applied to the bar fill, or a left-to-right sweep animation). During all other stages (`uploading`, `queued`, `downloading`, `saving`) continue to show the exact numeric percentage. Revert to numeric mode as soon as a non-`separating` stage event arrives or the job completes/fails.
- **Inputs:** Existing separation progress component (locate by searching for where `progress` events are handled), `src/stores/appStore.ts` or `batchQueueStore.ts`.
- **Outputs / deliverables:** Modified progress component and/or separation store.
- **Acceptance criteria:**
  1. TypeScript compiles.
  2. Unit test: simulating a `separating` stage event with `activeProvider = 'fal'` sets an `indeterminate` CSS class on the bar; simulating a `downloading` event removes it.
- **Dependencies:** TASK-13.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-22 — Offline detection and automatic local fallback

- [x] **TASK-22: Detect offline state and auto-fall back to local inference with a user warning**
- **Description:**
  1. In `src/hooks/useHealthCheck.ts` (or a new `useNetworkStatus.ts` hook), listen to the browser's `navigator.onLine` property and `window` `"online"` / `"offline"` events to track connectivity.
  2. In the separation-dispatch logic (Rust or the frontend layer that calls `invoke('start_separation')`), if `activeProvider !== 'local'` and the device is determined to be offline, temporarily override the provider to `'local'` for that job and show a `sonner` toast: `t('inference.offlineFallback')` (amber/warning colour). Do not permanently change `activeProvider` — the next job should retry cloud.
  3. The offline detection should also be surfaced in the status bar: when offline and cloud is configured, show a warning icon alongside the cloud indicator.
- **Inputs:** `src/hooks/useHealthCheck.ts`, `src/stores/settingsStore.ts`, separation invocation site, `src/i18n/*.json`.
- **Outputs / deliverables:** Modified hook(s) and separation dispatch.
- **Acceptance criteria:**
  1. Unit tests: `navigator.onLine = false` → hook returns `offline`; separation called while offline + cloud provider configured → toast appears with fallback message; `activeProvider` unchanged after the job.
  2. TypeScript compiles.
- **Dependencies:** TASK-19.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** None.

---

### TASK-23 — File-duration warning for cloud inference

- [x] **TASK-23: Warn (and optionally block) when audio duration exceeds configured threshold for cloud jobs**
- **Description:** Before dispatching a cloud separation job, check the audio duration (available from the Tauri `probe_audio` or equivalent command that is already used elsewhere). If the duration exceeds `cloudDurationWarnMinutes` (default 15 min), show a `sonner` toast warning: `t('inference.durationWarning', { minutes: Math.ceil(durationMin), provider })`. If the duration exceeds `cloudDurationHardCapMinutes` (when set), block the job with an `AlertDialog` offering to cancel or switch to local. Add settings UI in `InferenceSection` for both thresholds (number inputs or sliders, with "Disabled" option). The defaults (`warnMinutes = 15`, `hardCap = null`) must match TASK-08.
- **Inputs:** `src/components/settings/InferenceSection.tsx`, `src/stores/settingsStore.ts`, audio probe command, `src/i18n/*.json`.
- **Outputs / deliverables:** Modified `InferenceSection.tsx`, modified separation dispatch logic.
- **Acceptance criteria:**
  1. TypeScript compiles.
  2. Unit tests: duration = 16 min with `warnMinutes = 15` → warning toast; duration = 20 min with `hardCap = 18` → blocking dialog; local provider → no warning regardless of duration.
- **Dependencies:** TASK-21.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** None.

---

### TASK-24 — Batch parallel/sequential cloud setting

- [x] **TASK-24: Add batch-mode (sequential vs parallel) setting for cloud inference**
- **Description:** Add a radio/toggle in `InferenceSection` below the API key: **Sequential** (default) or **Parallel** for cloud jobs in the batch queue. Persist via `settingsStore.setBatchParallel(bool)`. In the batch queue processing logic (`src/stores/batchQueueStore.ts`), when `activeProvider !== 'local'` and `batchParallel === true`, submit all pending cloud jobs simultaneously (via `Promise.all`); when `batchParallel === false`, process them one at a time. When `activeProvider === 'local'`, this setting is ignored (local concurrency is controlled by `maxParallelJobs`).
- **Inputs:** `src/stores/batchQueueStore.ts`, `src/stores/settingsStore.ts`, `src/components/settings/InferenceSection.tsx`.
- **Outputs / deliverables:** Modified `batchQueueStore.ts`, modified `InferenceSection.tsx`.
- **Acceptance criteria:**
  1. TypeScript compiles.
  2. Existing `batchQueueStore.test.ts` tests pass.
  3. New test: with `batchParallel = true` and 3 queued cloud jobs, all three `invoke('start_separation')` calls happen before any resolves; with `false`, each call waits for the previous.
- **Dependencies:** TASK-22.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** None.

---

### TASK-25 — Error surfacing: `fallback_hint` handling in the frontend

- [x] **TASK-25: Handle `fallback_hint` from sidecar errors and offer "Switch to Local" recovery action**
- **Description:** In the existing sidecar event listener (where `status === "error"` JSON events are handled), check for the `fallback_hint === "switch_to_local"` field. When present, display an `AlertDialog` (or dismissible `sonner` toast with action button) that offers a **Switch to Local** action. Clicking it calls `settingsStore.setActiveProvider('local')` and, if there is a failed job in the queue, re-queues it. Ensure this works for all error conditions described in spec §8.
- **Inputs:** Sidecar event listener (locate in `src/stores/appStore.ts` or `batchQueueStore.ts`), `src/stores/settingsStore.ts`.
- **Outputs / deliverables:** Modified store(s) with fallback-hint handling.
- **Acceptance criteria:**
  1. TypeScript compiles.
  2. Unit tests: error event with `fallback_hint = "switch_to_local"` → "Switch to Local" action rendered; clicking it calls `setActiveProvider('local')`.
- **Dependencies:** TASK-24.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-26 — Add missing Python unit tests for cloud runners

- [x] **TASK-26: Write comprehensive tests for `run_fal` and `run_replicate` in `python/tests/test_cloud_runners.py`**
- **Description:** Expand `python/tests/test_cloud_runners.py` (started in TASK-05/TASK-06) to full coverage. Required test cases:
  - **fal.ai:** successful run (mock upload URL + successful result with 4 stems); 401 on upload → error JSON emitted; `ConnectionError` on download → retry then error; timeout after 300 s → timeout error; unknown model name → maps to `htdemucs`.
  - **Replicate:** successful run (mock prediction polling, 3 polls then `succeeded`); `failed` prediction → error; `canceled` prediction → error; missing `--provider-version` → `sys.exit(1)`.
  - **Integration:** `run_separation` dispatch with `device="cloud"`, `provider="fal"` calls `run_fal`; with `provider="replicate"` calls `run_replicate`.
  All HTTP calls must be mocked with `unittest.mock.patch`; no actual network calls in tests.
- **Inputs:** `python/stemgen_sidecar.py`, `python/tests/test_cloud_runners.py`.
- **Outputs / deliverables:** Expanded `python/tests/test_cloud_runners.py`.
- **Acceptance criteria:**
  1. `pytest python/tests/` passes with ≥ 15 test cases covering the scenarios above.
  2. `pytest --cov=python/stemgen_sidecar --cov-report=term-missing` shows ≥ 80 % coverage for `stemgen_sidecar.py`.
- **Dependencies:** TASK-07.
- **Estimated complexity:** Medium.
- **Privilege / tooling requirements:** None.

---

### TASK-27 — Add Tauri capability and security entries for network access

- [x] **TASK-27: Update `src-tauri/capabilities/default.json` for outbound HTTPS to providers**
- **Description:** The fal.ai and Replicate runners in the sidecar make outbound HTTPS calls. Tauri's CSP and capability system may need updating for the Rust-side HTTP calls (e.g. `test_provider_connection`, `fetch_replicate_versions`). Review `src-tauri/capabilities/default.json` and `src-tauri/tauri.conf.json` (or `Cargo.toml` features) and:
  1. Ensure `reqwest` or the HTTP client used by the Tauri commands has `tls` features enabled.
  2. Add `https://fal.run` and `https://api.replicate.com` to the CSP `connect-src` directive in `tauri.conf.json` if applicable (depends on Tauri version — check the existing config pattern).
  3. Document any changes in a comment inside the capability file.
- **Inputs:** `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json` (or equivalent).
- **Outputs / deliverables:** Modified capability/config files.
- **Acceptance criteria:**
  1. `cargo build` succeeds.
  2. The CI job that builds the Tauri app succeeds without CSP violations in the build log.
- **Dependencies:** TASK-10.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-28 — CI pipeline update: install cloud Python dependencies in CI

- [x] **TASK-28: Update `.github/workflows/ci.yml` to install and test cloud Python deps**
- **Description:** In `.github/workflows/ci.yml`, locate the step that installs Python dependencies (likely `pip install -r python/requirements.txt`). Add a parallel step that also installs `python/requirements-dev.txt` and runs `pytest python/tests/ --tb=short`. Ensure the fal-client and replicate packages install in CI (they are pure Python and should be on PyPI). Add `VITE_BUILD_DATE` environment variable injection to the frontend build step (format: `YYYY-MM-DD`, value: `${{ github.event.repository.updated_at | date('YYYY-MM-DD') }}` or use `date -u +%Y-%m-%d`).
- **Inputs:** `.github/workflows/ci.yml`.
- **Outputs / deliverables:** Modified CI workflow file.
- **Acceptance criteria:**
  1. A CI run triggered on the feature branch shows the new `pytest` step green.
  2. The `VITE_BUILD_DATE` variable is visible in the build log.
  3. All existing CI steps still pass.
- **Dependencies:** TASK-26.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** GitHub Actions write access; no elevated local permissions.

---

### TASK-29 — Update `CHANGELOG.md` and bump version

- [x] **TASK-29: Document all changes in `CHANGELOG.md` and bump `package.json` / `Cargo.toml` version**
- **Description:** Follow the existing changelog format (latest entry at top). Add a new `## [1.4.0] — YYYY-MM-DD` section documenting:
  - Added: Cloud inference providers (fal.ai, Replicate).
  - Added: Secure API key storage via OS keychain.
  - Added: Privacy notice modal for cloud providers.
  - Added: Replicate model version selector with staleness warnings.
  - Added: Pulsing animation during cloud GPU phase.
  - Added: Offline auto-fallback to local inference.
  - Added: File-duration warning/cap for cloud jobs.
  - Added: Batch parallel/sequential mode for cloud.
  - Changed: Python sidecar runner code refactored (no user-visible change).
  - Changed: Python unit tests added.
  Bump version to `1.4.0` in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- **Inputs:** `CHANGELOG.md`, `package.json`, `src-tauri/Cargo.toml`.
- **Outputs / deliverables:** Modified files.
- **Acceptance criteria:**
  1. `npm run release:prep` (the existing `scripts/release-prep.js`) completes without errors.
  2. `grep '"version": "1.4.0"' package.json` returns a match.
- **Dependencies:** All prior tasks.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** None.

---

### TASK-30 — Merge feature branch after CI green

- [ ] **TASK-30: Open PR, verify CI, and merge `feature/cloud-inference-providers` into `main`**
- **Description:** Open a pull request from `feature/cloud-inference-providers` targeting `main`. Ensure the PR description references all implemented acceptance criteria from spec §10 (AC-1 through AC-10). Wait for all CI checks to pass (see TASK-28). Request review if team workflow requires it. Once approved and CI is green, merge using a **squash merge** or **merge commit** (follow existing project convention). After merge, verify that the main branch CI pipeline also passes.
- **Inputs:** Feature branch, CI pipeline.
- **Outputs / deliverables:** Merged `main` branch; CI green on `main`.
- **Acceptance criteria:**
  1. All CI checks on the PR are green.
  2. Merge completes without conflicts.
  3. CI on `main` post-merge is green.
- **Dependencies:** TASK-29.
- **Estimated complexity:** Low.
- **Privilege / tooling requirements:** GitHub PR write access.

---

## Verification & Release

The following checklist must be completed in order before tagging the `v1.4.0` release.

1. **End-to-end smoke test (fal.ai):** With a real fal.ai API key configured, drop a 3-minute WAV file and press process. Confirm: progress bar moves through all stages, pulsing animation appears during GPU phase, 4 stem WAV files appear in the output directory within 90 seconds, `.stem.mp4` packs correctly, and provenance sidecar is written.

2. **End-to-end smoke test (Replicate):** Repeat with Replicate provider and a pinned version hash. Confirm the same output quality and timing.

3. **Test Connection verification:** Enter a known-invalid API key for each provider; confirm ❌ is shown promptly. Enter a valid key; confirm ✅.

4. **Privacy modal verification:** Clear `privacyNoticeShown` in the DB, switch from Local to fal.ai; confirm modal appears. Check "Don't show again" and confirm; switch back to Local then to fal.ai again; confirm modal does not re-appear.

5. **Replicate version dropdown:** Open Settings → Inference, select Replicate with a valid token. Confirm the dropdown populates, the "Refresh" button re-fetches, selecting an older version shows the amber warning, selecting a version newer than the build date shows the other amber warning.

6. **Offline fallback:** Disable network (or block `fal.run` in `/etc/hosts`). Start a cloud separation job. Confirm: the job falls back to local, the toast message appears, and `activeProvider` is unchanged afterwards.

7. **Duration warning:** Set `cloudDurationWarnMinutes = 2`. Drop a 3-minute file. Confirm the warning toast appears. Set `cloudDurationHardCapMinutes = 2` and confirm the blocking dialog appears.

8. **Batch parallel/sequential:** Queue 3 short files with cloud provider and `batchParallel = true`; confirm all 3 network calls fire simultaneously (check in browser DevTools). Repeat with `batchParallel = false`; confirm sequential.

9. **GUI edge-case verification:** Test with: a very long model name in the version dropdown; a non-ASCII file path as input; a provider name displayed in the status bar when the window is very narrow.

10. **Keychain security verification:** After storing an API key, confirm it does not appear in: the SQLite database file, any Tauri log file, any crash dump, or the Zustand/localStorage state.

11. **Regression sweep:** Run the full existing test suite (`npm run test`, `cargo test`) and confirm no previously passing tests are broken.

12. **CI/CD pipeline verification on GitHub:** Push the merged `main` branch and confirm both CI (lint, unit tests, Rust build, Python tests) and CD (release build for each platform) pipelines complete successfully. If any step fails, iterate until all pass before proceeding.

13. **Update changelog and bump version** to `1.4.0` as completed in TASK-29.

14. **Tag the release** with `git tag v1.4.0 -m "Cloud inference providers: fal.ai and Replicate"` and push the tag. GitHub Actions release workflow should trigger automatically.

15. **Publish release notes** on GitHub Releases summarizing: new cloud inference capabilities, both supported providers, security architecture (keychain), new settings, and fallback behaviour.

---

## Operational Constraints

- **Pause-and-ask policy:** If at any point the AI agent needs elevated privileges, access to external services (PyPI, fal.ai, Replicate APIs, GitHub secrets), new library installations, additional MCP server connections, API keys for validation, or anything beyond its current sandbox capabilities, it must **immediately stop execution, clearly describe what it needs and why, and wait for explicit approval** before continuing. This applies especially to TASK-04 (PyPI network), TASK-09 (OS keychain), and TASK-10/TASK-12 (outbound HTTPS).

- **Incremental commits:** Each task must be committed separately with a descriptive message referencing the Task ID (e.g. `feat(TASK-05): implement run_fal cloud runner with progress reporting`), so that progress is reviewable and reversible via `git revert`.

- **No silent failures:** Any error encountered during separation — whether from a local model or a cloud provider — must surface explicitly in the GUI (toast or dialog) and in the Tauri log. Errors must never be silently swallowed or silently defaulted to an empty stem set. The `fallback_hint` field must always be present in cloud error JSON payloads.

- **No key leakage:** API keys must never appear in any log line, Tauri event payload, SQLite row, localStorage entry, or Zustand store value. Every function that touches a key must have an inline comment asserting this invariant. This constraint is mandatory and non-negotiable.
