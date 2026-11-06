# Live resource charts and RAM breakdown — 0.4.0

CPU, RAM and AI GPU cards share a 120-second time axis and fixed 0–100% scale.
Visible resource views poll sequentially at roughly two-second intervals. The
history contains real returned sample timestamps; no generated points, smoothing,
interpolated pauses or prefilled curve is used in production. The buffer is
bounded to 121 entries and to the last 120 seconds. History stays in memory and
does not survive app restart. Switching between resource views retains it.

Each chart has an accessible text description with the actual point count and
range. A single first sample is a point rather than a fabricated historical line.
Unknown/invalid values remain gaps. Manual pause, leaving the resource views,
document hiding, IPC failure, missed intervals over six seconds and changing
GPU coverage break lines. Partial GPU percentages use a dashed line and remain
lower bounds. GPU still covers recognized local AI processes, not all GPU work,
VRAM or cloud inference. Unsupported providers explicitly say “Unavailable”.

RAM capacity uses binary GiB/MiB. The native sampler now exports available bytes
from `sysinfo::System::available_memory`. The RAM card displays:

- Used: OS-visible total minus available.
- Free/available: memory that can be used, including reclaimable cache. This is
  intentionally not a strict free-page count. The capacity tooltip explains it.
- System total: physical memory usable by the OS, excluding reserved capacity.
- Installed RAM: separate firmware capacity where the Windows provider supports
  it; never added to the percentage denominator or inferred by rounding.

Used + available therefore partitions system total. Unreadable/invalid values
remain unknown; zero available/zero use are valid. Tool/process RAM remains
resident memory, with the existing shared-page caveat; sums can overlap.

The **RAM display** selector provides capacity, percent and both (default).
The choice applies to RAM cards, tool aggregates and process rows and is stored
only under `roomit-ram-display`. Percentages use system total. CPU and GPU already
use percentages, and all chart axes always remain percentages. Display changes
do not clear filters, history, saved scans, exclusions or trigger a scan.

On measurement errors all current CPU/RAM/GPU fields become unavailable instead
of continuing to look live. Focused process controls retain focus while CPU/RAM
and GPU cells refresh. Charts are local canvas renderings; no chart dependency,
telemetry, cloud call, new file-writing capability or deletion command was added.

Validation for this version is recorded in `docs/VALIDATION.md`. Browser fixtures
are explicitly sample data; real native read-only measurements were checked
separately. Native GUI and macOS device acceptance are not implied by either.

## Expandable application groups — 0.4.1

Live resources groups recognized AI tools and their known helpers together.
Other processes share a group when their native executable identity matches;
known Chrome, Docker Desktop and Android Studio bundled helpers can share an
installation group. macOS app bundles form groups. Different unknown executable
locations remain separate, even when their filenames match. A process with no
readable executable path remains an individual group. No command-line text or
executable path is added to the IPC response for grouping.

Select an application row to expand its process rows. Headers show process count,
combined CPU, exact resident-memory sum and the native group GPU measurement.
Children show their own PID, CPU, RAM and GPU. RAM can include shared pages.
Group GPU combines counters on each engine before selecting the busiest engine;
it is never the sum of individual process GPU peaks. Missing and partial values
remain explicit. Search selects whole groups, so a PID match does not reduce the
group's resource totals. Sorting uses those totals before pagination.

Application pages and expanded member pages each contain at most 50 entries.
There is no overall result cutoff. Open groups, child pages and focused controls
survive live samples. Rows are reused and updated in place; exited processes are
removed. Group state is session-only. Existing scanning, exclusions and saved
results are independent of these controls.

Validation for 0.4.1: the combined check passed 50 frontend tests, 33 core tests,
and 53 desktop tests (the existing interactive reveal test remains ignored).
New coverage includes complete-group aggregation, exact large RAM counts,
PID filtering, group/member pagination, unknown measurements, installation
identity separation, bundled helpers, and native per-group GPU membership.
Browser fixtures confirmed expansion, second-page retention and keyboard focus
across live samples, independent child values, and PID search without reducing
totals. Fixture values are sample data; the native sampler tests use real local
measurements. macOS device checks remain pending.
