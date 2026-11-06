import type { InspectionReport } from "./report";

export function snapshotTitle(report: InspectionReport, restored: boolean): string {
  const title = restored ? "Kaydedilen tarama sonuçları" : "Son tarama sonuçları";
  return report.status === "cancelled" ? `${title} · İptal edildi, kısmi`
    : report.status === "limited" || !report.totalSizeComplete ? `${title} · Kısmi` : title;
}
export function snapshotDate(timestamp: number | undefined): string {
  if (!timestamp || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8_640_000_000_000_000) return "Tarama tarihi bilinmiyor.";
  return `Tarama başlangıcı: ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(timestamp)}`;
}
