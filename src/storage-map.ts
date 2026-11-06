import { invoke, isTauri } from "@tauri-apps/api/core";
import { formatBytes, sizeLabel } from "./report";
import type { SizedEntry } from "./report";
import { pathName } from "./groups";
import { aiMapTree, mapSlices, withRemainder } from "./map-model";
import type { MapNode } from "./map-model";
import type { GroupedReport } from "./groups";
import { revealActions } from "./reveal";
const NS="http://www.w3.org/2000/svg";
const colors=["#508dff","#66bcff","#7180ed","#4274cb","#89aef4","#386895","#accaff","#5e69ae"];
function sector(start:number,end:number,inner:number,outer:number):string {
  const a=start*Math.PI*2-Math.PI/2, b=(end-start>=.999999 ? end-.000001 : end)*Math.PI*2-Math.PI/2;
  const p=(r:number,t:number)=>`${200+r*Math.cos(t)},${200+r*Math.sin(t)}`;
  return `M${p(outer,a)} A${outer},${outer} 0 ${b-a>Math.PI?1:0} 1 ${p(outer,b)} L${p(inner,b)} A${inner},${inner} 0 ${b-a>Math.PI?1:0} 0 ${p(inner,a)} Z`;
}
export function renderStorageMap(groups:GroupedReport|null,indexId?:string,incomplete=false):HTMLElement {
  const root=groups ? aiMapTree(groups) : {id:"ai",name:"AI data",bytes:"0",complete:true,children:[]} as MapNode;
  root.complete &&= !incomplete;
  const panel=document.createElement("section"); panel.className="storage-map panel"; panel.setAttribute("aria-label","Interactive AI storage map");
  const header=document.createElement("div"); header.className="panel-heading";
  const title=document.createElement("div"); const h=document.createElement("h2");h.textContent="AI space map";
  const sub=document.createElement("p");sub.className="hint";sub.textContent="Select a sector to explore tools and folders.";title.append(h,sub);
  const back=document.createElement("button");back.type="button";back.className="secondary map-back";back.textContent="Up one level";header.append(title,back);
  const body=document.createElement("div");body.className="map-body";
  const visual=document.createElement("div");visual.className="map-visual";
  const svg=document.createElementNS(NS,"svg");svg.setAttribute("viewBox","0 0 400 400");svg.setAttribute("role","group");svg.setAttribute("aria-label","AI data by size");
  const center=document.createElement("div");center.className="map-center";
  const centerLabel=document.createElement("span"),centerBytes=document.createElement("strong"),centerHint=document.createElement("small");center.append(centerLabel,centerBytes,centerHint);visual.append(svg,center);
  const detail=document.createElement("div");detail.className="map-detail";
  const crumb=document.createElement("p");crumb.className="map-crumb";
  const list=document.createElement("div");list.className="map-list";
  const note=document.createElement("p");note.className="hint map-note"; note.setAttribute("role","status");
  const actions=document.createElement("div");
  detail.append(crumb,list,actions,note);body.append(visual,detail);panel.append(header,body);
  const caveat=document.createElement("p");caveat.className="hint map-caveat";caveat.textContent="Logical file sizes, not reclaimable space or unused data. Models, history, and settings are protected.";panel.append(caveat);
  const stack:MapNode[]=[root];let revision=0;
  async function open(node:MapNode):Promise<void>{
    if(!node.children && !node.directory){
      actions.dataset.revealOwner="";actions.tabIndex=0;actions.replaceChildren(revealActions(node.path?[node.path]:[]));
      note.textContent=node.path||"Smaller items are grouped on the map. Find every measured result in Large items.";
      actions.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});return;
    }
    const request=++revision;
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
    centerLabel.textContent=current.name;centerBytes.textContent=groups?formatBytes(current.bytes):"—";centerHint.textContent=groups?(current.complete?"Scanned AI data":"Partial measurement"):"Not scanned yet";
    svg.replaceChildren();list.replaceChildren();actions.replaceChildren();note.textContent="";
    if(current.path){actions.dataset.revealOwner="";actions.tabIndex=0;actions.append(revealActions([current.path]));}
    const slices=mapSlices(nodes,current.bytes);
    if(!slices.length){const circle=document.createElementNS(NS,"circle");circle.setAttribute("cx","200");circle.setAttribute("cy","200");circle.setAttribute("r","137");circle.setAttribute("fill","none");circle.setAttribute("stroke","#273346");circle.setAttribute("stroke-width","58");svg.append(circle);
      const empty=document.createElement("p");empty.className="map-empty";empty.textContent=groups?"No measured child items at this level.":"Scan AI data folders to create your map.";list.append(empty);}
    for(const [i,slice]of slices.entries()){
      const node=slice.node,color=colors[i%colors.length];
      const path=document.createElementNS(NS,"path");path.setAttribute("d",sector(slice.start,slice.end,99,175));path.setAttribute("fill",color);path.setAttribute("class","map-segment");path.setAttribute("role","button");path.setAttribute("tabindex","0");path.setAttribute("aria-label",`${node.name}, ${sizeLabel(node.bytes,node.complete)}`);
      const tip=document.createElementNS(NS,"title");tip.textContent=`${node.name} · ${sizeLabel(node.bytes,node.complete)}`;path.append(tip);
      const show=()=>{centerLabel.textContent=node.name;centerBytes.textContent=formatBytes(node.bytes);centerHint.textContent=node.directory||node.children?"Select for details":"File";};
      const reset=()=>{centerLabel.textContent=current.name;centerBytes.textContent=formatBytes(current.bytes);centerHint.textContent=current.complete?"Scanned AI data":"Partial measurement";};
      path.addEventListener("pointerenter",show);path.addEventListener("pointerleave",reset);path.addEventListener("focus",show);path.addEventListener("blur",reset);
      path.addEventListener("click",()=>void open(node));path.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();void open(node);}});svg.append(path);
      // Outer ring previews the known next level; every arc uses measured bytes.
      if(node.children){for(const child of mapSlices(node.children,node.bytes)){
        const p=document.createElementNS(NS,"path");p.setAttribute("d",sector(slice.start+(slice.end-slice.start)*child.start,slice.start+(slice.end-slice.start)*child.end,180,195));p.setAttribute("fill",color);p.setAttribute("opacity",".5");p.setAttribute("pointer-events","none");svg.append(p);
      }}
      const row=document.createElement("button");row.type="button";row.className="map-item secondary";
      const swatch=document.createElement("span");swatch.className="map-swatch";swatch.style.background=color;
      const label=document.createElement("span");label.textContent=node.name;label.title=node.path||node.name;
      const bytes=document.createElement("strong");bytes.textContent=sizeLabel(node.bytes,node.complete);
      row.append(swatch,label,bytes);row.addEventListener("click",()=>{if(node.children||node.directory)void open(node);else{actions.dataset.revealOwner="";actions.replaceChildren(revealActions(node.path?[node.path]:[]));note.textContent=node.path||"Smaller items are grouped on the map. Find every measured result in Large items.";}});list.append(row);
    }
  }
  back.addEventListener("click",()=>{revision++;if(stack.length>1)stack.pop();draw();if(stack.length===1)list.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});});
  panel.addEventListener("keydown",e=>{if(e.key==="Escape"&&stack.length>1){e.preventDefault();back.click();back.focus();}});draw();return panel;
}
