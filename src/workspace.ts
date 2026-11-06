import { invoke, isTauri } from "@tauri-apps/api/core";
import catalog from "./ai-catalog.json";
import { formatBytes, formatCount, sizeLabel } from "./report";
import type { InspectionReport } from "./report";
import type { GroupedReport } from "./groups";
import { renderStorageMap } from "./storage-map";
import { toolLogo, toolId } from "./tool-logos";
import { toolUsage, processPage } from "./workspace-model";
import type { ProcessRow } from "./workspace-model";
import { revealActions } from "./reveal";
export type WorkspaceView="control"|"tools"|"activity";
interface InstalledTool {id:string;name:string;kind:string;installations:string[];dataPaths:string[];evidence:string[]}
interface Inventory {tools:InstalledTool[];supportedCount:number;warnings:string[]}
interface NetworkRow {name:string;receivedPerSecond:number|null;sentPerSecond:number|null}
interface Snapshot {sampledAtMs:number;cpuPercent:number|null;memoryUsed:string;memoryTotal:string;processes:ProcessRow[];networks:NetworkRow[];gpuStatus:string;appNetworkStatus:string}
const el=(tag:string,text="",cls=""):HTMLElement=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
const percent=(n:number|null)=>n===null?"Ölçülüyor…":`%${n.toLocaleString("tr-TR",{maximumFractionDigits:1})}`;
const rate=(n:number|null)=>n===null?"Ölçülüyor…":`${formatBytes(Math.max(0,Math.round(n)).toString())}/sn`;
export function installWorkspace(container:HTMLElement,navigate:(view:"ai"|"tools"|"activity")=>void):{show:(view:string,report:InspectionReport|null,groups:GroupedReport|null)=>void}{
  let current:string="",report:InspectionReport|null=null,groups:GroupedReport|null=null;
  let inventory:Inventory|null=null,snapshot:Snapshot|null=null,inventoryError="",monitorError="",inventoryBusy=false,monitorBusy=false,paused=false;
  let networkName="",processQuery="",processSort:"memory"|"cpu"="memory",aiOnly=false,processIndex=0,timer:ReturnType<typeof setTimeout>|undefined;
  let runningIds="";
  let metrics:HTMLElement|null=null,toolsList:HTMLElement|null=null,processes:HTMLElement|null=null,sampleLabel:HTMLElement|null=null;
  const visible=()=>["control","tools","activity"].includes(current)&&!document.hidden;
  async function discover():Promise<void>{
    if(inventoryBusy)return;inventoryBusy=true;inventoryError="";renderTools();
    try{inventory=await invoke<Inventory>("discover_ai_tools");document.querySelector("#installed-count")!.textContent=String(inventory.tools.filter(t=>t.evidence.length||t.installations.length).length);}
    catch(e){inventoryError=String(e);}finally{inventoryBusy=false;renderTools();}
  }
  async function poll():Promise<void>{
    clearTimeout(timer);if(!visible()||paused||monitorBusy||!isTauri())return;monitorBusy=true;
    try{snapshot=await invoke<Snapshot>("resource_snapshot");monitorError="";
      const nextIds=[...new Set(snapshot.processes.filter(p=>p.toolId).map(p=>p.toolId!))].sort().join("|");
      if(nextIds!==runningIds){runningIds=nextIds;renderTools();}updateLive();}
    catch(e){monitorError=String(e);updateLive();}finally{monitorBusy=false;if(visible()&&!paused)timer=setTimeout(()=>void poll(),2000);}
  }
  document.addEventListener("visibilitychange",()=>{clearTimeout(timer);if(visible())void poll();});
  function metric(label:string,value:string,hint:string):HTMLElement{const card=el("div","","resource-metric");card.append(el("span",label),el("strong",value),el("small",hint));return card;}
  function updateLive():void{
    if(!visible())return;
    if(metrics){
      const running=snapshot?new Set(snapshot.processes.filter(p=>p.toolId).map(p=>p.toolId)).size:0;
      const available=snapshot?.networks||[];
      if(!available.some(n=>n.name===networkName))networkName=[...available].sort((a,b)=>(b.receivedPerSecond||0)+(b.sentPerSecond||0)-(a.receivedPerSecond||0)-(a.sentPerSecond||0))[0]?.name||"";
      const network=available.find(n=>n.name===networkName);
      metrics.replaceChildren(metric("CPU · cihaz",snapshot?percent(snapshot.cpuPercent):"—","Toplam işlemci kapasitesine göre"),
        metric("RAM · cihaz",snapshot?formatBytes(snapshot.memoryUsed):"—",snapshot?`${formatBytes(snapshot.memoryTotal)} toplam bellek`:"İlk ölçüm bekleniyor"),
        metric("Çalışan AI",snapshot?String(running):"—","Tanınan süreçler ve yardımcıları"),
        metric("Ağ · indirme",network?rate(network.receivedPerSecond):"—",network?.name||"Adaptör ölçümü bekleniyor"));
    }
    if(sampleLabel)sampleLabel.textContent=monitorError?`Ölçüm alınamadı: ${monitorError}`:paused?"Canlı ölçüm duraklatıldı.":snapshot?`Son ölçüm ${new Date(snapshot.sampledAtMs).toLocaleTimeString("tr-TR")} · 2 sn aralıkla` : "İlk ölçüm alınıyor…";
    for(const card of container.querySelectorAll<HTMLElement>("[data-tool-usage]")){
      const id=card.dataset.toolUsage!, usage=toolUsage(snapshot?.processes||[],id);
      card.textContent=snapshot?usage.processes?`${usage.processes} süreç · CPU ${percent(usage.cpu)} · RAM ${formatBytes(usage.memory)}`:"Şu anda çalışan süreç görülmedi":"Canlı ölçüm bekleniyor…";
    }
    if(processes)renderProcesses(true);
  }
  function renderTools():void{
    if(!toolsList)return;
    const opened=new Set(Array.from(toolsList.querySelectorAll<HTMLElement>("article[data-tool-id]")).filter(card=>card.querySelector<HTMLDetailsElement>("details")?.open).map(card=>card.dataset.toolId));
    toolsList.replaceChildren();toolsList.setAttribute("aria-busy",String(inventoryBusy));
    if(inventoryError){toolsList.append(el("p",`Araç keşfi başarısız: ${inventoryError}`,"warning"));return;}
    if(!inventory){toolsList.append(el("p",isTauri()?"Kurulu AI araçları aranıyor…":"Araç keşfi masaüstü uygulamasında çalışır.","hint"));return;}
    const detected=new Map(inventory.tools.map(t=>[t.id,t]));
    for(const id of new Set(snapshot?.processes.filter(p=>p.toolId).map(p=>p.toolId!)||[])){
      if(!detected.has(id)){const tool=catalog.find(t=>t.id===id);if(tool)detected.set(id,{id,name:tool.name,kind:tool.kind,installations:[],dataPaths:[],evidence:["Çalışan süreç"]});}
    }
    const tools=[...detected.values()].sort((a,b)=>Number(Boolean(b.evidence.length))-Number(Boolean(a.evidence.length))||a.name.localeCompare(b.name,"tr"));
    const display=tools;
    if(!tools.length)toolsList.append(el("p","Desteklenen katalogda bir kurulum veya veri klasörü bulunamadı. Özel / taşınabilir kurulumlar tespit edilemeyebilir.","hint"));
    for(const tool of display){
      const card=el("article","","installed-tool");card.dataset.toolId=tool.id;const heading=el("div","","installed-tool-heading"),copy=el("div");copy.append(el("h3",tool.name),el("p",tool.kind,"hint"));
      const badge=el("span",tool.evidence.length||tool.installations.length?"Tespit edildi":"Yalnızca veri",tool.evidence.length?"tool-state":"tool-state data-only");heading.append(toolLogo(tool.id),copy,badge);
      const usage=el("p","","tool-live");usage.dataset.toolUsage=tool.id;
      const measured=groups?.ai.filter(g=>toolId(g.title)===tool.id)||[];
      const storage=measured.reduce((s,g)=>s+BigInt(g.logicalBytes),0n);
      const bytes=el("div","","tool-storage");bytes.append(el("span","Taranan veri"),el("strong",measured.length?sizeLabel(storage.toString(),Boolean(report?.totalSizeComplete)&&!report?.resultsTruncated&&measured.every(g=>g.sizeComplete)):"Henüz ölçülmedi"));
      const details=document.createElement("details");details.className="tool-evidence";details.open=opened.has(tool.id);const summary=document.createElement("summary");summary.textContent="Tespit kanıtı ve konumlar";details.append(summary);
      for(const evidence of tool.evidence)details.append(el("p",evidence,"hint"));
      if(!tool.evidence.length&&!tool.installations.length)details.append(el("p","Veri klasörü kurulum kanıtı değildir; eski bir kurulumdan kalmış olabilir.","hint"));
      const paths=[...new Set([...tool.installations,...tool.dataPaths])];
      for(const path of paths)details.append(el("p",path,"report-path"));
      details.append(revealActions(paths));card.append(heading,usage,bytes,details);toolsList.append(card);
    }
    updateLive();
  }
  function renderProcesses(keepFocus=false):void{
    if(!processes || (keepFocus && processes.contains(document.activeElement)))return;processes.replaceChildren();
    if(!snapshot){processes.append(el("p",monitorError||"Süreç ölçümleri bekleniyor…","hint"));return;}
    const all=snapshot.processes;let page=processPage(all,processQuery,aiOnly,processSort,processIndex);
    while(!page.length&&processIndex>0){processIndex--;page=processPage(all,processQuery,aiOnly,processSort,processIndex);}
    const table=document.createElement("table");table.className="process-table";
    const head=document.createElement("thead"),tr=document.createElement("tr");for(const label of ["Süreç / uygulama","PID","CPU","RAM"]){const th=document.createElement("th");th.scope="col";th.textContent=label;tr.append(th);}head.append(tr);table.append(head);
    const tbody=document.createElement("tbody");
    for(const p of page){const row=document.createElement("tr"),name=document.createElement("td");const title=el("span",p.name,"process-name");
      if(p.toolId){name.append(toolLogo(p.toolId,20));title.append(el("small",catalog.find(t=>t.id===p.toolId)?.name||p.toolId));}
      else if(p.name.toLowerCase().includes("chrome"))name.append(toolLogo("chrome",20));
      else if(p.name.toLowerCase().includes("docker"))name.append(toolLogo("docker",20));
      name.append(title);row.append(name);for(const value of [String(p.pid),percent(p.cpuPercent),formatBytes(p.memoryBytes)]){const td=document.createElement("td");td.textContent=value;row.append(td);}tbody.append(row);}
    table.append(tbody);processes.append(table);
    if(!page.length)processes.append(el("p","Aramana uyan süreç yok.","hint"));
    const pager=el("div","","process-pager");
    const previous=document.createElement("button"),next=document.createElement("button");previous.type=next.type="button";previous.className=next.className="secondary";previous.textContent="Önceki";next.textContent="Sonraki";previous.disabled=processIndex===0;next.disabled=processPage(all,processQuery,aiOnly,processSort,processIndex+1).length===0;
    previous.onclick=()=>{processIndex--;renderProcesses();};next.onclick=()=>{processIndex++;renderProcesses();};pager.append(previous,el("span",`Sayfa ${processIndex+1} · ${formatCount(all.length)} erişilebilir süreç`),next);processes.append(pager);
    const networks=el("div","","network-list");const label=document.createElement("label");label.textContent="Ağ adaptörü ";const select=document.createElement("select");select.setAttribute("aria-label","Ağ adaptörü");
    for(const n of snapshot.networks)select.add(new Option(n.name,n.name));select.value=networkName;select.onchange=()=>{networkName=select.value;updateLive();};label.append(select);networks.append(label);
    const network=snapshot.networks.find(n=>n.name===networkName);networks.append(el("p",network?`İndirme ${rate(network.receivedPerSecond)} · Gönderme ${rate(network.sentPerSecond)}`:"Ağ adaptörü bulunamadı.","hint"));
    networks.append(el("p",snapshot.appNetworkStatus,"hint"),el("p",`GPU: ${snapshot.gpuStatus}`,"hint"));processes.append(networks);
  }
  function render():void{
    container.replaceChildren();metrics=null;toolsList=null;processes=null;sampleLabel=null;
    container.classList.toggle("control-workspace",current==="control");
    if(!["control","tools","activity"].includes(current))return;
    const liveHeader=el("div","","workspace-live-heading");sampleLabel=el("span","","hint");liveHeader.append(sampleLabel);
    const pause=document.createElement("button");pause.type="button";pause.className="text-button";pause.textContent=paused?"Ölçümü sürdür":"Ölçümü duraklat";pause.disabled=!isTauri();pause.onclick=()=>{paused=!paused;pause.textContent=paused?"Ölçümü sürdür":"Ölçümü duraklat";clearTimeout(timer);updateLive();if(!paused)void poll();};liveHeader.append(pause);
    metrics=el("div","","resource-grid");container.append(liveHeader,metrics);
    const controlLayout=current==="control"?el("div","","control-layout"):null;
    if(controlLayout){controlLayout.append(renderStorageMap(groups,report?.sizeIndexId, Boolean(report && (!report.totalSizeComplete || report.status!=="completed" || report.resultsTruncated))));container.append(controlLayout);}
    if(current!=="activity"){
      const panel=el("section","","tool-inventory panel"),heading=el("div","","panel-heading"),title=el("div");title.append(el("h2","AI araçların"),el("p","Masaüstü uygulamaları ve terminal araçları birlikte.","hint"));
      const refresh=document.createElement("button");refresh.type="button";refresh.className="secondary";refresh.textContent="Araçları yeniden bul";refresh.disabled=!isTauri();refresh.onclick=()=>void discover();heading.append(title,refresh);panel.append(heading);
      const disclosure=document.createElement("details");disclosure.className="catalog-note";const summary=document.createElement("summary");summary.textContent=`Keşif kapsamı · ${inventory?.supportedCount||catalog.length} araç`;disclosure.append(summary,el("p",`${catalog.map(t=>t.name).join(" · ")}. PATH, bilinen uygulama konumları ve kurulum kayıtları kontrol edilir. Özel kurulumlar, eklentiler, WSL, container içleri ve tarayıcıdaki AI siteleri otomatik keşfedilmez.`,"hint"));panel.append(disclosure);
      toolsList=el("div","","installed-tools");panel.append(toolsList);
      if(current==="control"){const all=document.createElement("button");all.type="button";all.className="text-button";all.textContent="Tüm araçları ve konumlarını gör";all.onclick=()=>navigate("tools");panel.append(all);}
      if(inventory?.warnings.length)panel.append(el("p",inventory.warnings.join(" "),"warning"));(controlLayout||container).append(panel);renderTools();
    } else {
      const panel=el("section","","activity-panel panel"),heading=el("div","","panel-heading");heading.append(el("h2","Çalışan uygulamalar ve süreçler"));
      const filters=el("div","","activity-filters");const search=document.createElement("input");search.type="search";search.placeholder="Chrome, Docker, araç veya PID ara…";search.setAttribute("aria-label","Süreç ara");search.value=processQuery;search.oninput=()=>{processQuery=search.value;processIndex=0;renderProcesses();};
      const sort=document.createElement("select");sort.setAttribute("aria-label","Süreç sıralaması");sort.add(new Option("RAM: yüksekten düşüğe","memory"));sort.add(new Option("CPU: yüksekten düşüğe","cpu"));sort.value=processSort;sort.onchange=()=>{processSort=sort.value as "memory"|"cpu";processIndex=0;renderProcesses();};
      const only=document.createElement("label"),check=document.createElement("input");check.type="checkbox";check.checked=aiOnly;check.onchange=()=>{aiOnly=check.checked;processIndex=0;renderProcesses();};only.append(check,document.createTextNode("Yalnızca AI"));filters.append(search,sort,only);
      processes=el("div");panel.append(heading,el("p","CPU toplam cihaz kapasitesine göredir. RAM süreçlerin yerleşik belleğidir; paylaşılan sayfalar birden fazla süreçte sayılabilir. Docker container içi ve Chrome sekme bazlı ayrım yapılmaz.","hint"),filters,processes);container.append(panel);renderProcesses();
    }
    container.append(el("p","Çalışmıyor olması kullanılmadığı anlamına gelmez. Geçmiş kullanım ve dosyanın güvenle kaldırılabileceği bu ölçümlerden belirlenmez.","hint usage-caveat"));updateLive();
  }
  return {show(view,nextReport,nextGroups){const changed=current!==view||report!==nextReport||groups!==nextGroups;current=view;report=nextReport;groups=nextGroups;container.hidden=!["control","tools","activity"].includes(view);if(changed)render();clearTimeout(timer);if(visible()&&isTauri()){if(!inventory&&!inventoryBusy)void discover();void poll();}}};
}
