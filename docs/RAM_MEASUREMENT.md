# RAM display correction — 0.3.1

The resource panel reused the decimal disk-size formatter for physical/process
RAM. 137,438,953,472 bytes (128 GiB) therefore displayed as 137.44 GB. This was
a display-unit error, not evidence of additional installed RAM.

- Device used/total RAM, tool aggregates and process rows now use binary units
  (1024 bytes per KiB, 1024 MiB per GiB). Labels explicitly say GiB/MiB.
- Firmware-installed capacity and OS-visible total are distinct. The Windows
  `GetPhysicallyInstalledSystemMemory` API returns installed capacity in KiB;
  checked multiplication by 1024 produces bytes. The read is cached per process
  lifetime. Failure, zero, overflow or a value below the OS total stays unknown.
- The resource panel says, for example, “128 GiB takılı · 127,7 GiB sistem
  belleği”. The second value is OS-visible total, not free/available memory.
  The value is not rounded up to an assumed DIMM capacity. A tooltip explains
  the units and meaning; the capacity line can wrap instead of clipping.
- Without a supported installed-memory provider, including this macOS version,
  the UI reports OS-visible total and “Takılı RAM okunamadı”. It never invents
  installed capacity. Native macOS acceptance remains pending.
- Disk/file sizes, network rates and decimal minimum-GB filters are unchanged.
  All formatting preserves u64 byte counts with integer arithmetic.

Regression checks cover 128 GiB, the reported 137.12 decimal GB example, MiB/KiB
boundaries, zero, u64 maximum, negative values, installed/OS-visible separation,
unknown installed capacity and unchanged decimal storage formatting.

API reference: [Microsoft GetPhysicallyInstalledSystemMemory](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getphysicallyinstalledsystemmemory).
