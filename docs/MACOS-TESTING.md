# Apple Silicon Mac test build

This experimental build targets Apple Silicon (M1 and newer, including M4),
macOS 13 or later. Intel Macs are not included. No developer tools or Rosetta
are needed to run it.

1. Download `Roomit-VERSION-macos-arm64.dmg` from the Mac test release.
2. Open the DMG and drag **Roomit** to **Applications**.
3. Eject the disk image and open **Applications → Roomit**.

The test app has an ad-hoc code signature, not an Apple Developer ID signature
or Apple notarization. macOS may block the first launch. After attempting to
open it, use **System Settings → Privacy & Security → Open Anyway** for Roomit
if macOS offers that option and you trust this download. Do not disable
Gatekeeper globally. If macOS still blocks it, share the exact message.

## Updates

Roomit checks for Mac updates five seconds after launch and every six hours
while open and visible. **Roomit → Check for updates** checks immediately.
Only newer, published Mac packages from the `macos-updates` feed are offered.
**Review update… → Install and restart** is required before installation;
an automatic check never installs silently. Keep the app in Applications,
not on the read-only disk image. Updates preserve saved scans and exclusions.

Updater packages are verified using Roomit's existing signing public key.
This signature is separate from Apple notarization. Future Mac builds must be
published to the Mac feed; a Git push or Windows-only release is not an update.

## Please test

- Launch, window controls, sidebar and folder picker.
- Discovery of installed AI apps and CLI tools; tell us any missing tools.
- Live CPU/RAM, grouped processes and charts. GPU is explicitly unavailable
  on macOS in this version; it is not reported as zero.
- One AI app's data scan, folder sizes, exclusions, progress and cancellation.
- Show in Finder, saved results after restart, and the stale-results notice.
- Manual update check (the first build should report up to date).

Scans inspect filesystem metadata and do not delete files. macOS access-denied
locations are skipped/reported; only grant access to folders you intend to scan.
The runner's native tests and launch smoke test do not establish interactive
MacBook acceptance or prove a real update installation. Please include your
macOS version, app version and steps with any failure; redact personal paths.
