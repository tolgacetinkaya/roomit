import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { formatBytes, formatCount, scanSummary } from "./report";
import type { InspectionReport, ScanProgress } from "./report";
import { groupReport } from "./groups";
import type { GroupedReport } from "./groups";
import { renderResults } from "./results";
import type { ResultView } from "./results";
import { scanTarget, usedPercent } from "./scan";
import type { LocalDisk, ScanMode } from "./scan";
import { icon } from "./icons";
import type { IconName } from "./icons";
import { installRevealShortcut, revealShortcut } from "./reveal";
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
installRevealShortcut(results);
const progressBar = element<HTMLProgressElement>("#scan-progress");
const currentPath = element<HTMLParagraphElement>("#current-path");
const chooseFolder = element<HTMLButtonElement>("#choose-folder");
const refreshRoots = element<HTMLButtonElement>("#refresh-roots");
const folderTarget = element<HTMLDivElement>("#folder-target");
const computerTarget = element<HTMLDivElement>("#computer-target");
const diskTarget = element<HTMLDivElement>("#disk-target");
const diskSelect = element<HTMLSelectElement>("#disk-select");
const diskInfo = element<HTMLDivElement>("#disk-info");
const toggleScan = element<HTMLButtonElement>("#toggle-scan");
const rootsLabel = element<HTMLParagraphElement>("#computer-roots");
const modeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="scan-mode"]'));
for (const radio of modeInputs) radio.parentElement?.prepend(icon(radio.value as IconName));
const navIcons: Record<string, IconName> = { overview: "overview", projects: "project", ai: "ai", largest: "folder", details: "details" };
for (const nav of document.querySelectorAll<HTMLButtonElement>("#result-tabs button")) nav.prepend(icon(navIcons[nav.dataset.view || "overview"]));
chooseFolder.prepend(icon("folder")); button.append(icon("arrow"));
element(".local-badge").prepend(icon("shield"));
let activeScan: string | null = null;
let cancelRequested = false;
let pickingFolder = false;
let rootsLoading = false;
let disks: LocalDisk[] = [];
let diskRequest = 0;
const scanMode = (): ScanMode => (modeInputs.find((radio) => radio.checked)?.value || "folder") as ScanMode;
const target = () => scanTarget(scanMode(), input.value, diskSelect.value, disks, rootsLoading);

function updateControls(): void {
  const native = isTauri();
  const busy = Boolean(activeScan) || pickingFolder;
  const mode = scanMode();
  folderTarget.hidden = mode !== "folder"; computerTarget.hidden = mode !== "computer";
  diskTarget.hidden = mode !== "disk"; refreshRoots.hidden = mode === "folder";
  diskInfo.hidden = mode === "folder" || rootsLoading || !disks.length;
  diskSelect.disabled = !native || busy || rootsLoading;
  input.disabled = !native || busy;
  chooseFolder.disabled = !native || busy;
  refreshRoots.disabled = !native || busy || rootsLoading;
  for (const radio of modeInputs) radio.disabled = !native || busy;
  button.disabled = !native || busy || !target();
  element("#runtime-note").textContent = !native ? "Tarayıcı önizlemesi · Tarama masaüstü uygulamasında kullanılabilir."
    : mode === "folder" ? "Seçim taramayı başlatmaz. Alt klasörler de incelenir."
    : mode === "disk" ? "Yalnızca seçilen disk · Öğe ve derinlik sınırı yok"
    : "Tüm yerel diskler · Ağ diskleri kapsam dışı · Öğe sınırı yok";
}

function renderDisks(): void {
  diskInfo.replaceChildren();
  const visible = scanMode() === "disk" ? disks.filter((disk) => disk.path === diskSelect.value) : disks;
  for (const disk of visible) {
    const row = document.createElement("div"); row.className = "disk-capacity";
    const title = document.createElement("strong"); title.textContent = `${disk.name || "Yerel disk"} · ${disk.path}`;
    const capacity = document.createElement("span");
    const percentage = usedPercent(disk);
    capacity.textContent = percentage === null ? "Kapasite bilgisi alınamadı" : `${formatBytes(disk.availableSpace)} boş / ${formatBytes(disk.totalSpace)}`;
    row.append(title, capacity);
    if (percentage !== null) {
      const meter = document.createElement("meter"); meter.min = 0; meter.max = 100; meter.value = percentage;
      meter.setAttribute("aria-label", `${disk.path} doluluk oranı: %${percentage}`); row.append(meter);
    }
    diskInfo.append(row);
  }
}

async function loadComputerRoots(): Promise<void> {
  const request = ++diskRequest;
  const previous = diskSelect.value;
  rootsLoading = true; disks = [];
  diskSelect.replaceChildren(new Option("Diskler yükleniyor…", ""));
  rootsLabel.textContent = "Yerel diskler bulunuyor…";
  updateControls();
  try {
    const found = await invoke<LocalDisk[]>("local_disks");
    if (request !== diskRequest) return;
    disks = found;
    diskSelect.replaceChildren(new Option(found.length ? "Taranacak diski seç…" : "Taranabilir disk bulunamadı", ""));
    for (const disk of found) diskSelect.add(new Option(`${disk.path} — ${disk.name || "Yerel disk"}${disk.removable ? " · Harici" : ""}`, disk.path));
    if (found.some((disk) => disk.path === previous)) diskSelect.value = previous;
    rootsLabel.textContent = found.length ? `${found.length} yerel disk: ${found.map((disk) => disk.path).join(" · ")}` : "Taranabilir yerel disk bulunamadı.";
    renderDisks();
  } catch (error: unknown) {
    if (request === diskRequest) {
      rootsLabel.textContent = `Disk listesi alınamadı: ${String(error)}`;
      diskSelect.replaceChildren(new Option("Disk listesi alınamadı · Yenile", ""));
      status.className = "warning"; status.textContent = rootsLabel.textContent;
    }
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
      clearReport();
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
  clearReport(); status.className = "";
  status.textContent = "Tarama kapsamı seçildi. Hazır olduğunda taramayı başlat.";
  updateControls();
  if (scanMode() !== "folder" && isTauri()) void loadComputerRoots();
});
refreshRoots.addEventListener("click", () => {
  if (!activeScan && !rootsLoading && isTauri()) { clearReport(); void loadComputerRoots(); }
});
diskSelect.addEventListener("change", () => {
  clearReport(); renderDisks(); updateControls(); status.className = "";
  status.textContent = diskSelect.value ? "Disk seçildi. Hazır olduğunda taramayı başlat." : "Taranacak diski seç.";
});

const search = element<HTMLInputElement>("#result-search");
const caption = element<HTMLParagraphElement>("#result-caption");
const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#result-tabs button"));
let lastReport: InspectionReport | null = null;
let grouped: GroupedReport | null = null;
let currentView: ResultView = "overview";
let settingsExpanded = false;
toggleScan.addEventListener("click", () => { settingsExpanded = !settingsExpanded; renderCurrent(); });
function navigate(view: ResultView): void { currentView = view; renderCurrent(); }
function renderCurrent(): void {
  form.hidden = Boolean(lastReport) && !settingsExpanded;
  toggleScan.hidden = !lastReport;
  toggleScan.textContent = settingsExpanded ? "Gizle" : "Alanı değiştir";
  toggleScan.setAttribute("aria-expanded", String(!form.hidden));
  element("#inspect-title").textContent = lastReport ? "Tarama alanı" : "Nereye bakalım?";
  element("#scan-caption").textContent = lastReport
    ? `${lastReport.scope === "disk" ? "Tek disk" : lastReport.scope === "computer" ? "Bütün bilgisayar" : "Bir klasör"} · ${lastReport.root}`
    : "Bir alan seç. Roomit içindekileri anlamlandırır.";
  for (const tab of viewButtons) tab.setAttribute("aria-pressed", String(tab.dataset.view === currentView));
  search.disabled = !lastReport;
  element("#reveal-hint").hidden = !lastReport;
  element("#reveal-hint").textContent = `Konumu açmak için öğeye odaklanıp ${revealShortcut} tuşlarına basabilirsin.`;
  const titles: Record<ResultView, string> = { overview: "Genel bakış", projects: "Projeler", ai: "AI araçları", largest: "Büyük klasörler", details: "Tarama ayrıntıları" };
  element("#page-title").textContent = titles[currentView];
  element("#results-title").textContent = currentView === "overview" ? "Alanının hikâyesi" : titles[currentView];
  element("#project-count").textContent = grouped ? formatCount(grouped.projects.length) : "—";
  element("#ai-count").textContent = grouped ? formatCount(grouped.ai.length) : "—";
  if (lastReport && grouped) {
    results.replaceChildren(renderResults(lastReport, grouped, currentView, search.value, navigate));
    caption.textContent = `Listelenen: ${formatCount(grouped.projects.length)} proje grubu · ${formatCount(grouped.ai.length)} AI aracı`;
  } else {
    const empty = document.createElement("div"); empty.className = "empty-state";
    const intro = document.createElement("div"); intro.className = "empty-intro";
    const title = document.createElement("h3"); title.textContent = activeScan ? "Alanını keşfediyoruz…" : "Dijital alanında neler var?";
    const message = document.createElement("p"); message.textContent = activeScan
      ? "Dosyaların boyutları ölçülüyor, proje ve araç grupları hazırlanıyor. İlerlemeyi yukarıdan takip edebilir, istediğinde iptal edebilirsin."
      : "Biriken bağımlılıkları, AI modellerini ve büyük klasörleri tek bir görünümde keşfet. Yukarıdan bir alan seçerek başla.";
    intro.append(title, message); empty.append(intro);
    const features = document.createElement("div"); features.className = "empty-features";
    for (const [symbol, label, heading, description] of [
      ["project", "GELİŞTİRME", "Projeler bir arada", "Bağımlılıklar ve derleme çıktıları ait oldukları projede toplanır."],
      ["ai", "YAPAY ZEKÂ", "Araçlarını tanı", "Modeller, ayarlar ve kullanıcı verileri AI aracına göre gruplanır."],
      ["disk", "DEPOLAMA", "Büyük resmi gör", "Büyük klasörler ve alt klasörlerin boyutları birlikte incelenir."],
    ]) {
      const feature = document.createElement("div"); feature.className = "empty-feature";
      const tag = document.createElement("small"); tag.textContent = label;
      const headingNode = document.createElement("h4"); headingNode.textContent = heading;
      const copy = document.createElement("p"); copy.textContent = description;
      feature.append(icon(symbol as IconName, "ui-icon feature-icon"), tag, headingNode, copy); features.append(feature);
    }
    empty.append(features); results.replaceChildren(empty);
    caption.textContent = activeScan ? "Dosyalar inceleniyor; sonuçlar hazırlanacak." : "Tarama tamamlandığında özet burada görünecek.";
  }
}
function clearReport(): void {
  lastReport = null; grouped = null; search.value = ""; currentView = "overview"; renderCurrent();
}
function showReport(report: InspectionReport): void {
  settingsExpanded = false;
  lastReport = report; grouped = groupReport(report); currentView = "overview"; renderCurrent();
}
for (const tab of viewButtons) tab.addEventListener("click", () => navigate(tab.dataset.view as ResultView));
let searchTimer: ReturnType<typeof setTimeout> | undefined;
search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderCurrent, 120); });

if (isTauri()) {
  element("#runtime-note").textContent = "Klasör seçimi taramayı başlatmaz.";
} else {
  button.disabled = true; input.disabled = true;
  status.textContent = "Tarayıcı önizlemesi: Gerçek tarama için Roomit’i masaüstünde aç.";
}
updateControls();
renderCurrent();
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
  const selection = target();
  if (!selection || !isTauri() || activeScan || pickingFolder) return;
  const { root, mode } = selection;
  const scanId = crypto.randomUUID();
  activeScan = scanId; cancelRequested = false;
  updateControls();
  button.disabled = true; input.disabled = true;
  cancelButton.hidden = false; cancelButton.disabled = true;
  progressBar.hidden = false;
  clearReport(); results.setAttribute("aria-busy", "true");
  status.className = ""; status.textContent = "Tarama başlatılıyor…";
  currentPath.textContent = mode === "computer" ? "Yerel diskler hazırlanıyor…" : root;
  const onProgress = new Channel<ScanProgress>();
  onProgress.onmessage = (progress) => {
    if (activeScan !== scanId) return;
    cancelButton.disabled = progress.finished || cancelRequested;
    currentPath.textContent = progress.currentPath; currentPath.title = progress.currentPath;
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
    status.textContent = `Tarama tamamlanamadı: ${String(error)}`;
  } finally {
    activeScan = null;
    results.setAttribute("aria-busy", "false");
    progressBar.hidden = true; cancelButton.hidden = true;
    currentPath.textContent = "";
    button.disabled = false; input.disabled = false;
    updateControls();
  }
});
