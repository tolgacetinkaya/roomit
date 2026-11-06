export type Category = "buildOutput" | "dependencies" | "pythonCache" | "aiUserData" | "aiSettings" | "aiModels" | "protectedData";
export type EntryKind = "file" | "directory";
export type ScanStatus = "completed" | "cancelled" | "limited";
export interface SizedEntry {
  path: string;
  kind: EntryKind;
  logicalBytes: string;
  sizeComplete: boolean;
}
export interface Finding extends SizedEntry {
  category: Category;
  disposition: "reviewRequired" | "protected";
  tool: string;
  ruleId: string;
  reason: string;
}
export interface Project { path: string; ecosystems: string[] }
export interface ScanStats {
  filesScanned: number;
  directoriesScanned: number;
  entriesSeen: number;
  skippedLinks: number;
  skippedSpecial: number;
  skippedMounts: number;
  excludedEntries?: number;
  errors: number;
  projectsFound: number;
  findingsFound: number;
  totalLogicalBytes: string;
  recognizedLogicalBytes: string;
}
export interface ScanProgress { stats: ScanStats; currentPath: string; finished: boolean; rootIndex: number; rootCount: number }
export interface RootReport {
  path: string;
  status: "completed" | "cancelled" | "limited" | "failed" | "notScanned" | "excluded";
  logicalBytes: string;
  sizeComplete: boolean;
  error: string | null;
}
export interface InspectionReport {
  root: string;
  scope: "recursive" | "computer" | "disk" | "ai";
  status: ScanStatus;
  totalSizeComplete: boolean;
  stats: ScanStats;
  projects: Project[];
  findings: Finding[];
  largestEntries: SizedEntry[];
  sizeIndexId: string;
  scannedAtMs?: number;
  aiToolId?: string | null;
  persistenceError?: string | null;
  warnings: string[];
  warningsOmitted: number;
  resultsTruncated: boolean;
  roots: RootReport[];
}
export type FindingFilter = "all" | "development" | "ai" | "protected";
export const categoryLabels: Record<Category, string> = {
  buildOutput: "Build output", dependencies: "Dependencies", pythonCache: "Python cache",
  aiUserData: "AI user data", aiSettings: "AI settings / instructions", aiModels: "AI models", protectedData: "Protected data",
};
const number = new Intl.NumberFormat("en-US");
export const formatCount = (count: number): string => number.format(count);

// Decimal GB, not GiB. Integer arithmetic preserves large u64 IPC byte counts.
export function formatBytes(value: string): string {
  const bytes = BigInt(value);
  if (bytes < 0n) throw new RangeError("Byte count must be nonnegative");
  const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
  let unit = 0;
  let divisor = 1n;
  while (bytes >= divisor * 1000n && unit < units.length - 1) { divisor *= 1000n; unit += 1; }
  if (unit === 0) return `${number.format(bytes)} B`;
  const rounded = (bytes * 100n + divisor / 2n) / divisor;
  const fraction = (rounded % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `${number.format(rounded / 100n)}${fraction ? `.${fraction}` : ""} ${units[unit]}`;
}
export function sizeLabel(bytes: string, complete: boolean): string {
  return complete ? formatBytes(bytes) : `At least ${formatBytes(bytes)} · partial`;
}
export function matchesFilter(finding: Finding, filter: FindingFilter): boolean {
  switch (filter) {
    case "development": return finding.disposition === "reviewRequired";
    case "ai": return finding.category.startsWith("ai");
    case "protected": return finding.disposition === "protected";
    default: return true;
  }
}
export function scanSummary(report: InspectionReport): string {
  const status = report.status === "cancelled" ? "Scan cancelled. Results are partial."
    : report.status === "limited" ? "Scan limit reached. Results are partial."
    : !report.totalSizeComplete ? "Scan completed. Sizes are partial because some items were skipped."
    : "Scan completed.";
  const roots = report.scope === "computer"
    ? ` ${report.roots.filter((root) => !["failed", "notScanned", "excluded"].includes(root.status)).length}/${report.roots.length} disks processed.` : "";
  return `${status}${roots} ${formatCount(report.stats.filesScanned)} files, ${formatCount(report.stats.directoriesScanned)} folders. No files were changed.`;
}
