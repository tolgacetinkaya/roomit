import { categoryLabels, formatBytes, formatCount, sizeLabel } from "./report";
import type { Finding, InspectionReport, ProjectGit } from "./report";
import { filterGroups, pathName, sortGroups } from "./groups";
import type { GroupSort } from "./groups";
import type { GroupedReport, ResultGroup } from "./groups";
import { icon } from "./icons";
import { revealActions, revealShortcut } from "./reveal";
import { renderSizeBrowser } from "./size-browser";
import {storageCopy} from "./locales/en-storage";
import {coverageCopy} from "./locales/en-coverage";
import {scanNotes} from "./scan-notes";
import { renderStorageMap, storageSummary } from "./storage-map";
import {locationLookup} from "./project-context";
import type {Workspace} from "./project-context";
import { modelPanel } from "./model-copies";
import { toolLogo, toolId } from "./tool-logos";

export type ResultView = "control" | "tools" | "activity" | "overview" | "projects" | "ai" | "largest" | "details";
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
    more.textContent = `Show more (${formatCount(count)} / ${formatCount(items.length)})`;
  };
  more.addEventListener("click", append); wrapper.append(list, more); append(); return wrapper;
}
function attachReveal(target: HTMLElement, paths: string[], focusable = false, summaryName?: string): void {
  target.dataset.revealOwner = "";
  if (focusable) target.tabIndex = 0;
  target.append(revealActions(paths, summaryName));
}
function expandable(title: string, subtitle: string, size: string, build: () => HTMLElement, paths: string[] = [], summaryName?: string): HTMLElement {
  const details = document.createElement("details"); details.className = "group-card";
  const summary = document.createElement("summary");
  const row = node("span", "", "group-row");
  const label = node("span", "", "group-label");
  label.append(node("strong", title), node("span", subtitle, "group-subtitle"));
  const right = node("span", "", "group-right");
  right.append(node("strong", size), node("span", "Details", "group-subtitle"));
  row.append(label, right); summary.append(row); details.append(summary);
  let built = false;
  details.addEventListener("toggle", () => {
    if (details.open && !built) { details.append(build()); built = true; }
  });
  if (!paths.length) return details;
  const card = node("div", "", "result-card"); card.append(details);
  attachReveal(card, paths, false, summaryName);
  summary.title = `Open details · Reveal location: ${revealShortcut}`;
  return card;
}
function findingRow(item: Finding): HTMLElement {
  const row = node("div", "", "member-row");
  const heading = node("div", "", "member-heading");
  heading.append(node("strong", pathName(item.path)), node("span", sizeLabel(item.logicalBytes, item.sizeComplete)));
  const path = node("p", item.path, "report-path");
  row.append(heading, node("p", `${categoryLabels[item.category]} · ${item.disposition === "protected" ? "Protected" : "Review required"}`, "muted"), path, node("p", item.reason, "hint"));
  attachReveal(row, [item.path], true);
  return row;
}
function projectActivity(git?: ProjectGit): HTMLElement {
  const info = node("dl", "", "project-activity");
  let date = "Rescan to check", changes = date;
  if (git?.state === "repository") {
    date = git.lastCommitTime === null ? "No project commits" : new Date(git.lastCommitTime * 1000).toLocaleDateString("en", {year:"numeric", month:"short", day:"numeric"});
    changes = git.dirty === null ? "Unavailable" : git.dirty ? "Changes present" : "Clean";
  } else if (git) {
    date = changes = git.state === "noRepository" ? "No Git repository" : "Unavailable";
  }
  for (const [label, value] of [["Last local project commit", date], ["Project changes", changes]]) {
    const field = node("div");
    field.append(node("dt", label), node("dd", value)); info.append(field);
  }
  return info;
}
function groupCard(group: ResultGroup, listedBytes?: bigint, projectReport?: InspectionReport): HTMLElement {
  const location = group.location ? group.location.replace(/\\/g, "/").split("/").slice(-2).join("/") + " · " : "";
  const context = group.kind === "ai" ? storageCopy.locations(group.items.length) : `${location}${group.tools.join(" · ")} · ${formatCount(group.items.length)} locations`;
  const modules = group.nodeModules;
  const size = projectReport
    ? `node_modules · ${modules ? sizeLabel(modules.logicalBytes, modules.sizeComplete) : "Rescan to measure"}`
    : sizeLabel(group.logicalBytes, group.sizeComplete);
  const card = expandable(group.title, context, size, () => {
    const body = node("div", "", "group-content");
    if (group.location) body.append(node("p", group.location, "report-path"));
    if (projectReport) body.append(node("p", `Recognized outputs and dependencies · ${sizeLabel(group.logicalBytes, group.sizeComplete)}`, "hint"));
    body.append(paged(group.items, findingRow, 20)); return body;
  }, group.location ? [group.location] : group.items.map((item) => item.path), group.kind === "ai" ? group.title : undefined);
  card.title = group.location || group.title;
  if (projectReport) card.insertBefore(projectActivity(projectReport.projectGit?.[group.location]), card.querySelector(".reveal-actions"));
  if (group.kind === "ai") {
    card.classList.add("ai-result");
    if (listedBytes && listedBytes > 0n) {
      const share = Number(BigInt(group.logicalBytes) * 1000n / listedBytes) / 10;
      const meter = document.createElement("meter"); meter.min = 0; meter.max = 100; meter.value = share;
      meter.setAttribute("aria-label", `${group.title}: share of listed AI data: ${share}%`);
      const usage = node("div", "", "tool-usage"); usage.append(meter); card.append(usage);
    }
  }
  card.querySelector(".group-row")?.prepend(group.kind === "ai" && toolId(group.title) ? toolLogo(toolId(group.title)!) : icon(group.kind === "ai" ? "ai" : group.kind === "project" ? "project" : "shield", "ui-icon group-icon"));
  return card;
}
function section(title: string, count: number, action?: () => void, unit = "groups"): HTMLElement {
  const header = node("div", "", "section-header");
  header.append(node("h3", title), node("span", `${formatCount(count)} ${unit}`, "section-count"));
  if (action) {
    const button = document.createElement("button"); button.type = "button"; button.className = "text-button";
    button.textContent = "View all"; button.addEventListener("click", action); header.append(button);
  }
  return header;
}
const empty = (text: string): HTMLElement => node("div", text, "empty-note");

function scanCoverage(report: InspectionReport, query:string): HTMLElement {
  const {stats,roots}=report;
  const layout=node("div","","scan-coverage");
  const summary=node("section","","panel coverage-summary");
  const state=report.status==="completed"?(report.totalSizeComplete?"Completed":"Partial sizes"):report.status==="cancelled"?"Cancelled":"Limited";
  const head=node("div","","panel-heading");
  head.append(node("h3","Measured space"),node("span",state,state==="Completed"?"scan-chip":"scan-chip attention"));
  summary.append(head,node("strong",sizeLabel(stats.totalLogicalBytes,report.totalSizeComplete&&report.status==="completed"),"coverage-size"),node("p",report.root,"report-path"));
  const counts=node("div","","coverage-counts");
  for(const [label,count,symbol] of [["Files",stats.filesScanned,"file"],["Folders",stats.directoriesScanned,"folder"]] as const){
    const item=node("div");item.append(icon(symbol),node("strong",formatCount(count)),node("span",label));counts.append(item);
  }
  const measuredItems=stats.filesScanned+stats.directoriesScanned;
  const ring=node("div","","coverage-ring");ring.setAttribute("aria-hidden","true");
  if(measuredItems>0)ring.style.setProperty("--file-share",String(stats.filesScanned/measuredItems*100)+"%");
  else ring.classList.add("empty-ring");
  const center=node("div");center.append(node("strong",formatCount(measuredItems)),node("small","items"));ring.append(center);
  const contents=node("div","","coverage-mix");contents.append(ring,counts);summary.append(contents);
  const notes = scanNotes(report, query);
  const issues=node("section","","panel scan-diagnostics");
  issues.append(node("h3",coverageCopy.title), node("p",notes.summary));
  const counters=node("dl","","diagnostic-counts");
  for (const {label,explanation,count} of notes.reasons) {
    const row = node("div");
    const term = node("dt",label);
    term.append(node("small",explanation,"hint"));
    row.append(term,node("dd",formatCount(count)));
    counters.append(row);
  }
  if (notes.reasons.length) issues.append(counters);
  if (notes.logCount) {
    const log = document.createElement("details");
    log.className = "coverage-log";
    log.append(node("summary",coverageCopy.log(formatCount(notes.logCount))));
    if (query.trim()) {
      log.open = true;
      log.append(node("p",coverageCopy.filtered(formatCount(notes.messages.length),formatCount(report.warnings.length)),"hint"));
    }
    for (const message of notes.messages) log.append(node("p",message,"report-path"));
    if (report.warningsOmitted) log.append(node("p",coverageCopy.omitted(formatCount(report.warningsOmitted)),"hint"));
    issues.append(log);
  }
  layout.append(summary,issues);
  const locations=node("section","","panel coverage-locations");
  locations.append(node("h3",`Scanned locations (${formatCount(roots.length)})`));
  const measured=(root:InspectionReport["roots"][number])=>root.status==="completed"||root.status==="limited"||root.status==="cancelled";
  const total=roots.reduce((sum,r)=>measured(r)?sum+BigInt(r.logicalBytes):sum,0n);
  if(total>0n)locations.append(node("p","Share of measured bytes by location","hint"));
  const labels={completed:"Completed",limited:"Limited",cancelled:"Cancelled",failed:"Inaccessible",notScanned:"Not scanned",excluded:"Excluded"};
  const rootRow=(root:InspectionReport["roots"][number])=>{
    const row=node("div","","coverage-root"),line=node("div","","coverage-line");
    const rootLabel = root.status === "completed" && !root.sizeComplete ? "Partial sizes" : labels[root.status];
    line.append(icon("folder"),node("strong",root.path,"coverage-path"),node("span",rootLabel,"scan-chip"+(root.status==="excluded"||root.status==="completed"&&root.sizeComplete?"":" attention")));
    row.append(line);
    if(measured(root)){
      const size=sizeLabel(root.logicalBytes,root.sizeComplete&&root.status==="completed");
      row.append(node("strong",size,"coverage-bytes"));
      if(total>0n){
        const bar=document.createElement("progress");bar.max=1;bar.value=Number(BigInt(root.logicalBytes))/Number(total);
        bar.setAttribute("aria-label",`${root.path} share of measured bytes`);row.append(bar);
      }
    }
    if(root.error)row.append(node("p",root.error,"warning"));
    attachReveal(row,[root.path],true);return row;
  };
  const matching=roots.filter(root=>root.path.toLowerCase().includes(query.trim().toLowerCase()));
  locations.append(matching.length?paged(matching,rootRow):empty(query?"No matching location.":"No location details in this report."));layout.append(locations);
  const method = document.createElement("details");
  method.className = "panel coverage-notes";
  method.append(node("summary",coverageCopy.method),node("p",coverageCopy.sizes,"hint"),node("p",coverageCopy.summaries,"hint"));
  layout.append(method);return layout;
}

function growthPanel(report:InspectionReport):HTMLElement {
  const panel=node("section","","panel");
  panel.append(node("h3","Changes since previous scan"));
  const growth=report.growth;
  if(!growth){panel.append(node("p","Rescan to start tracking size changes.","hint"));return panel;}
  if(growth.previousMs) panel.append(node("p",`Compared with ${new Date(growth.previousMs).toLocaleString()}. Folder totals can include the categories and projects listed below.`,"hint"));
  if(growth.note)panel.append(node("p",growth.note,"hint"));
  if(growth.changes.length)panel.append(paged(growth.changes, change=>{
    const row=node("div","","member-row");
    const difference=BigInt(change.delta);
    row.append(node("strong",`${difference>0n?"+":"−"}${formatBytes(String(difference<0n?-difference:difference))} · ${change.label}`),
      node("p",change.location,"report-path"));
    return row;
  },10));
  else if(growth.previousMs)panel.append(node("p","No size changes among comparable items.","hint"));
  return panel;
}

export function renderResults(report: InspectionReport, grouped: GroupedReport, view: ResultView, query: string,
  navigate: (view: ResultView) => void, minimumBytes = 0n, sort: GroupSort = "size", workspaces:Workspace[]=[], initialTool?: string): HTMLElement {
  const container = node("div", "", "report-view");
  const aiBytes = grouped.ai.reduce((sum, group) => sum + BigInt(group.logicalBytes), 0n);
  if (view === "ai") {
    const scoped = report.scope === "ai" && Boolean(report.aiToolId);
    const compareTools=!scoped && grouped.ai.length>1;
    const overview=compareTools ? node("div","","ai-map-overview") : container;
    if(compareTools)container.append(overview);
    overview.append(storageSummary(grouped,report,undefined,compareTools));
    if (grouped.ai.length) {
      const map = renderStorageMap(grouped,report.sizeIndexId,!report.totalSizeComplete||report.status!=="completed"||report.resultsTruncated,initialTool);
      if (scoped && aiBytes !== BigInt(report.stats.totalLogicalBytes)) {
        map.prepend(node("p",storageCopy.mapCoverage+" · "+formatBytes(String(aiBytes)),"hint"));
      }
      if (scoped || grouped.ai.length === 1) {
        const explorer = document.createElement("details"); explorer.className = "map-explorer";
        explorer.append(node("summary",storageCopy.browse),map); container.append(explorer);
      } else overview.append(map);
    }
  }
  if (view === "overview") {
    const metrics = node("div", "", "metrics");
    for (const [label, value, hint] of [
      ["Size inspected", sizeLabel(report.stats.totalLogicalBytes, report.totalSizeComplete), `${formatCount(report.stats.filesScanned)} files inspected`],
      ["Recognized space", sizeLabel(report.stats.recognizedLogicalBytes, report.totalSizeComplete), "Recognized software, AI, and protected data"],
      ["Software / AI groups", `${formatCount(grouped.projects.length)} / ${formatCount(grouped.ai.length)}`, "Organized by project and tool"],
    ]) { const card = node("div", "", "metric"); card.append(node("span", label), node("strong", value), node("small", hint)); metrics.append(card); }
    container.append(metrics);
  }
  if(view==="overview"){
    const panel=node("section","","panel storage-profile");
    panel.append(node("h3","Space by category"));
    const ranked=[["AI tool data",grouped.ai],["Project outputs and dependencies",grouped.projects],["Other protected data",grouped.protected]] as const;
    const measured=BigInt(report.stats.totalLogicalBytes);
    const rows:{name:string;bytes:bigint}[]=ranked.map(([name,items])=>({name,bytes:items.reduce((sum,g)=>sum+BigInt(g.logicalBytes),0n)}));
    const identified=rows.reduce((sum,r)=>sum+r.bytes,0n);
    if(measured>identified)rows.push({name:"Other measured space",bytes:measured-identified});
    for(const row of rows){
      const line=node("div","","profile-row");line.append(node("span",row.name),node("strong",formatBytes(String(row.bytes))));
      const bar=node("div","","size-track"), fill=node("span");
      fill.style.width=String(measured?Number(row.bytes*1000n/measured)/10:0)+"%";bar.append(fill);line.append(bar);panel.append(line);
    }
    container.append(panel);
  }
  const groupSummaryTruncated = report.resultsTruncated && view !== "largest";
  if(view==="overview")container.append(growthPanel(report),modelPanel(report));
  if (groupSummaryTruncated || (view !== "details" && (!report.totalSizeComplete || report.status !== "completed"))) {
    const notice = node("div", "", "result-notice");
    notice.append(node("span", groupSummaryTruncated ? "Group summaries are limited. All measured files and folders are available in Large items." : coverageCopy.partialNotice));
    const details = document.createElement("button"); details.type = "button"; details.className = "text-button"; details.textContent = "View details";
    details.addEventListener("click", () => navigate("details")); if(view!=="details")notice.append(details); container.append(notice);
  }
  const projects = sortGroups(filterGroups(grouped.projects, query), sort, view === "projects");
  const protectedGroups = filterGroups(grouped.protected, query);
  if (view === "overview" || view === "projects") {
    container.append(section("Software projects", projects.length, view === "overview" && projects.length > 6 ? () => navigate("projects") : undefined));
    container.append(node("p", view === "projects" ? "Each project shows its own node_modules folder. The date is the latest commit affecting this folder in the checked-out history. Staged, unstaged and untracked changes are checked within the project at scan time." : "Project cards show the total of recognized outputs and dependencies.", "hint"));
    container.append(projects.length ? paged(view === "overview" ? projects.slice(0, 6) : projects, group => groupCard(group, undefined, view === "projects" ? report : undefined)) : empty(query ? "No projects match your search." : "No software projects were found in this scan."));
  }
  if (view === "overview") {
    const ai = sortGroups(filterGroups(grouped.ai, query), sort);
    container.append(section("AI tools", ai.length), ai.length ? paged(ai, group => groupCard(group, aiBytes)) : empty(query ? "No AI tools match your search." : "No recognized AI data found in this scope. Use New scan to select a custom folder."));
  }
  if (view === "ai") {
    const listHeading = node("div", "", "ai-list-tools");
    listHeading.append(node("h3", storageCopy.measuredTools));
    container.append(listHeading, renderAiToolList(grouped, query, sort));
    const diagnostics = node("div", "", "ai-report-details");
    if (report.growth?.changes.length || report.growth?.note) {
      const changes = document.createElement("details");
      changes.className = "additional-details";
      changes.append(node("summary", storageCopy.scanChanges + (report.growth.changes.length ? ` · ${formatCount(report.growth.changes.length)}` : "")), growthPanel(report));
      diagnostics.append(changes);
    }
    if (report.modelGroups?.length || report.skippedModels) diagnostics.append(modelPanel(report));
    container.append(diagnostics);
  }
  if (view === "overview" && protectedGroups.length) {
    const details = document.createElement("details"); details.className = "additional-details";
    details.append(node("summary", `Other protected data · ${formatCount(protectedGroups.length)} groups`));
    let built = false;
    details.addEventListener("toggle", () => { if (details.open && !built) { details.append(paged(protectedGroups, group => groupCard(group))); built = true; } });
    container.append(details);
  }
  if (view === "largest") container.append(renderSizeBrowser(report.sizeIndexId, minimumBytes, query,locationLookup(report,grouped,workspaces)));
  if (view === "details") {
    container.append(scanCoverage(report,query));
    if (protectedGroups.length) container.append(section("Protected data", protectedGroups.length), paged(protectedGroups, group => groupCard(group)));
  }
  return container;
}

export function renderAiToolList(grouped: GroupedReport, query: string, sort: GroupSort): HTMLElement {
  const items = sortGroups(filterGroups(grouped.ai, query), sort);
  const result = node("div", "", "ai-list-results");
  const total = grouped.ai.reduce((sum, group) => sum + BigInt(group.logicalBytes), 0n);
  if (items.length) {
    const list = paged(items, group => groupCard(group, total));
    list.classList.add("ai-tool-list");
    result.append(list);
  } else {
    result.append(empty(query ? "No AI tools match your search." : "No recognized AI data found in this scope. Use New scan to select a custom folder."));
  }
  return result;
}
