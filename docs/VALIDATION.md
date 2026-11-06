# AI-first interface refresh — 2026-11-05

- **92 automated tests passed**: 33 core, 30 native, 29 frontend; one existing
  interactive reveal smoke ignored. Full check passed before final presentation
  refinements; frontend tests, TypeScript/Vite and the Windows debug/no-bundle
  build passed again afterward. Rust source did not change in this refresh.
- New sorting tests cover exact byte order beyond JavaScript's safe integer
  range, natural Turkish name order, stable ties and preserving the source list.
- Browser mocked-IPC checks cover the AI-first empty screen, targeted scan,
  progress/cancel/partial results, search/name sorting, reveal path selection,
  folder/disk selection, exclusion saving and stale warnings without auto-rescan.
  Opening/closing scan setup preserves search and the later size-results page;
  the size browser still renders at most 50 files and 50 directories per page.
- A settings-load/last-result-restore race discovered during UI checks was fixed:
  the failed exclusions panel and retry remain visible, with scan start disabled.
  Setup opens with focus on the selected scope and closes back to New scan.
- Responsive checks: 720 x 600 has no horizontal overflow, 1120 x 820 (native
  default size) shows both AI cards and reveal controls, and wider windows use
  two columns. Primary button text contrast is 4.81:1 (4.59:1 on hover); this is
  not a claim of a full accessibility audit. Final preview console had no errors.
- Current-run before/after screenshots are ignored local artifacts under
  `artifacts/qa/ui-before-*`, `ui-after-*` and `ui-default-window.jpg`. They are
  explicitly labeled sample data, not measurements from the user's disks.
- Native UI acceptance and macOS build/device testing remain pending. Existing
  scan/watch/storage tests verify their own native paths separately. No deletion,
  actual user-data reset, automatic scan or publication was added in this refresh.

# Retained AI view and targeted scan — 2026-11-05

- **90 automated tests passed**: 33 core, 30 native, 27 frontend; one existing
  interactive reveal smoke ignored. Full frontend build/tests, core tests,
  workspace check and native tests passed. Windows debug/no-bundle build passed;
  delivered executable is hash-matched against the native output.
- Native AI-root fixtures verify only supported direct user-data roots enter the
  plan: ordinary sibling trees/files remain outside, exact Codex/Ollama byte
  totals/classification are retained, and absent roots never become a broad scan.
  A saved AI scope round-trips through the persistent store. Frontend target tests
  verify AI mode is independent of disk discovery/loading/selection.
- Browser mocked-IPC navigation regression: AI remains selected at scan start,
  completion and cancellation. Direct action invokes mode=ai; disk-list calls stay
  zero. Reopening the cancelled AI record restores AI view/partial flags with zero
  scans and zero disk-list calls. This fixture proves UI flow, not native sizing.
- 720 x 600 layout had scrollWidth 705, the AI action visible and a clean console.
  `artifacts/qa/ai-targeted-scan.jpg` uses labeled sample data. Native desktop UI and
  Mac device acceptance remain separate; existing scan/watch/exclusion tests pass.
- This action targets known AI data, not all custom/project storage or exclusively
  temporary/disposable files. No deletion capability or GitHub publication added.

# Live change detection with manual rescan — 2026-11-04

- **86 automated tests passed**: 33 core, 27 native, 26 frontend; one existing
  interactive reveal smoke ignored. Full check passed: frontend build/tests,
  core tests, workspace check and native tests. Windows debug/no-bundle build
  passed; the delivery executable is hash-matched to its native output.
- Real Windows filesystem/ReadDirectoryChangesW tests detect nested file create,
  overwrite, rename, deletion and root-directory rename. They verify excluded
  subtree/.app activity and file reads do not stale a result, sibling prefix
  names still count, old watcher generations stop influencing replacements, and
  new sessions begin clean. Tests modify/remove only app-created fixture files.
- Native tests cover Unicode/bounds notification parsing, missing-root coverage,
  lost-batch uncertainty and preserving a known stale state through a later
  error. Existing persisted reports lacking watchPolicy remain deserializable.
- Frontend notice tests distinguish pending/session-active/stale/incomplete and
  explicitly state that scanning does not start automatically. Browser mocked-IPC
  checks retain the 5 GB/path filter and matching row when the warning arrives,
  with scan count still zero; view changes preserve the warning. A user rescan
  increments the scan count once and resets it; monitoring failure is explicit.
- Windows monitoring is tested natively, independently of browser UI fixtures.
  Mac FSEvents code is present but a Mac build/device test remains pending. The
  notification mechanism is best effort, not an offline or durable change journal.
- Existing persistence, exclusions, sizing/paging, progress/cancellation and reveal
  tests stay green. No automatic scan, file contents read, or deletion feature.

# Last scan persistence and stale-result notice — 2026-11-04

- **77 automated tests passed**: 33 core, 21 native, 23 frontend; one pre-existing
  interactive file-manager smoke ignored. Full check (frontend build/tests, core
  tests, workspace check and native tests) passed. Windows debug/no-bundle build
  passed and delivery is hash-matched to the native output.
- A fresh native store reopens the typed report and a **10,073-row** size index
  after all previous store/snapshot objects drop. It preserves exact u64::MAX,
  inclusive 5 GB filtering, a match beyond 10,000, bounded 50-row pages, Unicode
  paths, recognized project findings, cancellation and incomplete-size flags.
- Native tests verify current-generation survival on shutdown, replacement waiting
  for a live reader before owned cleanup, interrupted staging and failed-save
  preservation of the old record, missing/invalid/corrupt snapshot errors without
  creating/replacing files, and refusing cleanup outside the owned root.
- Frontend tests cover cancelled/partial titles and valid/invalid scan dates.
  The notice warns of possible changes; no change detection/watcher is claimed.
- Browser mocked-IPC checks: initial scan then reload shows saved groups/date with
  zero new scans; the saved index filters to a result beyond 10,000; rescan errors
  retain old visible results; a missing disk never falls back to another scope;
  save/load errors and cancelled saved records are explicit. Browser persistence
  is a fixture; real SQLite reopening correctness is established above.
- Scanned files remain unchanged. Existing progress, cancel, size paging/filtering,
  exclusions and reveal checks stay green. Native desktop screen acceptance and
  Mac build/APFS/Finder device verification are still pending.

# Persistent exclusions and automatic system/install scope — 2026-11-04

- **71 automated tests passed**: 33 core, 17 native and 21 frontend; one existing
  interactive Explorer smoke remains ignored. Full check passed, then the added
  native policy test passed alongside persistence/error tests. TypeScript/Vite,
  workspace check and Windows debug/no-bundle compilation passed.
- New real-filesystem tests cover excluded subtrees/files, component-prefix
  collisions, Windows case matching and SYSTEM attributes, direct nested root
  rejection, separately requested excluded roots, app bundle ancestors, exact
  included byte totals, retained AI/project recognition and no excluded sink rows.
- Native settings tests reopen a fresh store, preserve disconnected paths, reject
  invalid additions without losing prior settings, remove/rewrite choices, retain
  corrupt JSON unchanged, and surface save failures. A read-only native policy
  test verifies standard system paths and rejects volume-root exclusions.
- Browser mocked-IPC checks cover multi-folder add, picker cancel, remove, page
  reload retention, locked controls during scan, visible save failure retaining
  prior choices, and load failure blocking scan even after selecting a target.
  Screenshots use clearly labeled sample data; actual persistence/scanning is
  verified by the Rust tests, not by this browser mock.
- Existing result paging, size filtering, progress/cancellation and reveal tests
  remain green. No scanned files are modified and no deletion feature exists.
- This is location-based protection, not an exhaustive ownership classifier for
  portable/unregistered applications. macOS source paths/bundle logic are present;
  a native Mac build and APFS/Finder/device screen acceptance are still pending.

# Unlimited, disk-backed size results — 2026-11-04

- **64 automated tests passed**: 29 core (20 inspection + 9 multi-root), 14 native
  state/discovery/reveal-validation/index tests, 21 frontend tests. The existing
  interactive Explorer smoke test remains ignored in default runs.
- TypeScript/Vite build, Rust workspace check and Windows debug/no-bundle build
  passed. The delivered executable is copied and SHA-256 checked against output.
- A real fixture streamed **10,013 files** through the scanner without retaining
  a full array. An independent SQLite test traversed every page of **10,073 files
  and 10,073 directories**, including equal-size ties, forward/backward cursors,
  high-end searches and inclusive byte boundaries. No duplicate/missing rows.
- Tests cover exact u64::MAX sizing, literal Unicode/punctuation search, missing
  index IDs, cancellation generations, owned-directory cleanup with live readers,
  a real cancelled walk producing a queryable partial index, write-error propagation
  and excluding the app's own temporary metadata without hiding user results.
- Synthetic metadata benchmark (Windows debug build): 100,001 catalog rows wrote
  in **1.758 s**; first 50 rows plus exact count took **94.4 ms**. Database size
  **15,753,216 bytes**. Connection page cache configured to 4 MiB. This is an index
  benchmark, not a whole-disk scan-speed, peak-RAM or native-frame-rate claim.
- Browser mocked-IPC evidence covers 10,123 matches per kind, at most 100 rendered
  cards total, next/previous replacing rows, finding a path beyond 10,000, no-rescan
  filtering, stale delayed responses, result-query cancellation, and scan cancel
  partial-state rendering. Actual data correctness is separately covered above.
- All desktop scan scopes are now uncapped by entry/depth. Core library budgets,
  developer/AI group summaries and warning retention remain separate concerns.
- The temporary metadata database is local, removed on normal scan replacement/
  shutdown and excluded from its own walk (APFS alias handling is source-checked).
  Insufficient temporary space fails explicitly; it does not silently cap results.
- No delete/trash UI, GitHub publication or remote. Windows native app screen
  acceptance and real macOS build/Finder/APFS device checks remain pending.

Prior sections describe earlier builds and superseded bounded list designs.

---
# Minimum GB filter — 2026-11-04

- **60 tests passed**: 28 core (19 inspection + 9 multi-root), 8 native
  state/discovery/path checks, 24 frontend. Native Explorer smoke is intentionally
  ignored in default runs; its prior evidence belongs to the previous build.
- TypeScript/Vite build, Rust workspace check and Windows debug/no-bundle build
  passed. The executable is copied and SHA-256 compared with the build output.
- Core coverage verifies independent file/directory retention, exact totals after
  caps, zero/partial sizes, disabling retained output without stopping traversal,
  and the extended IPC contract. Existing cancellation/uncapped disk tests pass.
- Frontend coverage verifies exact decimal/comma parsing, inclusive equality,
  byte-below-boundary exclusion, u64 precision/range, invalid input, search,
  individual item semantics, partial labels and retention-cutoff warnings.
- Browser fixture checks verify 5 GB, 0,5 GB, invalid input, clear, empty state,
  combined path search and unchanged scan invocation count while filtering.
  Evidence: `artifacts/qa/size-filter-5gb.jpg`; values are labeled fixture data.
- Size view holds at most 10,000 files and 10,000 subdirectories. When omitted
  entries could meet the filter, the UI explicitly says more matches may exist.
  This retention cap never stops the scan or changes root/recognition totals.
- No delete/trash capability or publication. Native Windows full-screen acceptance
  and a real macOS build/device test remain separate from browser/fixture checks.

---
# Reveal locations and keyboard shortcut — 2026-11-04

- **52 automated tests passed**: 26 core, 8 native state/discovery/path-validation,
  18 frontend. The native reveal smoke test is ignored during default checks and
  was run explicitly afterward: **1 additional test passed** (53 total).
- TypeScript/Vite build, Rust workspace check and Windows debug/no-bundle exe
  build passed. The delivered copy is SHA-256 checked against that output.
- Real Windows smoke test used a local fixture named
  `Konum denemesi, Türkçe & (1).txt`. Explorer opened its containing folder;
  that window and the expected filename were observed through native UI state.
  No assertion that Windows always selects the item is made (native fallback can
  open the containing folder). The test file was never executed.
- Browser mocked-IPC checks: visible action on a collapsed card; correct path
  from button; Ctrl+Enter on project summary; Ctrl+Enter on nested row selects
  the row path rather than its parent; multi-location chooser opens and receives
  keyboard focus; failure messages leave subsequent actions usable.
- Unit coverage includes missing/relative/URL paths, existing files/directories,
  spaces, Turkish characters and punctuation; Windows vs Mac modifier handling,
  plain Enter, extra modifiers, held keys and text composition.
- Only the Rust reveal function is used; general URL/file-open plugin IPC is not
  exposed. No deletion, write/trash controls, GitHub publication or remote.
- Finder implementation uses the official library; macOS build/device execution
  and the full native Roomit-to-Explorer UI flow remain user acceptance checks.
  Browser evidence uses labeled fixture data and is not native UI certification.

---
# Single disk and graphite workspace — 2026-11-04

- `scripts/check.ps1` passed: 26 core tests, 6 Tauri state/discovery/selection
  tests, 15 frontend tests; total **47 passing tests**. TypeScript/Vite build
  and Rust workspace check passed. Windows debug/no-bundle exe build passed.
- Single disk is an explicit mode. Fresh volume discovery validates the exact
  selected mount before scanning; missing disks never fall back to all disks.
  It uses unlimited computer scan options and retains progress/cancellation.
- Volume capacities/free space are OS snapshots, serialized as decimal strings.
  They are separate from logical file-length totals in the scan report.
- In-app browser visual checks and mocked IPC interactions passed: disk selection,
  exact root/mode, progress, cancellation, reopening setup, navigation, search and
  lazy details. Checked default, 1120 x 820 and 720 x 600 viewports. See root
  `design-qa.md`; screenshot evidence is ignored under `artifacts/qa`.
- This is browser/fixture UI evidence, not native executable or physical-disk
  acceptance. No actual full-disk scan was run. macOS device test remains pending.
- Compiled assets stay local files for native CSP. The UI harness and sample data
  are absent from production output. No deletion, GitHub publication or remote.

Earlier entries below describe historical builds.

---
# Unlimited computer scan and grouped workspace — 2026-11-04

## Automated evidence

- `scripts/check.ps1` passed: 26 core integration tests (17 inspection + 9
  multi-root), 5 native state/discovery tests, and 12 frontend report/grouping
  tests. Total: 43 passing tests.
- TypeScript/Vite production build and Rust workspace check passed.
- Windows native build passed (`tauri build --debug --no-bundle`). The final
  exe is copied for user testing and hash-checked against the build output.
- Computer-mode options have no entry/depth cutoff. A test traversed 140 nested
  directories, then a later root; a separate test verifies unlimited scans still
  cancel promptly and retain bounded output.
- Group tests cover parent/child deduplication, exact byte totals/sorting,
  nearest-project assignment, AI tool merging, Windows/Mac path semantics,
  protected-data separation, search and partial/truncated labels.
- No actual whole-computer scan, current screenshot audit, native screen
  automation or Mac device acceptance was performed. UI checks remain with
  the user, as established in the conversation.

## Current behavior

The desktop computer command uses `ScanOptions::computer`: no file-count or
folder-depth budget, with progress/cancellation preserved. Folder-mode defaults
remain 1,000,000 entries / 128 levels. Output-list and warning retention caps
continue independently and never stop unlimited traversal. Link/reparse and
mount partition rules still apply; access failures are reported as partial.

The compact layout keeps controls on the left and separates Overview, Projects,
AI tools, Large folders and Details on the right. Results begin with group cards;
paths and individual entries are lazy detail content. Protected technical data
and warnings are secondary. Nested findings contribute their bytes only once.
Groups from truncated retained lists are labeled lower bounds. Search/navigation
do not rescan, and no delete/trash action was added.

Windows executable output and source hash are recorded in ignored
`artifacts/Roomit-build.json`. See `MANUAL_TEST.md` for current acceptance steps.
Prior sections below are historical evidence for earlier builds.

---

# Native folder picker and computer scope — 2026-11-04

## Automated evidence

- Combined `scripts/check.ps1` passed: 24 core integration tests (17 recursive
  inspection + 7 multi-root), 5 desktop state/root-discovery tests, and 6 frontend
  report tests. Total: 35 passing tests.
- TypeScript/Vite production build and Rust workspace check passed.
- Windows native build passed (`tauri build --debug --no-bundle`), producing
  `target/debug/roomit.exe`. The user-test artifact and its SHA-256/source commit
  are recorded in ignored `artifacts/Roomit-build.json`.
- Native Windows disk discovery was tested without scanning the computer.
- Multi-root tests used temporary fixtures, verifying cumulative progress,
  overlapping-root partitioning, failure isolation, cancellation, shared limits,
  duplicate roots and preferred user-branch traversal.
- Native folder dialog and updated screen behavior are awaiting user checks.
  No screen automation or real whole-computer scan was run for this change.
- macOS APFS/volume handling and the native Mac picker remain device-untested.

## Behavior and limits

Folder selection uses the official Tauri dialog plugin, directory-only and single
selection, with only the open permission granted. Cancel preserves the previous
folder. Changing the scope or selecting a folder does not start a scan.

Computer mode previews local disk roots, refreshes them on start, shares one
worker/budget/cancel token and lists each root's outcome. Root errors do not stop
other roots; cancellation or a global entry cap leaves later roots not scanned.
Unix filesystem boundaries and separate planned roots are pruned to avoid
walking the same mounted subtree through ancestor paths. Pruned/inaccessible
areas conservatively keep totals partial. The entry cap remains 1,000,000 across
all roots. Network disks are excluded by native disk discovery.

Normal OS access applies. No elevation, deletion or publishing was introduced.
The updated manual acceptance checklist is in `MANUAL_TEST.md`.

---

# Recursive scanning validation — 2026-11-03

## Current change

- 17 Rust core integration tests passed: nested file/folder totals, empty folders,
  multiple ecosystems, protected AI data/settings/models, union accounting,
  dependency-tree suppression, cancellation, entry/depth bounds, capped output,
  exact byte serialization, logical hardlink semantics, disappearing queued
  directories, invalid roots and Windows junction/cycle skipping.
- 2 Tauri state tests passed: one active scan, scan-ID cancellation, and release
  of the registry after worker panic.
- 5 frontend report tests passed: decimal units, exact u64 byte handling,
  partial-size labels, software/AI/protected filters and completion messages.
- TypeScript/Vite production build and Rust workspace check passed.
- Native build passed: `npm run tauri -- build --debug --no-bundle` produced
  `target/debug/roomit.exe`. A matching user-test copy is `artifacts/Roomit.exe`.
  Its hash and source commit are recorded in ignored `artifacts/Roomit-build.json`.
- Total: 24 automated tests passed. No screen automation was performed for this
  change; updated native UI/IPC behavior and visual acceptance await the user.

Core tests were repeated after the final progress-boundary change and all 17
passed. The existing combined check helper now includes frontend report tests
and Tauri state tests. Normal Windows permissions were used for junction and
hardlink fixtures, which a restricted sandbox may prevent.

## User handoff

See `MANUAL_TEST.md` for the screen checklist. Test a modest parent directory
with nested projects, verify findings/sizes, inspect AI/protected filtering, and
try cancellation and missing-path errors. The full UI/IPC flow recorded below
belongs to the old foundation commit, not this updated implementation.

No deletion, trash action, network service, GitHub publish or installer was added.
macOS compilation/runtime checks and real-disk speed benchmarks remain unverified.
Logical bytes are not allocated space or reclaimable space. Skipped/limited/cancelled
subtrees explicitly yield lower bounds, and displayed folder rows overlap children.

---

## Historical baseline: initial foundation (`ae63d9d`)

# Foundation validation — 2026-11-03

## Story verified

A user enters an absolute project directory in the Windows desktop app, clicks
Inspect, the Tauri command invokes the read-only Rust library, and the report is
rendered with project evidence, protected data, review findings and errors.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript + Vite production build | Passed | `npm run build`, 7 modules, no TypeScript errors |
| Core integration tests | Passed | 6 tests, including protected AI data, missing project evidence, direct-child scope, invalid paths, stable output and Windows junctions |
| Rust desktop workspace | Passed | `cargo check --workspace --locked` |
| Combined Windows helper | Passed | `scripts/check.ps1`, exit 0 with cached dependencies/offline mode |
| Native Windows executable | Passed | `npm run tauri -- build --debug --no-bundle` -> `target/debug/roomit.exe` |
| Real native UI -> IPC -> filesystem -> UI | Passed | Inspected this repository: Node.js, protected `.git`, review-required `node_modules`, 2 findings / 0 warnings |
| Native error rendering | Passed | Missing directory returned `Klasör incelenemedi` and OS error 2; old results cleared and input/button enabled |
| JSON core example | Passed | `cargo run -p roomit-core --locked --example inspect -- <absolute-path>` returned the same two findings |
| macOS build and native behavior | Not run | Requires a macOS machine and Apple toolchain |
| Recursive scan, size accounting, exclusions, reveal, trash | Not implemented | Future slices; no UI success claims for these features |

Screenshots are local, ignored artifacts: `artifacts/windows-start.png`,
`artifacts/windows-inspection.png`, and `artifacts/windows-error.png`.

## Environment notes

Rust/cargo 1.91.1 were already installed under the user stable MSVC toolchain but
absent from PATH. The PowerShell helper supplies a process-local PATH fallback.
Visual Studio Community 2026 and WebView2 were detected. No system installation
or permanent PATH change was performed.

The restricted sandbox prevented the junction test fixture from creating a
junction (access denied). The same combined check passed all six tests with
normal Windows execution permissions. Do not silently skip this safety test.
Cargo also reported a non-fatal incremental-cache hardlink warning and fell back
to copying; build and test results above completed successfully.

This is a foundation check, not acceptance of a complete cleaner or a disk-speed
benchmark. No personal file contents were scanned. No installer, release, remote
repository, package publication or GitHub push was produced.
