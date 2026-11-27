import type { InspectionReport } from "./report";
import {pathName} from "./groups.ts";
import {scanTimeCopy} from "./locales/en-workspace.ts";

export function snapshotDuration(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isSafeInteger(ms) || ms < 0) return "";
  if (ms < 1000) return scanTimeCopy.label(scanTimeCopy.underOneSecond);
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const parts = [];
  if (minutes >= 60) parts.push(`${Math.floor(minutes / 60)}h`);
  if (minutes) parts.push(`${minutes % 60}m`);
  parts.push(`${seconds % 60}s`);
  return scanTimeCopy.label(parts.join(" "));
}

export function snapshotTitle(report: InspectionReport, restored: boolean): string {
  const base = restored ? "Saved scan results" : "Latest scan results";
  const title = report.scope === "ai" ? `${base} · ${pathName(report.root)}` : base;
  const status = report.status === "cancelled" ? `${title} · Cancelled, partial`
    : report.status === "limited" || !report.totalSizeComplete ? `${title} · Partial` : title;
  return [status, snapshotDuration(report.scanDurationMs)].filter(Boolean).join(" · ");
}
export function snapshotDate(timestamp: number | undefined): string {
  if (!timestamp || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8_640_000_000_000_000) return "Scan date unknown.";
  return `Scan started: ${new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(timestamp)}`;
}
