# Roomit

Your local AI workspace: tools, resources, and the data they leave behind.

Roomit is a local-first Windows/macOS desktop project for understanding files
left by development and AI tools. Its Rust library is independent of the
Tauri 2 + TypeScript interface. The repository is local; no remote or publishing
is configured. MIT licensed.

## Current capabilities

- **AI kontrol merkezi** combines live resource panels, detected AI tools with
  local brand logos, and an interactive AI storage map. **Araçlarım** shows all
  discoveries and their evidence; the control center's list scrolls without
  dropping tools after the first six.
- Discovery supports 19 catalog entries: desktop apps and CLI files on PATH,
  common user binary directories, Windows uninstall/app-package registrations
  and macOS app locations. This is not universal discovery of all AI software.
  ZCode, Qwen, Kimi and LM Studio are included. Data-only traces are labeled
  separately from installation evidence. No discovered program is executed.
- Open **AI verilerini tara** to scan existing supported AI user-data roots
  (including `.codex`, `.claude`, `.cursor`, `.ollama` and OpenCode) without walking every
  disk. Missing locations never fall back to a home/disk/computer scan. Custom
  locations and project-local AI data still require selecting a folder.
- Keep the selected result view when starting, completing or cancelling a scan.
  Startup opens the AI control center and restores results without scanning again.
- Select a measured map sector to navigate tool → data location → direct children;
  use **Bir üst düzey** / Escape to go back. New indexes return the largest 80
  children and an explicit remainder; every measured item remains available in
  **Büyük öğeler**. Old saved indexes require a manual rescan for deep navigation.
- **Canlı kaynaklar** samples native CPU/RAM per accessible process and network
  rates per adapter while its workspace is visible, roughly every two seconds.
  Search Chrome/Docker/PID, filter AI processes, sort and page 50 rows at a time.
  Pause/resume is available; leaving the workspace pauses polling. Network rates
  need two samples and reset/disconnected counters never become fabricated traffic.
- Pick a folder using the native Windows/macOS dialog; its path stays visible.
- Scan one folder, one selected local disk, or all detected local disks, without opening file contents.
- Add multiple folders to **Hariç tutulanlar** using the native picker; choices persist
  locally across restarts and apply to folder/disk/computer scans. Remove a rule
  with **Listeden çıkar**; this does not change the folder itself.
- Automatically prune standard system/install locations, Windows SYSTEM-attribute
  entries, registered Windows InstallLocation/App Paths and macOS `.app` bundles.
  Automatic rules cannot be disabled. Unknown portable/unregistered installations
  require an explicit user exclusion; this is not universal application ownership detection.
- Compute individual file lengths and directory totals in one iterative traversal.
- Discover nested .NET, Node.js, Python, Rust and Java/Gradle projects from markers.
- Identify development outputs/dependencies with reasons and review-required status.
- Identify supported AI user-data directories; protect AI data,
  instructions, recognized settings/model stores, Git data and environment files.
- Live progress, cancellation and clearly labeled partial results.
- Restore the last saved scan on startup, including grouped results and the entire
  paged size index. Search and GB filtering work without scanning again.
- Monitor the last scan's folder/disk/computer scope while Roomit is open.
  Included file/folder changes show **Sonuçlar güncel değil** without changing
  results or starting a scan. **Yeniden tara** remains a manual action.
- A visible scan date and separate offline notice explain that edits made while
  Roomit was closed are unknown. Cancelled scans remain explicitly partial.
  Interrupted/incomplete monitoring shows **Güncellik doğrulanamıyor**.
- Show result paths in Windows Explorer / macOS Finder with **Klasörde göster**.
  On a focused card/row, use **Ctrl+Enter** (Windows) or **Command+Enter** (Mac).
  Multi-location AI groups ask which location to reveal.
- Graphite/electric-blue workspace with persistent navigation, grouped results,
  compact completed-scan setup, and per-volume capacity/free-space previews.
- Inspect grouped development/AI results; use **Büyük öğeler** for separate file/folder lists.
- Enter a minimum GB size (for example 5 or 0,5), apply or clear it without rescanning.
  **All measured matches** are available through Previous/Next pages, with no result-count cutoff.
  The threshold is inclusive, uses exact decimal bytes and combines with path search.
- Skip symlinks/reparse points; bound work and report memory; keep totals independent
  of paginated or capped result lists.

There is **no deletion, move-to-trash, age filter,
telemetry, or cloud/LLM call**. Custom AI storage locations and arbitrary tool
versions are not automatically discovered outside the selected directory.

Per-app GPU/network attribution, LAN-versus-internet separation, container internals,
browser tabs, and long-term use/unused-file determination are **not implemented**.
The UI reports those limits explicitly. CPU is normalized to total device capacity;
process RAM may include shared pages. Only recognized process identities and known
helpers in the same installation are attributed to an AI tool; launching another
application does not make that application part of the parent's usage.

## Size semantics and limits

Sizes are **logical bytes**, not allocated disk space or reclaimable space.
Hardlinked files count once per encountered path. Sparse/compressed files and
filesystem clones may occupy different physical space. Directory totals overlap
child rows; use the report root total, not a sum of displayed rows.
Totals measure the included scope, excluding pruned data; they are not full sizes
of folders containing excluded children. Recognized
space counts nested findings only once.

Skipped links, inaccessible entries and cancelled scans make sizes partial lower
bounds. All desktop scopes (folder, one disk, computer) have no entry/depth cutoff.
The library retains configurable traversal budgets for other callers. A live
filesystem scan is not an atomic snapshot or proof that an item can be removed.

The desktop streams every measured file/subdirectory into an app-owned local
SQLite index. The size view has **no 10,000-result cap** and requests only 50 rows
per file/directory page. Changing GB size or search queries the existing index;
there is no rescan. Progress, scan cancellation and result-loading cancellation
are available. Cancelled scans retain the metadata measured so far. The selected
root is summarized separately; links and the running app's own result directory
are excluded. The latter also has a macOS APFS Data alias exclusion.

Scanned user files remain unchanged. The index stores paths, types and sizes on
the local device. Successful scans (including cancelled/partial results) persist
under Tauri's per-user app local data folder in `last-scan`. Normal app shutdown
keeps the current result; a successful replacement retires the previous index
once its readers finish. Failed scans/saves preserve the previous saved result.
Write failures are displayed, and unsaved current results are labeled temporary.
Available local disk space bounds storage.
No full-result array is kept in the UI. SQLite page caches are configured to
4 MiB per connection; this is not a total process-memory guarantee.

Development/AI summaries still retain 10,000 findings/projects each, plus 100
legacy largest entries and 100 warnings. These summary limits do not limit the
size index or stop traversal. Progress is throttled to about 100 ms, and only one
desktop scan can run at once.
Byte counts are u64 in Rust and decimal strings in JSON/IPC to preserve precision
in JavaScript. The UI uses decimal units: 1 GB = 1,000,000,000 bytes.

## Product order

1. Development and AI-tool data recognition, with evidence and impact.
2. Files/directories at or above a user-entered GB threshold. No age filter.
3. Shared review and optional OS trash actions (exclusions and Finder/Explorer reveal exist).

See [architecture](docs/ARCHITECTURE.md), [validation](docs/VALIDATION.md), and
[manual screen checks](docs/MANUAL_TEST.md).

## Prerequisites

- Node.js supported by the locked Vite release, and npm. Frontend logic tests use
  Node's native TypeScript support (Node 22.18+ or a newer supported release).
- Rust stable; use a current stable toolchain for desktop dependencies.
- Windows: Visual Studio C++ build tools, Windows SDK and WebView2.
- macOS: Xcode Command Line Tools.

Official setup: https://v2.tauri.app/start/prerequisites/

## Run locally

```sh
npm ci
npm run tauri -- dev
```

Windows helper (also handles the existing user toolchain missing from PATH,
without changing system settings):

```powershell
.\scripts\dev.ps1
```

Frontend-only preview: `npm run dev`. Native scanning is disabled in a browser.

## Checks

```sh
npm run build
npm test
cargo test -p roomit-core --locked
cargo check --workspace --locked
cargo test -p roomit --lib --locked
```

Windows combined check: `.\scripts\check.ps1`. Link/junction fixture tests require
normal OS permissions; the agent sandbox may block their creation. The Windows
helper keeps its Cargo cache in ignored `.local/cargo`.

Core-only recursive JSON report (absolute directory required):

```sh
cargo run -p roomit-core --example inspect -- /absolute/project/path
```

Build a local executable without an installer or publishing:

```sh
npm run tauri -- build --debug --no-bundle
```

Windows output: `target/debug/roomit.exe`. macOS builds and runtime checks require
a Mac. This implementation has no Windows-versus-Mac speed benchmark claim.

## Folder and computer targets

Use **Klasör seç…** to open the native directory picker. Cancelling keeps the
previous selection. Selection alone does not start scanning. Manual path typing
is no longer needed.

**Bütün bilgisayar** previews detected local fixed/removable disk roots. Network
volumes are not included. The scan starts only when **Taramayı başlat** is pressed;
roots are refreshed at start. **Diskleri yenile** refreshes the preview.

Computer scans share one worker, cancellation token, bounded
largest-item list and cumulative progress across roots. Failed and unscanned
roots are listed. The user's home branch/volume is preferred where possible.
Overlapping requested roots are partitioned to avoid duplicate measurement.
On Unix, volume crossings are skipped; macOS APFS System and Data are separate
roots, avoiding traversal through Data firmlinks from the System tree. These
skips conservatively mark totals partial. Native Mac behavior awaits testing.

Normal OS permissions apply; the app does not request elevation. Inaccessible
areas, mount boundaries and entry limits yield partial results. Whole-computer
mode is not a guarantee that every protected/hidden volume can be inspected.

## Grouped results

The compact desktop layout keeps scan controls on the left and results on the
right. Overview, Projects, AI tools, Large folders and Details are separate
working views with search. Software findings are grouped by nearest project,
AI locations by tool, and other protected data in a collapsed secondary section.
Individual paths and reasons are built lazily when a group is opened. Lists are
paged, so large reports do not create thousands of initial DOM rows.

Nested directory findings are counted once before grouping. Group bytes are
recognized artifact/data totals, not complete project sizes or reclaimable
space. If the retained report was truncated, group sizes are explicitly lower
bounds. Root scan totals still account for all measured files, independently
of output-list retention. Whole-computer scanning stops on cancellation, access
failures for particular subtrees, or OS errors, never because of an item/depth
budget. Existing link/mount partition rules continue to apply.

## Persistent exclusion settings

Choices are saved in `scan-exclusions.json` in Tauri's per-user app configuration
folder (`dev.roomit.desktop`), independently of the temporary scan index. Saving
uses an atomic same-directory replacement. Disconnected/missing paths stay saved.
Unreadable/corrupt settings block scanning instead of silently ignoring choices.
Only Roomit's own settings and temporary result metadata are written; scanned
files are untouched. Changes apply to subsequent scans; editing is locked while
scanning. Windows registry locations are read-only and refreshed each scan.

System/install rules intentionally preserve project directories and AI user data
outside protected installation trees. Files stored inside an excluded installation
remain excluded even if they look like project/AI data. On macOS, APFS Data user
paths remain eligible; system subtrees and their Data aliases are protected.

## Saved results and freshness

The report and complete SQLite index are stored together in one versioned local
generation. A small `current.json` pointer changes atomically only after the data
commits. New scans do not overwrite the old generation in place. Startup reads
only the saved report/schema; result rows are still loaded in 50-row pages.
Corrupt/missing/unsupported records show a recovery message and are preserved.
No saved result means the normal empty screen; nothing is scanned automatically.

Snapshots contain paths, classifications and sizes, not scanned file contents.
Their timestamp is the scan's start time. While the app is open, native filesystem
notifications detect included changes and latch a stale warning until a new scan.
Notifications do not update sizes or results. Offline changes are still unknown;
restored results retain a separate possible-change notice. **Yeniden tara** uses the saved scope and
current exclusions; a missing disk prompts for a target instead of scanning all
disks. Existing reveal actions validate the path against the live filesystem.
An older exe's in-memory results cannot be recovered after that exe closes; the
new persistence begins with scans performed using this build.

## Change monitoring

Windows uses overlapped ReadDirectoryChangesW with one recursive handle per scan
root plus non-recursive parent watches to detect root rename/replacement. macOS
uses notify's FSEvents backend. No periodic file enumeration or content hashing
is used. The UI reads the small monitoring status every two seconds and changes
only the notice, preserving open filters/pages. This is best-effort monitoring:
permissions, disconnected roots or dropped event batches produce an explicit
uncertainty warning instead of a claim that results are current.

Watchers arm before a new scan, so included mutations during the scan can also
invalidate the resulting report. Failed replacement scans keep the previous
monitor. New saved reports retain their exclusion policy; older saved reports
remain readable and use the current policy as a compatibility fallback. The
app-owned settings/index trees, standard system/install exclusions and app-bundle
rules are filtered before invalidation. Windows access-only activity is ignored.
Monitoring is session-only: no background service or observation while closed,
and observed-change flags are not a durable filesystem journal.

The targeted AI action measures known tool data; histories, settings and models
are not automatically classified as disposable temporary files. A dedicated
AI temporary-file classifier remains incomplete. System/install exclusions,
progress/cancel, persisted results and live change warnings also apply in AI scope.
