import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { formatBytes, formatCount, scanSummary } from "./report";
import type { InspectionReport, ScanProgress } from "./report";
import { groupReport } from "./groups";
import type { GroupedReport, GroupSort } from "./groups";
import { renderResults, renderAiToolList } from "./results";
import {storageCopy} from "./locales/en-storage";
import {workspacePages} from "./locales/en-workspace";
import { renderStorageMap } from "./storage-map";
import type { ResultView } from "./results";
import { scanTarget, usedPercent } from "./scan";
import type { LocalDisk, ScanMode } from "./scan";
import { icon } from "./icons";
import type { IconName } from "./icons";
import { installRevealShortcut, revealShortcut } from "./reveal";
import {installArchive} from "./archive-candidates";
import {archiveCopy} from "./locales/en-archive";
import "./archive.css";
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
import {installUpdates} from "./updates";
import {reportMessage} from "./legacy-messages";
import aiCatalog from "./ai-catalog.json";
import "./scan-coverage.css";
import "./workspace-layout.css";
import "./serigrafi.css";
import {pathName,pathKey} from "./groups";
import {revealActions} from "./reveal";
import type {ProjectDiscovery} from "./project-context";

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
const aiToolSelect = element<HTMLSelectElement>("#ai-tool-select");
for (const tool of [...aiCatalog].sort((a,b)=>a.name.localeCompare(b.name,"en"))) aiToolSelect.add(new Option(tool.name,tool.id));
const aiScopeLabel = () => aiToolSelect.value ? `${aiToolSelect.selectedOptions[0]?.textContent || "Selected app"} data locations` : "Known AI data locations";
function restoreAiScope(report: InspectionReport): void {
  const id = report.scope === "ai" ? report.aiToolId || "" : "";
  // Keep an unrecognized saved ID explicit so a rescan cannot silently broaden.
  if (id && ![...aiToolSelect.options].some(option=>option.value===id)) aiToolSelect.add(new Option(`Unavailable tool (${id})`,id));
  aiToolSelect.value = id;
}
const diskSelect = element<HTMLSelectElement>("#disk-select");
const diskInfo = element<HTMLDivElement>("#disk-info");
const toggleScan = element<HTMLButtonElement>("#toggle-scan");
const openMap = element<HTMLButtonElement>("#open-map");
openMap.textContent = storageCopy.explore;
openMap.addEventListener("click", () => navigate("ai"));
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
let archive:ReturnType<typeof installArchive>|undefined;
const updates = installUpdates(() => Boolean(archive?.busy()) || Boolean(activeScan) || restoring || preparingRescan, updateControls);
const scanMode = (): ScanMode => (modeInputs.find((radio) => radio.checked)?.value || "folder") as ScanMode;
const target = () => scanTarget(scanMode(), input.value, diskSelect.value, disks, rootsLoading, aiToolSelect.value);

function updateControls(): void {
  const native = isTauri();
  const scanBusy = Boolean(archive?.busy()) || Boolean(activeScan) || pickingFolder || restoring || preparingRescan || updates.busy();
  exclusions?.update(scanBusy);
  archive?.sync();
  const busy = scanBusy || Boolean(exclusions?.busy);
  const mode = scanMode();
  folderTarget.hidden = mode !== "folder"; computerTarget.hidden = mode !== "computer";
  diskTarget.hidden = mode !== "disk"; aiTarget.hidden = mode !== "ai";
  refreshRoots.hidden = mode === "folder" || mode === "ai";
  diskInfo.hidden = mode === "folder" || mode === "ai" || rootsLoading || !disks.length;
  diskSelect.disabled = !native || busy || rootsLoading;
  aiToolSelect.disabled = !native || busy;
  for (const action of document.querySelectorAll<HTMLButtonElement>("[data-scan-tool]")) action.disabled = !native || busy || !exclusions?.ready;
  input.disabled = !native || busy;
  chooseFolder.disabled = !native || busy;
  refreshRoots.disabled = !native || busy || rootsLoading;
  for (const radio of modeInputs) radio.disabled = !native || busy;
  button.disabled = !native || busy || !exclusions?.ready || !target();
  element<HTMLButtonElement>("#retry-last-scan").disabled = !native || busy;
  element<HTMLButtonElement>("#rescan-snapshot").disabled = !native || busy || !exclusions?.ready;
  element<HTMLButtonElement>("#quick-ai-scan").disabled = !native || busy || !exclusions?.ready;
  element<HTMLButtonElement>("#sidebar-new-scan").disabled = busy;
  element<HTMLButtonElement>("#menu-new-scan").disabled = busy;
  element("#runtime-note").textContent = !native ? "Browser preview · Scanning is available in the desktop app."
    : mode === "ai" ? "Known AI data locations only · Custom locations are outside this scope"
    : mode === "folder" ? "Selecting a folder does not start a scan. Subfolders are included."
    : mode === "disk" ? "Selected disk only · No item or depth limit"
    : "All local disks · Network volumes excluded · No item limit";
}

function renderDisks(): void {
  diskInfo.replaceChildren();
  const visible = scanMode() === "disk" ? disks.filter((disk) => disk.path === diskSelect.value) : disks;
  for (const disk of visible) {
    const row = document.createElement("div"); row.className = "disk-capacity";
    const title = document.createElement("strong"); title.textContent = `${disk.name || "Local disk"} · ${disk.path}`;
    const capacity = document.createElement("span");
    const percentage = usedPercent(disk);
    capacity.textContent = percentage === null ? "Capacity unavailable" : `${formatBytes(disk.availableSpace)} free / ${formatBytes(disk.totalSpace)}`;
    row.append(title, capacity);
    if (percentage !== null) {
      const meter = document.createElement("meter"); meter.min = 0; meter.max = 100; meter.value = percentage;
      meter.setAttribute("aria-label", `${disk.path} used: ${percentage}%`); row.append(meter);
    }
    diskInfo.append(row);
  }
}

async function loadComputerRoots(): Promise<void> {
  const request = ++diskRequest;
  const previous = diskSelect.value;
  rootsLoading = true; disks = [];
  diskSelect.replaceChildren(new Option("Loading disks…", ""));
  rootsLabel.textContent = "Finding local disks…";
  updateControls();
  try {
    const found = await invoke<LocalDisk[]>("local_disks");
    if (request !== diskRequest) return;
    disks = found;
    diskSelect.replaceChildren(new Option(found.length ? "Select a disk to scan…" : "No scannable disks found", ""));
    for (const disk of found) diskSelect.add(new Option(`${disk.path} — ${disk.name || "Local disk"}${disk.removable ? " · Removable" : ""}`, disk.path));
    if (found.some((disk) => disk.path === previous)) diskSelect.value = previous;
    rootsLabel.textContent = found.length ? `${found.length} local disks: ${found.map((disk) => disk.path).join(" · ")}` : "No scannable local disks found.";
    renderDisks();
  } catch (error: unknown) {
    if (request === diskRequest) {
      rootsLabel.textContent = `Could not load disks: ${String(error)}`;
      diskSelect.replaceChildren(new Option("Disks unavailable · Refresh", ""));
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
      title: "Roomit — Select a folder to scan", defaultPath: input.value || undefined,
      canCreateDirectories: false, fileAccessMode: "scoped" });
    if (folder !== null) {
      input.value = folder;
      lastScanError = false;
      status.className = "";
      status.textContent = "Folder selected. Start the scan when you are ready.";
    }
  } catch (error: unknown) {
    lastScanError = true;
    status.className = "warning";
    status.textContent = `Could not open the folder picker: ${String(error)}`;
  } finally { pickingFolder = false; updateControls(); renderScanLayout(); }
});
for (const radio of modeInputs) radio.addEventListener("change", () => {
  diskRequest += 1; rootsLoading = false;
  lastScanError = false; status.className = "";
  status.textContent = "Scope selected. Start the scan when you are ready.";
  updateControls();
  renderScanLayout();
  if (["disk", "computer"].includes(scanMode()) && isTauri()) void loadComputerRoots();
});
refreshRoots.addEventListener("click", () => {
  if (!activeScan && !rootsLoading && isTauri()) void loadComputerRoots();
});
diskSelect.addEventListener("change", () => {
  lastScanError = false; renderDisks(); updateControls(); renderScanLayout(); status.className = "";
  status.textContent = diskSelect.value ? "Disk selected. Start the scan when you are ready." : "Select a disk to scan.";
});

const search = element<HTMLInputElement>("#result-search");
const caption = element<HTMLParagraphElement>("#result-caption");
const sizeForm = element<HTMLFormElement>("#size-filter-form");
const sortSelect = element<HTMLSelectElement>("#result-sort");
const resultTools = element(".result-tools");
const resultsHeader = element(".results-header");
let groupSort: GroupSort = "size";
function refreshFilteredList():void {
  const list=currentView==="ai" && results.querySelector(".ai-list-results");
  if(list && grouped)list.replaceWith(renderAiToolList(grouped,search.value,groupSort));
  else renderCurrent();
}
sortSelect.addEventListener("change", () => { groupSort = sortSelect.value as GroupSort; refreshFilteredList(); });
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
let discovery:ProjectDiscovery={projects:[],warnings:[]};
let discovering=false;
let projectError="";
async function refreshProjects():Promise<void>{
  if(discovering||!isTauri())return;
  discovering=true;projectError="";
  try{discovery=await invoke<ProjectDiscovery>("discover_projects");}
  catch(error){projectError=String(error);discovery={projects:[],warnings:[]};}
  finally{discovering=false;if(currentView==="projects"||currentView==="largest")renderCurrent();}
}
let currentView: ResultView = "control";
let largeMode:"all"|"archive"="all";
const inArchive=()=>currentView==="largest" && largeMode==="archive";
const archiveBlocked=()=>Boolean(activeScan)||pickingFolder||restoring||preparingRescan||updates.busy()||Boolean(exclusions?.busy)||!exclusions?.ready;
archive=installArchive(archiveBlocked,updateControls);
const largeNav=document.createElement("div");largeNav.className="view-switch archive-nav";
largeNav.setAttribute("role","group");largeNav.setAttribute("aria-label",archiveCopy.tabs);
for(const [value,label] of [["all",archiveCopy.all],["archive",archiveCopy.candidates]] as const){
  const tab=document.createElement("button");tab.type="button";tab.textContent=label;tab.dataset.largeMode=value;
  tab.className="secondary";tab.onclick=()=>{largeMode=value;renderCurrent();};largeNav.append(tab);
}
sizeForm.before(largeNav);sizeForm.after(archive.panel);
const workspace = installWorkspace(element("#workspace-panel"), navigate, startAiScan,
  () => !isTauri() || Boolean(archive?.busy()) || archiveBlocked());
const shell = installShell(navigate, openScanSetup);
let settingsExpanded = false;
let restoredReport = false;
let navigationRevision = 0;
toggleScan.addEventListener("click", () => {
  settingsExpanded = !settingsExpanded; renderScanLayout();
  if (!settingsExpanded) element<HTMLButtonElement>("#sidebar-new-scan").focus({ preventScroll: true });
});
function openScanSetup(): void {
  if (activeScan || restoring || preparingRescan || pickingFolder) return;
  settingsExpanded = true; renderScanLayout(); updateControls();
  scanPanel.scrollIntoView({ block: "start" });
  modeInputs.find(radio => radio.checked)?.focus({ preventScroll: true });
}
element("#quick-ai-scan").addEventListener("click", () => startAiScan());
function renderScanLayout(): void {
  const running = Boolean(activeScan);
  const needsExclusionSetup = Boolean(isTauri() && exclusions && !exclusions.busy && !exclusions.ready);
  const expanded = settingsExpanded || needsExclusionSetup;
  const aiView=currentView==="ai" || currentView==="control";
  openMap.hidden = currentView !== "control" || !lastReport;
  element("#quick-ai-scan").textContent = currentView==="ai"?"Scan all AI tools":"Scan AI data";
  const alreadyScannedAll=lastReport?.scope==="ai" && !lastReport.aiToolId;
  element("#quick-ai-scan").hidden = inArchive() || (aiView && (expanded || running || Boolean(lastReport && (currentView==="control" || alreadyScannedAll))));
  scanPanel.hidden = !expanded && !running && !lastScanError;
  form.hidden = !expanded || running;
  scanPanel.classList.toggle("scan-running", running);
  element(".scan-state").hidden = !running && !lastScanError;
  element(".scan-scope-note").hidden = !expanded || running;
  toggleScan.hidden = !expanded || running || needsExclusionSetup;
  toggleScan.textContent = "Close";
  toggleScan.setAttribute("aria-expanded", String(!form.hidden));
  element("#inspect-title").textContent = running ? (scanMode() === "ai" ? `Scanning ${aiScopeLabel()}` : "Scan in progress") : "Choose a scan scope";
  element("#scan-caption").textContent = scanMode() === "ai" ? `${aiScopeLabel()} · Other disks are not scanned`
    : scanMode() === "computer" ? "All connected local disks" : scanMode() === "disk" ? `One disk · ${pathName(diskSelect.value) || "Select disk"}` : pathName(input.value) || "Select a folder to inspect, including its subfolders.";
  element("#scan-elapsed").hidden = !running;
  element(".report-panel").hidden = ["control", "tools", "activity"].includes(currentView) || (currentView !== "largest" && !lastReport && (running || expanded));
}
function navigate(view: ResultView, tool?: string): void {
  const changed = view !== currentView;
  const main=element("#main");
  const fromContent=main.contains(document.activeElement);
  navigationRevision++; currentView = view;
  if(changed&&(view==="projects"||view==="largest"))void refreshProjects();
  renderCurrent(tool);
  if (changed) {
    main.scrollTop=0;
    if(fromContent)main.focus({preventScroll:true});
  }
}
function renderCurrent(tool?: string): void {
  clearTimeout(searchTimer);
  disposeSizeBrowser();
  renderScanLayout();
  workspace.show(currentView, lastReport, grouped);
  if(!resultsHeader.contains(resultTools))resultsHeader.append(resultTools);
  element("#snapshot-banner").hidden = inArchive() || !lastReport || ["tools", "activity"].includes(currentView);
  freshness.set(lastReport?.sizeIndexId || null);
  if (lastReport) {
    element("#rescan-snapshot").textContent=lastReport.scope==="ai"?(lastReport.aiToolId?"Rescan "+(aiCatalog.find(t=>t.id===lastReport!.aiToolId)?.name??lastReport.aiToolId):"Rescan all AI tools"):"Rescan this scope";
    element("#snapshot-title").textContent = snapshotTitle(lastReport, restoredReport);
    element("#snapshot-date").textContent = snapshotDate(lastReport.scannedAtMs);
    element("#snapshot-offline").hidden = !restoredReport;
    element("#snapshot-save-error").hidden = !lastReport.persistenceError;
    element("#snapshot-save-status").hidden = !lastReport.persistenceError;
    element("#snapshot-save-status").textContent = lastReport.persistenceError ? storageCopy.saveFailed : "";
    element("#snapshot-save-error").textContent = lastReport.persistenceError
      ? `This scan could not be saved and is only available while Roomit is open. Your previous saved scan was preserved. ${lastReport.persistenceError}` : "";
  }
  const showArchive=inArchive();
  sizeForm.hidden=currentView!=="largest"||showArchive;
  largeNav.hidden=currentView!=="largest";
  for(const tab of largeNav.querySelectorAll("button"))tab.setAttribute("aria-pressed",String(tab.dataset.largeMode===largeMode));
  archive!.panel.hidden=!showArchive;
  results.hidden=showArchive;
  resultsHeader.hidden=showArchive || currentView==="ai";
  if(showArchive)archive!.open();
  for (const tab of viewButtons) tab.setAttribute("aria-pressed", String(tab.dataset.view === currentView));
  search.disabled = !lastReport && currentView!=="projects";
  search.placeholder=currentView==="details"?"Filter locations or protected groups…":"Search tools or folders…";
  element("#reveal-hint").hidden = showArchive || !lastReport || currentView==="ai";
  element("#reveal-hint").textContent = `Focus an item and press ${revealShortcut} to reveal its location.`;
  const page = workspacePages[currentView];
  element("#page-title").textContent = page.title;
  shell.setTitle(currentView === "control" ? "AI control center" : page.title);
  const description = element("#page-description");
  description.textContent = showArchive ? archiveCopy.intro : page.description;
  description.hidden = !description.textContent;
  const resultsTitle = element("#results-title");
  resultsTitle.textContent = currentView === "overview" ? "Scan summary" : currentView === "ai" ? "Your AI storage" : currentView === "details" ? "Scan coverage" : page.title;
  resultsTitle.hidden = resultsTitle.textContent === page.title;
  element("#result-sort-label").hidden = currentView !== "ai" && currentView !== "projects";
  const projectCount=new Set([...discovery.projects.map(p=>pathKey(p.path)),...(grouped?.projects??[]).map(p=>pathKey(p.location))]).size;
  element("#project-count").textContent = grouped||projectCount ? formatCount(projectCount) : "—";
  element("#ai-count").textContent = grouped ? formatCount(grouped.ai.length) : "—";
  if(showArchive){
    results.replaceChildren();caption.textContent=archiveCopy.intro;return;
  }
  if (lastReport && grouped) {
    results.replaceChildren(renderResults(lastReport, grouped, currentView, search.value, navigate, minimumBytes, groupSort, discovery.projects, tool));
    caption.textContent = currentView === "largest" ? "Filter files and folders by size. No rescan needed."
      : currentView==="details"?"Measured items and locations in the latest scan."
      : currentView === "ai" ? ""
      : `Listed: ${formatCount(grouped.projects.length)} project groups · ${formatCount(grouped.ai.length)} AI tools`;
  } else if(currentView==="projects"){
    results.replaceChildren();caption.textContent="Project folders used by AI tools and editors on this device.";
  } else if(currentView==="ai") {
    results.replaceChildren(renderStorageMap(null));
    caption.textContent="Scan AI data to measure tools and folders.";
  } else {
    const empty = document.createElement("div"); empty.className = "empty-state";
    const intro = document.createElement("div"); intro.className = "empty-intro";
    const title = document.createElement("h3"); title.textContent = activeScan ? "Preparing results…" : "No scans yet";
    const message = document.createElement("p"); message.textContent = activeScan
      ? "Measuring file sizes and grouping projects and tools. Follow progress above and cancel at any time."
      : currentView==="details"?"Run a scan to see measured space, inspected locations and skipped items.":"Explore accumulated dependencies, AI models, and large folders in one view. Choose a scope above to begin.";
    intro.append(title, message); empty.append(intro);
    const features = document.createElement("div"); features.className = "empty-features";
    for (const [symbol, label, heading, description] of [
      ["project", "DEVELOPMENT", "Projects, together", "Dependencies and build outputs are grouped by project."],
      ["ai", "ARTIFICIAL INTELLIGENCE", "Know your tools", "Models, settings, and user data are grouped by AI tool."],
      ["disk", "STORAGE", "See the big picture", "Explore large folders alongside their subfolder sizes."],
    ]) {
      const feature = document.createElement("div"); feature.className = "empty-feature";
      const tag = document.createElement("small"); tag.textContent = label;
      const headingNode = document.createElement("h4"); headingNode.textContent = heading;
      const copy = document.createElement("p"); copy.textContent = description;
      feature.append(icon(symbol as IconName, "ui-icon feature-icon"), tag, headingNode, copy); features.append(feature);
    }
    if(currentView!=="details")empty.append(features); results.replaceChildren(empty);
    caption.textContent = activeScan ? "Inspecting files. Results will appear here." : "Your summary will appear here when the scan finishes.";
  }
  if(currentView==="ai"){
    results.querySelector(".ai-list-tools")?.append(resultTools);
    const info=document.createElement("details");
    info.className="map-explorer";
    const title=document.createElement("summary");title.textContent=storageCopy.coverage;
    info.append(title,workspace.coverage());
    (results.querySelector(".ai-report-details")??results).append(info);
  }
  if(currentView==="projects"){
    const panel=document.createElement("section");panel.className="panel workspace-projects";
    const header=document.createElement("div");header.className="panel-heading";
    const title=document.createElement("h3");title.textContent="Workspace activity";
    const reload=document.createElement("button");reload.type="button";reload.className="secondary";reload.textContent=discovering?"Checking…":"Refresh activity";reload.disabled=discovering||!isTauri();
    reload.onclick=()=>{void refreshProjects();renderCurrent();};header.append(title,reload);panel.append(header);
    const query=search.value.trim().toLowerCase();
    const visible=discovery.projects.filter(p=>[p.path,...p.running,...p.recent].some(s=>s.toLowerCase().includes(query)));
    for(const p of visible){
      const row=document.createElement("article");row.className="workspace-project";row.dataset.revealOwner="";row.tabIndex=0;
      const title=document.createElement("strong");title.textContent=pathName(p.path);
      const info=document.createElement("span");info.className="project-activity";
      info.textContent=p.running.length?"Open in "+p.running.join(", "):"Recent · "+p.recent.join(", ");
      const path=document.createElement("small");path.textContent=p.path;path.className="report-path";
      row.append(title,info,path);
      if(p.lastUsed){const last=document.createElement("small");last.textContent="Last session · "+new Date(p.lastUsed*1000).toLocaleString();row.append(last);}
      row.append(revealActions([p.path]));panel.append(row);
    }
    const hint=document.createElement("p");hint.className="hint";
    hint.textContent=[projectError,...discovery.warnings,discovering?"Checking local workspaces…":!visible.length?"No matching open or recent workspaces.":"",
      "Open projects use process working folders. Recent activity covers the last seven days of Codex and OpenCode sessions."].filter(Boolean).join(" ");
    panel.append(hint);results.prepend(panel);
  }
}
setInterval(() => {
  if (!activeScan || !scanStartedAt) return;
  const seconds = Math.floor((performance.now() - scanStartedAt) / 1000);
  element("#scan-elapsed").textContent = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}, 1000);
function clearReport(): void {
  lastReport = null; grouped = null; search.value = ""; renderCurrent();
}
function showReport(report: InspectionReport, restored = false): void {
  report = {...report,
    root: report.scope === "ai" && report.root === "Bilinen AI veri konumları" ? "Known AI data locations" : report.scope === "computer" && report.root === "Bütün bilgisayar" ? "Whole computer" : report.root,
    findings: report.findings.map(item => ({...item, reason: reportMessage(item.reason), tool: reportMessage(item.tool)})),
    warnings: report.warnings.map(reportMessage),
    roots: report.roots.map(root => ({...root, error: root.error ? reportMessage(root.error) : null})),
    persistenceError: report.persistenceError ? reportMessage(report.persistenceError) : report.persistenceError,
  };
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
      restoreAiScope(report);
      for (const radio of modeInputs) radio.checked = radio.value === mode;
      if (mode === "folder") input.value = report.root;
      if (mode === "ai" && requestedAt === navigationRevision && currentView !== "control") currentView = "ai";
      showReport(report, true);
      status.className = ""; status.textContent = "Last saved scan restored. No rescan was performed.";
      if (mode === "disk" || mode === "computer") {
        await loadComputerRoots();
        if (mode === "disk") { diskSelect.value = disks.some(disk => disk.path === report.root) ? report.root : ""; renderDisks(); }
      }
    }
  } catch (error) {
    element("#restore-state").hidden = false;
    element("#restore-message").textContent = `Could not open saved results. The saved files were preserved. Start a new scan or try opening them again. ${String(error)}`;
  } finally { restoring = false; updateControls(); }
}
element("#retry-last-scan").addEventListener("click", () => void loadLastScan());
element("#rescan-snapshot").addEventListener("click", async () => {
  if (!lastReport || activeScan || restoring || preparingRescan || pickingFolder || !exclusions?.ready) return;
  preparingRescan = true;
  const report = lastReport;
  const mode = report.scope === "recursive" ? "folder" : report.scope;
  restoreAiScope(report);
  settingsExpanded = true; renderCurrent();
  for (const radio of modeInputs) radio.checked = radio.value === mode;
  if (mode === "folder") input.value = report.root;
  else if (mode === "disk" || mode === "computer") {
    await loadComputerRoots();
    if (mode === "disk") { diskSelect.value = disks.some(disk => disk.path === report.root) ? report.root : ""; renderDisks(); }
  }
  preparingRescan = false; updateControls();
  if (target()) form.requestSubmit();
  else { status.className = "warning"; status.textContent = "The previous scan disk is unavailable. Choose a scan scope."; }
});
for (const tab of viewButtons) tab.addEventListener("click", () => navigate(tab.dataset.view as ResultView));
function startAiScan(toolId = ""): void {
  if (!isTauri() || archive?.busy() || activeScan || restoring || preparingRescan || pickingFolder || updates.busy() || exclusions?.busy || !exclusions?.ready) return;
  if (toolId && !aiCatalog.some(tool=>tool.id===toolId)) return;
  aiToolSelect.value = toolId;
  diskRequest++; rootsLoading = false;
  for (const radio of modeInputs) radio.checked = radio.value === "ai";
  settingsExpanded = true; renderCurrent(); updateControls(); form.requestSubmit();
  scanPanel.scrollIntoView({block:"start"});
}
aiToolSelect.addEventListener("change", () => { updateControls(); renderScanLayout(); });
let searchTimer: ReturnType<typeof setTimeout> | undefined;
search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(refreshFilteredList, 120); });

if (isTauri()) {
  element("#runtime-note").textContent = "Selecting a folder does not start a scan.";
} else {
  button.disabled = true; input.disabled = true;
  status.textContent = "Browser preview: open Roomit on your desktop to scan.";
}
exclusions = installExclusions(() => {
  updateControls();
  if (exclusions && !exclusions.busy && !exclusions.ready) { settingsExpanded = true; renderCurrent(); }
}, () => {
  status.className = "";
  status.textContent = lastReport ? "Exclusions saved. Current results belong to the previous scan. Rescan to apply your changes." : "Exclusions saved.";
});
void exclusions.load();
void loadLastScan();
updateControls();
renderCurrent();
cancelButton.addEventListener("click", async () => {
  const scanId = activeScan;
  if (!scanId || cancelRequested) return;
  cancelRequested = true; cancelButton.disabled = true;
  status.textContent = "Requesting cancellation. Measured results will be preserved…";
  try {
    const accepted = await invoke<boolean>("cancel_scan", { scanId });
    if (activeScan === scanId && !accepted) {
      cancelRequested = false; cancelButton.disabled = false;
      status.textContent = "Finishing the scan. Retry cancellation if needed.";
    }
  } catch (error: unknown) {
    if (activeScan === scanId) {
      cancelRequested = false; cancelButton.disabled = false;
      status.textContent = `Could not request cancellation: ${String(error)}`;
    }
  }
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selection = target();
  if (!selection || !isTauri() || archive?.busy() || activeScan || pickingFolder || restoring || preparingRescan || updates.busy() || !exclusions?.ready) return;
  const { root, mode, aiToolId } = selection;
  const scanId = crypto.randomUUID();
  const previousReport = lastReport; const previouslyRestored = restoredReport;
  activeScan = scanId; cancelRequested = false; lastScanError = false; scanStartedAt = performance.now();
  element("#scan-elapsed").textContent = "00:00";
  updateControls();
  button.disabled = true; input.disabled = true;
  cancelButton.hidden = false; cancelButton.disabled = true;
  progressBar.hidden = false;
  clearReport(); results.setAttribute("aria-busy", "true");
  status.className = ""; status.textContent = "Starting scan…";
  currentPath.textContent = mode === "computer" ? "Preparing local disks…" : pathName(root);
  const onProgress = new Channel<ScanProgress>();
  let focusCancel = true;
  onProgress.onmessage = (progress) => {
    if (activeScan !== scanId) return;
    cancelButton.disabled = progress.finished || cancelRequested;
    if (focusCancel && !cancelButton.disabled) {
      focusCancel = false;
      if (document.activeElement === document.body) cancelButton.focus({ preventScroll: true });
    }
    currentPath.textContent = pathName(progress.currentPath);
    const disk = mode === "computer" ? ` · Disk ${progress.rootIndex}/${progress.rootCount}` : "";
    if (!cancelRequested) status.textContent = `${progress.finished ? "Preparing results" : "Scanning"}${disk} · ${formatCount(progress.stats.filesScanned)} files · ${formatCount(progress.stats.directoriesScanned)} folders · ${formatBytes(progress.stats.totalLogicalBytes)}`;
  };
  try {
    const report = await invoke<InspectionReport>("inspect_workspace", { root, mode, aiToolId: aiToolId || null, scanId, onProgress });
    showReport(report);
    element("#restore-state").hidden = true;
    status.textContent = scanSummary(report);
    status.className = report.totalSizeComplete && report.status === "completed" ? "" : "warning";
  } catch (error: unknown) {
    if (previousReport) showReport(previousReport, previouslyRestored);
    else settingsExpanded = true;
    lastScanError = true;
    status.className = "warning";
    status.textContent = `Scan could not be completed: ${String(error)}`;
  } finally {
    activeScan = null;
    workspace.show(currentView, lastReport, grouped);
    results.setAttribute("aria-busy", "false");
    progressBar.hidden = true; cancelButton.hidden = true;
    currentPath.textContent = "";
    button.disabled = false; input.disabled = false;
    updateControls();
    renderScanLayout();
  }
});
