# Roomit architecture

## Product boundaries

Development and AI-tool recognition is primary. Size-threshold search is phase 2
and has no date/age requirement. Runtime work is local and read-only. There is no
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

File entries are not retained as a full inventory. A bounded min-heap keeps the
largest 100 files/directories; up to 10,000 findings and 10,000 projects are
retained. Folder mode defaults to 1,000,000 entries and 128 levels; computer mode has neither count nor depth cutoff. Pending directory queues can grow with the scanned tree. Warnings are capped at 100 with an omitted counter.
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
uses `ScanOptions::computer`, setting both to None, while normal folder/library
defaults remain bounded. Work is still iterative and cancellation/progress are
preserved. Report list/warning limits remain independent of traversal. Tests
exercise traversal beyond the former depth cap, later roots, and cancellation.

`src/groups.ts` normalizes Windows paths without case sensitivity, retains case
on Mac paths, removes nested/duplicate byte contributions, associates outputs
with the nearest project, and merges AI locations by tool. Truncated retained
reports produce lower-bound group labels. `src/results.ts` renders lazy,
paginated group accordions and separate result views. Large folders are shown
at their outer boundary, with included child paths inside the accordion.
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

## Minimum-size presentation

The scanner now keeps independent bounded heaps for files and subdirectories,
controlled by `ScanOptions.max_size_entries_per_kind` (10,000 by default). Their
merged `sizeEntries` plus per-kind truncation flags are separate from legacy
`largestEntries`, recognition findings and all measured totals. Full traversal,
progress, cancellation, link skipping and the absence of disk/computer cutoffs
are preserved. The chosen root remains in `roots`, not duplicated as a subfolder.
A low heap candidate is rejected without cloning its path once the heap fills.

`src/size-filter.ts` parses comma/dot decimal GB directly into BigInt bytes (up
to u64, at most nine fractional digits) and compares inclusively without using
rounded display strings. Filtering is on measured sizes. A partial directory
below the threshold may be omitted even if its true unmeasured size is larger;
existing partial-report notices still apply. Blank/zero clear the size cutoff.

The **Büyük öğeler** view shows flat, independently paged files and directories;
parent and child sizes overlap and are not summed. Search/threshold changes use
the retained report and never invoke a scan. Recognition/group totals are not
filtered. A truncation notice appears when the lowest retained item of that kind
still meets the threshold (including ties); above that boundary all matches by
measured size are retained. This is bounded display, not a complete file index.
