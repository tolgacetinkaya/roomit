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
VRAM or cloud inference. Unsupported providers explicitly say “Ölçülemiyor”.

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

The **RAM gösterimi** selector provides capacity, percent and both (default).
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
