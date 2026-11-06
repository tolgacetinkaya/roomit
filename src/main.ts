import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { formatBytes, formatCount, scanSummary } from "./report";
import type { InspectionReport, ScanProgress } from "./report";
import { groupReport, filterGroups } from "./groups";
import type { GroupedReport, GroupSort } from "./groups";
import { renderResults } from "./results";
import type { ResultView } from "./results";
import { scanTarget, usedPercent } from "./scan";
import type { LocalDisk, ScanMode } from "./scan";
import { icon } from "./icons";
import type { IconName } from "./icons";
import { installRevealShortcut, revealShortcut } from "./reveal";
import { parseMinimumGb } from "./size-filter";
import { disposeSizeBrowser } from "./size-browser";
import { installExclusions } from "./exclusions";
import { snapshotTitle, snapshotDate } from "./snapshot";
import { installFreshness } from "./freshness";
import "./styles.css";
import "./workspace.css";
import { installWorkspace } from "./workspace";
import { installShell } from "./shell";
import "./shell.css";

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing interface element: ${selector}`);
  return result;
}
const form = element<HTMLFormElement>("#inspect-form");
const scanPanel = element<HTMLElement>(".scan-panel");
const input = element<HTMLInputElement>("#root");
const button = element<HTMLButtonElement>("#inspect-button");
const cancelButton = element<HTMLButtonElement>("#cancel-button");
const status = element<HTMLParagraphElement>("#status");
const results = element<HTMLDivElement>("#results");
const freshness = installFreshness();
installRevealShortcut(results);
const progressBar = element<HTMLProgressElement>("#scan-progress");
const currentPath = element<HTMLParagraphElement>("#current-path");
const chooseFolder = element<HTMLButtonElement>("#choose-folder");
const refreshRoots = element<HTMLButtonElement>("#refresh-roots");
const folderTarget = element<HTMLDivElement>("#folder-target");
const computerTarget = element<HTMLDivElement>("#computer-target");
const diskTarget = element<HTMLDivElement>("#disk-target");
const aiTarget = element<HTMLDivElement>("#ai-target");
const diskSelect = element<HTMLSelectElement>("#disk-select");
const diskInfo = element<HTMLDivElement>("#disk-info");
const toggleScan = element<HTMLButtonElement>("#toggle-scan");
const rootsLabel = element<HTMLParagraphElement>("#computer-roots");
const modeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="scan-mode"]'));
for (const radio of modeInputs) radio.parentElement?.prepend(icon(radio.value as IconName));
const navIcons: Record<string, IconName> = { control: "overview", tools: "ai", activity: "computer", overview: "disk", projects: "project", ai: "ai", largest: "folder", details: "details" };
for (const nav of document.querySelectorAll<HTMLButtonElement>("#result-tabs button")) nav.prepend(icon(navIcons[nav.dataset.view || "overview"]));
chooseFolder.prepend(icon("folder")); button.append(icon("arrow"));
element(".local-badge").prepend(icon("shield"));
let activeScan: string | null = null;
let cancelRequested = false;
let pickingFolder = false;
let rootsLoading = false;
let restoring = isTauri();
let preparingRescan = false;
let lastScanError = false;
let scanStartedAt = 0;
let disks: LocalDisk[] = [];
let diskRequest = 0;
let exclusions: ReturnType<typeof installExclusions> | undefined;
const scanMode = (): ScanMode => (modeInputs.find((radio) => radio.checked)?.value || "folder") as ScanMode;
const target = () => scanTarget(scanMode(), input.value, diskSelect.value, disks, rootsLoading);

function updateControls(): void {
  const native = isTauri();
  const scanBusy = Boolean(activeScan) || pickingFolder || restoring || preparingRescan;
  exclusions?.update(scanBusy);
  const busy = scanBusy || Boolean(exclusions?.busy);
  const mode = scanMode();
  folderTarget.hidden = mode !== "folder"; computerTarget.hidden = mode !== "computer";
  diskTarget.hidden = mode !== "disk"; aiTarget.hidden = mode !== "ai";
  refreshRoots.hidden = mode === "folder" || mode === "ai";
  diskInfo.hidden = mode === "folder" || mode === "ai" || rootsLoading || !disks.length;
  diskSelect.disabled = !native || busy || rootsLoading;
  input.disabled = !native || busy;
  chooseFolder.disabled = !native || busy;
  refreshRoots.disabled = !native || busy || rootsLoading;
  for (const radio of modeInputs) radio.disabled = !native || busy;
  button.disabled = !native || busy || !exclusions?.ready || !target();
  element<HTMLButtonElement>("#retry-last-scan").disabled = !native || busy;
  element<HTMLButtonElement>("#rescan-snapshot").disabled = !native || busy || !exclusions?.ready;
  element<HTMLButtonElement>("#scan-ai").disabled = !native || busy || !exclusions?.ready;
  element<HTMLButtonElement>("#quick-ai-scan").disabled = !native || busy || !exclusions?.ready;
  element<HTMLButtonElement>("#new-scan").disabled = busy;
  element<HTMLButtonElement>("#sidebar-new-scan").disabled = busy;
  element<HTMLButtonElement>("#menu-new-scan").disabled = busy;
  element<HTMLButtonElement>("#configure-scan").disabled = busy;
  element("#runtime-note").textContent = !native ? "Tarayıcı önizlemesi · Tarama masaüstü uygulamasında kullanılabilir."
    : mode === "ai" ? "Yalnızca bilinen AI veri konumları · Özel disk/klasör konumları kapsam dışı"
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
    if (request === diskRequest) { rootsLoading = false; updateControls(); renderScanLayout(); }
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
      lastScanError = false;
      status.className = "";
      status.textContent = "Klasör seçildi. Hazır olduğunda taramayı başlat.";
    }
  } catch (error: unknown) {
    lastScanError = true;
    status.className = "warning";
    status.textContent = `Klasör seçici açılamadı: ${String(error)}`;
  } finally { pickingFolder = false; updateControls(); renderScanLayout(); }
});
for (const radio of modeInputs) radio.addEventListener("change", () => {
  diskRequest += 1; rootsLoading = false;
  lastScanError = false; status.className = "";
  status.textContent = "Tarama kapsamı seçildi. Hazır olduğunda taramayı başlat.";
  updateControls();
  renderScanLayout();
  if (["disk", "computer"].includes(scanMode()) && isTauri()) void loadComputerRoots();
});
refreshRoots.addEventListener("click", () => {
  if (!activeScan && !rootsLoading && isTauri()) void loadComputerRoots();
});
diskSelect.addEventListener("change", () => {
  lastScanError = false; renderDisks(); updateControls(); renderScanLayout(); status.className = "";
  status.textContent = diskSelect.value ? "Disk seçildi. Hazır olduğunda taramayı başlat." : "Taranacak diski seç.";
});

const search = element<HTMLInputElement>("#result-search");
const caption = element<HTMLParagraphElement>("#result-caption");
const sizeForm = element<HTMLFormElement>("#size-filter-form");
const sortSelect = element<HTMLSelectElement>("#result-sort");
let groupSort: GroupSort = "size";
sortSelect.addEventListener("change", () => { groupSort = sortSelect.value as GroupSort; renderCurrent(); });
const minimumInput = element<HTMLInputElement>("#minimum-gb");
const sizeError = element<HTMLParagraphElement>("#size-filter-error");
let minimumBytes = 0n;
sizeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const parsed = parseMinimumGb(minimumInput.value);
  sizeError.hidden = parsed.error === null; sizeError.textContent = parsed.error || "";
  minimumInput.setAttribute("aria-invalid", String(parsed.error !== null));
  if (parsed.bytes === null) return;
  minimumBytes = parsed.bytes; renderCurrent();
});
element("#clear-size-filter").addEventListener("click", () => {
  minimumInput.value = ""; minimumBytes = 0n; minimumInput.removeAttribute("aria-invalid");
  sizeError.hidden = true; sizeError.textContent = ""; renderCurrent(); minimumInput.focus();
});
const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#result-tabs button"));
let lastReport: InspectionReport | null = null;
let grouped: GroupedReport | null = null;
let currentView: ResultView = "control";
const workspace = installWorkspace(element("#workspace-panel"), navigate);
const shell = installShell(navigate, () => element<HTMLButtonElement>("#new-scan").click());
let settingsExpanded = false;
let restoredReport = false;
let navigationRevision = 0;
toggleScan.addEventListener("click", () => {
  settingsExpanded = !settingsExpanded; renderScanLayout();
  if (!settingsExpanded) element<HTMLButtonElement>("#new-scan").focus({ preventScroll: true });
});
function openScanSetup(folder = false): void {
  if (activeScan || restoring || preparingRescan || pickingFolder) return;
  if (folder) { for (const radio of modeInputs) radio.checked = radio.value === "folder"; }
  settingsExpanded = true; renderScanLayout(); updateControls();
  scanPanel.scrollIntoView({ block: "start" });
  if (folder) chooseFolder.focus({ preventScroll: true });
  else modeInputs.find(radio => radio.checked)?.focus({ preventScroll: true });
}
element("#configure-scan").addEventListener("click", () => openScanSetup(true));
element("#new-scan").addEventListener("click", () => openScanSetup());
element("#quick-ai-scan").addEventListener("click", () => element<HTMLButtonElement>("#scan-ai").click());
function renderScanLayout(): void {
  const running = Boolean(activeScan);
  const needsExclusionSetup = Boolean(isTauri() && exclusions && !exclusions.busy && !exclusions.ready);
  const expanded = settingsExpanded || needsExclusionSetup;
  element("#ai-scan-panel").hidden = currentView !== "control" || Boolean(lastReport) || running || expanded;
  element("#quick-ai-scan").hidden = !element("#ai-scan-panel").hidden;
  scanPanel.hidden = !expanded && !running && !lastScanError;
  form.hidden = !expanded || running;
  scanPanel.classList.toggle("scan-running", running);
  element(".scan-state").hidden = !running && !lastScanError;
  element(".scan-scope-note").hidden = !expanded || running;
  toggleScan.hidden = !expanded || running || needsExclusionSetup;
  toggleScan.textContent = "Kapat";
  toggleScan.setAttribute("aria-expanded", String(!form.hidden));
  element("#inspect-title").textContent = running ? (scanMode() === "ai" ? "AI klasörleri taranıyor" : "Tarama sürüyor") : "Tarama alanını seç";
  element("#scan-caption").textContent = scanMode() === "ai" ? "Bilinen AI kullanıcı klasörleri · Diğer diskler taranmıyor"
    : scanMode() === "computer" ? "Bağlı tüm yerel diskler" : scanMode() === "disk" ? `Tek disk · ${diskSelect.value || "Disk seç"}` : input.value || "Alt klasörleriyle birlikte incelenecek bir klasör seç.";
  element("#scan-elapsed").hidden = !running;
  element(".report-panel").hidden = ["control", "tools", "activity"].includes(currentView) || (!lastReport && (currentView === "ai" || running || expanded));
}
function navigate(view: ResultView): void {
  const changed = view !== currentView;
  navigationRevision++; currentView = view; renderCurrent();
  if (changed) element("#main").scrollTop = 0;
}
function renderCurrent(): void {
  clearTimeout(searchTimer);
  disposeSizeBrowser();
  renderScanLayout();
  workspace.show(currentView, lastReport, grouped);
  element("#snapshot-banner").hidden = !lastReport || ["tools", "activity"].includes(currentView);
  freshness.set(lastReport?.sizeIndexId || null);
  if (lastReport) {
    element("#snapshot-title").textContent = snapshotTitle(lastReport, restoredReport);
    element("#snapshot-date").textContent = snapshotDate(lastReport.scannedAtMs);
    element("#snapshot-offline").hidden = !restoredReport;
    element("#snapshot-save-error").hidden = !lastReport.persistenceError;
    element("#snapshot-save-error").textContent = lastReport.persistenceError
      ? `Bu tarama kaydedilemedi; yalnızca uygulama açıkken kullanılabilir. Önceki kayıt korundu. ${lastReport.persistenceError}` : "";
  }
  sizeForm.hidden = currentView !== "largest";
  for (const tab of viewButtons) tab.setAttribute("aria-pressed", String(tab.dataset.view === currentView));
  search.disabled = !lastReport;
  element("#reveal-hint").hidden = !lastReport;
  element("#reveal-hint").textContent = `Konumu açmak için öğeye odaklanıp ${revealShortcut} tuşlarına basabilirsin.`;
  const titles: Record<ResultView, string> = { control: "AI çalışma alanın", tools: "AI araçların", activity: "Canlı kaynaklar", overview: "Genel bakış", projects: "Projeler", ai: "AI depolama haritası", largest: "Büyük öğeler", details: "Tarama ayrıntıları" };
  const descriptions: Record<ResultView, string> = { control: "Araçların, canlı kaynakların ve geride kalan AI verilerin.", tools: "Masaüstü uygulamaları ve CLI araçlarını birlikte keşfet.", activity: "AI araçları, Chrome, Docker ve diğer süreçlerin canlı kullanımı.", overview: "Son taramanın tamamına bir bakış.", projects: "Bağımlılıklar ve derleme çıktıları, ait oldukları projede.", ai: "Modellerin, geçmişin ve AI veri klasörlerinin kapladığı alanı keşfet.", largest: "Boyutlarına göre dosya ve klasörleri keşfet.", details: "Nerelerin tarandığını ve atlanan alanları incele." };
  element("#page-title").textContent = titles[currentView];
  shell.setTitle(titles[currentView]);
  element("#page-description").textContent = descriptions[currentView];
  element("#results-title").textContent = currentView === "overview" ? "Tarama özeti" : currentView === "ai" ? "AI depolama alanın" : titles[currentView];
  element("#result-sort-label").hidden = currentView !== "ai" && currentView !== "projects";
  element("#project-count").textContent = grouped ? formatCount(grouped.projects.length) : "—";
  element("#ai-count").textContent = grouped ? formatCount(grouped.ai.length) : "—";
  if (lastReport && grouped) {
    results.replaceChildren(renderResults(lastReport, grouped, currentView, search.value, navigate, minimumBytes, groupSort));
    caption.textContent = currentView === "largest" ? "Dosya ve klasör boyutlarını filtrele. Yeniden tarama gerekmez."
      : currentView === "ai" ? `${formatCount(filterGroups(grouped.ai, search.value).length)} / ${formatCount(grouped.ai.length)} araç grubu · Boyutları karşılaştır, konumlarını incele.`
      : `Listelenen: ${formatCount(grouped.projects.length)} proje grubu · ${formatCount(grouped.ai.length)} AI aracı`;
  } else {
    const empty = document.createElement("div"); empty.className = "empty-state";
    const intro = document.createElement("div"); intro.className = "empty-intro";
    const title = document.createElement("h3"); title.textContent = activeScan ? "Sonuçlar hazırlanıyor…" : "Henüz bir tarama yok";
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
setInterval(() => {
  if (!activeScan || !scanStartedAt) return;
  const seconds = Math.floor((Date.now() - scanStartedAt) / 1000);
  element("#scan-elapsed").textContent = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}, 1000);
function clearReport(): void {
  lastReport = null; grouped = null; search.value = ""; renderCurrent();
}
function showReport(report: InspectionReport, restored = false): void {
  restoredReport = restored;
  settingsExpanded = false;
  lastReport = report; grouped = groupReport(report); renderCurrent();
}
async function loadLastScan(): Promise<void> {
  if (!isTauri() || activeScan || pickingFolder) return;
  restoring = true; updateControls();
  const requestedAt = navigationRevision;
  try {
    const report = await invoke<InspectionReport | null>("load_last_scan");
    element("#restore-state").hidden = true;
    if (report) {
      const mode = report.scope === "recursive" ? "folder" : report.scope;
      for (const radio of modeInputs) radio.checked = radio.value === mode;
      if (mode === "folder") input.value = report.root;
      if (mode === "ai" && requestedAt === navigationRevision && currentView !== "control") currentView = "ai";
      showReport(report, true);
      status.className = ""; status.textContent = "Son kayıt açıldı. Yeniden tarama yapılmadı.";
      if (mode === "disk" || mode === "computer") {
        await loadComputerRoots();
        if (mode === "disk") { diskSelect.value = disks.some(disk => disk.path === report.root) ? report.root : ""; renderDisks(); }
      }
    }
  } catch (error) {
    element("#restore-state").hidden = false;
    element("#restore-message").textContent = `Kayıtlı sonuçlar açılamadı; kayıt dosyaları korundu. Yeni tarama yapabilir veya yeniden açmayı deneyebilirsin. ${String(error)}`;
  } finally { restoring = false; updateControls(); }
}
element("#retry-last-scan").addEventListener("click", () => void loadLastScan());
element("#rescan-snapshot").addEventListener("click", async () => {
  if (!lastReport || activeScan || restoring || preparingRescan || pickingFolder || !exclusions?.ready) return;
  preparingRescan = true;
  const report = lastReport;
  const mode = report.scope === "recursive" ? "folder" : report.scope;
  settingsExpanded = true; renderCurrent();
  for (const radio of modeInputs) radio.checked = radio.value === mode;
  if (mode === "folder") input.value = report.root;
  else if (mode === "disk" || mode === "computer") {
    await loadComputerRoots();
    if (mode === "disk") { diskSelect.value = disks.some(disk => disk.path === report.root) ? report.root : ""; renderDisks(); }
  }
  preparingRescan = false; updateControls();
  if (target()) form.requestSubmit();
  else { status.className = "warning"; status.textContent = "Önceki tarama diski şu an kullanılamıyor. Taranacak alanı seç."; }
});
for (const tab of viewButtons) tab.addEventListener("click", () => navigate(tab.dataset.view as ResultView));
element("#scan-ai").addEventListener("click", () => {
  if (!isTauri() || activeScan || restoring || preparingRescan || pickingFolder || !exclusions?.ready) return;
  diskRequest++; rootsLoading = false;
  for (const radio of modeInputs) radio.checked = radio.value === "ai";
  settingsExpanded = true; renderCurrent(); updateControls(); form.requestSubmit();
});
let searchTimer: ReturnType<typeof setTimeout> | undefined;
search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderCurrent, 120); });

if (isTauri()) {
  element("#runtime-note").textContent = "Klasör seçimi taramayı başlatmaz.";
} else {
  button.disabled = true; input.disabled = true;
  status.textContent = "Tarayıcı önizlemesi: Gerçek tarama için Roomit’i masaüstünde aç.";
}
exclusions = installExclusions(() => {
  updateControls();
  if (exclusions && !exclusions.busy && !exclusions.ready) { settingsExpanded = true; renderCurrent(); }
}, () => {
  status.className = "";
  status.textContent = lastReport ? "Hariç tutma seçimin kaydedildi. Ekrandaki sonuçlar önceki taramaya ait; yeni seçim için tekrar tara." : "Hariç tutma seçimin kaydedildi.";
});
void exclusions.load();
void loadLastScan();
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
  if (!selection || !isTauri() || activeScan || pickingFolder || restoring || preparingRescan || !exclusions?.ready) return;
  const { root, mode } = selection;
  const scanId = crypto.randomUUID();
  const previousReport = lastReport; const previouslyRestored = restoredReport;
  activeScan = scanId; cancelRequested = false; lastScanError = false; scanStartedAt = Date.now();
  element("#scan-elapsed").textContent = "00:00";
  updateControls();
  button.disabled = true; input.disabled = true;
  cancelButton.hidden = false; cancelButton.disabled = true;
  progressBar.hidden = false;
  clearReport(); results.setAttribute("aria-busy", "true");
  status.className = ""; status.textContent = "Tarama başlatılıyor…";
  currentPath.textContent = mode === "computer" ? "Yerel diskler hazırlanıyor…" : root;
  const onProgress = new Channel<ScanProgress>();
  let focusCancel = true;
  onProgress.onmessage = (progress) => {
    if (activeScan !== scanId) return;
    cancelButton.disabled = progress.finished || cancelRequested;
    if (focusCancel && !cancelButton.disabled) {
      focusCancel = false;
      if (document.activeElement === document.body) cancelButton.focus({ preventScroll: true });
    }
    currentPath.textContent = progress.currentPath; currentPath.title = progress.currentPath;
    const disk = mode === "computer" ? ` · Disk ${progress.rootIndex}/${progress.rootCount}` : "";
    if (!cancelRequested) status.textContent = `${progress.finished ? "Sonuçlar hazırlanıyor" : "Taranıyor"}${disk} · ${formatCount(progress.stats.filesScanned)} dosya · ${formatCount(progress.stats.directoriesScanned)} klasör · ${formatBytes(progress.stats.totalLogicalBytes)}`;
  };
  try {
    const report = await invoke<InspectionReport>("inspect_workspace", { root, mode, scanId, onProgress });
    showReport(report);
    element("#restore-state").hidden = true;
    status.textContent = scanSummary(report);
    status.className = report.totalSizeComplete && report.status === "completed" ? "" : "warning";
  } catch (error: unknown) {
    if (previousReport) showReport(previousReport, previouslyRestored);
    else settingsExpanded = true;
    lastScanError = true;
    status.className = "warning";
    status.textContent = `Tarama tamamlanamadı: ${String(error)}`;
  } finally {
    activeScan = null;
    results.setAttribute("aria-busy", "false");
    progressBar.hidden = true; cancelButton.hidden = true;
    currentPath.textContent = "";
    button.disabled = false; input.disabled = false;
    updateControls();
    renderScanLayout();
  }
});
