import { invoke } from "@tauri-apps/api/core";
import { formatBytes, sizeLabel } from "./report";
import type { SizedEntry } from "./report";
import { pathName } from "./groups";
import { icon } from "./icons";
import { revealActions } from "./reveal";

import type {LocationContext} from "./project-context";

type EntryKind = "directory"|"file";
let selectedKind:EntryKind="directory";
let grid=true;
try { grid=localStorage.getItem("roomit-size-layout")!=="list"; } catch {}

interface Cursor { sortKey: string; path: string }
interface SizePage {
  entries: SizedEntry[]; total: string | null; first: Cursor | null; last: Cursor | null;
  hasPrevious: boolean; hasNext: boolean;
}
let activeCleanup: (() => void) | null = null;
export function disposeSizeBrowser(): void { activeCleanup?.(); activeCleanup = null; }
const node = (tag: string, text = "", className = ""): HTMLElement => {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
};
function entryCard(entry: SizedEntry, context:LocationContext, maximum:bigint): HTMLElement {
  const card = node("article", "", "result-card size-result"); card.tabIndex = 0; card.dataset.revealOwner = "";
  const heading = node("div", "", "member-heading");
  const title = node("span", "", "size-entry-title");
  title.append(icon(entry.kind === "file" ? "file" : "folder"), node("strong", pathName(entry.path)));
  heading.append(title, node("span", sizeLabel(entry.logicalBytes, entry.sizeComplete)));
  const bar=node("div","","size-track");
  const fill=node("span");fill.style.width=String(maximum?Number(BigInt(entry.logicalBytes)*1000n/maximum)/10:0)+"%";
  bar.append(fill);bar.setAttribute("aria-hidden","true");
  card.append(heading,bar,node("p",entry.path,"report-path"));
  if(context.project){const owner=node("p","Project · "+pathName(context.project),"item-context");owner.title=context.project;card.append(owner);}
  if(context.linkedProjects?.length){
    const paths=context.linkedProjects;
    const labels=paths.slice(0,2).map(pathName);
    const links=node("p","Recent session projects · "+labels.join(", ")+(paths.length>2?" +"+String(paths.length-2):""),"item-context");
    links.title=paths.join("\n");card.append(links);
  }
  if(context.tools.length)card.append(node("p",context.tools.join(" · "),"item-context"));
  card.append(revealActions([entry.path])); return card;
}

export function renderSizeBrowser(indexId: string, minimum: bigint, search: string, lookup:(path:string)=>LocationContext): HTMLElement {
  const root = node("div", "", "size-browser");
  root.append(node("p", `${minimum > 0n ? formatBytes(minimum.toString()) + " and above" : "No minimum size"} · Measured files and subfolders`, "size-filter-summary"),
    node("p", "Bars compare sizes on this page. Folder totals include their contents.", "hint"));
  const toolbar=node("div","","size-toolbar");
  const kinds=node("div","","view-switch"),layouts=node("div","","view-switch");
  const content=node("div");toolbar.append(kinds,layouts);root.append(toolbar,content);
  let cleanup=()=>{};
  activeCleanup=()=>cleanup();
  function choice(label:string,host:HTMLElement,action:()=>void){
    const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent=label;
    button.onclick=action;host.append(button);return button;
  }
  const folders=choice("Folders",kinds,()=>show("directory")),files=choice("Files",kinds,()=>show("file"));
  const gridButton=choice("Grid",layouts,()=>layout(true)),listButton=choice("List",layouts,()=>layout(false));
  function layout(useGrid:boolean){
    grid=useGrid;root.classList.toggle("size-grid",grid);
    gridButton.setAttribute("aria-pressed",String(grid));listButton.setAttribute("aria-pressed",String(!grid));
    try{localStorage.setItem("roomit-size-layout",grid?"grid":"list");}catch{}
  }
  function show(kind:EntryKind){
    cleanup();selectedKind=kind;content.replaceChildren();
    folders.setAttribute("aria-pressed",String(kind==="directory"));files.setAttribute("aria-pressed",String(kind==="file"));
    const panel = node("section", "", "size-page-panel");
    const heading = node("div", "", "section-header");
    const name = kind === "file" ? "Files" : "Folders";
    const count = node("span", "Loading…", "section-count");
    heading.append(node("h3", name), count);
    const status = node("p", "", "hint"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const progress = document.createElement("progress"); progress.setAttribute("aria-label", `${name} loading`);
    const list = node("div", "", "group-list size-page-list");
    const controls = node("div", "", "size-page-controls");
    const button = (text: string): HTMLButtonElement => {
      const element = document.createElement("button"); element.type = "button"; element.className = "secondary"; element.textContent = text; return element;
    };
    const previous = button("Previous"), next = button("Next"), cancel = button("Cancel loading"), retry = button("Try again");
    const previousTop = button("Previous"), nextTop = button("Next");
    previous.setAttribute("aria-label", `Previous ${kind === "file" ? "file" : "folder"} page`);
    next.setAttribute("aria-label", `Next ${kind === "file" ? "file" : "folder"} page`);
    previousTop.setAttribute("aria-label", previous.getAttribute("aria-label")!); nextTop.setAttribute("aria-label", next.getAttribute("aria-label")!);
    const topControls = node("div", "", "size-page-top-controls"); topControls.append(previousTop, nextTop); heading.append(topControls);
    cancel.setAttribute("aria-label", `${name}: cancel loading`);
    retry.hidden = true; controls.append(previous, next, cancel, retry);
    panel.append(heading, status, progress, list, controls); content.append(panel);
    let disposed = false, currentRequest: string | null = null, total: string | null = null;
    let page: SizePage | null = null, pageNumber = 1;
    let lastAttempt: { cursor: Cursor | null; direction: "next" | "previous"; target: number } = { cursor: null, direction: "next", target: 1 };
    const cancelRequest = (id: string): void => { void invoke("cancel_size_query", { requestId: id }).catch(() => {}); };
    const update = (): void => {
      const busy = currentRequest !== null;
      panel.setAttribute("aria-busy", String(busy)); progress.hidden = !busy; cancel.hidden = !busy;
      previous.disabled = busy || !page?.hasPrevious; next.disabled = busy || !page?.hasNext;
      previousTop.disabled = previous.disabled; nextTop.disabled = next.disabled;
      count.textContent = total !== null ? `${new Intl.NumberFormat("en-US").format(BigInt(total))} ${kind === "file" ? "file" : "folder"} · Page ${pageNumber}` : busy ? "Loading…" : "—";
    };
    const load = async (cursor: Cursor | null, direction: "next" | "previous", target: number): Promise<void> => {
      if (disposed) return;
      if (currentRequest) cancelRequest(currentRequest);
      const requestId = crypto.randomUUID(); currentRequest = requestId;
      lastAttempt = { cursor, direction, target }; status.className = "hint"; status.textContent = "Loading results…";
      retry.hidden = true; cancel.disabled = false; update();
      try {
        const response = await invoke<SizePage>("query_size_entries", { request: {
          indexId, requestId, kind, minimumBytes: minimum.toString(), query: search,
          cursor, direction, includeTotal: total === null,
        } });
        if (disposed || currentRequest !== requestId) return;
        page = response; pageNumber = target; total = response.total ?? total;
        const maximum=BigInt(response.entries[0]?.logicalBytes??"0");
        list.replaceChildren(...response.entries.map(entry=>entryCard(entry,lookup(entry.path),maximum)));
        if (!response.entries.length) list.append(node("div", "No items match this size and search.", "empty-note"));
        status.textContent = response.entries.length ? `This page: ${response.entries.length} items shown.` : "No matches.";
        if (cursor) { panel.scrollIntoView({ block: "start" }); heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      } catch (error: unknown) {
        if (disposed || currentRequest !== requestId) return;
        status.className = "warning"; status.textContent = String(error); retry.hidden = false;
      } finally {
        if (!disposed && currentRequest === requestId) { currentRequest = null; update(); }
      }
    };
    for (const element of [previous, previousTop]) element.addEventListener("click", () => { if (page?.first) void load(page.first, "previous", Math.max(1, pageNumber - 1)); });
    for (const element of [next, nextTop]) element.addEventListener("click", () => { if (page?.last) void load(page.last, "next", pageNumber + 1); });
    retry.addEventListener("click", () => { void load(lastAttempt.cursor, lastAttempt.direction, lastAttempt.target); });
    cancel.addEventListener("click", () => {
      if (!currentRequest) return;
      const requestId = currentRequest; currentRequest = null; cancelRequest(requestId);
      status.className = "hint"; status.textContent = "Result loading cancelled. You can try again.";
      retry.hidden = false; update();
    });
    cleanup=() => { disposed = true; if (currentRequest) cancelRequest(currentRequest); currentRequest = null; };
    void load(null, "next", 1);
  }
  layout(grid);show(selectedKind);return root;
}
