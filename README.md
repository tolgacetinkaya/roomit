# Roomit

Know what is there. Choose what stays.

Roomit is a local-first Windows/macOS desktop project for understanding files
left by development and AI tools. Its Rust library is independent of the
Tauri 2 + TypeScript interface. The repository is local; no remote or publishing
is configured. MIT licensed.

## Current capabilities

- Pick a folder using the native Windows/macOS dialog; its path stays visible.
- Scan one folder or all detected local disks, without opening file contents.
- Compute individual file lengths and directory totals in one iterative traversal.
- Discover nested .NET, Node.js, Python, Rust and Java/Gradle projects from markers.
- Identify development outputs/dependencies with reasons and review-required status.
- Identify Codex, Claude Code, Cursor and Ollama directories; protect AI data,
  instructions, recognized settings/model stores, Git data and environment files.
- Live progress, cancellation and clearly labeled partial results.
- Filter findings, inspect detected projects and view the largest 100 files/folders.
- Skip symlinks/reparse points; bound work and report memory; keep totals independent
  of paginated or capped result lists.

There is **no deletion, move-to-trash, native reveal, exclusion UI, age filter,
telemetry, or cloud/LLM call**. Custom AI storage locations and arbitrary tool
versions are not automatically discovered outside the selected directory.

## Size semantics and limits

Sizes are **logical bytes**, not allocated disk space or reclaimable space.
Hardlinked files count once per encountered path. Sparse/compressed files and
filesystem clones may occupy different physical space. Directory totals overlap
child rows; use the report root total, not a sum of displayed rows. Recognized
space counts nested findings only once.

Skipped links, inaccessible entries, cancelled scans and depth/entry limits make
sizes partial lower bounds. The filesystem may change during a scan; this is
not a snapshot or a proof that an item can safely be removed.

Defaults (shared across disks in computer mode): 1,000,000 observed entries, 128 directory levels below each root,
10,000 retained findings/projects each, 100 largest entries and 100 retained
warnings. Hitting a result-list cap does not stop size accounting. Progress is
throttled to about 100 ms. Only one desktop scan can run at once.

Byte counts are u64 in Rust and decimal strings in JSON/IPC to preserve precision
in JavaScript. The UI uses decimal units: 1 GB = 1,000,000,000 bytes.

## Product order

1. Development and AI-tool data recognition, with evidence and impact.
2. Files/directories at or above a user-entered GB threshold. No age filter.
3. Shared review, exclusions, Finder/Explorer reveal and OS trash actions.

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

Computer scans share one worker, cancellation token, entry budget, bounded
largest-item list and cumulative progress across roots. Failed and unscanned
roots are listed. The user's home branch/volume is preferred where possible.
Overlapping requested roots are partitioned to avoid duplicate measurement.
On Unix, volume crossings are skipped; macOS APFS System and Data are separate
roots, avoiding traversal through Data firmlinks from the System tree. These
skips conservatively mark totals partial. Native Mac behavior awaits testing.

Normal OS permissions apply; the app does not request elevation. Inaccessible
areas, mount boundaries and entry limits yield partial results. Whole-computer
mode is not a guarantee that every protected/hidden volume can be inspected.
