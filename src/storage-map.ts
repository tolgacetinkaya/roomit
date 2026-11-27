import { invoke, isTauri } from "@tauri-apps/api/core";
import type {InspectionReport} from "./report";
import {scanReadout} from "./scan-readout";
import {snapshotDate,snapshotDuration} from "./snapshot";
import {storageCopy as copy} from "./locales/en-storage";
import { formatBytes, formatCount, sizeLabel } from "./report";
import type { SizedEntry } from "./report";
import { pathName } from "./groups";
import { aiMapTree, mapTiles, storageSeries, withRemainder } from "./map-model";
import type { MapNode } from "./map-model";
import type { GroupedReport } from "./groups";
import { revealActions } from "./reveal";
import "./kesit-storage.css";

const seriesColor = (series: number) => `var(--storage-series-${series})`;
export function storageSummary(groups:GroupedReport|null, report:InspectionReport|null, open?:(tool?: string)=>void, compact=false):HTMLElement {
  const panel=document.createElement("section");panel.className="panel storage-summary scan-readout";
  if(!open){
    const header=document.createElement("div");header.className="panel-heading";
    const title=document.createElement("h2");title.textContent=copy.heading;header.append(title);
    panel.append(header);
  }
  if(!groups||!report){
    const note=document.createElement("p");note.className="hint";note.textContent=copy.unmeasured+" · "+copy.start;panel.append(note);return panel;
  }
  const model=scanReadout(report,groups);
  const scope=document.createElement("p");scope.className="readout-scope";
  scope.textContent=[copy.scan+" · "+model.scope,snapshotDate(report.scannedAtMs),snapshotDuration(report.scanDurationMs)].filter(Boolean).join("  ·  ");
  const size=document.createElement("strong");size.className="storage-total";
  if(model.missing || !model.complete) {
    size.textContent=model.missing??sizeLabel(String(model.total),false);
    size.classList.add("qualified-total");
  } else {
    const [amount,unit]=formatBytes(String(model.total)).split(" ");
    const suffix=document.createElement("small");suffix.textContent=unit;
    size.append(amount," ",suffix);
  }
  const counts=document.createElement("span");counts.className="hint";
  counts.textContent=formatCount(model.files)+" "+(model.files===1?copy.oneFile:copy.files);
  if(!(report.scope==="ai" && report.aiToolId))counts.textContent+=" · "+formatCount(model.toolCount)+" "+(model.toolCount===1?copy.tool:copy.tools);
  const hero=document.createElement("div");hero.className="storage-hero";
  const headline=document.createElement("div");headline.className="readout-total";headline.append(size,counts);hero.append(headline);panel.append(scope,hero);
  if(model.largestTool && !model.missing){
    const leader=document.createElement("p");leader.className="readout-leader";
    const name=document.createElement("strong");name.textContent=model.largestTool.title;
    const value=document.createElement("span");value.textContent=sizeLabel(model.largestTool.logicalBytes,model.largestTool.sizeComplete);
    leader.append(copy.largestTool+" · ",name," · ",value);
    headline.append(leader);
  }
  if(compact && model.rows.length)return panel;
  if(!model.rows.length){
    if(!model.missing && !model.total && model.complete){const note=document.createElement("p");note.className="hint";note.textContent=report.aiToolId?copy.emptySize:copy.empty;panel.append(note);}
    return panel;
  }
  const plot=document.createElement("div");plot.className="storage-plot";
  const label=document.createElement("h3");label.className="readout-label";label.textContent=model.label;
  const bar=document.createElement("div");bar.className="storage-share";bar.title=copy.rulerScale;
  const list=document.createElement("ul");list.className="storage-legend";
  for(const [index,row] of model.rows.entries()){
    const tool=model.label===copy.byTool?groups.ai.find(group=>group.title===row.label):undefined;
    const swatch=document.createElement("i");
    const size=sizeLabel(String(row.bytes),row.complete);
    const li=document.createElement("li"),name=document.createElement("span"),value=document.createElement("strong");
    name.textContent=row.label;value.textContent=size;
    let segment:HTMLElement;
    if(open && tool){
      const button=document.createElement("button");button.type="button";
      button.setAttribute("aria-label",copy.exploreTool(row.label,size));button.title=copy.exploreTool(row.label,size);
      button.onclick=()=>open(tool.id);segment=button;
      const link=document.createElement("button");link.type="button";link.className="storage-key";
      link.setAttribute("aria-label",button.title);link.onclick=button.onclick;
      link.append(swatch,name,value);li.append(link);
    }else{
      segment=document.createElement("span");li.append(swatch,name,value);
    }
    const color=seriesColor(model.label===copy.byTool?storageSeries(row.label):index+1);
    segment.style.flexBasis=Number(row.bytes)/Number(model.total)*100+"%";
    segment.style.background=swatch.style.background=color;bar.append(segment);
    list.append(li);
  }
  plot.append(label,bar,list);hero.append(plot);return panel;
}
export function renderStorageMap(groups:GroupedReport|null,indexId?:string,incomplete=false,initialTool?:string):HTMLElement {
  const root=groups ? aiMapTree(groups) : {id:"ai",name:"AI data",bytes:"0",complete:true,children:[]} as MapNode;
  root.complete &&= !incomplete;
  const panel=document.createElement("section"); panel.className="storage-map panel"; panel.setAttribute("aria-label",copy.mapLabel);
  const header=document.createElement("div"); header.className="panel-heading";
  const title=document.createElement("div"); const h=document.createElement("h2");h.textContent=copy.mapHeading;
  const sub=document.createElement("p");sub.className="hint";sub.textContent=copy.mapHint;title.append(h,sub);
  const back=document.createElement("button");back.type="button";back.className="secondary map-back";back.textContent=copy.mapLevelUp;header.append(title,back);
  const body=document.createElement("div");body.className="map-body";
  const visual=document.createElement("div");visual.className="storage-tiles";
  visual.setAttribute("role","group");visual.setAttribute("aria-label",copy.mapHeading);
  const detail=document.createElement("div");detail.className="map-detail";
  const crumb=document.createElement("p");crumb.className="map-crumb";
  const list=document.createElement("div");list.className="map-list";
  const note=document.createElement("p");note.className="hint map-note"; note.setAttribute("role","status");
  const actions=document.createElement("div");
  detail.append(crumb,list,actions,note);body.append(visual,detail);panel.append(header,body);
  const caveat=document.createElement("p");caveat.className="hint map-caveat";caveat.textContent="Logical file sizes, not reclaimable space or unused data. Models, history, and settings are protected.";panel.append(caveat);
  const stack:MapNode[]=[root];let revision=0;
  const selectedTool=root.children?.find(node=>node.id===initialTool);
  if(selectedTool)stack.push(selectedTool);
  async function open(node:MapNode):Promise<void>{
    const request=++revision;
    if(!node.children && !node.directory){
      actions.dataset.revealOwner="";actions.tabIndex=0;actions.replaceChildren(revealActions(node.path?[node.path]:[]));
      note.textContent=node.path||"Smaller items are grouped on the map. Find every measured result in Large items.";
      actions.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});return;
    }
    if(node.directory && !node.children){
      if(!indexId || !isTauri()){note.textContent="Start a new desktop scan to explore subfolders.";return;}
      note.textContent="Loading subfolders…";
      try{
        const entries=await invoke<SizedEntry[]>("map_children",{indexId,path:node.path});
        if(request!==revision || !panel.isConnected)return;
        node.children=withRemainder(entries.map(e=>({id:e.path,name:pathName(e.path),bytes:e.logicalBytes,complete:e.sizeComplete,path:e.path,directory:e.kind==="directory"})),node);
      }catch(error){if(request===revision)note.textContent=String(error);return;}
    }
    if(request!==revision)return;stack.push(node);draw();back.focus({preventScroll:true});
  }
  function draw():void{
    const current=stack[stack.length-1];const nodes=current.children||[];
    back.disabled=stack.length===1;crumb.textContent=stack.map(n=>n.name).join(" / ");crumb.title=current.path||crumb.textContent;
    if(groups)crumb.append(" · ",sizeLabel(current.bytes,current.complete));
    visual.replaceChildren();list.replaceChildren();actions.replaceChildren();note.textContent="";
    if(current.path){actions.dataset.revealOwner="";actions.tabIndex=0;actions.append(revealActions([current.path]));}
    const tiles=mapTiles(nodes);
    visual.hidden=!tiles.length;
    if(!tiles.length){
      const empty=document.createElement("p");empty.className="map-empty";empty.textContent=groups?copy.mapEmptyLevel:copy.mapEmpty;list.append(empty);
    }
    for(const [index,{node,x,y,width,height}] of tiles.entries()){
      const owner=stack[1]??node;
      const ink=seriesColor(storageSeries(owner.name));
      const color=stack.length===1?ink:`color-mix(in srgb, ${ink} ${100-(index%5)*10}%, var(--panel))`;
      const tile=document.createElement("button");tile.type="button";tile.className="storage-tile";
      tile.setAttribute("aria-label",`${node.name}, ${sizeLabel(node.bytes,node.complete)}`);
      tile.title=`${node.name} · ${sizeLabel(node.bytes,node.complete)}`;
      const tileLabel=document.createElement("span");tileLabel.className="map-tile-label";
      tileLabel.textContent=node.name;tile.append(tileLabel);
      Object.assign(tile.style,{left:x+"%",top:y+"%",width:width+"%",height:height+"%",backgroundColor:color});
      tile.addEventListener("click",()=>void open(node));visual.append(tile);
      const row=document.createElement("button");row.type="button";row.className="map-item secondary";
      const swatch=document.createElement("span");swatch.className="map-swatch";swatch.style.background=color;
      const label=document.createElement("span");label.textContent=node.name;
      const bytes=document.createElement("strong");bytes.textContent=sizeLabel(node.bytes,node.complete);
      row.onpointerenter=row.onfocus=()=>tile.classList.add("legend-highlight");
      row.onpointerleave=row.onblur=()=>tile.classList.remove("legend-highlight");
      row.append(swatch,label,bytes);row.addEventListener("click",()=>void open(node));list.append(row);
    }
  }
  back.addEventListener("click",()=>{revision++;if(stack.length>1)stack.pop();draw();if(stack.length===1)list.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});});
  panel.addEventListener("keydown",e=>{if(e.key==="Escape"&&stack.length>1){e.preventDefault();back.click();back.focus();}});draw();return panel;
}
