import {formatMemory,memoryCapacity,gpuText} from "./workspace-model";
import type {GpuReading} from "./workspace-model";
import {HISTORY_MS,memoryPercent,memoryBreakdown,usageSegments,validPercent} from "./resource-history";
import type {MemoryMode,UsagePoint,ResourceKey} from "./resource-history";
export interface ResourceSnapshot {sampledAtMs:number;cpuPercent:number|null;memoryUsed:string;memoryTotal:string;memoryAvailable?:string;memoryInstalled?:string|null;gpuAi?:GpuReading}
const el=(tag:string,text="",cls="")=>{const element=document.createElement(tag);element.textContent=text;element.className=cls;return element;};
export function percentText(value:number|null):string{return value===null?"Unavailable":`${value.toLocaleString("en-US",{maximumFractionDigits:1})}%`;}
export function memoryText(value:string,total:string,mode:MemoryMode):string {
  const pct=percentText(memoryPercent(value,total));
  return mode==="capacity"?formatMemory(value):mode==="percent"?pct:`${formatMemory(value)} · ${pct}`;
}
function chart(card:HTMLElement,key:ResourceKey,history:readonly UsagePoint[],empty:string):void {
  const wrapper=el("div","","resource-chart"),canvas=document.createElement("canvas");
  const segments=usageSegments(history,key),known=history.filter(p=>p[key]!==null);
  const values=known.map(p=>p[key]!);
  canvas.setAttribute("role","img");
  canvas.setAttribute("aria-label",`${key.toUpperCase()} · last 2 minutes · ${values.length?`${values.length} samples, minimum ${percentText(Math.min(...values))}, maximum ${percentText(Math.max(...values))}.`:empty} Missing measurements appear as gaps.`);
  const scale=el("div","","chart-scale");scale.append(el("span","100%"),el("span","0%"));
  wrapper.append(scale,canvas);
  if(!known.length)wrapper.append(el("span",empty,"chart-empty"));
  const times=el("div","","chart-times");times.append(el("span","−2 min"),el("span","Latest sample"));
  card.append(wrapper,times);
  requestAnimationFrame(()=>{
    if(!canvas.isConnected)return;
    const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
    if(!width||!height)return;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    const context=canvas.getContext("2d");if(!context)return;context.scale(dpr,dpr);
    context.strokeStyle="#2c384b";context.lineWidth=1;
    for(const y of [1,height/2,height-1]){context.beginPath();context.moveTo(0,y);context.lineTo(width,y);context.stroke();}
    const end=history[history.length-1]?.at??Date.now(),start=end-HISTORY_MS;
    const color=key==="ram"?"#8cb6ff":key==="gpu"?"#b4a4ff":"#5b9bff";
    for(const segment of segments){
      const point=(p:UsagePoint)=>({x:Math.max(1,Math.min(width-1,(p.at-start)/HISTORY_MS*width)),y:height-2-p[key]!/100*(height-4)});
      context.strokeStyle=color;context.lineWidth=2;context.setLineDash(key==="gpu"&&segment[0].gpuPartial?[4,3]:[]);
      context.beginPath();segment.forEach((p,index)=>{const {x,y}=point(p);if(!index)context.moveTo(x,y);else context.lineTo(x,y);});context.stroke();
      for(const p of segment.length===1?segment:[segment[segment.length-1]]){const {x,y}=point(p);context.fillStyle=color;context.beginPath();context.arc(x,y,2,0,Math.PI*2);context.fill();}
    }
  });
}
function card(label:string,value:string,hint:string,cls:string):HTMLElement {
  const node=el("section","",`resource-metric ${cls}`);node.setAttribute("aria-label",label);
  const heading=el("div","","resource-card-heading");heading.append(el("span",label));
  node.append(heading,el("strong",value,"resource-value"),el("small",hint,"resource-caption"));return node;
}
export function renderResourceCards(snapshot:ResourceSnapshot|null,history:readonly UsagePoint[],mode:MemoryMode,error:string,running:number):DocumentFragment {
  const fragment=document.createDocumentFragment(),live=error?null:snapshot;
  const cpu=card("CPU · device",live?percentText(validPercent(live.cpuPercent)):"Unavailable","Total CPU capacity","cpu-metric");
  chart(cpu,"cpu",history,live?.cpuPercent===null?"Waiting for first sample":"Measurement unavailable");
  const ram=live?memoryBreakdown(live.memoryTotal,live.memoryUsed,live.memoryAvailable):null;
  const ramCard=card("RAM · device",ram?memoryText(ram.used,ram.total,mode):"Unavailable","Memory used","ram-metric");
  const breakdown=document.createElement("dl");breakdown.className="ram-breakdown";
  for(const [name,value]of [["Free / available",ram?memoryText(ram.available,ram.total,mode):"Unavailable"],["System total",ram?memoryText(ram.total,ram.total,mode):"Unavailable"]]){
    const row=el("div");row.append(el("dt",name),el("dd",value));breakdown.append(row);
  }
  ramCard.append(breakdown);
  const capacity=el("p",live?memoryCapacity(live.memoryTotal,live.memoryInstalled):"No current memory measurement","ram-installed");
  capacity.title="Installed RAM may differ from the system total. Free / available memory includes cache that can be reclaimed. Percentages use the total RAM available to the operating system.";
  ramCard.append(capacity);chart(ramCard,"ram",history,"Measurement unavailable");
  const gpu=card("GPU · AI processes",gpuText(live?.gpuAi),`${running} running AI tools · on this device`,"gpu-metric");
  const gpuNote=live?.gpuAi?.status==="partial"?"Dashed line: partial measurement / lower bound":live?.gpuAi?.reason||"A missing GPU value does not mean zero usage.";
  gpu.title=error||live?.gpuAi?.reason||"No current GPU measurement";gpu.append(el("p",gpuNote,"gpu-chart-note"));
  chart(gpu,"gpu",history,live?.gpuAi?.status==="warmingUp"?"Waiting for measurement":"GPU unavailable");
  fragment.append(cpu,ramCard,gpu);return fragment;
}
