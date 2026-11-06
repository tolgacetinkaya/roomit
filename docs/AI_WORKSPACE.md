# AI workspace architecture and phased scope

Roomit's primary job is visibility into AI tools and their local data. Generic
project/disk size inspection remains secondary. The graphite/blue interface uses
Sensei's sidebar/panel hierarchy and DaisyDisk-style measured sector navigation.

## Discovery

`src/ai-catalog.json` is shared by Rust and TypeScript (19 tool families).
`inventory.rs` probes literal CLI files, known directories, Windows uninstall and
registered package metadata, and macOS app bundles. It never runs --version,
shell scripts or the discovered executables. Registration evidence and data-only
traces are separate. DisplayIcon is parsed as a literal file/resource path, not
executed. A product-named icon installation can also supplement automatic scan
exclusions; a shared Desktop/Documents icon must not exclude that user directory.

Unknown tools, custom aliases, editor extensions, WSL, container contents and
browser AI websites are outside this catalog's discovery guarantee. Known user
data roots are metadata-scanned on demand, deduplicated and protected. Alternate
model/data directories still need explicit folder selection. Installed program
binaries and user data are distinct; the reported scan size is not the complete
installed footprint or reclaimable space.

## Resource sampling

`monitor.rs` keeps a small mutex-protected sysinfo sampler. Visible workspace
views request snapshots sequentially about every two seconds; duplicate callers
within a second use the cache. Hidden views and pause stop polling. There is no
background service. Process arguments are used in memory for fixed CLI script
identity only; arguments/environments are not returned, logged or persisted.

CPU needs a second interval, is normalized by logical CPU count, and becomes
unknown after a long pause. RAM is process resident memory and can double-count
shared pages. Tool identity uses exact known names/script package paths. Only
known helper names in the same installation can inherit a parent's attribution;
Chrome, Docker, compilers, task processes and shared Node hosts do not inherit
ownership simply by descent. Unrecognized processes stay in the general list.

Network rates use cumulative adapter deltas and a baseline per adapter. New,
reset or disconnected interfaces produce unknown rates. The user selects an
adapter; virtual/VPN interfaces are not summed into a misleading device total.
There is no per-app traffic or LAN/internet distinction in this phase.

### Windows GPU (0.2.0)

`gpu/windows.rs` owns a language-neutral PDH `GPU Engine(*) / Utilization Percentage`
query in the monitor sampler mutex. It uses native DLL calls; no shell, external
CLI, driver installation, elevated helper or GPU workload is launched. The first
interval warms up; a pause over 15 seconds resets the baseline. Failed queries
retry after 10 seconds, returning explicit unknown status rather than cached values.
Native buffers are aligned, bounded to 16 MiB, checked for valid string ranges and
retried at most three times if instance counts change during retrieval.

`gpu.rs` validates instance PID/adapter/engine identity and finite valid-status
percentages. Stable nonzero process start times guard PID reuse. Missing/invalid
counters stay unknown. Per-process engine counters are indexed so process rows
do not repeatedly scan the entire array. Duplicate identities are conservatively
deduplicated and marked partial. Shared-engine process values sum first; only the
busiest engine is selected across engines/adapters. Tool groups with incomplete
coverage expose measured lower bounds and a coverage explanation. A numeric zero
requires valid measured data; an absent counter is never an implicit zero.

Local model workers are recognized only by known binary names plus product-specific
LM Studio/Ollama paths. Arbitrary worker binaries and child applications are not
charged to those tools. These are recognized local process measurements, not a
universal process-ownership guarantee or cloud-model GPU measurement.

The UI shows GPU per tool, per process and across recognized AI processes, with
GPU sorting and visible unknown/partial labels. IPC failures clear displayed GPU
percentages; unsupported platforms report unavailability. macOS per-process GPU
and VRAM remain outside this implementation.

API references: [PDH language-neutral counters](https://learn.microsoft.com/en-us/windows/win32/api/pdh/nf-pdh-pdhaddenglishcounterw),
[wildcard arrays](https://learn.microsoft.com/en-us/windows/win32/api/pdh/nf-pdh-pdhgetformattedcounterarrayw),
[Microsoft's GPU engine aggregation explanation](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/).

## Storage map

`map-model.ts` builds tool/location boundaries after existing nested de-duplication.
The chart uses BigInt totals, measured sector ratios and keyboard-accessible paths
with an equivalent list. Selection drills into the saved SQLite index, not the
live filesystem. New index rows store a normalized parent key and an ordered
parent/size index; a query returns at most 80 direct children. The remaining
measured parent bytes form an explicit remainder. All measured entries remain
reachable in the uncapped paginated size browser. Old saved indexes remain
readable and request manual rescanning to add the new parent metadata.

## Agreed next phases

- Extend detection to more catalogs, custom installations, plugins and isolated
  environments with visible evidence/coverage rather than a universal claim.
- Extend GPU coverage to macOS and add app-network providers. Missing access
  or unsupported counters must stay unknown, never zero. No driver, privileged
  packet tracing or permission expansion is enabled in this phase.
- Add a tool-specific temporary/cache taxonomy and optional longitudinal usage
  evidence. A timestamp or absent running process cannot prove a file is unused.
  File contents, prompts, histories and credentials stay protected. Deletion is
  outside the current authorized feature set.

Sources for brand assets are recorded in `src/assets/tools/SOURCES.md`. Reference
products: https://cindori.com/sensei and https://daisydiskapp.com/.
