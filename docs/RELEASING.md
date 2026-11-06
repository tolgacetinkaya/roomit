# Releases and in-app updates

Roomit checks **published GitHub releases**, not Git commits. Only a higher stable
version is an update. A push to `main` alone does not update installed apps.

The Windows app checks on startup (after five seconds) and every six hours while
open. Use **Roomit → Check for updates** to check immediately. Checks only request
the public release manifest; no scan results or telemetry are uploaded. A new
version displays a notice and plain-text release notes. **Update and restart**
downloads, verifies, and installs it using the official Tauri updater. A scan and
an update installation cannot run concurrently. Failed downloads/signatures show
an error and permit retry. Saved results and exclusions keep the same app ID.

## Windows distribution

- `Roomit-VERSION-windows-x64-setup.exe`: recommended per-user installation. Future
  updates install into the registered Roomit location and restart the installed app.
- `Roomit-VERSION.exe`: directly runnable executable. WebView2 must already be
  installed. Updating a portable copy launches the standard installer; it does not
  overwrite or remove the original portable EXE. Use the installed copy afterward.
- `latest.json` and the setup `.sig`: signed-update metadata for `windows-x86_64`.
- `SHA256SUMS.txt` and `Roomit-build.json`: download checksums and build provenance.

Updater signatures authenticate update packages. They are separate from Windows
Authenticode signing; v0.4.0 does not have an Authenticode publisher certificate.
macOS source support remains experimental: there is no macOS updater entry or
download until a Mac build and device checks have been completed.

## Signing key

The public key is committed in `src-tauri/tauri.conf.json`. Keep the matching
private key outside Git. This workstation's key is in ignored `.local/signing/`,
with file access restricted to its Windows user and SYSTEM. Back it up securely:
losing it prevents updates trusted by existing installations. Never upload the
private key, key generation output, or signing password as release assets.

On a new signing setup, generate a key with the official Tauri signer and commit
only its public key. For an encrypted private key, supply
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` through a private local environment. Do not
replace a deployed public key casually: existing apps trust the old key.

## Publish a version

1. Update the versions in `package.json`, `package-lock.json`, `Cargo.toml`,
   `crates/roomit-core/Cargo.toml`, `src-tauri/Cargo.toml`, `Cargo.lock`, and
   `src-tauri/tauri.conf.json`. Update visible version labels as well.
2. Write English release notes in `docs/releases/vVERSION.md`. Commit the source.
3. On Windows, run `./scripts/release.ps1`. It runs the checks, builds optimized
   GUI-subsystem binaries, signs the NSIS installer, and writes
   `artifacts/releases/vVERSION/`. `-SkipChecks` is only for already verified source.
4. Verify the build provenance, signature and checksums. Smoke-test the EXE. Do not
   replace saved user results as part of release testing.
5. Create a GitHub release with tag `vVERSION` targeting the verified source commit.
   Upload all six files from that release directory, using the exact names, and
   publish it as the latest stable release. Do not publish an incomplete manifest.
6. Download the public EXE/setup and compare SHA-256. Check that `latest.json` points
   to the setup asset and has the exact matching signature. A client already on
   that version should report up to date; an older updater-enabled client should
   offer **Update and restart**. Do not publish a dummy newer version for testing.

Versions predating this release do not contain an updater. Their users must
download v0.4.0 once. Subsequent signed releases can be installed from the app.
