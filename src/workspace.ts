import { invoke, isTauri } from "@tauri-apps/api/core";
import catalog from "./ai-catalog.json";
import { formatBytes, sizeLabel } from "./report";
import type { InspectionReport } from "./report";
import type { GroupedReport } from "./groups";
import { renderStorageMap } from "./storage-map";
import { toolLogo, toolId } from "./tool-logos";
import { toolUsage, gpuText } from "./workspace-model";
import type { ProcessRow, GpuReading, ProcessSort } from "./workspace-model";
import {memoryMode,memoryBreakdown,recordUsage,validPercent} from "./resource-history";
import type {MemoryMode,UsagePoint} from "./resource-history";
import {renderResourceCards,memoryText} from "./resource-cards";
import "./resources.css";
import { revealActions } from "./reveal";
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
export function installWorkspace(container:HTMLElement,navigate:(view:"ai"|"tools"|"activity")=>void):{show:(view:string,report:InspectionReport|null,groups:GroupedReport|null)=>void}{
  let current:string="",report:InspectionReport|null=null,groups:GroupedReport|null=null;
  let inventory:Inventory|null=null,snapshot:Snapshot|null=null,inventoryError="",monitorError="",inventoryBusy=false,monitorBusy=false,paused=false;
  let networkName="",processQuery="",processSort:ProcessSort="memory",timer:ReturnType<typeof setTimeout>|undefined;
  let scope=processScope(null);
  try{scope=processScope(localStorage.getItem("roomit-process-scope"));}catch{}
  let runningIds="";
  const processState:ProcessTableState={expanded:new Set(),memberPages:new Map(),page:0};
  const toolNames=new Map(catalog.map(t=>[t.id,t.name]));
  let processTable:ReturnType<typeof createProcessTable>|null=null;
  let processGpuNote:HTMLElement|null=null,networkSelect:HTMLSelectElement|null=null,networkReading:HTMLElement|null=null,networkStatus:HTMLElement|null=null;
  let history:UsagePoint[]=[],pendingBreak=false,displayMode:MemoryMode="both";
  try{displayMode=memoryMode(localStorage.getItem("roomit-ram-display"));}catch{}
  let metrics:HTMLElement|null=null,toolsList:HTMLElement|null=null,processes:HTMLElement|null=null,sampleLabel:HTMLElement|null=null,networkSummary:HTMLElement|null=null;
  const visible=()=>["control","tools","activity"].includes(current)&&!document.hidden;
  async function discover():Promise<void>{
    if(inventoryBusy)return;inventoryBusy=true;inventoryError="";renderTools();
    try{inventory=await invoke<Inventory>("discover_ai_tools");document.querySelector("#installed-count")!.textContent=String(inventory.tools.filter(t=>t.evidence.length||t.installations.length).length);}
    catch(e){inventoryError=String(e);}finally{inventoryBusy=false;renderTools();}
  }
  async function poll():Promise<void>{
    clearTimeout(timer);if(!visible()||paused||monitorBusy||!isTauri())return;monitorBusy=true;
    try{const next=await invoke<Snapshot>("resource_snapshot");if(!visible()||paused){pendingBreak=true;return;}snapshot=next;monitorError="";
      const ram=memoryBreakdown(snapshot.memoryTotal,snapshot.memoryUsed,snapshot.memoryAvailable),gpu=snapshot.gpuAi;
      const at=snapshot.sampledAtMs;
      if(at>(history[history.length-1]?.at||0)){
        history=recordUsage(history,{at,cpu:validPercent(snapshot.cpuPercent),ram:ram?.usedPercent??null,gpu:gpu&&(gpu.status==="measured"||gpu.status==="partial")?validPercent(gpu.percent):null,gpuPartial:gpu?.status==="partial",breakBefore:pendingBreak});pendingBreak=false;
      }
      const nextIds=[...new Set(snapshot.processes.filter(p=>p.toolId).map(p=>p.toolId!))].sort().join("|");
      if(nextIds!==runningIds){runningIds=nextIds;renderTools();}updateLive();}
    catch(e){if(visible()&&!paused){monitorError=String(e);history=recordUsage(history,{at:Date.now(),cpu:null,ram:null,gpu:null,gpuPartial:false,breakBefore:true});updateLive();}}finally{monitorBusy=false;if(visible()&&!paused)timer=setTimeout(()=>void poll(),2000);}
  }
  document.addEventListener("visibilitychange",()=>{clearTimeout(timer);if(!visible())pendingBreak=true;else void poll();});
  let resizeFrame=0;window.addEventListener("resize",()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>updateLive());});
  function updateLive():void{
    if(!visible())return;
    if(metrics){
      const running=snapshot?new Set(snapshot.processes.filter(p=>p.toolId).map(p=>p.toolId)).size:0;
      const available=snapshot?.networks||[];
      if(!available.some(n=>n.name===networkName))networkName=[...available].sort((a,b)=>(b.receivedPerSecond||0)+(b.sentPerSecond||0)-(a.receivedPerSecond||0)-(a.sentPerSecond||0))[0]?.name||"";
      const network=monitorError?undefined:available.find(n=>n.name===networkName);
      metrics.replaceChildren(renderResourceCards(snapshot,history,displayMode,monitorError,running));
      if(networkSummary)networkSummary.textContent=network?`Network · ${network.name} · Download ${rate(network.receivedPerSecond)} · Upload ${rate(network.sentPerSecond)}`:"Network measurement unavailable";
    }
    if(sampleLabel)sampleLabel.textContent=monitorError?`Measurement unavailable: ${monitorError}`:paused?"Live monitoring paused.":snapshot?`Latest sample ${new Date(snapshot.sampledAtMs).toLocaleTimeString("en-US")} · Every 2 seconds` : "Collecting first sample…";
    for(const card of container.querySelectorAll<HTMLElement>("[data-tool-usage]")){
      const id=card.dataset.toolUsage!, usage=toolUsage(snapshot?.processes||[],id);
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
  function renderTools():void{
    if(!toolsList)return;
    const opened=new Set(Array.from(toolsList.querySelectorAll<HTMLElement>("article[data-tool-id]")).filter(card=>card.querySelector<HTMLDetailsElement>("details")?.open).map(card=>card.dataset.toolId));
    toolsList.replaceChildren();toolsList.setAttribute("aria-busy",String(inventoryBusy));
    if(inventoryError){toolsList.append(el("p",`Tool discovery failed: ${inventoryError}`,"warning"));return;}
    if(!inventory){toolsList.append(el("p",isTauri()?"Discovering installed AI tools…":"Tool discovery is available in the desktop app.","hint"));return;}
    const detected=new Map(inventory.tools.map(t=>[t.id,t]));
    for(const id of new Set(snapshot?.processes.filter(p=>p.toolId).map(p=>p.toolId!)||[])){
      if(!detected.has(id)){const tool=catalog.find(t=>t.id===id);if(tool)detected.set(id,{id,name:tool.name,kind:tool.kind,installations:[],dataPaths:[],evidence:["Running processes"]});}
    }
    const tools=[...detected.values()].sort((a,b)=>Number(Boolean(b.evidence.length))-Number(Boolean(a.evidence.length))||a.name.localeCompare(b.name,"en"));
    const display=tools;
    if(!tools.length)toolsList.append(el("p","No installations or data folders matched the supported catalog. Custom or portable installations may not be detected.","hint"));
    for(const tool of display){
      const card=el("article","","installed-tool");card.dataset.toolId=tool.id;const heading=el("div","","installed-tool-heading"),copy=el("div");copy.append(el("h3",tool.name),el("p",tool.kind,"hint"));
      const badge=el("span",tool.evidence.length||tool.installations.length?"Detected":"Data only",tool.evidence.length?"tool-state":"tool-state data-only");heading.append(toolLogo(tool.id),copy,badge);
      const usage=el("p","","tool-live");usage.dataset.toolUsage=tool.id;
      const gpu=el("p","GPU · Waiting for measurement","tool-gpu");gpu.dataset.toolGpu=tool.id;
      const measured=groups?.ai.filter(g=>toolId(g.title)===tool.id)||[];
      const storage=measured.reduce((s,g)=>s+BigInt(g.logicalBytes),0n);
      const bytes=el("div","","tool-storage");bytes.append(el("span","Scanned data"),el("strong",measured.length?sizeLabel(storage.toString(),Boolean(report?.totalSizeComplete)&&!report?.resultsTruncated&&measured.every(g=>g.sizeComplete)):"Not measured yet"));
      const details=document.createElement("details");details.className="tool-evidence";details.open=opened.has(tool.id);const summary=document.createElement("summary");summary.textContent="Discovery evidence and locations";details.append(summary);
      for(const evidence of tool.evidence)details.append(el("p",evidence,"hint"));
      if(!tool.evidence.length&&!tool.installations.length)details.append(el("p","A data folder is not proof of installation. It may remain from a previous installation.","hint"));
      const paths=[...new Set([...tool.installations,...tool.dataPaths])];
      for(const path of paths)details.append(el("p",path,"report-path"));
      details.append(revealActions(paths));card.append(heading,usage,gpu,bytes,details);toolsList.append(card);
    }
    updateLive();
  }
  function renderProcesses():void{
    if(!processes)return;
    if(!snapshot){processes.replaceChildren(el("p",monitorError||"Waiting for process measurements…","hint"));return;}
    if(!processTable){
      processes.replaceChildren();
      processGpuNote=el("p","","gpu-status-note");
      processTable=createProcessTable(processState);
      processes.append(processGpuNote,el("p","Select an app to view its processes. Group totals include all members, even when searching by PID. Shared runtimes may appear separately.","process-group-help"),processTable.element);
      const networks=el("div","","network-list"),label=document.createElement("label");label.textContent="Network adapter ";
      networkSelect=document.createElement("select");networkSelect.setAttribute("aria-label","Network adapter");
      networkSelect.onchange=()=>{networkName=networkSelect!.value;updateLive();};label.append(networkSelect);
      networkReading=el("p","","hint");networkStatus=el("p","","hint");networks.append(label,networkReading,networkStatus);processes.append(networks);
    }
    processGpuNote!.textContent=gpuNote()+" Groups show their busiest GPU engine; child GPU percentages may not add up to the group value.";
    const gpuReadings=new Map((snapshot.appGpu||[]).map(g=>[g.appId,g.reading]));
    for(const gpu of snapshot.gpuTools||[])if(!gpuReadings.has(`tool:${gpu.toolId}`))gpuReadings.set(`tool:${gpu.toolId}`,gpu.reading);
    processTable.update({groups:groupProcesses(snapshot.processes,gpuReadings,toolNames),query:processQuery,scope,sort:processSort,totalMemory:snapshot.memoryTotal,mode:displayMode,error:monitorError});
    const names=snapshot.networks.map(n=>n.name);
    if(JSON.stringify([...networkSelect!.options].map(o=>o.value))!==JSON.stringify(names))networkSelect!.replaceChildren(...names.map(name=>new Option(name,name)));
    networkSelect!.value=networkName;
    const network=snapshot.networks.find(n=>n.name===networkName);
    networkReading!.textContent=monitorError?"Network measurement unavailable":network?`Download ${rate(network.receivedPerSecond)} · Upload ${rate(network.sentPerSecond)}`:"No network adapters found.";
    networkStatus!.textContent=snapshot.appNetworkStatus;
  }
  function gpuNote():string{
    return monitorError?`GPU unavailable: no live measurement. ${monitorError}`:`GPU · ${(snapshot?.gpuStatus||"Waiting for measurement").replace(/\.+$/,"")}. GPU usage is measured on this device, not on cloud model servers. Missing values do not mean zero. Partial percentages are measured lower bounds.`;
  }
  function render():void{
    container.replaceChildren();metrics=null;toolsList=null;processes=null;sampleLabel=null;networkSummary=null;processTable=null;processGpuNote=null;networkSelect=null;networkReading=null;networkStatus=null;
    container.classList.toggle("control-workspace",current==="control");
    if(!["control","tools","activity"].includes(current))return;
    const liveHeader=el("div","","workspace-live-heading");sampleLabel=el("span","","hint");liveHeader.append(sampleLabel);
    const controls=el("div","","resource-controls"),label=document.createElement("label"),mode=document.createElement("select");label.textContent="RAM display ";mode.setAttribute("aria-label","RAM display");
    for(const [value,text]of [["capacity","GiB / MiB"],["percent","Percent"],["both","Capacity + percent"]])mode.add(new Option(text,value));mode.value=displayMode;
    mode.title="RAM display for cards, tools, and processes. Percentages use the system total. Your preference is saved on this device.";
    mode.onchange=()=>{displayMode=memoryMode(mode.value);try{localStorage.setItem("roomit-ram-display",displayMode);}catch{}updateLive();};label.append(mode);controls.append(label);
    const pause=document.createElement("button");pause.type="button";pause.className="text-button";pause.textContent=paused?"Resume monitoring":"Pause monitoring";pause.disabled=!isTauri();pause.onclick=()=>{paused=!paused;pendingBreak=true;pause.textContent=paused?"Resume monitoring":"Pause monitoring";clearTimeout(timer);updateLive();if(!paused)void poll();};controls.append(pause);liveHeader.append(controls);
    metrics=el("div","","resource-grid");networkSummary=el("p","","resource-network hint");container.append(liveHeader,metrics,el("p","Last 2 minutes · 0–100% scale · History accumulates while this view is open. Missing or paused measurements leave gaps.","history-note hint"),networkSummary);
    const controlLayout=current==="control"?el("div","","control-layout"):null;
    if(controlLayout){controlLayout.append(renderStorageMap(groups,report?.sizeIndexId, Boolean(report && (!report.totalSizeComplete || report.status!=="completed" || report.resultsTruncated))));container.append(controlLayout);}
    if(current!=="activity"){
      const panel=el("section","","tool-inventory panel"),heading=el("div","","panel-heading"),title=el("div");title.append(el("h2","Your AI tools"),el("p","Desktop apps and terminal tools, together.","hint"));
      const refresh=document.createElement("button");refresh.type="button";refresh.className="secondary";refresh.textContent="Refresh discovery";refresh.disabled=!isTauri();refresh.onclick=()=>void discover();heading.append(title,refresh);panel.append(heading);
      const disclosure=document.createElement("details");disclosure.className="catalog-note";const summary=document.createElement("summary");summary.textContent=`Discovery scope · ${inventory?.supportedCount||catalog.length} tools`;disclosure.append(summary,el("p",`${catalog.map(t=>t.name).join(" · ")}. Checks PATH, known app locations, and installation records. Custom installations, plugins, WSL, container internals, and AI websites are not automatically discovered.`,"hint"));panel.append(disclosure);
      toolsList=el("div","","installed-tools");panel.append(toolsList);
      if(current==="control"){const all=document.createElement("button");all.type="button";all.className="text-button";all.textContent="View all tools and locations";all.onclick=()=>navigate("tools");panel.append(all);}
      if(inventory?.warnings.length)panel.append(el("p",inventory.warnings.join(" "),"warning"));(controlLayout||container).append(panel);renderTools();
    } else {
      const panel=el("section","","activity-panel panel"),heading=el("div","","panel-heading");const title=el("h2",scope==="all"?"Running apps and processes":scope==="ai"?"Running AI apps":"Running AI & development apps");heading.append(title);
      const filters=el("div","","activity-filters");const search=document.createElement("input");search.type="search";search.placeholder="Search Chrome, Docker, tool, or PID…";search.setAttribute("aria-label","Search processes");search.value=processQuery;search.oninput=()=>{processQuery=search.value;processState.page=0;renderProcesses();};
      const sort=document.createElement("select");sort.setAttribute("aria-label","Process sort order");sort.add(new Option("RAM: high to low","memory"));sort.add(new Option("CPU: high to low","cpu"));sort.add(new Option("GPU: high to low","gpu"));sort.value=processSort;sort.onchange=()=>{processSort=sort.value as ProcessSort;processState.page=0;renderProcesses();};
      const filter=document.createElement("select");filter.setAttribute("aria-label","Process scope");filter.add(new Option("AI & development","workspace"));filter.add(new Option("AI only","ai"));filter.add(new Option("All processes","all"));filter.value=scope;filter.onchange=()=>{scope=processScope(filter.value);title.textContent=scope==="all"?"Running apps and processes":scope==="ai"?"Running AI apps":"Running AI & development apps";try{localStorage.setItem("roomit-process-scope",scope);}catch{}processState.page=0;renderProcesses();};filters.append(search,sort,filter);
      processes=el("div");panel.append(heading,el("p","AI & development includes recognized AI apps, CLI tools, IDEs, editors and Docker Desktop. Unrecognized apps are available under All processes. Device charts above always show their labeled device/AI totals. CPU is normalized to total device capacity. RAM is process resident memory; shared pages may be counted in several processes. Docker container internals and individual Chrome tabs are not separated.","hint"),filters,processes);container.append(panel);renderProcesses();
    }
    container.append(el("p","Not running does not mean unused. These measurements do not establish past use or whether a file can be safely removed.","hint usage-caveat"));updateLive();
  }
  return {show(view,nextReport,nextGroups){const changed=current!==view||report!==nextReport||groups!==nextGroups;current=view;if(!visible())pendingBreak=true;report=nextReport;groups=nextGroups;container.hidden=!["control","tools","activity"].includes(view);if(changed)render();clearTimeout(timer);if(visible()&&isTauri()){if(!inventory&&!inventoryBusy)void discover();void poll();}}};
}
