# Roomit architecture

## Product boundaries

1. Primary: recognize development and AI-tool data, explain ownership and impact.
2. Secondary: find files and directories at or above a user-entered GB threshold.
   Age and last-access time are not requirements.
3. Shared future actions: exclude, reveal in Finder/Explorer, move selected items
   to the OS trash. Never fall back to permanent deletion.

The product runs locally on Windows and macOS. No hosted API, telemetry, account,
or LLM service is required. Fetching development dependencies requires internet.

## Structure

- `crates/roomit-core`: reusable Rust library, no Tauri dependency. Contains
  inspection models and a first direct-child, metadata-only classifier.
- `src-tauri`: Tauri 2 shell. The `inspect_workspace` command runs filesystem work
  on a blocking worker, outside the UI thread.
- `src`: TypeScript UI and local CSS. Rust is invoked through Tauri IPC.
  Paths, reasons and errors are rendered as text, not HTML.
- `docs`: decisions, scope, limitations, and local validation evidence.

The initial frontend uses vanilla TypeScript and Vite to keep the foundation
small. No frontend framework is required by the core. OS-specific adapters will
be added when native reveal/trash behavior is implemented and tested.

## First working slice

An explicit absolute directory is inspected. Only its direct children are
enumerated. No file contents are read. No child directories are traversed.

Project evidence:

- .NET: a direct `.csproj`, `.fsproj`, or `.vbproj` file -> `bin` / `obj`.
- Node.js: direct `package.json` -> `node_modules`.
- Python: direct `pyproject.toml`, `requirements.txt`, `setup.py`, or `Pipfile`
  -> `__pycache__`.

These are review findings, not proof of regenerability or safe removal.
AI directories `.codex`, `.claude`, `.cursor` and instruction files `AGENTS.md`,
`CLAUDE.md`, `.cursorrules` are protected findings. They are not cache rules.
`.git`, `.ssh`, `.env`, and `.env.*` are also protected when encountered.
This is a starter set, not an exhaustive inventory of protected data.

The report includes root, scope, detected ecosystems, findings, reasons, and
warnings. Ordering is deterministic. Symlinks and Windows reparse points are
skipped; a linked root is rejected. Checks are best-effort metadata checks;
there is no claim of race-safe filesystem traversal. No report authorizes writes.

## Planned next slices

- Recursive discovery inside explicitly selected roots; exclusions, cancellation,
  progress, bounded work queues and real directory size accounting.
- Versioned tool rules and fixtures before recognizing any AI cache as removable.
- Benchmarks on real Windows and macOS devices before speed claims or choosing
  a parallel walker. Account for hardlinks, sparse files and inaccessible paths.
- Separate operation eligibility from risk; approved plan snapshots and target
  identity revalidation before any future move-to-trash operation.
- Native reveal and trash adapters, with partial-failure reporting and no
  permanent-delete fallback. Trash size is not immediate disk space reclaimed.
- Phase 2 size-threshold search, reusing the same traversal engine.

## Distribution status

Local repository only. Cargo packages have `publish = false`, npm is private,
and no remote, update endpoint, release pipeline or publishing workflow is set.
The starter license is MIT. Names/icons/signing/installer acceptance remain
release work. Initial native icons are generated from `src/assets/roomit.svg`.
