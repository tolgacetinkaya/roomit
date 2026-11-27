import type { InspectionReport } from "./report";
import { coverageCopy as copy } from "./locales/en-coverage.ts";

type CoverageReport = Pick<InspectionReport, "status" | "totalSizeComplete" | "stats" | "warnings" | "warningsOmitted">;

export function scanNotes(report: CoverageReport, query: string) {
  const status = report.status === "completed" && !report.totalSizeComplete ? "partial" : report.status;
  const reasons = (Object.keys(copy.reasons) as (keyof typeof copy.reasons)[]).flatMap(key => {
    const count = report.stats[key] ?? 0;
    const [label, explanation] = copy.reasons[key];
    return count > 0 ? [{label, explanation, count}] : [];
  });
  const filter = query.trim().toLowerCase();
  return {
    summary: [copy[status], report.stats.errors === 0 ? copy.noReadErrors : ""].filter(Boolean).join(" "),
    reasons,
    logCount: report.warnings.length + report.warningsOmitted,
    messages: report.warnings.filter(message => message.toLowerCase().includes(filter)),
  };
}
