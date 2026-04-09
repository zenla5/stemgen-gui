# stemgen-gui — Library Management Feature: AI Agent Task List

## Objective(s)

Implement the full **Music Library Stem Management** feature described in `LIBRARY_MANAGEMENT_SPEC.md` on top of the existing `stemgen-gui` Tauri + React + Rust codebase. The implementation follows the phased plan in the spec (P1 → P5), plus upfront project quality improvements (P0) and a final release phase (P6).

The end state is a fully functional Library tab that lets users configure watched library roots, scan source audio collections, track stem provenance, detect outdated stems via a configurable staleness policy, run batch generation and regeneration jobs, clean up orphaned stems, and export library health reports — all with a CI pipeline that stays green throughout.

Every task below must be committed to a dedicated feature branch (`feature/library-management`) and merged to `main` only after the complete CI pipeline passes.

---

## Step-by-Step Implementation Task List for AI Agents

---

### PHASE 0 — Branch Setup & Pre-flight Quality Improvements

---

#### [x] TASK-001 — Create feature branch

**Description:** Create and push the `feature/library-management` branch from the current `main` HEAD. All subsequent commits in this task list must target this branch exclusively.

**Inputs:** Local clone of `stemgen-gui` at current HEAD.

**Outputs / deliverables:** Remote branch `feature/library-management` exists and is up to date with `main`.

**Acceptance criteria:**
- `git branch -a` shows `remotes/origin/feature/library-management`.
- The branch diverges cleanly from `main` with zero additional commits initially.
- GitHub Actions CI triggers on the branch push and all jobs pass (since no code changes exist yet).

**Dependencies:** None.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** Requires `git push` access to the remote repository. Stop and ask if credentials or branch protection rules prevent the push.

---

#### [x] TASK-002 — Add missing unit tests for existing `StemInfoPanel` component

**Description:** The `src/components/library/StemInfoPanel.tsx` component has no test file. Create `src/components/library/__tests__/StemInfoPanel.test.tsx` with a comprehensive Vitest + React Testing Library test suite. Tests must cover: loading state rendering, error state rendering, rendering with a full mock `StemProvenance` object (all sections visible), rendering when provenance is `null` (the "No provenance" empty state), integrity status icon variants (`ok`, `modified`, `missing`, `checking`), the `CopyButton` copy-to-clipboard interaction, the `Save Notes` button triggering `invoke('save_user_notes', ...)`, and the `handleSaveNotes` error path. Mock `@tauri-apps/api/core` `invoke` appropriately for every test case.

**Inputs:** `src/components/library/StemInfoPanel.tsx`, `src/lib/types/library.ts`, `src/vitest-setup.ts`.

**Outputs / deliverables:** `src/components/library/__tests__/StemInfoPanel.test.tsx` (≥ 12 test cases).

**Acceptance criteria:**
- `npm run test:unit` passes with all new tests green.
- No TypeScript errors (`npm run check`).
- New tests appear in coverage output.

**Dependencies:** TASK-001.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-003 — Add missing unit tests for `libraryStore`

**Description:** `src/stores/__tests__/libraryStore.test.ts` exists but is shallow. Extend it to test every store action: `setLibraryPath`, `scanLibrary` (success + error paths), `loadStalenessRules` (success + error paths), `saveStalenessRules`, `selectStem` / `deselectStem` / `toggleStemSelection` / `clearSelection` / `selectAll`, `findDuplicates`, `loadProvenance`, `exportLibrary` (success + error paths), `saveNotes`, `verifyIntegrity`, and `reset`. Use `vi.mock('@tauri-apps/api/core')` to stub `invoke`. Verify all selectors (`selectStaleReports`, `selectCurrentReports`, `selectUnknownReports`, `selectTotalSelected`, `selectSelectedReports`, `selectStaleSelectedCount`) against mock scan results.

**Inputs:** `src/stores/libraryStore.ts`, `src/lib/types/library.ts`, existing `libraryStore.test.ts`.

**Outputs / deliverables:** Extended `src/stores/__tests__/libraryStore.test.ts`.

**Acceptance criteria:**
- All new test cases pass under `npm run test:unit`.
- Every store action has at least one happy-path and one error-path test.
- Coverage for `libraryStore.ts` increases visibly in the Vitest coverage report.

**Dependencies:** TASK-001.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-004 — Raise CI coverage thresholds

**Description:** The current coverage thresholds in `vitest.config.ts` (or equivalent) are set to lines 32 %, functions 60 %, branches 63 %, statements 32 %. After the new tests in TASK-002 and TASK-003 are merged, raise the thresholds to lines 45 %, functions 70 %, branches 68 %, statements 45 %. Edit the `coverage.thresholds` block. Do not decrease any threshold.

**Inputs:** `vitest.config.ts` (or the file that contains the coverage threshold block), TASK-002 and TASK-003 results.

**Outputs / deliverables:** Updated `vitest.config.ts` with higher thresholds.

**Acceptance criteria:**
- `npm run test:unit -- --coverage` exits with code 0 (thresholds met).
- CI `frontend` job passes.

**Dependencies:** TASK-002, TASK-003.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** None.

---

### PHASE 1 — Data Model Extensions (Rust)

---

#### [x] TASK-005 — Extend `ModelInfo` with staleness-ranking fields

**Description:** In `src-tauri/src/commands/models.rs`, add three fields to the `ModelInfo` struct:
```rust
pub quality_rank: u8,           // numeric rank, higher = better (0 if unknown)
pub released_at: Option<String>,    // ISO 8601 date string, e.g. "2024-11-01"
pub changelog_url: Option<String>,  // URL to release notes
```
Update `#[derive(Serialize, Deserialize)]`. Find every location where `ModelInfo` is constructed (including the `get_available_models` function) and add the new fields with sensible defaults: `quality_rank` values should reflect relative quality among existing models (`demucs` = 1, `htdemucs` = 2, `htdemucs_ft` = 3, `bs_roformer` = 4). Add `released_at` and `changelog_url` as `None` for now (they will be populated from the model registry in a later task). Add unit tests in the same file verifying the new fields serialize to JSON correctly and that `quality_rank` is `u8`.

**Inputs:** `src-tauri/src/commands/models.rs`.

**Outputs / deliverables:** Updated `models.rs` with new fields and tests.

**Acceptance criteria:**
- `cd src-tauri && cargo clippy --lib -- -D warnings` emits zero warnings.
- `cd src-tauri && cargo test --lib` passes.
- `cd src-tauri && cargo fmt --check` passes.
- `ModelInfo` serialized JSON contains `quality_rank`, `released_at`, `changelog_url`.

**Dependencies:** TASK-001.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-006 — Extend `StemProvenance` with missing spec fields

**Description:** The existing `StemProvenance` struct in `src-tauri/src/stems/provenance.rs` is flat. Extend it with all fields required by the spec that are currently absent:

```rust
// Separation section additions
pub model_name: Option<String>,         // human-readable name, e.g. "HTDemucs Fine-Tuned"
pub model_family: Option<String>,       // e.g. "demucs", "roformer"
pub model_sha256: Option<String>,       // SHA-256 of the model checkpoint file
pub separation_duration_secs: Option<f64>, // wall-clock time the separation job took
pub device: Option<String>,             // "cpu" | "cuda" | "mps"

// Toolchain additions
pub ffmpeg_version: Option<String>,     // e.g. "7.0"
pub os_info: Option<String>,            // e.g. "macOS 15.1"

// Source file additions
pub source_size_bytes: Option<u64>,     // file size of the source at separation time
pub source_format: Option<String>,      // e.g. "flac", "mp3", "wav"
pub source_bitdepth: Option<u16>,       // e.g. 16, 24

// Export additions
pub export_codec: Option<String>,       // e.g. "alac", "aac"
pub export_dj_preset: Option<String>,   // e.g. "traktor", "rekordbox"
```

All new fields must be decorated with `#[serde(skip_serializing_if = "Option::is_none")]`. Update `StemProvenance::new(...)` constructor signature documentation. The constructor itself should not change its parameter list — callers should use field mutation after construction for the new optional fields. Add unit tests: round-trip serialization with all new fields populated, round-trip with all new fields absent (backward compatibility), and deserialization of an old minimal JSON (no new fields) must succeed without error.

**Inputs:** `src-tauri/src/stems/provenance.rs`.

**Outputs / deliverables:** Updated `provenance.rs` with new fields and extended tests.

**Acceptance criteria:**
- `cargo clippy --lib -- -D warnings` clean.
- `cargo test --lib` passes (all existing tests still green, new tests green).
- Old minimal JSON (from existing test `test_provenance_minimal_deserialization`) still deserializes without error.
- New fields appear in serialized output only when `Some(...)`.

**Dependencies:** TASK-001.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-007 — Add `provenance` field to `NIStemMetadata`

**Description:** In `src-tauri/src/stems/metadata.rs`, add `pub provenance: Option<StemProvenance>` to the `NIStemMetadata` struct. Import `StemProvenance` from `crate::stems::provenance`. Decorate with `#[serde(skip_serializing_if = "Option::is_none")]`. Update `NIStemMetadata::default()` to set `provenance: None`. Update `NIStemMetadata::new(...)` to also accept no provenance (keep it backward compatible — the field is `Option`). Add unit tests: `NIStemMetadata` with provenance serializes and deserializes correctly (the provenance block round-trips), and `NIStemMetadata` without provenance round-trips with the field absent from JSON (backward-compat test for old files that have no `provenance` key).

**Inputs:** `src-tauri/src/stems/metadata.rs`, `src-tauri/src/stems/provenance.rs` (from TASK-006).

**Outputs / deliverables:** Updated `metadata.rs`.

**Acceptance criteria:**
- `cargo clippy --lib -- -D warnings` clean.
- `cargo test --lib` passes.
- Existing metadata tests still pass unchanged.
- Serialized `NIStemMetadata` JSON includes a `"provenance"` key when set.

**Dependencies:** TASK-006.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-008 — Write provenance into stem files during packing

**Description:** In `src-tauri/src/commands/separation.rs`, find the `pack_stems_with_provenance` command (or equivalent packing flow) and ensure that the full extended `StemProvenance` (from TASK-006) is populated before being passed to `StemProvenance::save_to_sidecar`. Specifically, populate the new optional fields where the data is already available at pack time:
- `model_name`: look up from `get_available_models()` using `provenance.separation_model`.
- `model_family`: derive from model ID (e.g., any ID containing `"demucs"` → `"demucs"`, `"roformer"` → `"roformer"`).
- `device`: read from `SeparationSettings.device`.
- `export_codec`: read from `SeparationSettings.output_format`.
- `export_dj_preset`: read from `SeparationSettings.dj_preset`.
- `source_size_bytes`: stat the source file.
- `source_format`: derive from source file extension.

Do not block on fields that require sidecar data from the Python sidecar (like `ffmpeg_version`, `os_info`, `model_sha256`) — leave those as `None` for now. They will be populated by the Python sidecar reporting in a later task.

**Inputs:** `src-tauri/src/commands/separation.rs`, `src-tauri/src/commands/models.rs` (TASK-005), `src-tauri/src/stems/provenance.rs` (TASK-006).

**Outputs / deliverables:** Updated `separation.rs`.

**Acceptance criteria:**
- `cargo clippy --lib -- -D warnings` clean.
- `cargo test --lib` passes.
- Running a separation and inspecting the resulting `.prov.json` sidecar shows `model_family`, `device`, `export_codec`, `export_dj_preset`, `source_size_bytes`, and `source_format` populated.

**Dependencies:** TASK-005, TASK-006, TASK-007.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-009 — Update TypeScript `StemProvenance` type and utility functions

**Description:** In `src/lib/types/library.ts`, add all new optional fields from TASK-006 to the `StemProvenance` TypeScript interface. Update the utility function `getStalenessReasonDescription` if needed. Add two new utility functions: `formatDuration(seconds: number): string` (formats `94.3` → `"1m 34s"`) and `formatBitdepth(bits: number | undefined): string` (formats `16` → `"16-bit"`, undefined → `"—"`). Add corresponding unit tests in `src/lib/__tests__/library.test.ts`.

**Inputs:** `src/lib/types/library.ts`, `src/lib/__tests__/library.test.ts`.

**Outputs / deliverables:** Updated `library.ts` and `library.test.ts`.

**Acceptance criteria:**
- `npm run check` (TypeScript) clean.
- `npm run test:unit` passes.
- `StemProvenance.model_family`, `.device`, `.export_codec` etc. are accessible in TypeScript without type errors.

**Dependencies:** TASK-006.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** None.

---

### PHASE 2 — Database: Library Roots & Index Tables

---

#### [x] TASK-010 — Add `library_roots` and `library_index` database tables

**Description:** In `src-tauri/src/commands/db.rs`, add migration code in `run_migrations` to create the following tables if they do not exist:

```sql
CREATE TABLE IF NOT EXISTS library_roots (
    id          TEXT PRIMARY KEY,
    path        TEXT NOT NULL UNIQUE,
    output_strategy TEXT NOT NULL DEFAULT 'alongside',
    -- 'alongside' | 'mirrored' | 'flat'
    mirrored_path TEXT,          -- only if output_strategy = 'mirrored'
    flat_path   TEXT,            -- only if output_strategy = 'flat'
    scan_policy TEXT NOT NULL DEFAULT 'manual',
    -- 'manual' | 'on_open'
    ignored_globs TEXT,          -- JSON array of glob patterns
    staleness_policy TEXT,       -- JSON of staleness rules (nullable = use global)
    created_at  TEXT NOT NULL,
    last_scanned_at TEXT
);

CREATE TABLE IF NOT EXISTS library_index (
    id              TEXT PRIMARY KEY,
    root_id         TEXT NOT NULL REFERENCES library_roots(id) ON DELETE CASCADE,
    source_path     TEXT NOT NULL,
    source_sha256   TEXT,
    source_mtime    INTEGER,     -- Unix timestamp of source mtime at last scan
    source_inode    INTEGER,     -- Inode number for change detection
    stem_path       TEXT,
    status          TEXT NOT NULL,
    -- 'NoStem' | 'HasStemCurrent' | 'HasStemOutdated' | 'HasStemUnknownProvenance' | 'OrphanedStem' | 'Ignored'
    provenance_json TEXT,
    ignored         INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_library_index_root_id ON library_index(root_id);
CREATE INDEX IF NOT EXISTS idx_library_index_status ON library_index(status);
CREATE INDEX IF NOT EXISTS idx_library_index_source_sha256 ON library_index(source_sha256);
```

The migration must be idempotent (re-running on an existing DB must not fail). Add a unit test in the `db.rs` test section that opens an in-memory SQLite connection, runs `run_migrations`, and asserts all three tables exist via `PRAGMA table_info`.

**Inputs:** `src-tauri/src/commands/db.rs`.

**Outputs / deliverables:** Updated `db.rs` with migration code and tests.

**Acceptance criteria:**
- `cargo test --lib` passes.
- `cargo clippy --lib -- -D warnings` clean.
- Running migrations twice on the same connection does not error.

**Dependencies:** TASK-001.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-011 — Add `batch_queue` database table and status types

**Description:** Extend the migration in `db.rs` (TASK-010) with:

```sql
CREATE TABLE IF NOT EXISTS batch_queue (
    id          TEXT PRIMARY KEY,
    root_id     TEXT NOT NULL REFERENCES library_roots(id) ON DELETE CASCADE,
    source_path TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'processing' | 'done' | 'error' | 'cancelled'
    model_id    TEXT NOT NULL,
    dj_preset   TEXT,
    output_format TEXT,
    created_at  TEXT NOT NULL,
    started_at  TEXT,
    finished_at TEXT,
    error_message TEXT,
    priority    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_batch_queue_root_id ON batch_queue(root_id);
CREATE INDEX IF NOT EXISTS idx_batch_queue_status ON batch_queue(status);
```

Define a Rust `BatchQueueStatus` enum and `BatchQueueItem` struct in `db.rs` (or a new `src-tauri/src/commands/batch.rs` file). The enum variants must be `Pending`, `Processing`, `Done`, `Error`, `Cancelled`. Add serialization tests.

**Inputs:** `src-tauri/src/commands/db.rs` (from TASK-010).

**Outputs / deliverables:** Updated `db.rs` (or new `batch.rs`), migration extended, types defined.

**Acceptance criteria:**
- `cargo test --lib` passes including migration idempotence test.
- `cargo clippy --lib -- -D warnings` clean.

**Dependencies:** TASK-010.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-012 — Implement library root CRUD Tauri commands

**Description:** Create `src-tauri/src/commands/library_roots.rs`. Implement and register the following `#[tauri::command]` functions:

- `add_library_root(state, path: String, output_strategy: String, mirrored_path: Option<String>, flat_path: Option<String>) -> Result<String, String>` — inserts a new row into `library_roots`, returns the generated UUID id. Validate that `path` exists on disk.
- `list_library_roots(state) -> Result<Vec<LibraryRoot>, String>` — returns all rows.
- `update_library_root(state, id: String, updates: LibraryRootUpdate) -> Result<(), String>` — updates mutable fields.
- `delete_library_root(state, id: String) -> Result<(), String>` — deletes root and cascades to `library_index` and `batch_queue`.
- `get_library_root(state, id: String) -> Result<Option<LibraryRoot>, String>` — fetches a single root by id.

Define `LibraryRoot` and `LibraryRootUpdate` structs. Register all new commands in `src-tauri/src/lib.rs` `invoke_handler`. Add unit tests using `rusqlite::Connection::open_in_memory()` that verify insert, list, update, and delete operations at the SQL level.

**Inputs:** `src-tauri/src/commands/db.rs` (TASK-010), `src-tauri/src/lib.rs`.

**Outputs / deliverables:** `src-tauri/src/commands/library_roots.rs`, updated `lib.rs`, updated `src-tauri/src/commands/mod.rs`.

**Acceptance criteria:**
- All new commands compile and are registered.
- `cargo test --lib` passes.
- `cargo clippy --lib -- -D warnings` clean.
- Attempting to add a non-existent path returns an `Err`.

**Dependencies:** TASK-010.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

### PHASE 3 — Library Scanner Overhaul

---

#### [x] TASK-013 — Implement source-file-aware library scanner

**Description:** Overhaul `scan_library` in `src-tauri/src/commands/library.rs` (or a new `src-tauri/src/commands/scanner.rs`). The new scanner must:

1. Accept a `root_id: String` parameter and load the `LibraryRoot` config from the DB.
2. Walk the library root, collecting all audio source files matching the supported extensions: `.mp3`, `.flac`, `.wav`, `.aif`, `.aiff`, `.ogg`, `.opus`, `.m4a`, `.aac`, `.wv`, `.ape`. Exclude `.stem.mp4`, files in `__MACOSX/`, `.Spotlight-V100/`, and any directory or file matching the root's `ignored_globs` patterns (use the `glob` crate).
3. For each source file, determine its `StemFileState` (a new enum):
   - `NoStem` — source found, no matching stem file.
   - `HasStemCurrent` — stem exists, provenance present, `StalenessStatus::Current`.
   - `HasStemOutdated` — stem exists, provenance present, `StalenessStatus::Stale`.
   - `HasStemUnknownProvenance` — stem exists, no `.prov.json` sidecar.
4. Resolve source → stem matching via:
   - Hash match: `source.sha256 == StemProvenance.source_content_hash` (requires computing source SHA-256).
   - Path heuristic fallback: if no hash match, look for `<source_basename>.stem.mp4` alongside the source file.
5. Walk again for stem files whose source cannot be resolved → `OrphanedStem` state.
6. Persist results to `library_index` table (upsert by `source_path`).
7. Return a `LibraryScanResult` with counts per state and a list of `LibraryIndexEntry` records.

Keep the existing `scan_library` signature as a deprecated shim or rename it. The new command is `scan_library_root(state, root_id: String, full_rescan: bool) -> Result<LibraryScanResult, String>`.

**Inputs:** `db.rs` (TASK-010), `library_roots.rs` (TASK-012), `provenance.rs`, `staleness.rs`, `audio/hasher.rs`.

**Outputs / deliverables:** Updated or new scanner module, updated `lib.rs`.

**Acceptance criteria:**
- `cargo clippy --lib -- -D warnings` clean.
- `cargo test --lib` passes.
- New integration test (`src-tauri/tests/`) using `tempfile::TempDir` creates a directory with 3 source files and 1 matching stem (with `.prov.json`), runs the scanner, and asserts `no_stem_count == 2`, `has_stem_current_count == 1`.

**Dependencies:** TASK-011, TASK-012, TASK-006.

**Estimated complexity:** High.

**Privilege / tooling requirements:** The `glob` crate may need to be added to `src-tauri/Cargo.toml`. Stop and ask before adding new crate dependencies.

---

#### [x] TASK-014 — Implement incremental scanning (mtime/inode cache)

**Description:** Extend the scanner from TASK-013. When `full_rescan` is `false`:
1. For each file on disk, compare its current `mtime` (Unix timestamp) and `inode` against the stored values in `library_index`.
2. Skip re-evaluation if both match (the file has not changed since last scan).
3. Re-evaluate files whose `mtime` or `inode` differs, or which have no row in `library_index` yet.
4. Mark rows in `library_index` whose `source_path` no longer exists on disk as `OrphanedStem` (or delete them, configurable).
5. Update `library_roots.last_scanned_at` on completion.

Add a test: perform a full scan, then modify one file's mtime, then perform an incremental scan, and assert only the modified file is re-evaluated (instrument with a counter).

**Inputs:** Scanner from TASK-013, `db.rs`.

**Outputs / deliverables:** Extended scanner, extended tests.

**Acceptance criteria:**
- `cargo test --lib` passes.
- Incremental scan on unchanged library processes 0 source files (all skipped).
- Incremental scan after modifying one file processes exactly that file.

**Dependencies:** TASK-013.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-015 — Implement glob exclusion pattern filtering

**Description:** In the scanner (TASK-013), implement support for the `ignored_globs` field on `LibraryRoot`. The field is stored as a JSON array of glob strings (e.g. `["**/Samples/**", "**/_archive/**"]`). During the walk, skip any file whose relative path (relative to the root) matches any pattern. Use the `glob` crate's `Pattern::matches_path`. Write unit tests: a directory with 5 files where 2 are in a `Samples/` subdirectory, the glob `**/Samples/**` excludes them, and the scan returns 3 entries.

**Inputs:** Scanner (TASK-013), `library_roots.rs` (TASK-012).

**Outputs / deliverables:** Updated scanner with glob filtering, tests.

**Acceptance criteria:**
- `cargo test --lib` passes.
- Files matching exclusion patterns do not appear in scan results.
- Invalid glob patterns are logged as warnings, not errors (scan continues).

**Dependencies:** TASK-013.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** None.

---

### PHASE 4 — Enhanced Staleness Engine

---

#### [x] TASK-016 — Extend `StalenessRules` with quality-rank and age-based policies

**Description:** In `src-tauri/src/stems/staleness.rs`, extend `StalenessRules` with:
```rust
pub prefer_model_family: Option<String>,   // e.g. "roformer" — flag if not this family
pub quality_rank_threshold: Option<u8>,    // flag if current rank < (best_available - threshold)
pub age_days_threshold: Option<u32>,       // flag if stem older than N days AND better model exists
pub flag_unknown_provenance: bool,         // true = treat no-provenance as candidate
```
Extend `StalenessReason` with:
```rust
PreferredModelFamily { current_family: String, preferred: String },
QualityRankBelowThreshold { current_rank: u8, best_rank: u8 },
StemTooOld { age_days: u32, threshold: u32 },
```
Update `check_stem_staleness` to evaluate the new rules. The function now needs access to the best available model info; thread in a `BestModelInfo { model_family: String, quality_rank: u8 }` parameter (or expand `ModelVersionRegistry` to carry quality rank). Add unit tests for each new reason type.

**Inputs:** `src-tauri/src/stems/staleness.rs`, `src-tauri/src/commands/models.rs` (TASK-005).

**Outputs / deliverables:** Updated `staleness.rs` with new rules, reasons, and tests.

**Acceptance criteria:**
- `cargo clippy --lib -- -D warnings` clean.
- `cargo test --lib` passes.
- A stem with `model_family = "demucs"` and `prefer_model_family = "roformer"` returns `Stale([PreferredModelFamily {...}])`.
- A stem with `separation_timestamp` more than `age_days_threshold` days ago returns `Stale([StemTooOld {...}])`.

**Dependencies:** TASK-005, TASK-006.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-017 — Add orphan management Tauri commands

**Description:** In `src-tauri/src/commands/library.rs`, add:

- `get_library_orphans(state, root_id: String) -> Result<Vec<OrphanedStemEntry>, String>` — queries `library_index` for rows with `status = 'OrphanedStem'` for the given root, returns stem path, last known source path, file size, and last modified date.
- `re_link_orphan(state, stem_path: String, new_source_path: String) -> Result<RelinkResult, String>` — verifies the SHA-256 of `new_source_path` against `StemProvenance.source_content_hash`; if they match, updates the `library_index` row's `source_path` and `status`; returns a `RelinkResult { matched: bool, new_status: String }`.
- `delete_orphan_stem(state, stem_path: String) -> Result<(), String>` — moves the `.stem.mp4` and its `.prov.json` sidecar to the OS trash (use the `trash` crate or `std::fs::remove_file` as a fallback). Updates `library_index` row.
- `ignore_orphan_stem(state, stem_path: String) -> Result<(), String>` — sets `ignored = 1` in `library_index`.

Define `OrphanedStemEntry` and `RelinkResult` structs. Register all commands. Write unit tests for `re_link_orphan` (hash matches, hash mismatch, source file not found).

**Inputs:** `db.rs` (TASK-010), `library.rs`, `provenance.rs`.

**Outputs / deliverables:** Updated `library.rs`, updated `lib.rs`.

**Acceptance criteria:**
- All commands compile and are registered.
- `cargo test --lib` passes.
- `cargo clippy --lib -- -D warnings` clean.

**Dependencies:** TASK-013, TASK-010.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** The `trash` crate may need to be added. Stop and ask before adding it.

---

### PHASE 5 — Batch Queue Backend

---

#### [x] TASK-018 — Implement batch queue Tauri commands

**Description:** Create `src-tauri/src/commands/batch.rs`. Implement:

- `queue_batch_generate(state, root_id: String, model_id: String, dj_preset: String, output_format: String) -> Result<BatchQueueResult, String>` — queries `library_index` for all `NoStem` entries in the root, inserts a `batch_queue` row for each with status `pending`. Returns `BatchQueueResult { queued_count: usize, total_duration_secs: f64 }` (estimate duration from source file durations if available, else 0).
- `queue_batch_regenerate(state, root_id: String, model_id: String, include_unknown_provenance: bool, dj_preset: String, output_format: String) -> Result<BatchQueueResult, String>` — same but for `HasStemOutdated` (and optionally `HasStemUnknownProvenance`) entries.
- `get_batch_queue_status(state, root_id: String) -> Result<BatchQueueStatusSummary, String>` — returns counts by status and a list of the next 50 items.
- `pause_batch_queue(state, root_id: String) -> Result<(), String>` — sets a flag in app state that the processor checks.
- `resume_batch_queue(state, root_id: String) -> Result<(), String>` — clears the pause flag.
- `cancel_batch_queue(state, root_id: String) -> Result<(), String>` — sets all `pending` rows for the root to `cancelled`.
- `clear_completed_queue(state, root_id: String) -> Result<(), String>` — deletes `done` and `cancelled` rows for the root.

Define `BatchQueueResult`, `BatchQueueStatusSummary`, `BatchQueueItemPublic` structs. Register all commands. Add unit tests for the DB operations (insert, status query, cancel) using in-memory SQLite.

**Inputs:** `batch.rs` skeleton (TASK-011), `db.rs` (TASK-010, TASK-011), `library_index` (TASK-013).

**Outputs / deliverables:** `src-tauri/src/commands/batch.rs`, updated `lib.rs`, updated `mod.rs`.

**Acceptance criteria:**
- All commands compile and are registered.
- `cargo test --lib` passes.
- `queue_batch_generate` inserts the correct number of rows.
- `cancel_batch_queue` sets all pending items to `cancelled`.

**Dependencies:** TASK-011, TASK-013.

**Estimated complexity:** High.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-019 — Implement batch queue processor (async background task)

**Description:** Implement a background Tokio task in `batch.rs` that processes the batch queue. The processor:
1. Polls `batch_queue` for the next `pending` item (order by `priority DESC, created_at ASC`).
2. Marks it `processing`, updates `started_at`.
3. Invokes the existing separation pipeline (reuse `separation.rs` logic, or call the sidecar) for the source file with the specified model settings.
4. On success: updates row to `done`, `finished_at`; updates `library_index` to `HasStemCurrent`; writes provenance sidecar.
5. On error: updates row to `error`, stores error message.
6. Emits a Tauri event `batch_queue_progress` with `{ root_id, item_id, status, completed, total }` on each state change.
7. Respects the pause flag (sleeps 500 ms and re-checks when paused).
8. Stops when the queue is empty or `cancelled`.

The processor must be started via a `start_batch_processor(state, app_handle, root_id)` Tauri command. Guard against multiple concurrent processors for the same root (return an error if already running). Add a unit test that queues 3 items, starts the processor with a mocked sidecar, and asserts all 3 reach `done` status.

**Inputs:** `batch.rs` (TASK-018), `separation.rs`, `AppState`.

**Outputs / deliverables:** Updated `batch.rs`, updated `lib.rs`.

**Acceptance criteria:**
- `cargo clippy --lib -- -D warnings` clean.
- `cargo test --lib` passes.
- Processor emits `batch_queue_progress` events.
- Pause/resume/cancel correctly halts and restarts processing.

**Dependencies:** TASK-018.

**Estimated complexity:** High.

**Privilege / tooling requirements:** None.

---

### PHASE 6 — TypeScript: Types, Store, and Hooks

---

#### [x] TASK-020 — Update TypeScript types for scanner states and batch queue

**Description:** In `src/lib/types/library.ts`:
1. Add `StemFileState` type:
```typescript
export type StemFileState =
  | 'NoStem'
  | 'HasStemCurrent'
  | 'HasStemOutdated'
  | 'HasStemUnknownProvenance'
  | 'OrphanedStem'
  | 'Ignored';
```
2. Add `LibraryIndexEntry` interface (mirrors the DB row plus computed fields).
3. Add `LibraryRoot`, `LibraryRootUpdate` interfaces.
4. Add `BatchQueueItem`, `BatchQueueStatusSummary`, `BatchQueueResult` interfaces.
5. Add `OrphanedStemEntry`, `RelinkResult` interfaces.
6. Add `LibraryScanResultV2` (the new scanner result with per-state counts and `LibraryIndexEntry[]`).
7. Add utility: `stemStateLabel(state: StemFileState): string` and `stemStateColor(state: StemFileState): string` (returns a Tailwind color class like `"text-green-500"`).
8. Add tests for all new utilities in `library.test.ts`.

**Inputs:** `src/lib/types/library.ts`, `src/lib/__tests__/library.test.ts`.

**Outputs / deliverables:** Updated `library.ts` and `library.test.ts`.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes.

**Dependencies:** TASK-013, TASK-018.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-021 — Extend `libraryStore` with library root management and new scanner

**Description:** In `src/stores/libraryStore.ts`, add:
- State and actions for `libraryRoots: LibraryRoot[]`: `loadLibraryRoots`, `addLibraryRoot`, `updateLibraryRoot`, `deleteLibraryRoot`.
- Replace old `scanLibrary(path)` action with `scanLibraryRoot(rootId: string, fullRescan: boolean)` that calls the new `scan_library_root` command.
- State for `libraryIndex: LibraryIndexEntry[]`, `indexByState: Record<StemFileState, LibraryIndexEntry[]>` (computed on scan result).
- Actions: `setStatusFilter(states: StemFileState[])`, `setSearchQuery(q: string)`, `setGroupBy(by: 'folder' | 'model' | 'status' | 'none')` — computed selectors derive the filtered/grouped view.
- Selectors: `selectFilteredEntries`, `selectGroupedEntries`, `selectSummaryStats`.
- Extend `reset()` to clear new state.
- Update `src/stores/__tests__/libraryStore.test.ts` with tests for all new actions and selectors.

**Inputs:** `src/stores/libraryStore.ts`, `src/lib/types/library.ts` (TASK-020).

**Outputs / deliverables:** Updated `libraryStore.ts` and its tests.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes with new tests green.
- `selectFilteredEntries` correctly filters by state and search query.

**Dependencies:** TASK-020, TASK-012.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-022 — Add `batchQueueStore` Zustand store

**Description:** Create `src/stores/batchQueueStore.ts`. State and actions:
- `queueStatus: BatchQueueStatusSummary | null`
- `isProcessing: boolean`
- `isPaused: boolean`
- `queueError: string | null`
- `loadQueueStatus(rootId: string): Promise<void>`
- `queueGenerate(rootId, modelId, djPreset, outputFormat): Promise<BatchQueueResult>`
- `queueRegenerate(rootId, modelId, includeUnknown, djPreset, outputFormat): Promise<BatchQueueResult>`
- `startProcessor(rootId): Promise<void>`
- `pauseQueue(rootId): Promise<void>`
- `resumeQueue(rootId): Promise<void>`
- `cancelQueue(rootId): Promise<void>`
- `clearCompleted(rootId): Promise<void>`
- Subscribe to Tauri event `batch_queue_progress` in an `initBatchQueueListener(rootId)` action; update `queueStatus` on each event.

Create `src/stores/__tests__/batchQueueStore.test.ts` with tests for all actions (mock `invoke` and `listen`).

**Inputs:** `src/lib/types/library.ts` (TASK-020), Tauri API.

**Outputs / deliverables:** `src/stores/batchQueueStore.ts`, `src/stores/__tests__/batchQueueStore.test.ts`.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes.
- `initBatchQueueListener` subscribes to the correct event name.

**Dependencies:** TASK-018, TASK-020.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

### PHASE 7 — Navigation & App Shell

---

#### [x] TASK-023 — Add Library tab to sidebar navigation

**Description:** In `src/components/layout/Sidebar.tsx`, add a Library nav item:
```typescript
{ id: 'library' as const, icon: Library, label: 'Library' }
```
Import `Library` icon from `lucide-react`. Update the `ActiveView` type in `src/stores/appStore.ts` to include `'library'`. Update `src/App.tsx` to render the `<LibraryView />` component (stub with a placeholder `<div>` for now — the real component comes in TASK-024) when `activeView === 'library'`. Update keyboard shortcut mapping (currently `1-4`) to `1-5` for the new tab.

Update `src/components/layout/__tests__/Sidebar.test.tsx` to assert the Library nav item renders, is clickable, and sets the active view.

**Inputs:** `Sidebar.tsx`, `appStore.ts`, `App.tsx`, `useKeyboardShortcuts.ts`.

**Outputs / deliverables:** Updated `Sidebar.tsx`, `appStore.ts`, `App.tsx`, `useKeyboardShortcuts.ts`, updated tests.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes.
- Clicking the Library icon in the sidebar sets `activeView === 'library'`.
- Keyboard shortcut `5` navigates to Library.

**Dependencies:** TASK-001.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** None.

---

#### [x] TASK-024 — Implement `LibraryRootSettings` configuration panel

**Description:** Create `src/components/library/LibraryRootSettings.tsx`. This panel lets users manage library roots:
- List of configured roots with path, output strategy badge, and last-scanned time.
- "Add Root" button: opens a folder picker (Tauri `open` dialog, `directory: true`), then a small form to choose output strategy (`alongside` / `mirrored` / `flat`) and optionally a target path.
- Each root row has: "Scan Now" button (calls `scanLibraryRoot`), "Edit" (updates strategy), "Delete" (confirmation dialog before deleting).
- "Staleness Policy" section per root: form fields for `prefer_model_family`, `quality_rank_threshold`, `age_days_threshold`, `flag_unknown_provenance`.
- "Ignore Patterns" section: textarea for glob patterns (one per line), saved as JSON array.

Use existing `Button`, `Progress`, Radix UI components.

Create `src/components/library/__tests__/LibraryRootSettings.test.tsx` with tests for: initial render (no roots), add root flow, delete root confirmation.

**Inputs:** `libraryStore.ts` (TASK-021), Tauri dialog plugin, existing UI components.

**Outputs / deliverables:** `LibraryRootSettings.tsx` and its tests.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes.
- Folder picker calls `invoke('add_library_root', ...)` on confirm.
- Empty state renders a CTA to add the first root.

**Dependencies:** TASK-021, TASK-023.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

### PHASE 8 — Library Overview Panel & Table

---

#### [ ] TASK-025 — Implement `LibraryOverviewPanel` summary dashboard

**Description:** Create `src/components/library/LibraryOverviewPanel.tsx`. It receives a `LibraryScanResultV2` (or reads from `libraryStore`) and renders:
- Root path + last scanned timestamp.
- "Scan Now" and "⚙ Settings" buttons.
- A stat grid showing: total source files, stems (% of total), missing stems, current (✅), outdated (⚠️), unknown provenance (❓), orphaned (👻).
- A horizontal status breakdown bar (color-coded proportions).
- "Generate Missing" and "Regenerate Outdated" action buttons (disabled when no items, shows count).
- A scanning progress indicator (indeterminate spinner) when `isScanning === true`.

Create `src/components/library/__tests__/LibraryOverviewPanel.test.tsx`: test rendering with mock stats, test "Generate Missing" button disabled when `noStemCount === 0`, test "Scan Now" button calls `scanLibraryRoot`.

**Inputs:** `libraryStore.ts` (TASK-021), `batchQueueStore.ts` (TASK-022), UI components.

**Outputs / deliverables:** `LibraryOverviewPanel.tsx` and tests.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes.
- Stats match the mock data in tests.
- "Generate Missing" is disabled when `noStemCount === 0`.

**Dependencies:** TASK-021, TASK-022.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [ ] TASK-026 — Implement `LibraryTable` filterable, sortable table

**Description:** Create `src/components/library/LibraryTable.tsx`. A virtualized (or paginated — whichever avoids performance issues with thousands of rows) table showing one row per source file from `libraryStore.selectFilteredEntries`. Columns:

| Column | Implementation notes |
|---|---|
| Status icon | Color-coded badge using `stemStateLabel` / `stemStateColor` from TASK-020 |
| Title / Artist | From audio tags if available in `LibraryIndexEntry`, else filename |
| Duration | Formatted with `formatDuration` |
| Stem Model | `provenance_json?.separation_model` or `—` |
| Stem Date | `provenance_json?.separation_timestamp` formatted, or `—` |
| Staleness Reason | Text from `getStalenessReasonDescription` |

Table features:
- Sortable columns (click header to sort asc/desc).
- Filter toolbar: status multi-select checkboxes, model dropdown, free-text search.
- Grouping selector (by folder / model / status / none).
- Row checkbox for multi-select (shift-click for range selection).
- Clicking a row opens `StemInfoPanel` in a side panel.
- Right-click context menu: "Regenerate", "Mark as Ignored", "Open Source in Finder", "Open Stem in Finder", "Delete Stem".

Create `src/components/library/__tests__/LibraryTable.test.tsx`: render with 0 rows (empty state), render with 5 mock entries, filter by status, sort by date, row selection, context menu visibility.

**Inputs:** `libraryStore.ts` (TASK-021), `library.ts` (TASK-020), `StemInfoPanel.tsx`.

**Outputs / deliverables:** `LibraryTable.tsx` and tests.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes.
- Filtering by status `NoStem` hides rows with other statuses.
- Sorting by "Stem Date" reorders rows correctly.
- Right-click menu is visible on right-click.

**Dependencies:** TASK-021, TASK-025.

**Estimated complexity:** High.

**Privilege / tooling requirements:** None.

---

#### [ ] TASK-027 — Assemble the `LibraryView` page component

**Description:** Create `src/components/library/LibraryView.tsx` as the top-level page. It composes:
- If no library roots configured: an empty state CTA with "Set up Library" button → opens `LibraryRootSettings`.
- Otherwise: `<LibraryOverviewPanel />` at top, `<LibraryTable />` below, `<StemInfoPanel />` in a slide-out side panel (triggered by table row click).
- A top-level "Settings" icon that shows `<LibraryRootSettings />` in a dialog or slide-out panel.

Connect to `libraryStore`: call `loadLibraryRoots()` on mount; if roots exist, call `scanLibraryRoot` with `full_rescan: false` on first render.

Update `src/App.tsx` to import and render `LibraryView` when `activeView === 'library'` (replacing the temporary stub from TASK-023).

Create `src/components/library/__tests__/LibraryView.test.tsx`: empty state renders CTA, configured-state renders overview and table.

**Inputs:** `LibraryOverviewPanel.tsx` (TASK-025), `LibraryTable.tsx` (TASK-026), `StemInfoPanel.tsx`, `LibraryRootSettings.tsx` (TASK-024), `libraryStore.ts` (TASK-021).

**Outputs / deliverables:** `LibraryView.tsx`, updated `App.tsx`, tests.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes.
- Empty state renders when `libraryRoots.length === 0`.

**Dependencies:** TASK-024, TASK-025, TASK-026.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

### PHASE 9 — Enhanced Stem Info Panel

---

#### [ ] TASK-028 — Enhance `StemInfoPanel` with full nested provenance display

**Description:** Update `src/components/library/StemInfoPanel.tsx` to display all the new provenance fields from TASK-009:
- **SEPARATION section:** Model, Model Version, Model Family, Device, Separation Duration (formatted as `"1m 34s"`), Created At.
- **TOOLCHAIN section:** stemgen-gui, Python sidecar, FFmpeg version, OS.
- **SOURCE section:** Filename, SHA-256 (truncated with copy button), Format, Sample Rate, Bit Depth, Size, Duration.
- **EXPORT section:** Codec, DJ Preset.
- Each section uses a card layout consistent with the existing table style.
- The "Regenerate with best model" button: enabled when `isStemStale`, disabled with a tooltip when `isStemCurrent`. When clicked it queues a single-file regeneration (invoke `queue_batch_regenerate` with the specific file).
- The "Open stem file" button calls the `reveal_in_finder` command (or Tauri `open`).
- Show staleness badge at top with the reasons listed below it.

Update `src/components/library/__tests__/StemInfoPanel.test.tsx` (from TASK-002) to cover new sections and the "Regenerate" button.

**Inputs:** `StemInfoPanel.tsx`, `library.ts` (TASK-009), `batchQueueStore.ts` (TASK-022).

**Outputs / deliverables:** Updated `StemInfoPanel.tsx` and its tests.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes including updated StemInfoPanel tests.
- All four sections render when provenance contains corresponding data.
- "Regenerate" button is disabled when status is `Current`.

**Dependencies:** TASK-009, TASK-022, TASK-002.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

### PHASE 10 — Batch Operations UI

---

#### [ ] TASK-029 — Implement batch confirmation dialog

**Description:** Create `src/components/library/BatchConfirmDialog.tsx`. A Radix UI `AlertDialog` that shows before starting any batch operation:
- Title: "Generate Missing Stems" or "Regenerate Outdated Stems".
- Body: N files selected, estimated total duration (from `BatchQueueResult.total_duration_secs`), selected model name, selected DJ preset, output format.
- For regenerate: a note that existing stem files will be replaced (moved to Trash).
- "Include unknown-provenance stems" checkbox (for regenerate mode).
- "Cancel" and "Start" buttons.

Create `src/components/library/__tests__/BatchConfirmDialog.test.tsx`: renders with correct stats, Cancel closes dialog, Start calls the appropriate store action.

**Inputs:** `batchQueueStore.ts` (TASK-022), `libraryStore.ts`, Radix UI.

**Outputs / deliverables:** `BatchConfirmDialog.tsx` and tests.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes.
- Estimated time is displayed in a human-readable format.

**Dependencies:** TASK-022.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [ ] TASK-030 — Implement `BatchQueueView` progress UI

**Description:** Create `src/components/library/BatchQueueView.tsx`. This view is shown as an overlay or modal when a batch job is active. It displays:
- Total progress bar (completed / total items).
- Estimated remaining time.
- A scrollable list of batch queue items, each showing: source filename, status badge (Pending / Processing / Done / Error), time elapsed.
- "Pause / Resume" toggle button.
- "Cancel All" button (with confirmation).
- When all items are done: a "Done" summary with counts and a "Close" button.
- Subscribe to `batchQueueStore` and refresh in real-time as events arrive.

Create `src/components/library/__tests__/BatchQueueView.test.tsx`: renders with 3 items, Pause button calls `pauseQueue`, cancel confirmation dialog appears on "Cancel All".

**Inputs:** `batchQueueStore.ts` (TASK-022), UI components.

**Outputs / deliverables:** `BatchQueueView.tsx` and tests.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes.
- Progress bar reflects `completed / total` correctly.
- Pause/Resume button text toggles correctly.

**Dependencies:** TASK-022, TASK-029.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [ ] TASK-031 — Implement `OrphanedStemsView` cleanup UI

**Description:** Create `src/components/library/OrphanedStemsView.tsx`. A filterable list (derived from `libraryStore` entries with `status === 'OrphanedStem'`) showing:
- Orphaned stem path, last known source path, file size, last-seen date.
- Per-row actions: "Delete" (confirmation), "Re-link to Source" (opens file picker, calls `re_link_orphan`, shows hash verification result), "Ignore".
- Bulk "Delete All Orphans" button with confirmation.

Create `src/components/library/__tests__/OrphanedStemsView.test.tsx`: render with 2 orphans, Delete triggers confirmation, Re-link opens dialog.

**Inputs:** `libraryStore.ts` (TASK-021), Tauri dialog, `library.ts` (TASK-020).

**Outputs / deliverables:** `OrphanedStemsView.tsx` and tests.

**Acceptance criteria:**
- `npm run check` clean.
- `npm run test:unit` passes.
- "Delete All" does not proceed without confirmation.

**Dependencies:** TASK-017, TASK-021.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

### PHASE 11 — Internationalisation, Integration Tests & Playwright E2E

---

#### [ ] TASK-032 — Update i18n translation files

**Description:** All user-visible strings in the new components (TASK-023 through TASK-031) must be internationalised. Add every new string key to `src/i18n/en.json` under a `library` namespace. Provide German translations for all keys in `src/i18n/de.json`. Apply `useTranslation` from `i18next` in every new component to replace hardcoded English strings. Run the existing i18n tests (`src/i18n/__tests__/index.test.ts`) and add a new test asserting every key in `en.json.library` also exists in `de.json.library`.

**Inputs:** All new components, `src/i18n/en.json`, `src/i18n/de.json`, `src/i18n/__tests__/index.test.ts`.

**Outputs / deliverables:** Updated i18n files and test.

**Acceptance criteria:**
- `npm run test:unit` passes including i18n parity test.
- `npm run check` clean.
- No hardcoded English strings in any new component.

**Dependencies:** TASK-027, TASK-028, TASK-029, TASK-030, TASK-031.

**Estimated complexity:** Medium.

**Privilege / tooling requirements:** None.

---

#### [ ] TASK-033 — Add Vitest integration tests for new Library components

**Description:** In `src/__tests__/integration/`, create `LibraryView.test.tsx`. Use `@testing-library/react` with full store context to test the integrated component tree: add a library root → trigger scan → verify table renders entries → click row → verify StemInfoPanel opens → verify "Generate Missing" triggers batch confirmation dialog → confirm → verify batch queue view appears. Mock all Tauri `invoke` calls with realistic response objects.

**Inputs:** `LibraryView.tsx` (TASK-027), all stores, `src/__tests__/integration/setup.ts`.

**Outputs / deliverables:** `src/__tests__/integration/LibraryView.test.tsx`.

**Acceptance criteria:**
- `npm run test:integration` passes.
- Test covers the add-root → scan → select → regenerate happy path end-to-end.

**Dependencies:** TASK-027, TASK-030.

**Estimated complexity:** High.

**Privilege / tooling requirements:** None.

---

#### [ ] TASK-034 — Add Playwright E2E tests for Library tab

**Description:** Create `src/__tests__/e2e/library.spec.ts` (for the dev-server Playwright suite). Tests:
1. Navigate to Library tab via sidebar click — assert Library tab is active.
2. Navigate via keyboard shortcut `5` — assert Library tab is active.
3. Empty state renders "Set up Library" CTA.
4. Add library root flow: click "Set up Library", assert `LibraryRootSettings` panel is visible.
5. After adding a mock root (stub `invoke` via `page.route`), overview panel renders with stat cards.
6. Library table renders rows; clicking a row shows the side panel.
7. "Scan Now" button triggers scan (assert loading spinner, then results).

Create corresponding `src/__tests__/e2e/binary/library.spec.ts` for the binary E2E suite (Windows/Linux) mirroring the navigation tests. Add `src/__tests__/e2e/binary/linux/library.spec.ts` for Linux.

**Inputs:** `LibraryView.tsx`, existing E2E helpers.

**Outputs / deliverables:** `library.spec.ts` files in dev-server and binary suites.

**Acceptance criteria:**
- `npx playwright test --project=chromium src/__tests__/e2e/library.spec.ts` passes.
- No regressions in existing E2E tests.

**Dependencies:** TASK-027, TASK-023.

**Estimated complexity:** High.

**Privilege / tooling requirements:** Playwright must already be installed (it is). No new installs needed.

---

#### [ ] TASK-035 — Add Rust integration tests for scanner, batch, and orphan commands

**Description:** In `src-tauri/tests/`, create `library_management.rs`. Tests (using `tempfile::TempDir` and in-memory or temp-file SQLite):
1. `test_scan_finds_no_stem_entries` — directory with 3 audio files, no stems → all 3 as `NoStem`.
2. `test_scan_finds_current_stem` — directory with 1 audio file + matching `.stem.mp4` + `.prov.json` with hash → `HasStemCurrent`.
3. `test_scan_finds_unknown_provenance` — stem file with no sidecar → `HasStemUnknownProvenance`.
4. `test_scan_finds_orphan` — stem file with no matching source → `OrphanedStem`.
5. `test_incremental_scan_skips_unchanged` — run scan twice, assert second scan does fewer file reads.
6. `test_batch_queue_generate_inserts_correct_count` — 3 `NoStem` entries → `queue_batch_generate` → 3 rows in `batch_queue`.
7. `test_cancel_batch_queue` — 3 pending rows → `cancel_batch_queue` → all rows are `cancelled`.
8. `test_relink_orphan_hash_match` — orphan stem with known hash, provide source that matches → `RelinkResult.matched = true`.
9. `test_relink_orphan_hash_mismatch` — provide wrong source → `RelinkResult.matched = false`.

**Inputs:** Scanner (TASK-013, TASK-014), batch commands (TASK-018), orphan commands (TASK-017), `db.rs` (TASK-010).

**Outputs / deliverables:** `src-tauri/tests/library_management.rs`.

**Acceptance criteria:**
- `cd src-tauri && cargo test --tests library_management` passes.
- All 9 test cases green.

**Dependencies:** TASK-013, TASK-014, TASK-017, TASK-018.

**Estimated complexity:** High.

**Privilege / tooling requirements:** None.

---

### PHASE 12 — Release Preparation

---

#### [ ] TASK-036 — Raise coverage thresholds (second pass)

**Description:** After all tests in TASK-025 through TASK-035 are merged, re-check actual coverage and raise thresholds further: lines 55 %, functions 75 %, branches 72 %, statements 55 %. Edit `vitest.config.ts`. Run `npm run test:unit -- --coverage` locally to confirm thresholds are met before committing.

**Inputs:** `vitest.config.ts`, all test files.

**Outputs / deliverables:** Updated `vitest.config.ts`.

**Acceptance criteria:**
- `npm run test:unit -- --coverage` exits 0.
- CI `frontend` job passes.

**Dependencies:** TASK-033.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** None.

---

#### [ ] TASK-037 — Update `CHANGELOG.md` and bump version

**Description:** In `CHANGELOG.md`, add a new entry for the next version (e.g. `1.3.0`) under `## [Unreleased]` → `## [1.3.0] - YYYY-MM-DD`. Document every user-visible change: new Library tab, library root configuration, provenance extended metadata, staleness policy engine, batch generate/regenerate, orphaned stem cleanup, library health report export, and all new Tauri commands. Bump the version number in `package.json` (root) and `src-tauri/Cargo.toml` (and `src-tauri/tauri.conf.json` if present) from `1.2.5` to `1.3.0`. Ensure all three version strings are in sync.

**Inputs:** `CHANGELOG.md`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.

**Outputs / deliverables:** Updated files.

**Acceptance criteria:**
- `grep '"version"' package.json` returns `"1.3.0"`.
- `grep '^version' src-tauri/Cargo.toml` returns `version = "1.3.0"`.
- `CHANGELOG.md` has a `## [1.3.0]` section with all new features documented.
- `cargo build --release` succeeds (version embedded in binary is `1.3.0`).

**Dependencies:** TASK-036.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** None.

---

#### [ ] TASK-038 — Final CI validation on feature branch

**Description:** Ensure the complete CI pipeline passes on `feature/library-management`:
1. Push all committed changes.
2. Monitor GitHub Actions: wait for all jobs (`frontend`, `integration`, `e2e`, `backend`, `e2e-binary`, `security`, `check`) to complete.
3. If any job fails, read the failure log, fix the issue, push a new commit referencing the failing task ID (e.g. `fix(TASK-026): resolve TypeScript error in LibraryTable`), and wait again.
4. Iterate until the `check` job (the final gate) succeeds with `"All critical checks passed!"`.

**Inputs:** Feature branch at HEAD, GitHub Actions CI config.

**Outputs / deliverables:** A passing CI run on the feature branch (GitHub Actions run ID logged in the commit message).

**Acceptance criteria:**
- All CI jobs green (not just `check`).
- No `continue-on-error` jobs are hiding failures.
- Telegram failure notification is NOT triggered.

**Dependencies:** TASK-037.

**Estimated complexity:** Low (in terms of code changes) / High (in terms of iteration if CI fails).

**Privilege / tooling requirements:** Requires GitHub Actions access. Stop and report failures to the user if CI is blocked by infrastructure issues (runner unavailability, secrets missing, etc.) rather than code issues.

---

#### [ ] TASK-039 — Merge feature branch to `main`

**Description:** Once TASK-038 confirms CI is green, open a Pull Request from `feature/library-management` → `main` (or merge directly if branch protection allows). The PR description must include: a summary of all new features, a link to the passing CI run, and a note that `CHANGELOG.md` and version have been updated. After merge, delete the `feature/library-management` branch. Verify CI runs on `main` post-merge and passes.

**Inputs:** Feature branch (TASK-038 passing), `main` branch.

**Outputs / deliverables:** Feature branch merged to `main`, branch deleted, CI green on `main`.

**Acceptance criteria:**
- `git log main --oneline | head -1` shows the merge commit.
- GitHub Actions on `main` passes all jobs.
- `feature/library-management` branch no longer exists on remote.

**Dependencies:** TASK-038.

**Estimated complexity:** Low.

**Privilege / tooling requirements:** Requires merge permissions on `main`. If branch protection requires review approvals, stop and request a reviewer before proceeding.

---

## Verification & Release

Perform the following checks after TASK-039 (merge to `main`) is complete.

1. **End-to-end smoke test:** Build the release binary (`cargo tauri build`). Launch the built app. Add a local directory as a library root. Trigger a full scan. Verify summary stats render correctly. Queue "Generate Missing" for at least one file. Start the processor. Confirm the stem file is created, the `.prov.json` sidecar is written, and the library index updates to `HasStemCurrent`.

2. **GUI verification:** Open the Library tab and verify: overview panel renders with correct counts; the library table is filterable by status, model, and text search; clicking a row opens the StemInfoPanel with all four sections (Separation, Toolchain, Source, Export) populated; edge cases — very long file paths are truncated with `title` tooltip; non-ASCII source paths (Japanese, German, Arabic) display correctly; a stem with no provenance shows the "Unknown Provenance" empty state; a path with zero source files shows an empty table with a clear CTA.

3. **Staleness detection test:** Separate a file using model rank 2 (e.g. `htdemucs`). Manually edit the `.prov.json` to set `model_family = "demucs"`. Configure the staleness policy to `prefer_model_family = "roformer"`. Re-scan. Confirm the stem shows `HasStemOutdated` with the `PreferredModelFamily` staleness reason visible in the UI.

4. **Incremental scan performance test:** Scan a library with at least 100 source files. Record the time. Without modifying any files, trigger a second incremental scan. Confirm the second scan completes in noticeably less time (no source SHA-256 hashing on unchanged files).

5. **Orphan cleanup test:** Delete the source file of a processed stem from disk. Re-scan the library. Confirm the stem shows `OrphanedStem`. Use the Re-link dialog to re-link it to a copy of the original source. Confirm the hash verification succeeds and the status returns to `HasStemCurrent`.

6. **Regression sweep:** Run the full test suite (`npm run test:unit`, `npm run test:integration`, `npx playwright test`, `cd src-tauri && cargo test --lib --tests`). Confirm zero previously passing tests are now failing.

7. **Update changelog and bump version:** Confirm `CHANGELOG.md` has the `## [1.3.0]` entry and all three version files (`package.json`, `Cargo.toml`, `tauri.conf.json`) are at `1.3.0` (done in TASK-037; verify no drift occurred during iteration).

8. **General release preparation:** Run `npm run release:prep` to validate the release artifacts. Confirm no build warnings. Confirm binary builds succeed on all three platforms (macOS, Windows, Linux) via the release workflow (`release.yml`).

9. **Tag the release** with `git tag v1.3.0` and push the tag. Draft GitHub Release notes summarising every new metadata field, GUI addition (Library tab, Overview Panel, Library Table, Stem Info Panel enhancement, Batch Queue, Orphan Cleanup), and library management command (13 new Tauri commands). Include the updated provenance JSON schema as a code block in the notes.

10. **Verification on GitHub:** Check that both CI (push to `main`) and CD (tag push `v1.3.0`) pipelines succeed in GitHub Actions. Monitor the CD workflow's artifact upload and release asset creation. If either pipeline fails, iterate on fixes using the TASK-038 process, push a patch tag (`v1.3.0-patch.1` if needed), and update the release.

---

## Operational Constraints

- **Pause-and-ask policy:** If at any point the AI agent needs elevated privileges, access to external services, new library installations (e.g., adding a new Rust crate to `Cargo.toml` or a new npm package to `package.json`), additional MCP server connections, API keys, or anything beyond its current sandbox capabilities, it must **immediately stop execution, clearly describe what it needs and why, and wait for explicit approval** before continuing. Specifically: the `glob`, `trash`, and any other new Rust crates must be approved before adding.

- **Incremental commits:** Each task must be committed separately with a descriptive commit message in the format `feat(TASK-NNN): <short description>` or `fix(TASK-NNN): <short description>`. This ensures progress is reviewable and reversible. Do not batch multiple tasks into a single commit.

- **No silent failures:** Any error that can occur at runtime — scan errors, provenance read failures, batch queue processor errors, hash mismatches — must surface explicitly in the GUI (error state, toast notification, or inline error message) and in the structured logs via `tracing::error!` or `tracing::warn!`. Never silently swallow errors, default to empty state, or log-only without surfacing to the user.

- **Backward compatibility:** All changes to `StemProvenance`, `NIStemMetadata`, and DB schema must be backward-compatible. Old stem files with no provenance, old DB rows with missing columns, and old JSON missing new optional fields must all be handled gracefully without panics or crashes. Every new field is `Option<T>` with `skip_serializing_if = "Option::is_none"`.

- **Test before commit:** Before committing any task, run the relevant test suite locally. Do not commit code that causes `cargo test` or `npm run test:unit` to fail. CI is a safety net, not a substitute for local verification.
