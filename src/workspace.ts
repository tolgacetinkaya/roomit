import { invoke, isTauri } from "@tauri-apps/api/core";
import catalog from "./ai-catalog.json";
import { formatBytes, sizeLabel } from "./report";
import type { InspectionReport } from "./report";
import type { GroupedReport } from "./groups";
import { storageSummary } from "./storage-map";
import { toolLogo, toolId } from "./tool-logos";
import { controlCopy } from "./locales/en-control";
import { formatMemory, toolUsage, gpuText } from "./workspace-model";
import {activityState,prioritizeTools,runningToolIds} from "./tool-activity";
import {CPU_CEILING, OBSERVATION_MINUTES, RAM_FLOOR, observeToolMemory} from "./tool-memory";
import type {ToolMemoryObservation} from "./tool-memory";
import {toolMemoryCard} from "./tool-memory-card";
import type { ProcessRow, GpuReading, ProcessSort } from "./workspace-model";
import {memoryMode,memoryBreakdown,recordUsage,validPercent} from "./resource-history";
import type {MemoryMode,UsagePoint} from "./resource-history";
import {renderResourceCards,memoryText} from "./resource-cards";
import "./resources.css";
import { revealActions } from "./reveal";
import { categoryPanel } from "./storage-insights";
import {groupProcesses,processScope} from "./process-groups";
import {createProcessTable} from "./process-table";
import type {ProcessTableState} from "./process-table";
export type WorkspaceView="control"|"tools"|"activity";
interface InstalledTool {id:string;name:string;kind:string;installations:string[];dataPaths:string[];evidence:string[]}
interface Inventory {tools:InstalledTool[];supportedCount:number;warnings:string[]}
interface NetworkRow {name:string;receivedPerSecond:number|null;sentPerSecond:number|null}
interface Snapshot {sampledAtMs:number;cpuPercent:number|null;memoryUsed:string;memoryTotal:string;memoryAvailable?:string;memoryInstalled?:string|null;processes:ProcessRow[];appGpu?:{appId:string;reading:GpuReading}[];networks:NetworkRow[];gpuStatus:string;gpuAi?:GpuReading;gpuTools?:{toolId:string;reading:GpuReading}[];appNetworkStatus:string}
const el=(tag:string,text="",cls=""):HTMLElement=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
const percent=(n:number|null)=>n===null?"Measuring…":`${n.toLocaleString("en-US",{maximumFractionDigits:1})}%`;
const rate=(n:number|null)=>n===null?"Measuring…":`${formatBytes(Math.max(0,Math.round(n)).toString())}/s`;
export function installWorkspace(container:HTMLElement,navigate:(view:"ai"|"tools"|"activity",tool?:string)=>void,scanTool?:(id:string)=>void,scanBlocked:()=>boolean=()=>false):{show:(view:string,report:InspectionReport|null,groups:GroupedReport|null)=>void;coverage:()=>HTMLElement}{
  let current:string="",report:InspectionReport|null=null,groups:GroupedReport|null=null;
  let inventory:Inventory|null=null,snapshot:Snapshot|null=null,inventoryError="",monitorError="",inventoryBusy=false,monitorBusy=false,paused=false;
  let networkName="",processQuery="",processSort:ProcessSort="memory",timer:ReturnType<typeof setTimeout>|undefined;
  let scope=processScope(null);
  try{scope=processScope(localStorage.getItem("roomit-process-scope"));}catch{}
  let coveragePanel:HTMLElement|null=null;
  function updateCoverage(){
    if(!coveragePanel?.isConnected && current!=="ai")return;
    if(!coveragePanel)return;
    coveragePanel.replaceChildren(el("h3","AI storage coverage"));
    const measured=new Set(groups?.ai.map(group=>toolId(group.title))??[]);
    if(!inventory){
      coveragePanel.append(el("p",inventoryError||"Checking known tool locations…","hint"));return;
    }
    for(const tool of inventory.tools){
      const row=el("div","","coverage-tool");
      const state=measured.has(tool.id)?"Measured":tool.dataPaths.length?"Outside measured results":"No known data folder found";
      row.append(toolLogo(tool.id,18),el("span",tool.name),el("small",state));
      coveragePanel.append(row);
    }
    if(!inventory.tools.length)coveragePanel.append(el("p","No supported tools detected on this device.","hint"));
  }
  function coverage():HTMLElement{
    coveragePanel=el("section","","panel tool-coverage");updateCoverage();
    if(!inventory&&!inventoryBusy&&isTauri())void discover();
    return coveragePanel;
  }
  let renderedToolState="";
  const processState:ProcessTableState={expanded:new Set(),memberPages:new Map(),page:0};
  const toolNames=new Map(catalog.map(t=>[t.id,t.name]));
  let processTable:ReturnType<typeof createProcessTable>|null=null;
  let processGpuNote:HTMLElement|null=null,networkSelect:HTMLSelectElement|null=null,networkReading:HTMLElement|null=null,networkStatus:HTMLElement|null=null;
  let history:UsagePoint[]=[],pendingBreak=false,displayMode:MemoryMode="both";
  const observations = new Map<string, ToolMemoryObservation>();
  const memoryCards = new Map<string, ReturnType<typeof toolMemoryCard>>();
  let samplingGeneration = 0;
  function interruptSampling() {
    observations.clear();
    pendingBreak = true;
    samplingGeneration++;
  }
  try{displayMode=memoryMode(localStorage.getItem("roomit-ram-display"));}catch{}
  let metrics:HTMLElement|null=null,toolsList:HTMLElement|null=null,processes:HTMLElement|null=null,sampleLabel:HTMLElement|null=null;
  const visible=()=>["control","tools","activity"].includes(current)&&!document.hidden;
  async function discover():Promise<void>{
    if(inventoryBusy)return;inventoryBusy=true;inventoryError="";renderTools();
    try{inventory=await invoke<Inventory>("discover_ai_tools");document.querySelector("#installed-count")!.textContent=String(inventory.tools.filter(t=>t.evidence.length||t.installations.length).length);}
    catch(e){inventoryError=String(e);}finally{inventoryBusy=false;renderTools();updateCoverage();}
  }
  async function poll():Promise<void>{
    clearTimeout(timer);if(!visible()||paused||monitorBusy||!isTauri())return;monitorBusy=true;
    const generation = samplingGeneration;
    try{const next=await invoke<Snapshot>("resource_snapshot");if(!visible()||paused||generation!==samplingGeneration)return;snapshot=next;monitorError="";
      const ram=memoryBreakdown(snapshot.memoryTotal,snapshot.memoryUsed,snapshot.memoryAvailable),gpu=snapshot.gpuAi;
      const at=snapshot.sampledAtMs;
      observeToolMemory(observations, at, snapshot.processes);
      if(at>(history[history.length-1]?.at||0)){
        history=recordUsage(history,{at,cpu:validPercent(snapshot.cpuPercent),ram:ram?.usedPercent??null,gpu:gpu&&(gpu.status==="measured"||gpu.status==="partial")?validPercent(gpu.percent):null,gpuPartial:gpu?.status==="partial",breakBefore:pendingBreak});pendingBreak=false;
      }
      updateLive();}
    catch(e){if(visible()&&!paused&&generation===samplingGeneration){interruptSampling();monitorError=String(e);history=recordUsage(history,{at:Date.now(),cpu:null,ram:null,gpu:null,gpuPartial:false,breakBefore:true});updateLive();}}finally{monitorBusy=false;if(visible()&&!paused)timer=setTimeout(()=>void poll(),2000);}
  }
  document.addEventListener("visibilitychange",()=>{clearTimeout(timer);if(!visible())interruptSampling();else {updateLive();void poll();}});
  let resizeFrame=0;window.addEventListener("resize",()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>updateLive());});
  function redrawCharts():void {
    if (!metrics) return;
    const running = new Set(snapshot?.processes.map(p => p.toolId).filter(Boolean)).size;
    metrics.replaceChildren(renderResourceCards(snapshot,history,displayMode,monitorError,running));
  }
  window.addEventListener("roomit-theme-change", redrawCharts);
  function updateLive():void{
    if(!visible())return;
    if(toolsList&&renderedToolState!==toolStateKey()){renderTools();return;}
    for (const [id, card] of memoryCards) card.update(observations.get(id));
    if(metrics){
      const available=snapshot?.networks||[];
      if(!available.some(n=>n.name===networkName))networkName=[...available].sort((a,b)=>(b.receivedPerSecond||0)+(b.sentPerSecond||0)-(a.receivedPerSecond||0)-(a.sentPerSecond||0))[0]?.name||"";

      redrawCharts();
    }
    if(sampleLabel)sampleLabel.textContent=monitorError?`Measurement unavailable: ${monitorError}`:paused?"Live monitoring paused.":snapshot?`Latest sample ${new Date(snapshot.sampledAtMs).toLocaleTimeString("en-US")} · Every 2 seconds` : "Collecting first sample…";
    for(const card of container.querySelectorAll<HTMLElement>("[data-tool-usage]")){
      const id=card.dataset.toolUsage!, usage=toolUsage(snapshot?.processes||[],id);
      if (current === "control") {
        card.textContent = snapshot ? controlCopy.ram(memoryText(usage.memory, snapshot.memoryTotal, displayMode)) : controlCopy.activity.waiting;
        continue;
      }
      card.textContent=monitorError?"Live measurement unavailable":snapshot?usage.processes?`${usage.processes} processes · CPU ${percent(usage.cpu)} · RAM ${memoryText(usage.memory,snapshot.memoryTotal,displayMode)}`:"No running processes detected":"Waiting for live measurement…";
    }
    for(const card of container.querySelectorAll<HTMLElement>("[data-tool-gpu]")){
      const id=card.dataset.toolGpu!, usage=toolUsage(snapshot?.processes||[],id);
      const gpu=monitorError?undefined:snapshot?.gpuTools?.find(t=>t.toolId===id)?.reading;
      card.textContent=`GPU · ${snapshot?(usage.processes?gpuText(gpu):"No running processes"):"Waiting for measurement"}`;
      card.title=monitorError?`Live measurement unavailable: ${monitorError}`:gpu?.reason||(snapshot&&!usage.processes?"No running processes detected for this tool.":"GPU usage is unavailable for this tool. This does not mean zero usage.");
    }
    if(processes)renderProcesses();
  }
  const toolState=()=>activityState(Boolean(snapshot),paused,Boolean(monitorError),pendingBreak);
  const toolStateKey=()=>JSON.stringify([toolState(),[...runningToolIds(snapshot?.processes||[])].sort()]);
  function renderTools():void{
    if(!toolsList)return;
    renderedToolState=toolStateKey();
    const active=document.activeElement instanceof HTMLElement&&toolsList.contains(document.activeElement)?document.activeElement:null;
    const focusedCard=active?.closest<HTMLElement>("article[data-tool-id]");
    const focusIndex=focusedCard&&active?[...focusedCard.querySelectorAll<HTMLElement>("button,summary,a,input,select")].indexOf(active):-1;
    const openGraphs = new Set([...memoryCards].filter(([, card]) => card.element.open).map(([id]) => id));
    memoryCards.clear();
    const opened=new Set(Array.from(toolsList.querySelectorAll<HTMLElement>("article[data-tool-id]")).filter(card=>card.querySelector<HTMLDetailsElement>("details.tool-evidence")?.open).map(card=>card.dataset.toolId));
    toolsList.replaceChildren();toolsList.setAttribute("aria-busy",String(inventoryBusy));
    if(inventoryError && current !== "control")toolsList.append(el("p",`Tool discovery failed: ${inventoryError}. Running tools may still be shown from process measurements.`,"warning"));
    if(!inventory&&!snapshot&&current!=="control"){toolsList.append(el("p",isTauri()?"Discovering installed AI tools…":"Tool discovery is available in the desktop app.","hint"));return;}
    const detected=new Map((inventory?.tools||[]).map(t=>[t.id,t]));
    for(const id of new Set(snapshot?.processes.filter(p=>p.toolId).map(p=>p.toolId!)||[])){
      if(!detected.has(id)){const tool=catalog.find(t=>t.id===id);if(tool)detected.set(id,{id,name:tool.name,kind:tool.kind,installations:[],dataPaths:[],evidence:["Running processes"]});}
    }
    const state=toolState(),running=runningToolIds(snapshot?.processes||[]);
    const tools=prioritizeTools([...detected.values()],running,state);
    const runningCount=state==="live"?tools.filter(t=>running.has(t.id)).length:0;
    if (current === "control") {
      if (!runningCount) {
        toolsList.append(el("p", controlCopy.activity[state], "hint"));
      }
      for (const tool of tools) {
        if (state !== "live" || !running.has(tool.id)) continue;
        const row = el("div", "", "running-tool-row");
        const ram = el("span", "", "running-tool-ram");
        ram.dataset.toolUsage = tool.id;
        row.append(toolLogo(tool.id), el("strong", tool.name), ram);
        toolsList.append(row);
      }
      updateLive();
      return;
    }
    toolsList.append(el("p",state==="live"?`${runningCount} running now · ${tools.length-runningCount} other tools`:state==="paused"?"Monitoring paused · running status is not live":state==="unavailable"?"Running status unavailable · waiting for a successful measurement":"Checking which tools are running…","tool-activity-summary"));
    if(!tools.length)toolsList.append(el("p","No installations or data folders matched the supported catalog. Custom or portable installations may not be detected.","hint"));
    for(const tool of tools){
      const card=el("article","","installed-tool");card.dataset.toolId=tool.id;const heading=el("div","","installed-tool-heading"),copy=el("div");copy.append(el("h3",tool.name),el("p",tool.kind,"hint"));
      const isRunning=state==="live"&&running.has(tool.id);card.classList.toggle("is-running",isRunning);
      const badge=el("span",isRunning?"Running now":state==="paused"?"Paused":state==="unavailable"?"Status unavailable":state==="waiting"?"Checking status":tool.evidence.length||tool.installations.length?"Detected":"Data only",isRunning?"tool-state running-state":"tool-state data-only");
      badge.title=isRunning?"A process is running on this device. This does not necessarily mean an AI request is being processed.":"Installation evidence and live running status are separate.";heading.append(toolLogo(tool.id),copy,badge);
      const usage=el("p","","tool-live");usage.dataset.toolUsage=tool.id;
      const gpu=el("p","GPU · Waiting for measurement","tool-gpu");gpu.dataset.toolGpu=tool.id;
      const measured=groups?.ai.filter(g=>toolId(g.title)===tool.id)||[];
      const storage=measured.reduce((s,g)=>s+BigInt(g.logicalBytes),0n);
      const scoped = report?.scope === "ai" && report.aiToolId === tool.id;
      const bytes=el("div","","tool-storage");bytes.append(el("span",scoped?"Latest app scan":"Scanned data"),el("strong",scoped&&report?sizeLabel(report.stats.totalLogicalBytes,report.totalSizeComplete&&report.status==="completed"):measured.length?sizeLabel(storage.toString(),Boolean(report?.totalSizeComplete)&&!report?.resultsTruncated&&measured.every(g=>g.sizeComplete)):"Not measured yet"));
      const actions=el("div","","tool-scan-actions");
      if(scanTool){const scan=document.createElement("button");scan.type="button";scan.className="secondary";scan.textContent="Scan app data";scan.dataset.scanTool=tool.id;scan.setAttribute("aria-label",`Scan ${tool.name} app data`);scan.disabled=scanBlocked();scan.title="Scan known data locations only. Replaces the latest saved scan; files stay unchanged.";scan.onclick=()=>scanTool(tool.id);actions.append(scan);}
      if(scoped||measured.length){const view=document.createElement("button");view.type="button";view.className="text-button";view.textContent="View scanned data";view.onclick=()=>navigate("ai");actions.append(view);}
      const details=document.createElement("details");details.className="tool-evidence";details.open=opened.has(tool.id);const summary=document.createElement("summary");summary.textContent="Discovery evidence and locations";details.append(summary);
      for(const evidence of tool.evidence)details.append(el("p",evidence,"hint"));
      if(!tool.evidence.length&&!tool.installations.length)details.append(el("p","A data folder is not proof of installation. It may remain from a previous installation.","hint"));
      const paths=[...new Set([...tool.installations,...tool.dataPaths])];
      for(const path of paths)details.append(el("p",path,"report-path"));
      details.append(revealActions(paths));
      const memory = toolMemoryCard(tool.name, openGraphs.has(tool.id));
      memoryCards.set(tool.id, memory);
      card.append(heading,usage,gpu,memory.element,bytes);
      if(tool.id==="codex"||tool.id==="claude-code") card.append(categoryPanel(tool.id,report));
      card.append(actions,details);toolsList.append(card);
    }
    if(focusedCard&&focusIndex>=0){const restored=[...toolsList.querySelectorAll<HTMLElement>("article[data-tool-id]")].find(card=>card.dataset.toolId===focusedCard.dataset.toolId);restored?.querySelectorAll<HTMLElement>("button,summary,a,input,select")[focusIndex]?.focus({preventScroll:true});}
    updateLive();
  }
  function renderProcesses():void{
    if(!processes)return;
    if(!snapshot){processes.replaceChildren(el("p",monitorError||"Waiting for process measurements…","hint"));return;}
    if(!processTable){
      processes.replaceChildren();
      processGpuNote=el("p","","gpu-status-note");
      processTable=createProcessTable(processState);
      const notes=document.createElement("details");
      notes.className="catalog-note";
      notes.append(el("summary","About these measurements"),processGpuNote,el("p","Group totals include all processes. CPU is a share of device capacity. RAM can include pages shared by multiple processes.","hint"));
      processes.append(processTable.element,notes);
      const networks=el("div","","network-list"),label=document.createElement("label");label.textContent="Network adapter ";
      networkSelect=document.createElement("select");networkSelect.setAttribute("aria-label","Network adapter");
      networkSelect.onchange=()=>{networkName=networkSelect!.value;updateLive();};label.append(networkSelect);
      networkReading=el("div","","network-rates");networkStatus=el("p","","hint");
      networks.append(el("h3","Device network traffic"),label,networkReading);
      notes.append(networkStatus);processes.prepend(networks);
    }
    processGpuNote!.textContent=gpuNote()+" Groups show their busiest GPU engine; child GPU percentages may not add up to the group value.";
    const gpuReadings=new Map((snapshot.appGpu||[]).map(g=>[g.appId,g.reading]));
    for(const gpu of snapshot.gpuTools||[])if(!gpuReadings.has(`tool:${gpu.toolId}`))gpuReadings.set(`tool:${gpu.toolId}`,gpu.reading);
    processTable.update({groups:groupProcesses(snapshot.processes,gpuReadings,toolNames),query:processQuery,scope,sort:processSort,totalMemory:snapshot.memoryTotal,mode:displayMode,error:monitorError});
    const names=snapshot.networks.map(n=>n.name);
    if(JSON.stringify([...networkSelect!.options].map(o=>o.value))!==JSON.stringify(names))networkSelect!.replaceChildren(...names.map(name=>new Option(name,name)));
    networkSelect!.value=networkName;
    const network=snapshot.networks.find(n=>n.name===networkName);
    networkReading!.replaceChildren();
    for(const [label,value] of [["Download",network?.receivedPerSecond],["Upload",network?.sentPerSecond]] as const){
      const tile=el("div");tile.append(el("span",label),el("strong",monitorError||!network?"Unavailable":rate(value??null)));
      networkReading!.append(tile);
    }
    networkStatus!.textContent=snapshot.appNetworkStatus;
  }
  function gpuNote():string{
    return monitorError?`GPU unavailable: no live measurement. ${monitorError}`:`GPU · ${(snapshot?.gpuStatus||"Waiting for measurement").replace(/\.+$/,"")}. GPU usage is measured on this device, not on cloud model servers. Missing values do not mean zero. Partial percentages are measured lower bounds.`;
  }
  function render():void{
    memoryCards.clear();
    container.replaceChildren();metrics=null;toolsList=null;processes=null;sampleLabel=null;processTable=null;processGpuNote=null;networkSelect=null;networkReading=null;networkStatus=null;
    container.classList.toggle("control-workspace",current==="control");
    if(!["control","tools","activity"].includes(current))return;
    if (current === "control") {
      const layout = el("div", "", "control-layout");
      const running = el("section", "", "panel control-running");
      toolsList = el("div", "", "running-tool-list");
      running.append(el("h2", controlCopy.running), toolsList);
      const links = el("div", "", "control-running-links");
      for (const [view, text] of [["tools", controlCopy.allTools], ["activity", controlCopy.resources]] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "text-button";
        button.textContent = text;
        button.onclick = () => navigate(view);
        links.append(button);
      }
      running.append(links);
      layout.append(storageSummary(groups, report, tool => navigate("ai", tool)), running);
      container.append(layout);
      renderTools();
      return;
    }
    const liveHeader=el("div","","workspace-live-heading");sampleLabel=el("span","","hint");liveHeader.append(sampleLabel);
    const controls=el("div","","resource-controls"),label=document.createElement("label"),mode=document.createElement("select");label.textContent="RAM display ";mode.setAttribute("aria-label","RAM display");
    for(const [value,text]of [["capacity","GiB / MiB"],["percent","Percent"],["both","Capacity + percent"]])mode.add(new Option(text,value));mode.value=displayMode;
    mode.title="RAM display for cards, tools, and processes. Percentages use the system total. Your preference is saved on this device.";
    mode.onchange=()=>{displayMode=memoryMode(mode.value);try{localStorage.setItem("roomit-ram-display",displayMode);}catch{}updateLive();};label.append(mode);controls.append(label);
    const pause=document.createElement("button");pause.type="button";pause.className="text-button";pause.textContent=paused?"Resume monitoring":"Pause monitoring";pause.disabled=!isTauri();pause.onclick=()=>{paused=!paused;interruptSampling();pause.textContent=paused?"Resume monitoring":"Pause monitoring";clearTimeout(timer);updateLive();if(!paused)void poll();};controls.append(pause);liveHeader.append(controls);
    container.append(liveHeader);
    if(current!=="tools"){metrics=el("div","","resource-grid");container.append(metrics);}
    if(current==="activity"){
      container.append(el("p","Last 2 minutes · Samples every 2 seconds","history-note hint"));
    }
    if(current!=="activity"){
      const panel=el("section","","tool-inventory panel"),heading=el("div","","panel-heading"),title=el("div");title.append(el("h2","Your AI tools"));
      const refresh=document.createElement("button");refresh.type="button";refresh.className="secondary";refresh.textContent="Refresh discovery";refresh.disabled=!isTauri();refresh.onclick=()=>void discover();heading.append(title,refresh);panel.append(heading);
      const disclosure=document.createElement("details");disclosure.className="catalog-note";const summary=document.createElement("summary");summary.textContent=`Discovery scope · ${inventory?.supportedCount||catalog.length} tools`;disclosure.append(summary,el("p",`${catalog.map(t=>t.name).join(" · ")}. Checks PATH, known app locations, and installation records. Custom installations, plugins, WSL, container internals, and AI websites are not automatically discovered.`,"hint"));
      toolsList=el("div","","installed-tools");panel.append(toolsList);
      disclosure.append(el("p",`A tool card shows its CPU and RAM history after ${OBSERVATION_MINUTES} observed minutes at or below ${CPU_CEILING}% of device CPU with at least ${formatMemory(String(RAM_FLOOR))} resident RAM. Monitoring gaps restart the timer. Tools can still be serving requests.`,"hint"));
      if(inventory?.warnings.length)panel.append(el("p",inventory.warnings.join(" "),"warning"));container.append(panel);container.append(disclosure);renderTools();
    } else {
      const panel=el("section","","activity-panel panel"),heading=el("div","","panel-heading");const title=el("h2",scope==="all"?"Running apps and processes":scope==="ai"?"Running AI apps":"Running AI & development apps");heading.append(title);
      const filters=el("div","","activity-filters");const search=document.createElement("input");search.type="search";search.placeholder="Search Chrome, Docker, tool, or PID…";search.setAttribute("aria-label","Search processes");search.value=processQuery;search.oninput=()=>{processQuery=search.value;processState.page=0;renderProcesses();};
      const sort=document.createElement("select");sort.setAttribute("aria-label","Process sort order");sort.add(new Option("RAM: high to low","memory"));sort.add(new Option("CPU: high to low","cpu"));sort.add(new Option("GPU: high to low","gpu"));sort.value=processSort;sort.onchange=()=>{processSort=sort.value as ProcessSort;processState.page=0;renderProcesses();};
      const filter=document.createElement("select");filter.setAttribute("aria-label","Process scope");filter.add(new Option("AI & development","workspace"));filter.add(new Option("AI only","ai"));filter.add(new Option("All processes","all"));filter.value=scope;filter.onchange=()=>{scope=processScope(filter.value);title.textContent=scope==="all"?"Running apps and processes":scope==="ai"?"Running AI apps":"Running AI & development apps";try{localStorage.setItem("roomit-process-scope",scope);}catch{}processState.page=0;renderProcesses();};filters.append(search,sort,filter);
      processes=el("div");panel.append(heading,filters,processes);container.append(panel);renderProcesses();
    }
    updateLive();
  }
  return {coverage,show(view,nextReport,nextGroups){const changed=current!==view||report!==nextReport||groups!==nextGroups;current=view;if(!visible())interruptSampling();report=nextReport;groups=nextGroups;container.hidden=!["control","tools","activity"].includes(view);if(changed)render();clearTimeout(timer);if(visible()&&isTauri()){if(!inventory&&!inventoryBusy)void discover();void poll();}}};
}
