# Contributing to Roomit

Roomit currently lives in a local Git repository. No remote is configured.

- Keep development/AI inspection first and size-threshold search second.
- Keep `roomit-core` independent of the desktop UI.
- Do not read source, secrets, or AI conversation contents to identify artifacts.
- A directory name alone is not evidence that removal is safe.
- Do not add deletion, shell execution, telemetry or publishing to the foundation.
- Add fixture-based tests for new detection behavior, including false positives,
  protected data, and platform-specific links where relevant.
- Validate with `npm run build`, `cargo test -p roomit-core --locked`, and
  `cargo check --workspace --locked`. Windows helpers are in `scripts/`.
- Report Windows and macOS results separately; a Windows build is not macOS
  runtime verification. Keep `docs/VALIDATION.md` honest and up to date.
