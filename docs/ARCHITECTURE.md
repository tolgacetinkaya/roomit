# Roomit architecture

## Product boundaries

Development and AI-tool recognition is primary. Size-threshold search is phase 2
and has no date/age requirement. Runtime work is local; scanned files are read-only.
Only app-owned settings and scan-result metadata are written or cleaned up. There is no
LLM service, hosted API, telemetry, account, publishing, or deletion capability.

## Layers

- `crates/roomit-core/src/model.rs`: typed reports, progress and size semantics.
- `crates/roomit-core/src/rules.rs`: marker evidence and metadata-only rules.
- `crates/roomit-core/src/scanner.rs`: iterative traversal and bottom-up totals.
- `src-tauri/src/lib.rs`: one active worker, ordered progress channel, scan IDs,
  cooperative cancellation, and a lease that releases state on error/panic.
- `src/report.ts`: shared frontend contract, exact byte formatting, filtering,
  and honest completion/partial-result messages.
- `src/main.ts`: native IPC, paginated report rendering and scan controls.

The core has no Tauri/UI dependency. Filesystem work runs on a blocking worker
outside the UI thread. One scan per desktop process avoids unbounded worker
creation. A disconnected progress channel requests cancellation. Matching scan
IDs prevent stale cancel requests affecting another scan.

## Traversal and accounting

An explicit absolute root is validated and canonicalized. Frames form an
iterative DFS stack, avoiding recursive call-stack growth. Each directory is
listed once: file metadata is accounted immediately; child directories are
queued after local project evidence is known. Completed child totals propagate
to their parent. No file contents, hashes or AI transcripts are opened.

File entries are not retained as a full in-memory inventory. Every measured size
record streams to the native local index. A legacy summary min-heap keeps
100 entries; development/AI summaries retain at most 10,000 findings/projects.
Library traversal defaults remain 1,000,000 entries / 128 levels, while all desktop
scopes explicitly disable those budgets. Pending directory queues can grow with
the tree. Warnings retain 100 messages with an omitted counter.
Files are not deterministically ordered by the filesystem; completed reports
are sorted, while partial selection can depend on enumeration order.

`logical_bytes` sums regular file lengths. It does not measure allocation,
physical uniqueness, or recoverable space. Hardlinks count per path. Folder
rows overlap children. `recognized_logical_bytes` is the union of matched
subtrees/files even if the retained finding list is capped. Byte counters are
serialized as decimal strings to avoid JavaScript u64 precision loss.

Links/reparse points and special files are skipped. Root links are rejected;
queued directories are checked again before opening. Nested failures are
reported and scanning continues with siblings. Skips, errors and stopped scans
mark ancestor sizes incomplete. Entry/depth limits and cancellation are explicit
statuses. These metadata checks reduce link exposure but do not provide
race-free traversal or a consistent filesystem snapshot.

## Classification

Project markers are regular files, not directory names or symlinks:

| Context | Recognized entries |
| --- | --- |
| .NET `.csproj` / `.fsproj` / `.vbproj` | Direct `bin`, `obj` |
| Node.js `package.json` | Direct `node_modules` |
| Python `pyproject.toml` / `requirements.txt` / `setup.py` / `Pipfile` | Direct `.venv`, `venv`; `__pycache__` in the project subtree |
| Rust `Cargo.toml` | Direct `target` |
| Gradle `build.gradle` / `build.gradle.kts`, Maven `pom.xml` | Direct `build`, `target` |

These are review-required findings, never deletion permits or guarantees of
regenerability. Dependencies/output, AI-data and protected trees are still sized
but their internal sample projects are not rediscovered as user projects.

AI directories `.codex`, `.claude`, `.cursor`, `.ollama` are protected boundaries.
Known `.cursor/rules`, `.claude/settings.json` / `settings.local.json`, and
`.ollama/models` receive more specific protected classifications. An explicitly
selected AI-directory root is recognized too. AI instructions `AGENTS.md`,
`CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and `.github/copilot-instructions.md`
are protected, as are Git/SSH directories, Git worktree reference files and
`.env` / `.env.*`. This is a starter rule set, not exhaustive tool support.
Names establish evidence, not file-format or installed-tool verification.
Custom locations and environment-variable overrides are not auto-discovered.

Sources checked for the new path associations:

- Claude settings: https://code.claude.com/docs/en/settings
- Cursor rules: https://prod.cursor.com/help/customization/rules
- Ollama model store: https://docs.ollama.com/faq#where-are-models-stored
- Copilot instructions: https://docs.github.com/en/copilot/concepts/prompting/response-customization
- Tauri progress channels: https://v2.tauri.app/develop/calling-frontend/#channels

## Next slices

Exclusions, additional versioned tool rules, real-device performance measurement,
then size-threshold search. Any future action layer needs separate eligibility,
approved-plan snapshots, OS adapters and identity revalidation. Moving to trash
must never silently fall back to permanent deletion. Trash size is not space freed.

## Distribution

Local repository only. npm is private and Cargo packages use `publish = false`.
No remote, release pipeline or update endpoint exists. MIT licensed. Native
icons derive from `src/assets/roomit.svg`; signing/installers remain release work.

## Native folder selection and computer scope

The official Tauri dialog plugin is initialized in the desktop shell. Only
`dialog:allow-open` is granted, with directory-only, single-selection options.
The JS picker uses `fileAccessMode: scoped` and disables folder creation where
supported. Cancellation preserves the selected path; selecting does not scan.

`src-tauri/src/computer.rs` uses sysinfo 0.37's disk-only feature (Rust 1.88+
compatible) to enumerate local volumes without process/network inventory.
Its native implementations exclude remote disks. macOS retains browsable APFS
Data and System roots; Unix device IDs constrain each root's traversal, so
firmlink/mount crossings are not walked through both aliases. Device matching
and a Data-home alias prioritize the current user's data where applicable.

Core `scan_locations` shares the existing scanner across roots. It canonicalizes
and deduplicates roots, prunes separately planned nested roots from parent walks,
keeps shared caps/totals and reports each root's status/error. All progress is
cumulative, with root index/count and only one final completion event. Cancellation
and entry limits leave remaining roots explicitly not scanned. Root errors allow
other roots to continue. Root bytes are strings on the JSON/IPC boundary too.

Computer root discovery and all-file traversal are separate commands. Previewing
roots only enumerates volumes. Automated tests scan fixtures rather than the
actual computer. Per the user request, native picker and complete-screen checks
are manual; Windows automated evidence does not verify macOS runtime behavior.

Reference: https://v2.tauri.app/plugin/dialog/
Disk discovery source: https://github.com/GuillaumeGomez/sysinfo/tree/v0.37.2/src

## Unlimited computer traversal and result presentation

`ScanOptions.max_entries` / `max_depth` are optional. The desktop computer command
uses `ScanOptions::computer`, setting both to None. Desktop folder mode also
disables traversal budgets; only library defaults remain bounded. Work is still iterative and cancellation/progress are
preserved. Report list/warning limits remain independent of traversal. Tests
exercise traversal beyond the former depth cap, later roots, and cancellation.

`src/groups.ts` normalizes Windows paths without case sensitivity, retains case
on Mac paths, removes nested/duplicate byte contributions, associates outputs
with the nearest project, and merges AI locations by tool. Truncated retained
reports produce lower-bound group labels. `src/results.ts` renders lazy,
paginated group accordions and separate result views. The size view reads all
measured files/subdirectories from its separate indexed pages.
Search and view navigation do not rescan. Full paths/warnings are secondary.

The existing Roomit palette, system fonts and logo are preserved; the large
introductory area was replaced with a compact two-column analysis workspace.
This is an implementation pass based on the user's usability feedback and the
existing code target, not a screenshot-backed audit. No live visual or native
screen acceptance is claimed; screen checks remain with the user.

## Single-volume selection and visual workspace

The desktop adds `local_disks` for volume metadata (mount path, label, total/free
bytes as decimal strings, removable flag). Discovery does not walk files.
`mode=disk` validates `root` against a fresh `computer_roots` list, scans exactly
that one root with computer options, then returns `scope=disk` and that root.
Unmounted/invalid choices return errors rather than expanding scan scope. On Unix,
filesystem crossings remain excluded; a volume selection is not a physical-device
or APFS-container scan. Capacity snapshots are never summed into logical totals.

The existing vanilla TS UI uses local Phosphor SVG assets, graphite tokens and
blue accents; completed reports compact setup to keep results prominent. The
Vite asset inline limit is zero to keep images compatible with native strict CSP.
UI fixture evidence is separate from native/platform acceptance; see design QA.

## Reveal result locations

`reveal_path` is the only new desktop command. It checks an existing absolute
file/directory and calls the official tauri-plugin-opener Rust reveal function
on a blocking worker. The plugin's general open-path/open-URL IPC is not
registered and no shell/opener frontend capability is granted. The app never
opens a file in its associated program. Windows uses native Explorer APIs;
macOS uses NSWorkspace/Finder. Missing/invalid targets yield a visible message.
Explorer can fall back to showing the containing folder if selection fails.

Every result location has an explicit action. Group actions are siblings of the
native details element so they remain available on a collapsed card. Multi-path
AI groups present a location chooser. Keyboard handling is scoped to the focused
result owner; nested rows take priority over parent projects. Ctrl+Enter on
Windows and Command+Enter on macOS trigger the same action, while typing fields,
key repeats, composition and extra modifiers are ignored.

## Unlimited size-result index (current)

The previous bounded in-memory `sizeEntries` heaps are removed. Core streaming
APIs `scan_workspace_with_sink` and `scan_locations_with_sink` accept a fallible
`SizeSink`. Every regular file and measured subdirectory is emitted once, including
partial directory records on cancellation. Sink I/O errors abort explicitly rather
than publishing an incomplete index as complete. Legacy summary retention is
independent. Desktop folder, disk and computer options have no traversal budgets;
library defaults remain configurable/bounded for external callers.

`src-tauri/src/size_index.rs` writes every record into a uniquely app-created
staging SQLite directory in the app local data folder. Inserts use cached statements and 1,000-row
transactions. The `WITHOUT ROWID` primary B-tree is `(kind, sort_key, path)`;
`sort_key` is the 20-character zero-padded decimal `u64::MAX - logical_bytes`.
This preserves exact u64 size order without SQLite signed-integer overflow or
floating-point comparisons. The ordered tree is maintained while scanning;
there is no final all-row sort or multi-million-row IPC payload.

The desktop response flattens the normal inspection report and adds
`sizeIndexId`, an opaque scan ID. `query_size_entries` accepts that ID, kind,
minimum-byte string, literal path search, and a first/last cursor plus direction.
Pages contain at most 50 rows. Cursor seeking uses tuple comparisons, not growing
OFFSET scans; the response includes first/last cursors and exact next/previous
availability. Exact total counts are requested on the first page for each filter
and reused during navigation. Counts and byte values cross IPC as decimal strings.
Search uses Turkish lowercase and literal `instr`, not SQL wildcard interpolation.
All request values are bound parameters; database filenames are never client input.

Readers open separate read-only SQLite connections on blocking workers. Each
connection targets a 4 MiB page cache, file-backed temporary work, and no mmap.
Search/count may still scan eligible index rows; indeterminate progress and
cancellation keep that work off the WebView thread. Per-kind query leases cancel
superseded requests, and SQLite progress handlers interrupt running queries.
Frontend disposal/request IDs reject delayed stale responses, including those
arriving after a view/filter change. A queued search debounce is cleared by manual
Apply/navigation so it cannot restart a cancelled result load.

The registry holds one current snapshot. Arc ownership keeps old readers' files
alive until those readers finish; replacing/clearing the current index rejects
old IDs. Temporary directory deletion happens outside registry locks and scan
cleanup runs on a blocking worker. A committed snapshot survives shutdown.
A successful replacement retires old app-owned data only after its readers finish.
Failed/uncommitted staging files are temporary and cleaned up on normal failure;
abnormal process termination can leave orphaned staging data. The current metadata
directory is excluded from its own scan, including its APFS Data alias on macOS.
Only app-created settings and result metadata are written; cleanup removes only owned retired/staging metadata. Scanned files are untouched.

`src/size-browser.ts` replaces, rather than appends, each page. There are at most
50 visible file cards and 50 directory cards. Previous/Next controls are at both
ends, section jumps avoid scrolling through the other list, and reveal actions
and keyboard shortcuts still use the actual row path. Filtering/searching never
reruns the filesystem walk. A cancelled scan publishes a queryable partial index;
a failed index write publishes no successful index. Native screen/macOS acceptance
is separate from core/SQLite tests and browser mocked-IPC evidence.


## Persistent and automatic exclusions — 2026-11-04

The native `ExclusionStore` reads/writes only a fixed app-config JSON path.
`get_exclusions` and `change_exclusions` run on blocking workers; writes validate
all new absolute, existing, non-link directories, deduplicate, flush/sync a
same-directory temporary file, then atomically persist. Previously saved missing
paths remain effective when the drive returns. Corrupt/read-failed settings are
preserved and fail closed. Store locks serialize writes; the scan-registry lock
prevents editing during a scan. Each scan snapshots choices, refreshes native
policy, and adds its own config/index directories.

The core compiles lexical and canonical paths into a component-boundary hash set.
Windows keys ignore case and normalize the extended prefix. Ancestor checks prune
before metadata measurement/project evidence/index emission. Excluded explicit
folder roots return an error; excluded computer roots are labeled `excluded` and
never walked. macOS app-bundle ancestors also block direct nested selection.
`excludedEntries` counts pruned boundary entries, not all unvisited descendants.
Intentional exclusions do not mark the remaining scope incomplete: all displayed
sizes describe that scope. I/O/link/cancel incompleteness keeps its prior meaning.

Windows policy covers standard system/install names on local volumes, environment
system/program locations, current-user Programs/WindowsApps/Packages, the running
exe, SYSTEM attributes and both registry views of HKCU/HKLM Uninstall
`InstallLocation` and App Paths executable-parent directories. Registry values
are never executed; empty/relative/drive-root registrations are rejected.
Microsoft documents [InstallLocation](https://learn.microsoft.com/en-us/windows/win32/msi/uninstall-registry-key).
macOS policy covers system/library/install locations, `.app` ancestors anywhere,
volume service metadata, and APFS Data aliases. `/System` and `/System/Volumes`
children are pruned individually while preserving Data user paths. Directory
reads for this policy enumerate only boundary names, not file contents.
Apple describes [system/application domains](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html).
This is a deterministic location policy, not a complete inventory of every
application-owned file; unregistered/portable/custom paths require user rules.
No shell, delete/trash command or broad frontend filesystem permission is added.


## Last-scan persistence and freshness — 2026-11-04

`SavedScanStore` lives in `app_local_data_dir()/last-scan`; it is automatically
excluded from all scans, alongside the settings path. `IndexWriter::new_in`
streams directly into an app-owned random `scan-<suffix>` staging directory,
avoiding a second full-database copy. Finishing closes the index transaction.
Saving opens that database read/write, adds one typed report JSON row in a FULL
synchronous transaction and sets user_version=1. The database and a same-directory
pointer temporary file are synced before atomic `current.json` replacement.
Only then is the generation retained beyond process shutdown.

The report and index form one generation; no separated JSON summary can point at
an unrelated index. The core report now has owned strings and typed Deserialize,
including exact decimal-string u64 byte fields. The external JSON shape is
unchanged. Startup validates the pointer/version/path, rejects links/reparse
points, opens SQLite read-only without CREATE, validates report types and the
index schema, then publishes the snapshot. No filesystem scan or full index read
is needed. Invalid index byte keys return query errors rather than panicking.

Index publication swaps Arc snapshots; a successful persistent replacement marks
the old snapshot retired. Its directory is removed only after the final reader
drops, with app-root/canonical-parent/generated-name checks. Current persistent
snapshots survive Drop/shutdown. Failed saves publish session-only results with
`persistenceError` while retaining the old disk record; failed walks leave the old
index available. Crashes can leave unreferenced staging/old data, which is not
broadly swept. Current persistence has one user-facing saved scan, not history.

`load_last_scan` and saves run on blocking workers, with the existing scan registry
preventing a restore/edit race during scans. The UI starts with controls locked
while restoring, then loads groups and paged size requests normally. Restored
scope is retained; **Yeniden tara** re-discovers disk availability and cannot fall
back to computer scanning. Failed new scans can redisplay the previous report.
The timestamp is the scan start; partial/cancelled labels survive reopening.

A persistent banner retains the offline possible-change notice for restored data.
The subsequent change-monitoring implementation below adds a detected-change
warning while open. It never automatically scans or changes result rows.
Exclusion changes are still reported as applying to the next scan. Native Windows/Mac screen and
real Mac filesystem acceptance remain separate from automated/mock evidence.


## Native change monitoring — 2026-11-04

`watch::WatchSession` arms on blocking workers before a filesystem walk and before
publishing restored results. Candidate sessions remain separate from the current
snapshot; failed walks drop the candidate without replacing the previous monitor.
Successful publication swaps registry sessions and drops old native handles outside
the registry lock. A report's optional `watchPolicy` stores the exact user/native
exclusions used for that scan. Old JSON reports without this field deserialize
with None and use the current exclusion policy on restore.

Windows uses ReadDirectoryChangesW directly, with read/list-only access and
read/write/delete sharing so watches do not block normal user operations. A
recursive directory handle and non-recursive parent handle cover child mutations
and root rename/removal/replacement. Each worker owns DWORD-aligned 64 KiB buffers,
boxed OVERLAPPED storage and a completion event. Drop signals a shared stop event,
cancels pending IO and drains completion before buffers/handles are released.
Create/remove/rename, size/write/creation/attribute changes count; last-access
notifications are not requested. Notification records are bounds-checked and
UTF-16 names preserve Unicode. The documented zero-byte overflow and error paths
mark monitoring incomplete; they cannot silently leave a healthy status.
See [Microsoft's ReadDirectoryChangesW contract](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw).

macOS uses target-specific notify 8.2.1 / FSEvents. Access events are ignored;
need_rescan, empty-path or error notifications produce uncertainty. It does not
fall back to PollWatcher or file-content hashing. See [notify's native backend
and event limitations](https://docs.rs/notify/8.2.1/notify/).

Events are matched to component-boundary roots and the shared core `Exclusions`
matcher (including canonical paths/Windows case folding/.app ancestors). Existing
Windows SYSTEM/reparse entries are ignored. Deleted entries whose attributes can
no longer be inspected may conservatively invalidate a result. Coalesced/lost
notifications are handled conservatively; no complete durable change log is
claimed. A small root-path metadata check detects lost/deleted/unplugged roots;
it does not enumerate child entries. Session flags latch an included change until
replacement; observed-change flags themselves are not persisted across shutdown.

`watch_status(indexId)` returns only snapshot ID, stale flag and optional coverage
error. The frontend polls serially every two seconds with generation/ID guards,
updates only the banner and stops polling once stale. It does not rerender result
lists, alter filters, or call inspect_workspace. Stale events show **Sonuçlar güncel
değil**; incomplete monitoring shows **Güncellik doğrulanamıyor**. Restored reports
also retain an offline caveat. New scanning is still exclusively a user action.
No deletion command or expanded WebView capability is added.


## Targeted AI scope and retained navigation — 2026-11-05

The native `ai::roots` planner probes just four supported per-user root names
(.codex/.claude/.cursor/.ollama), with metadata-only existence/directory/link
checks. It does not enumerate home, discover projects across volumes, or fall
back to other scopes when none exist. An `ai` command mode feeds those roots into
the existing uncapped shared scanner/sink, exclusion policy, watcher and snapshot
pipeline. The saved report scope is `ai`; its reader whitelist and UI restoration
support that scope. Root classification already recognizes these data directories.
This does not introduce unverified temporary-file or deletion-safety labels.

The AI view exposes a direct action and the setup adds an AI-location scope.
Disk-list loading and capacity cards are restricted to disk/computer modes; the
AI action/restore does not request a disk list. The native automatic exclusion
policy still probes volume metadata, independently of filesystem traversal.

`clearReport` only discards data/search and `showReport` only publishes results;
neither resets currentView to overview/largest. Navigation during a scan is also
preserved on completion/cancel/failure. Startup selects AI for an AI saved scope
only when no newer user navigation occurred during restore. Other explicit user
navigation remains authoritative. Mode selection alone never starts scanning.
