import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { categoryLabels, formatBytes, formatCount, matchesFilter, scanSummary, sizeLabel } from "./report";
import type { Finding, FindingFilter, InspectionReport, ScanProgress } from "./report";
import "./styles.css";

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing interface element: ${selector}`);
  return result;
}
const form = element<HTMLFormElement>("#inspect-form");
const input = element<HTMLInputElement>("#root");
const button = element<HTMLButtonElement>("#inspect-button");
const cancelButton = element<HTMLButtonElement>("#cancel-button");
const status = element<HTMLParagraphElement>("#status");
const results = element<HTMLDivElement>("#results");
const progressBar = element<HTMLProgressElement>("#scan-progress");
const currentPath = element<HTMLParagraphElement>("#current-path");
const chooseFolder = element<HTMLButtonElement>("#choose-folder");
const refreshRoots = element<HTMLButtonElement>("#refresh-roots");
const folderTarget = element<HTMLDivElement>("#folder-target");
const computerTarget = element<HTMLDivElement>("#computer-target");
const rootsLabel = element<HTMLParagraphElement>("#computer-roots");
const modeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="scan-mode"]'));
let activeScan: string | null = null;
let cancelRequested = false;
let pickingFolder = false;
let rootsLoading = false;
let computerRoots: string[] = [];
let diskRequest = 0;
const scanMode = (): "folder" | "computer" => modeInputs.find((radio) => radio.checked)?.value === "computer" ? "computer" : "folder";

function updateControls(): void {
  const native = isTauri();
  const busy = Boolean(activeScan) || pickingFolder;
  const computer = scanMode() === "computer";
  folderTarget.hidden = computer; computerTarget.hidden = !computer;
  input.disabled = !native || busy;
  chooseFolder.disabled = !native || busy;
  refreshRoots.disabled = !native || busy || rootsLoading;
  for (const radio of modeInputs) radio.disabled = !native || busy;
  button.disabled = !native || busy || (computer ? rootsLoading || computerRoots.length === 0 : !input.value);
}

async function loadComputerRoots(): Promise<void> {
  const request = ++diskRequest;
  rootsLoading = true; computerRoots = [];
  rootsLabel.textContent = "Yerel diskler bulunuyor…";
  updateControls();
  try {
    const roots = await invoke<string[]>("computer_scan_roots");
    if (request !== diskRequest) return;
    computerRoots = roots;
    rootsLabel.textContent = roots.length ? roots.join(" · ") : "Taranabilir yerel disk bulunamadı.";
  } catch (error: unknown) {
    if (request === diskRequest) rootsLabel.textContent = `Disk listesi alınamadı: ${String(error)}`;
  } finally {
    if (request === diskRequest) { rootsLoading = false; updateControls(); }
  }
}

chooseFolder.addEventListener("click", async () => {
  if (activeScan || pickingFolder || !isTauri()) return;
  pickingFolder = true; updateControls();
  try {
    const folder = await open({ directory: true, multiple: false, recursive: true,
      title: "Roomit — Taranacak klasörü seç", defaultPath: input.value || undefined,
      canCreateDirectories: false, fileAccessMode: "scoped" });
    if (folder !== null) {
      input.value = folder;
      results.replaceChildren();
      status.className = "";
      status.textContent = "Klasör seçildi. Hazır olduğunda taramayı başlat.";
    }
  } catch (error: unknown) {
    status.className = "warning";
    status.textContent = `Klasör seçici açılamadı: ${String(error)}`;
  } finally { pickingFolder = false; updateControls(); }
});
for (const radio of modeInputs) radio.addEventListener("change", () => {
  diskRequest += 1; rootsLoading = false;
  results.replaceChildren(); status.className = "";
  status.textContent = "Tarama kapsamı seçildi. Hazır olduğunda taramayı başlat.";
  updateControls();
  if (scanMode() === "computer") void loadComputerRoots();
});
refreshRoots.addEventListener("click", () => { void loadComputerRoots(); });

// Paths, errors and other filesystem-derived values are untrusted text.
function textNode(tag: string, value: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}
function pagedList<T>(items: T[], render: (value: T) => HTMLElement): HTMLElement {
  const container = textNode("div", "");
  const list = document.createElement("ul");
  list.className = "findings";
  const more = document.createElement("button");
  more.type = "button";
  more.className = "secondary load-more";
  let count = 0;
  const appendPage = (): void => {
    const end = Math.min(count + 100, items.length);
    const fragment = document.createDocumentFragment();
    for (; count < end; count++) fragment.append(render(items[count]));
    list.append(fragment);
    more.hidden = count >= items.length;
    more.textContent = `Sonraki öğeleri göster (${formatCount(count)} / ${formatCount(items.length)})`;
  };
  more.addEventListener("click", appendPage);
  container.append(list, more);
  appendPage();
  return container;
}
function renderFinding(finding: Finding): HTMLElement {
  const item = document.createElement("li");
  const heading = textNode("div", "", "finding-heading");
  heading.append(textNode("strong", `${finding.tool} · ${categoryLabels[finding.category]}`));
  heading.append(textNode("span", finding.disposition === "protected" ? "Korunuyor" : "İnceleme gerekli", "tag"));
  item.append(heading, textNode("p", finding.path, "report-path"),
    textNode("strong", `${finding.kind === "directory" ? "Klasör" : "Dosya"} · ${sizeLabel(finding.logicalBytes, finding.sizeComplete)}`, "finding-size"),
    textNode("p", finding.reason, "muted"));
  return item;
}
function showReport(report: InspectionReport): void {
  results.append(textNode("p", report.root, "report-path"));
  if (report.scope === "computer") {
    const disks = document.createElement("details");
    disks.open = true;
    disks.append(textNode("summary", `Disk sonuçları (${report.roots.length})`));
    disks.append(pagedList(report.roots, (root) => {
      const row = document.createElement("li");
      const labels = { completed: root.sizeComplete ? "Tamamlandı" : "Kısmi", cancelled: "İptal edildi", limited: "Sınıra ulaşıldı", failed: "Erişilemedi", notScanned: "Taranmadı" };
      row.append(textNode("strong", labels[root.status]), textNode("p", root.path, "report-path"));
      if (root.status !== "failed" && root.status !== "notScanned") row.append(textNode("p", sizeLabel(root.logicalBytes, root.sizeComplete), "muted"));
      if (root.error) row.append(textNode("p", root.error, "warning"));
      return row;
    }));
    results.append(disks);
  }
  const metrics = textNode("div", "", "metrics");
  for (const [label, value] of [
    ["Taranan mantıksal boyut", sizeLabel(report.stats.totalLogicalBytes, report.totalSizeComplete)],
    ["Tanımlanan alan · iç içe öğeler tek sayılır", sizeLabel(report.stats.recognizedLogicalBytes, report.totalSizeComplete)],
    ["Tanınan proje / bulgu", `${formatCount(report.stats.projectsFound)} / ${formatCount(report.stats.findingsFound)}`],
  ]) {
    const metric = textNode("div", "", "metric");
    metric.append(textNode("span", label), textNode("strong", value));
    metrics.append(metric);
  }
  results.append(metrics, textNode("p", "Boyutlar dosya uzunluklarının toplamıdır; diskte ayrılan veya boşaltılabilecek alan değildir. Hardlinkler her dosya yolunda sayılır. Dosyalar değiştirilmez.", "hint"));
  if (report.resultsTruncated) results.append(textNode("p", "Ölçüm devam etti; proje veya bulgu listesi 10.000 kayıtla sınırlandı. Toplam sayaçlar listeden bağımsızdır.", "warning"));

  const filterLabel = document.createElement("label");
  filterLabel.textContent = "Bulgu türü";
  filterLabel.htmlFor = "finding-filter";
  const filter = document.createElement("select");
  filter.id = "finding-filter";
  for (const [value, label] of [["all", "Tümü"], ["development", "Yazılım çıktıları ve bağımlılıklar"], ["ai", "AI araçları"], ["protected", "Korunan veriler"]]) {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; filter.append(option);
  }
  const findings = textNode("div", "");
  const renderFiltered = (): void => {
    findings.replaceChildren();
    const matched = report.findings.filter((finding) => matchesFilter(finding, filter.value as FindingFilter));
    if (matched.length) findings.append(pagedList(matched, renderFinding));
    else findings.append(textNode("p", "Bu görünümde eşleşen öğe yok. Bu, diğer dosyaların gereksiz olduğu anlamına gelmez.", "empty-state"));
  };
  filter.addEventListener("change", renderFiltered);
  results.append(filterLabel, filter, findings);
  renderFiltered();

  if (report.projects.length) {
    const details = document.createElement("details");
    details.append(textNode("summary", `Tanınan proje klasörleri (${formatCount(report.stats.projectsFound)})`));
    details.append(pagedList(report.projects, (project) => {
      const row = document.createElement("li");
      row.append(textNode("strong", project.ecosystems.join(" · ")), textNode("p", project.path, "report-path"));
      return row;
    }));
    results.append(details);
  }
  if (report.largestEntries.length) {
    const details = document.createElement("details");
    details.append(textNode("summary", `En büyük dosya ve klasörler (${report.largestEntries.length} öğe)`));
    details.append(textNode("p", "Kök klasör hariç en büyük 100 öğeye kadar gösterilir. Üst ve alt klasörler örtüşür; satırların boyutları toplanmamalıdır.", "hint"));
    details.append(pagedList(report.largestEntries, (entry) => {
      const row = document.createElement("li");
      row.append(textNode("strong", `${entry.kind === "directory" ? "Klasör" : "Dosya"} · ${sizeLabel(entry.logicalBytes, entry.sizeComplete)}`), textNode("p", entry.path, "report-path"));
      return row;
    }));
    results.append(details);
  }
  if (report.warnings.length || report.warningsOmitted) {
    const details = document.createElement("details");
    details.append(textNode("summary", `Atlanan öğeler / uyarılar (${formatCount(report.warnings.length + report.warningsOmitted)})`));
    for (const warning of report.warnings) details.append(textNode("p", warning, "warning"));
    if (report.warningsOmitted) details.append(textNode("p", `${formatCount(report.warningsOmitted)} ek uyarı listede tutulmadı.`, "hint"));
    results.append(details);
  }
}

if (isTauri()) {
  element("#runtime-note").textContent = "Klasör seçmek veya kapsam değiştirmek taramayı başlatmaz. İçerikler açılmaz; dosyalar değiştirilmez.";
} else {
  button.disabled = true; input.disabled = true;
  status.textContent = "Tarayıcı önizlemesi: Gerçek tarama için Roomit’i masaüstünde aç.";
}
updateControls();
cancelButton.addEventListener("click", async () => {
  const scanId = activeScan;
  if (!scanId || cancelRequested) return;
  cancelRequested = true; cancelButton.disabled = true;
  status.textContent = "İptal isteniyor; ölçülen sonuçlar korunacak…";
  try {
    const accepted = await invoke<boolean>("cancel_scan", { scanId });
    if (activeScan === scanId && !accepted) {
      cancelRequested = false; cancelButton.disabled = false;
      status.textContent = "Tarama tamamlanıyor; iptal gerekirse tekrar deneyebilirsin.";
    }
  } catch (error: unknown) {
    if (activeScan === scanId) {
      cancelRequested = false; cancelButton.disabled = false;
      status.textContent = `İptal isteği iletilemedi: ${String(error)}`;
    }
  }
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const root = input.value.trim();
  const mode = scanMode();
  if ((mode === "folder" ? !root : !computerRoots.length || rootsLoading) || !isTauri() || activeScan || pickingFolder) return;
  const scanId = crypto.randomUUID();
  activeScan = scanId; cancelRequested = false;
  updateControls();
  button.disabled = true; input.disabled = true;
  cancelButton.hidden = false; cancelButton.disabled = true;
  progressBar.hidden = false;
  results.replaceChildren(); results.setAttribute("aria-busy", "true");
  status.className = ""; status.textContent = "Tarama başlatılıyor…";
  currentPath.textContent = mode === "computer" ? "Yerel diskler hazırlanıyor…" : root;
  const onProgress = new Channel<ScanProgress>();
  onProgress.onmessage = (progress) => {
    if (activeScan !== scanId) return;
    cancelButton.disabled = progress.finished || cancelRequested;
    currentPath.textContent = progress.currentPath;
    const disk = mode === "computer" ? ` · Disk ${progress.rootIndex}/${progress.rootCount}` : "";
    if (!cancelRequested) status.textContent = `${progress.finished ? "Sonuçlar hazırlanıyor" : "Taranıyor"}${disk} · ${formatCount(progress.stats.filesScanned)} dosya · ${formatCount(progress.stats.directoriesScanned)} klasör · ${formatBytes(progress.stats.totalLogicalBytes)}`;
  };
  try {
    const report = await invoke<InspectionReport>("inspect_workspace", { root, mode, scanId, onProgress });
    showReport(report);
    status.textContent = scanSummary(report);
    status.className = report.totalSizeComplete && report.status === "completed" ? "" : "warning";
  } catch (error: unknown) {
    status.className = "warning";
    status.textContent = `Klasör taranamadı: ${String(error)}`;
  } finally {
    activeScan = null;
    results.setAttribute("aria-busy", "false");
    progressBar.hidden = true; cancelButton.hidden = true;
    currentPath.textContent = "";
    button.disabled = false; input.disabled = false;
    updateControls();
  }
});
