import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { formatBytes, formatCount, scanSummary } from "./report";
import type { InspectionReport, ScanProgress } from "./report";
import { groupReport } from "./groups";
import type { GroupedReport } from "./groups";
import { renderResults } from "./results";
import type { ResultView } from "./results";
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
  if (scanMode() === "computer") void loadComputerRoots();
});
refreshRoots.addEventListener("click", () => { void loadComputerRoots(); });

const search = element<HTMLInputElement>("#result-search");
const caption = element<HTMLParagraphElement>("#result-caption");
const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#result-tabs button"));
let lastReport: InspectionReport | null = null;
let grouped: GroupedReport | null = null;
let currentView: ResultView = "overview";
function navigate(view: ResultView): void { currentView = view; renderCurrent(); }
function renderCurrent(): void {
  for (const tab of viewButtons) tab.setAttribute("aria-pressed", String(tab.dataset.view === currentView));
  search.disabled = !lastReport;
  if (lastReport && grouped) {
    results.replaceChildren(renderResults(lastReport, grouped, currentView, search.value, navigate));
    caption.textContent = `Listelenen: ${formatCount(grouped.projects.length)} proje grubu · ${formatCount(grouped.ai.length)} AI aracı`;
  } else {
    const empty = document.createElement("div"); empty.className = "empty-state";
    const title = document.createElement("h3"); title.textContent = activeScan ? "Tarama devam ediyor…" : "Sonuçları gruplar halinde gör.";
    const message = document.createElement("p"); message.textContent = activeScan
      ? "Ölçüm tamamlandığında projeler ve AI araçları burada özetlenecek. İlerlemeyi soldan takip edebilirsin."
      : "Soldan bir klasör veya bütün bilgisayarı seçip taramayı başlat. Tek tek kayıtları grup içinden açabilirsin.";
    empty.append(title, message); results.replaceChildren(empty);
    caption.textContent = activeScan ? "Dosyalar inceleniyor; sonuçlar hazırlanacak." : "Tarama tamamlandığında özet burada görünecek.";
  }
}
function clearReport(): void {
  lastReport = null; grouped = null; search.value = ""; currentView = "overview"; renderCurrent();
}
function showReport(report: InspectionReport): void {
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
