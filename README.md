<p align="center">
  <img src="src-tauri/icons/128x128.png" width="80" alt="Roomit logo" />
</p>

<h1 align="center">Roomit</h1>
<p align="center"><strong>See what your AI tools leave behind.</strong></p>
<p align="center">Discover AI apps. Monitor local resources. Understand their disk usage.</p>

<p align="center">
  <a href="https://github.com/tolgacetinkaya/roomit/releases/latest"><img src="https://img.shields.io/github/v/release/tolgacetinkaya/roomit?label=download&amp;color=4778ff" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
  <a href="https://github.com/tolgacetinkaya/roomit/releases/latest"><img src="https://img.shields.io/badge/Windows-x64-4778ff" alt="Windows x64 downloads" /></a>
</p>

<p align="center">
  <a href="#download">Download for Windows or Mac</a> ·
  <a href="#get-started">Get started</a> ·
  <a href="docs/ROADMAP.md">Roadmap</a> ·
  <a href="CONTRIBUTING.md">Contribute</a> ·
  <a href="https://github.com/tolgacetinkaya/roomit/issues/new/choose">Report an issue</a>
</p>

Roomit is an open-source desktop app for people using AI coding assistants and
local model tools. Find supported desktop and CLI apps such as **Claude Code,
Codex, Ollama and LM Studio**, see their local resource usage, and inspect the
data they accumulate — from one workspace.

Built with **Rust + Tauri + TypeScript**. Scans stay on your device and leave
scanned files unchanged. No account or AI API key is required.

## What you can do

| Question | In Roomit |
| --- | --- |
| Which AI tools are on this machine? | **My tools** lists supported apps and CLI tools, their discovery evidence and known locations. Running tools appear first. |
| What is using CPU, RAM or GPU? | **Live resources** shows device charts and expandable app/process groups. Windows GPU values report missing or partial coverage explicitly. |
| How much data does one tool keep? | Choose **Scan app data** on its card, or select one application in AI scan settings. |
| Where is that space going? | Explore the **AI storage map**, inspect paths and use **Show in folder** to open Explorer or Finder. |
| Can I keep the results? | The latest scan and exclusions persist. Changes detected while Roomit is open show a stale warning; you decide when to rescan. |
| What about other large files? | Scan a folder, one disk or local disks, then filter **Large items** by minimum GB without rescanning. |

## Download

### Windows x64 · stable release

Get the installer or portable EXE from the **[latest Windows release](https://github.com/tolgacetinkaya/roomit/releases/latest)**.

| File | Use it for |
| --- | --- |
| `Roomit-VERSION-windows-x64-setup.exe` | A per-user Windows installation. |
| `Roomit-VERSION.exe` | Running directly without installation. Requires WebView2. |
| `SHA256SUMS.txt` | Checking download hashes. |

Roomit checks published releases for updates. On 0.4.2 and later, **Roomit → Check
for updates → Review update…** offers **Install and restart** or **Download latest
portable EXE**. Installing from a portable copy installs Roomit; it does not replace
the original portable file. [Update behavior and signatures →](docs/RELEASING.md)

Windows update packages carry Roomit's updater signature. The Windows executables currently ship without an Authenticode publisher certificate.

### Apple Silicon Mac · test release

**[Download the v0.4.4 test DMG](https://github.com/tolgacetinkaya/roomit/releases/download/v0.4.4-macos-test.1/Roomit-0.4.4-macos-arm64.dmg)** for M1 and newer Macs, including M4, running macOS 13 or later. Open the DMG, drag **Roomit** to **Applications**, eject the disk image and launch Roomit from Applications.

The test build uses an ad-hoc signature and has no Apple notarization. If macOS blocks the first launch, follow the [Mac testing guide](docs/MACOS-TESTING.md). Roomit checks for signed Mac updates at startup and every six hours while open and visible. Choose **Review update… → Install and restart** to apply an update.

CPU and RAM monitoring are available on Mac. Per-process GPU readings are currently available on Windows only. Automated Apple Silicon tests and a launch check passed. Interactive M4 testing and a version-to-version update installation are still pending. [Mac test release notes](https://github.com/tolgacetinkaya/roomit/releases/tag/v0.4.4-macos-test.1)

## Get started

1. Open **My tools** to see detected AI applications and terminal tools.
2. Choose **Scan app data** on a tool such as Codex. To scan all supported tools,
   use **Scan AI data**. Known per-user locations are scanned; other disks are
   not searched for custom model folders.
3. Read the total on the tool card, then choose **View scanned data** to explore
   the map and locations. Progress and cancellation remain available.
4. Reopen Roomit to view the saved result. Use **Rescan** when you want a fresh
   measurement; each completed or cancelled scan replaces the latest snapshot.

For data on another drive, use a folder scan. Configure **Exclusions** before
scanning folders you want to leave out. See [per-app scans](docs/APP_DATA_SCANS.md).

## Supported AI tools

The bundled catalog currently contains 19 tool families:

| | Tools |
| --- | --- |
| Coding assistants and editors | Codex, Claude Code, OpenCode, Cursor, Windsurf, Gemini CLI, Aider, GitHub Copilot, Antigravity, Trae |
| Local models and AI workspaces | Ollama, LM Studio, Jan, AnythingLLM |
| Other desktop / CLI tools | Claude, ChatGPT, ZCode, Qwen, Kimi |

Support means known discovery rules, not a guarantee that every installation or
version will be found. Custom aliases, WSL/container installations, browser AI
sites and arbitrary model locations are outside automatic discovery. A leftover
data folder is labeled separately from installation evidence.

Missing a tool? [Request detection support](https://github.com/tolgacetinkaya/roomit/issues/new?template=03_tool_support.md)
with its official link, platform and a redacted example path.

## Local data, honest measurements

- **Metadata-only scans:** file paths, types and sizes are indexed locally. Source
  code, secrets and AI conversation contents are not read to classify files.
- **No deletion actions:** models, histories and settings are not treated as
  disposable simply because they are large or old. Detailed temporary/cache
  classification is a [proposed next step](docs/ROADMAP.md).
- **No telemetry or cloud inference:** update checks and downloads contact GitHub;
  opening external links uses your browser. Scan results are not uploaded.
- **Explicit coverage:** sizes are logical bytes, not reclaimable space. Exclusions,
  inaccessible items and cancellation can produce partial totals. RAM uses GiB/MiB;
  storage uses decimal GB.
- **Local resource usage:** CPU/RAM and supported Windows GPU measurements concern
  processes on this device. Cloud model GPU, VRAM, per-app network traffic and
  long-term activity history are not measured. Monitoring pauses when its workspace
  is hidden or paused; there is no background service.

See [measurement details](docs/LIVE_RESOURCES.md) and [scan semantics](docs/SCANNING.md).

## Build and contribute

Install Node.js, Rust and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/), then:

```sh
git clone https://github.com/tolgacetinkaya/roomit.git
cd roomit
npm ci
npm run tauri -- dev
```

Use Node 22.18+ for the native TypeScript tests and a Rust toolchain compatible
with the workspace's minimum version. Windows also needs C++ build tools, the
Windows SDK and WebView2. `npm run dev` is a frontend preview; native scanning is
only available in the desktop app.

Useful contributions include detection rules with fixtures, false-positive
reports, accessibility improvements and Mac validation. Changes go through a
**feature branch → tests → pull request → review → merge** workflow.

[Contribution guide](CONTRIBUTING.md) · [Proposed roadmap](docs/ROADMAP.md) ·
[Issue templates](https://github.com/tolgacetinkaya/roomit/issues/new/choose)

## Documentation

- [AI workspace and discovery](docs/AI_WORKSPACE.md)
- [Per-application data scans](docs/APP_DATA_SCANS.md)
- [Live resources and measurement limits](docs/LIVE_RESOURCES.md)
- [Scan sizes, exclusions and saved results](docs/SCANNING.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Validation](docs/VALIDATION.md) and [manual checks](docs/MANUAL_TEST.md)
- [Release process and updates](docs/RELEASING.md)

## License

[MIT](LICENSE). Tool names and logos identify their respective products; Roomit
is not affiliated with those vendors. See the [tool artwork notices](src/assets/tools/LICENSE).
