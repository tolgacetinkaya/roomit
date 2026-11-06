# Roomit

Know what is there. Choose what stays.

Roomit is a local-first Windows/macOS desktop project for understanding files
left by development and AI tools. The reusable Rust core is independent of the
Tauri 2 + TypeScript interface.

## Current foundation

- Local Git repository; no GitHub remote or publishing configured.
- Read-only inspection of **one selected directory's direct children**.
- Initial .NET / Node.js / Python project and artifact recognition.
- AI directories/instructions and selected sensitive paths marked as protected.
- Reasons and warnings displayed through real TypeScript -> Tauri -> Rust IPC.
- Fixture-based core tests, including Windows junction handling.

This is not a full recursive disk scanner or cleaner yet. It does not calculate
sizes, inspect AI-cache contents, reveal paths, exclude paths, move to trash or
permanently delete. There are no demo size totals or automatic scans.

## Product order

1. Development and AI-tool data recognition, with evidence and impact.
2. Files/directories at or above a user-entered GB threshold. No age filter.
3. Shared review, exclusions, Finder/Explorer reveal and OS trash actions.

See [architecture](docs/ARCHITECTURE.md) and [validation](docs/VALIDATION.md).

## Prerequisites

- Node.js supported by the locked Vite release, and npm.
- Rust stable. Use the current stable toolchain for the desktop dependencies.
- Windows: Visual Studio C++ build tools, Windows SDK and WebView2.
- macOS: Xcode Command Line Tools.

Official setup: https://v2.tauri.app/start/prerequisites/

## Run locally

From the repository root:

```sh
npm ci
npm run tauri -- dev
```

On Windows, if an installed stable Rust toolchain is missing from PATH, the helper
uses it for the current PowerShell process without changing system settings:

```powershell
.\scripts\dev.ps1
```

Frontend-only preview: `npm run dev`. Inspection is disabled in an ordinary
browser because it requires the native Rust bridge.

## Checks

```sh
npm run build
cargo test -p roomit-core --locked
cargo check --workspace --locked
```

Windows combined check: `.\scripts\check.ps1`.
The Windows helper keeps its Cargo dependency cache in ignored `.local/cargo`.

Core-only JSON inspection (use an absolute path):

```sh
cargo run -p roomit-core --example inspect -- /absolute/project/path
```

Native executable build, without an installer or publishing:

```sh
npm run tauri -- build --debug --no-bundle
```

A build for macOS must be performed and tested on macOS. Windows results do not
establish macOS runtime behavior. This foundation has no speed benchmark claim.

## License

MIT. Packages remain unpublished (`private: true` / `publish = false`).
