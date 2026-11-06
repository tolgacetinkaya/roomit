# Releases and in-app updates

Roomit checks **published GitHub releases**, not Git commits. Only a higher stable
version is an update. A push to `main` alone does not update installed apps.

The Windows app checks on startup (after five seconds) and every six hours while
open. Use **Roomit → Check for updates** to check immediately. Checks only request
the public release manifest; no scan results or telemetry are uploaded. A new
version displays a notice and plain-text release notes. From 0.4.2, **Review update…**
opens an installation explanation; only **Install and restart** confirms it.
Cancel and Escape do not install. Confirmation is required for every installation,
so a portable executable can never bypass it through misclassification.
The official Tauri updater downloads, verifies, and installs the package. A scan and
an update installation cannot run concurrently. Failed downloads/signatures show
an error and permit retry. Saved results and exclusions keep the same app ID.

## Windows distribution

- `Roomit-VERSION-windows-x64-setup.exe`: recommended per-user installation. Future
  updates install into the registered Roomit location and restart the installed app.
- `Roomit-VERSION.exe`: directly runnable executable. WebView2 must already be
  installed. Updating a portable copy launches the standard installer; it does not
  overwrite or remove the original portable EXE. Use the installed copy afterward.
- From 0.4.2, **Download latest portable EXE** is also available in the Roomit menu,
  update notice and confirmation dialog. It resolves the latest published manifest
  on every click, even for an up-to-date client, and opens the versioned EXE download
  in the default browser. It never invokes the installer or executes the download.
  The browser controls the save location and download prompts. Windows EXE names
  must retain the `Roomit-VERSION.exe` convention. Existing 0.4.0/0.4.1 clients keep
  their previous update UI until upgraded; publishing cannot retrofit that UI.
- `latest.json` and the setup `.sig`: signed-update metadata for `windows-x86_64`.
- `SHA256SUMS.txt` and `Roomit-build.json`: download checksums and build provenance.

Updater signatures authenticate update packages. They are separate from Windows
Authenticode signing; v0.4.0 does not have an Authenticode publisher certificate.
Mac test builds use the separate Apple Silicon feed described below. They do not
replace the latest stable Windows release or its updater manifest.

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

## Apple Silicon test releases

The `Apple Silicon test package` workflow runs native tests on `macos-15` arm64,
builds an ad-hoc signed DMG, verifies the bundle signature and architecture, and
checks that its process stays running. Interactive MacBook validation remains
separate. See [Mac testing](MACOS-TESTING.md).

1. Build the reviewed source branch. Download the `Roomit-macos-arm64-test`
   artifact from the successful run. Confirm `Roomit-build.json` identifies the
   intended source commit/tree and check both binary SHA-256 values.
2. Extract into an ignored artifact directory. Sign the archive **locally** with
   the existing updater key (do not upload the private key to the workflow):

   ```powershell
   npm run tauri -- signer sign --private-key-path .local/signing/roomit.key --app-version VERSION artifacts/macos-test/Roomit-VERSION-macos-arm64.app.tar.gz
   node scripts/macos-release-manifest.mjs artifacts/macos-test vVERSION-macos-test.1
   $env:ROOMIT_VERIFY_PACKAGE = (Resolve-Path artifacts/macos-test/Roomit-VERSION-macos-arm64.app.tar.gz).Path
   cargo test -p roomit --test release_signature --locked -- --ignored
   Remove-Item Env:ROOMIT_VERIFY_PACKAGE
   ```

3. Create a **pre-release** `vVERSION-macos-test.1` at the verified source commit.
   Upload the seven generated files. Do not set this release as latest and do not
   change the Windows `latest.json`. Publish only after signature verification.
4. Download the public assets and verify their bytes/checksums. Then publish the
   exact `latest-macos.json` to the repository's **macos-updates** branch root.
   The macOS config reads
   `https://raw.githubusercontent.com/tolgacetinkaya/roomit/macos-updates/latest-macos.json`.
   Publish the feed last so clients never see incomplete release assets.
5. Future Mac releases must increase the app's SemVer, retain the app ID and
   updater public key, and update that same feed after verification. Keep older
   downloads available. A Windows-only release does not advance this channel.

Automatic checks run after five seconds and every six hours while visible.
Mac confirmation describes replacing the installed app, not a Windows installer.
No update is installed without consent. Users must run the copy in Applications,
not the read-only DMG. Updater signatures do not confer Apple notarization;
production distribution should use Developer ID signing and notarization.
