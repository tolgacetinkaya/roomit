export type ScanMode = "folder" | "disk" | "computer" | "ai";
export interface LocalDisk {
  path: string;
  name: string;
  totalSpace: string;
  availableSpace: string;
  removable: boolean;
}

// No fallback: a missing disk must never turn into a computer-wide scan.
export function scanTarget(mode: ScanMode, folder: string, selectedDisk: string,
  disks: LocalDisk[], loading: boolean): { mode: ScanMode; root: string } | null {
  if (mode === "folder") return folder.trim() ? { mode, root: folder.trim() } : null;
  if (mode === "ai") return { mode, root: "" };
  if (loading) return null;
  if (mode === "computer") return disks.length ? { mode, root: "" } : null;
  const disk = disks.find((disk) => disk.path === selectedDisk);
  return disk ? { mode, root: disk.path } : null;
}

export function usedPercent(disk: LocalDisk): number | null {
  const total = BigInt(disk.totalSpace);
  if (total === 0n) return null;
  const free = BigInt(disk.availableSpace);
  return Number((total - (free > total ? total : free)) * 100n / total);
}
