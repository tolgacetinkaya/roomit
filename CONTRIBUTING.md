# Contributing to Roomit

Roomit's public source repository is https://github.com/tolgacetinkaya/roomit.
Keep contributions focused and describe the behavior changed and checks run.

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
