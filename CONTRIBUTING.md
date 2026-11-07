# Contributing to Roomit

Roomit's public source repository is https://github.com/tolgacetinkaya/roomit.
Keep contributions focused and describe the behavior changed and checks run.

## Start here

- Report a reproducible problem with the [bug template](https://github.com/tolgacetinkaya/roomit/issues/new?template=01_bug_report.md).
- Request a missing tool with the [detection template](https://github.com/tolgacetinkaya/roomit/issues/new?template=03_tool_support.md).
- Discuss larger changes in a [feature request](https://github.com/tolgacetinkaya/roomit/issues/new?template=02_feature_request.md).
- See the [proposed roadmap](docs/ROADMAP.md). It is a discussion guide, not a delivery commitment.

## Local development

Use Node 22.18+ for frontend TypeScript tests, Rust compatible with the workspace
minimum, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).
Windows needs Visual Studio C++ build tools, Windows SDK and WebView2; macOS needs
Xcode Command Line Tools and a Mac for native checks.

```sh
npm ci
npm run tauri -- dev
```

On Windows, `scripts/dev.ps1` prepares the local toolchain environment.
`npm run dev` previews the frontend without native scanning.

## Pull requests

Fork the repository for external contributions and create a focused feature
branch. Open a PR against `main`; include the problem, behavior, checks and known
limits. Review and merge happen before release packaging. A PR does not publish
an app update, and contributors do not need a signing key.

Small first contributions include detection fixtures, documentation corrections,
accessibility fixes and reproducible Mac validation. Use synthetic fixtures;
never attach private AI histories, `.env` files or complete scan databases.

## Design rules and checks

- Keep development/AI inspection first and size-threshold search second.
- Keep `roomit-core` independent of the desktop UI.
- Do not read source, secrets, or AI conversation contents to identify artifacts.
- A directory name alone is not evidence that removal is safe.
- Do not add deletion, shell execution, telemetry or automatic uploads to the application.
- Add fixture-based tests for new detection behavior, including false positives,
  protected data, and platform-specific links where relevant.
- Validate with `npm run build`, `npm test`, `cargo test -p roomit-core --locked`,
  `cargo check --workspace --locked`, and `cargo test -p roomit --lib --locked`.
  Windows helpers are in `scripts/`. Native screen checks can be left to the
  user when requested; distinguish compiled/tested from UI acceptance.
- Report Windows and macOS results separately; a Windows build is not macOS
  runtime verification. Keep `docs/VALIDATION.md` honest and up to date.
