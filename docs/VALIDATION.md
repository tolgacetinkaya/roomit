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
