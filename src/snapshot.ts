import type { InspectionReport } from "./report";

export function snapshotTitle(report: InspectionReport, restored: boolean): string {
  const base = restored ? "Saved scan results" : "Latest scan results";
  const title = report.scope === "ai" ? `${base} · ${report.root}` : base;
  return report.status === "cancelled" ? `${title} · Cancelled, partial`
    : report.status === "limited" || !report.totalSizeComplete ? `${title} · Partial` : title;
}
export function snapshotDate(timestamp: number | undefined): string {
  if (!timestamp || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8_640_000_000_000_000) return "Scan date unknown.";
  return `Scan started: ${new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(timestamp)}`;
}
