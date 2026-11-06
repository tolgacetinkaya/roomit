import { categoryLabels, formatBytes, formatCount, scanSummary, sizeLabel } from "./report";
import type { Finding, InspectionReport, SizedEntry } from "./report";
import { filterGroups, pathName } from "./groups";
import type { GroupedReport, ResultGroup } from "./groups";
import { icon } from "./icons";
import { revealActions, revealShortcut } from "./reveal";
import { filterSizeEntries, sizeListIncomplete } from "./size-filter";

export type ResultView = "overview" | "projects" | "ai" | "largest" | "details";
const node = (tag: string, text = "", className = ""): HTMLElement => {
  const result = document.createElement(tag); result.textContent = text; result.className = className; return result;
};
function paged<T>(items: T[], render: (item: T) => HTMLElement, pageSize = 25): HTMLElement {
  const wrapper = node("div", "", "paged-list");
  const list = node("div", "", "group-list");
  const more = document.createElement("button");
  more.type = "button"; more.className = "secondary load-more";
  let count = 0;
  const append = (): void => {
    const end = Math.min(count + pageSize, items.length);
    const fragment = document.createDocumentFragment();
    for (; count < end; count++) fragment.append(render(items[count]));
    list.append(fragment); more.hidden = count >= items.length;
    more.textContent = `Daha fazla göster (${formatCount(count)} / ${formatCount(items.length)})`;
  };
  more.addEventListener("click", append); wrapper.append(list, more); append(); return wrapper;
}
function attachReveal(target: HTMLElement, paths: string[], focusable = false): void {
  target.dataset.revealOwner = "";
  if (focusable) target.tabIndex = 0;
  target.append(revealActions(paths));
}
function expandable(title: string, subtitle: string, size: string, build: () => HTMLElement, paths: string[] = []): HTMLElement {
  const details = document.createElement("details"); details.className = "group-card";
  const summary = document.createElement("summary");
  const row = node("span", "", "group-row");
  const label = node("span", "", "group-label");
  label.append(node("strong", title), node("span", subtitle, "group-subtitle"));
  const right = node("span", "", "group-right");
  right.append(node("strong", size), node("span", "Ayrıntılar", "group-subtitle"));
  row.append(label, right); summary.append(row); details.append(summary);
  let built = false;
  details.addEventListener("toggle", () => {
    if (details.open && !built) { details.append(build()); built = true; }
  });
  if (!paths.length) return details;
  const card = node("div", "", "result-card"); card.append(details);
  attachReveal(card, paths);
  summary.title = `Ayrıntıları aç · Konumu göster: ${revealShortcut}`;
  return card;
}
function findingRow(item: Finding): HTMLElement {
  const row = node("div", "", "member-row");
  const heading = node("div", "", "member-heading");
  heading.append(node("strong", pathName(item.path)), node("span", sizeLabel(item.logicalBytes, item.sizeComplete)));
  const path = node("p", item.path, "report-path");
  row.append(heading, node("p", `${categoryLabels[item.category]} · ${item.disposition === "protected" ? "Korunuyor" : "İnceleme gerekli"}`, "muted"), path, node("p", item.reason, "hint"));
  attachReveal(row, [item.path], true);
  return row;
}
function groupCard(group: ResultGroup): HTMLElement {
  const location = group.location ? group.location.replace(/\\/g, "/").split("/").slice(-2).join("/") + " · " : "";
  const context = `${location}${group.tools.join(" · ")} · ${formatCount(group.items.length)} konum`;
  const card = expandable(group.title, context, sizeLabel(group.logicalBytes, group.sizeComplete), () => {
    const body = node("div", "", "group-content");
    if (group.location) body.append(node("p", group.location, "report-path"));
    body.append(paged(group.items, findingRow, 20)); return body;
  }, group.location ? [group.location] : group.items.map((item) => item.path));
  card.title = group.location || group.title;
  card.querySelector(".group-row")?.prepend(icon(group.kind === "ai" ? "ai" : group.kind === "project" ? "project" : "shield", "ui-icon group-icon"));
  return card;
}
function section(title: string, count: number, action?: () => void, unit = "grup"): HTMLElement {
  const header = node("div", "", "section-header");
  header.append(node("h3", title), node("span", `${formatCount(count)} ${unit}`, "section-count"));
  if (action) {
    const button = document.createElement("button"); button.type = "button"; button.className = "text-button";
    button.textContent = "Tümünü gör"; button.addEventListener("click", action); header.append(button);
  }
  return header;
}
const empty = (text: string): HTMLElement => node("div", text, "empty-note");

export function renderResults(report: InspectionReport, grouped: GroupedReport, view: ResultView, query: string,
  navigate: (view: ResultView) => void, minimumBytes = 0n): HTMLElement {
  const container = node("div", "", "report-view");
  if (view === "overview") {
    const metrics = node("div", "", "metrics");
    for (const [label, value, hint] of [
      ["İncelenen boyut", sizeLabel(report.stats.totalLogicalBytes, report.totalSizeComplete), `${formatCount(report.stats.filesScanned)} dosya incelendi`],
      ["Tanımlanan alan", sizeLabel(report.stats.recognizedLogicalBytes, report.totalSizeComplete), "Tanınan yazılım, AI ve korunan veri"],
      ["Yazılım / AI grubu", `${formatCount(grouped.projects.length)} / ${formatCount(grouped.ai.length)}`, "Projelerine ve araçlarına göre düzenlendi"],
    ]) { const card = node("div", "", "metric"); card.append(node("span", label), node("strong", value), node("small", hint)); metrics.append(card); }
    container.append(metrics);
  }
  if (!report.totalSizeComplete || report.status !== "completed" || report.resultsTruncated) {
    const notice = node("div", "", "result-notice");
    notice.append(node("span", report.resultsTruncated ? "Liste özetlendi. Gösterilen gruplar eksik olabilir; tarama toplamı tüm ölçülen dosyaları kapsar." : "Bazı alanlar taranamadı veya tarama durduruldu. Boyutlar kısmi olabilir."));
    const details = document.createElement("button"); details.type = "button"; details.className = "text-button"; details.textContent = "Ayrıntıları gör";
    details.addEventListener("click", () => navigate("details")); notice.append(details); container.append(notice);
  }
  const projects = filterGroups(grouped.projects, query);
  const ai = filterGroups(grouped.ai, query);
  const protectedGroups = filterGroups(grouped.protected, query);
  if (view === "overview" || view === "projects") {
    container.append(section("Yazılım projeleri", projects.length, view === "overview" && projects.length > 6 ? () => navigate("projects") : undefined));
    container.append(node("p", "Proje kartları, tanınan çıktı ve bağımlılıkların toplamını gösterir.", "hint"));
    container.append(projects.length ? paged(view === "overview" ? projects.slice(0, 6) : projects, groupCard) : empty(query ? "Aramana uygun proje bulunamadı." : "Bu taramada sınıflandırılan yazılım çıktısı bulunamadı."));
  }
  if (view === "overview" || view === "ai") {
    container.append(section("AI araçları", ai.length));
    container.append(ai.length ? paged(ai, groupCard) : empty(query ? "Aramana uygun AI aracı bulunamadı." : "Bu kapsamda tanınan AI verisi bulunamadı."));
  }
  if (view === "overview" && protectedGroups.length) {
    const details = document.createElement("details"); details.className = "additional-details";
    details.append(node("summary", `Diğer korunan veriler · ${formatCount(protectedGroups.length)} grup`));
    let built = false;
    details.addEventListener("toggle", () => { if (details.open && !built) { details.append(paged(protectedGroups, groupCard)); built = true; } });
    container.append(details);
  }
  if (view === "largest") {
    const entries = report.sizeEntries ?? report.largestEntries;
    const fileMatches = filterSizeEntries(entries, minimumBytes, query, "file");
    const directoryMatches = filterSizeEntries(entries, minimumBytes, query, "directory");
    container.append(node("p", `${minimumBytes > 0n ? formatBytes(minimumBytes.toString()) + " ve üzeri" : "Boyut sınırı yok"} · Ölçülen dosya ve alt klasörler`, "size-filter-summary"));
    container.append(node("p", "Dosyalar ve klasörler ayrı listelenir. Klasör boyutu alt dosyalarını da içerir; bu boyutları birlikte toplama.", "hint"));
    const fileLimited = sizeListIncomplete(entries, "file", report.sizeFilesTruncated, minimumBytes);
    const directoryLimited = sizeListIncomplete(entries, "directory", report.sizeDirectoriesTruncated, minimumBytes);
    if (fileLimited || directoryLimited) container.append(node("p", "Liste sınırına ulaşıldı: En büyük 10.000 dosya ve 10.000 klasör tutulur. Bu eşiğe uyan başka öğeler olabilir. Tarama ve toplam boyut hesaplaması bu sınırda durmaz.", "result-notice"));
    const sizeCard = (entry: SizedEntry): HTMLElement => {
      const card = node("article", "", "result-card size-result");
      const heading = node("div", "", "member-heading");
      const title = node("span", "", "size-entry-title");
      title.append(icon(entry.kind === "file" ? "file" : "folder"), node("strong", pathName(entry.path)));
      heading.append(title, node("span", sizeLabel(entry.logicalBytes, entry.sizeComplete)));
      card.append(heading, node("p", entry.path, "report-path"));
      attachReveal(card, [entry.path], true); return card;
    };
    container.append(section("Dosyalar", fileMatches.length, undefined, "dosya"));
    container.append(fileMatches.length ? paged(fileMatches, sizeCard) : empty("Bu boyut ve arama koşullarına uyan dosya bulunamadı."));
    container.append(section("Klasörler", directoryMatches.length, undefined, "klasör"));
    container.append(directoryMatches.length ? paged(directoryMatches, sizeCard) : empty("Bu boyut ve arama koşullarına uyan alt klasör bulunamadı."));
  }
  if (view === "details") {
    container.append(section("Tarama ayrıntıları", report.roots.length, undefined, "konum"), node("p", scanSummary(report), "muted"), node("p", report.root, "report-path"));
    for (const root of report.roots) {
      const row = node("div", "", "member-row");
      const label = root.status === "failed" ? "Erişilemedi" : root.status === "notScanned" ? "Taranmadı" : sizeLabel(root.logicalBytes, root.sizeComplete);
      row.append(node("strong", `${root.path} · ${label}`));
      attachReveal(row, [root.path], true);
      if (root.error) row.append(node("p", root.error, "warning")); container.append(row);
    }
    container.append(node("p", "Boyutlar dosya uzunluklarının toplamıdır. Diskte ayrılan veya boşaltılabilecek alanı göstermez; hardlinkler her yol için sayılır.", "hint"));
    if (report.scope === "computer" || report.scope === "disk") container.append(node("p", "Disk ve bütün bilgisayar taramalarında öğe sayısı veya klasör derinliği sınırı yoktur. Liste ve uyarı sayıları belleği korumak için sınırlı tutulur; bu sınırlar taramayı durdurmaz.", "hint"));
    for (const warning of report.warnings) container.append(node("p", warning, "warning"));
    if (report.warningsOmitted) container.append(node("p", `${formatCount(report.warningsOmitted)} ek uyarı listelenmedi.`, "hint"));
    if (protectedGroups.length) container.append(section("Korunan veriler", protectedGroups.length), paged(protectedGroups, groupCard));
  }
  return container;
}
