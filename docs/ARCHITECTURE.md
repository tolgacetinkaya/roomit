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
retained. Directory queues are bounded by the global 1,000,000-entry limit.
Depth is capped at 128. Warnings are capped at 100 with an omitted counter.
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
