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
