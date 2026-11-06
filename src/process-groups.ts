import type {ProcessRow,GpuReading,ProcessSort} from "./workspace-model";

export interface AppGroup {
  id:string;name:string;toolId:string|null;processes:ProcessRow[];
  cpuPercent:number|null;memoryBytes:string;gpu?:GpuReading;
}
export type ProcessScope="workspace"|"ai"|"all";
export function processScope(value:unknown):ProcessScope {return value==="ai"||value==="all"?value:"workspace";}
export const GROUP_PAGE_SIZE=50;
export const MEMBER_PAGE_SIZE=50;
export const processGroupId=(row:ProcessRow):string=>row.appId|| (row.toolId?`tool:${row.toolId}`:`process:${row.pid}`);
const gpuValue=(gpu?:GpuReading):number=>gpu&&(gpu.status==="measured"||gpu.status==="partial")&&gpu.percent!==null&&Number.isFinite(gpu.percent)&&gpu.percent>=0&&gpu.percent<=100?gpu.percent:-1;
function order(a:{cpuPercent:number|null;memoryBytes:string;gpu?:GpuReading},b:typeof a,sort:ProcessSort):number {
  if(sort==="cpu")return (b.cpuPercent??-1)-(a.cpuPercent??-1);
  if(sort==="gpu")return gpuValue(b.gpu)-gpuValue(a.gpu);
  return BigInt(a.memoryBytes)>BigInt(b.memoryBytes)?-1:BigInt(a.memoryBytes)<BigInt(b.memoryBytes)?1:0;
}
export function groupProcesses(rows:readonly ProcessRow[],readings:ReadonlyMap<string,GpuReading>,names:ReadonlyMap<string,string>=new Map()):AppGroup[] {
  const groups=new Map<string,AppGroup>();
  for(const row of rows){
    const id=processGroupId(row);
    let group=groups.get(id);
    if(!group){group={id,name:row.toolId?names.get(row.toolId)||row.appName||row.name:row.appName||row.name,toolId:row.toolId,processes:[],cpuPercent:0,memoryBytes:"0"};groups.set(id,group);}
    group.processes.push(row);
    group.memoryBytes=(BigInt(group.memoryBytes)+BigInt(row.memoryBytes)).toString();
    group.cpuPercent=group.cpuPercent===null||row.cpuPercent===null||!Number.isFinite(row.cpuPercent)?null:Math.min(100,group.cpuPercent+row.cpuPercent);
  }
  for(const group of groups.values()){
    // GPU percentages cannot be added: process peaks may be on different
    // engines/adapters. Use the sampler's engine-aware group measurement.
    group.gpu=readings.get(group.id)||(group.processes.length===1?group.processes[0].gpu:undefined);
  }
  return [...groups.values()];
}
export function groupPage(groups:readonly AppGroup[],query:string,scope:ProcessScope,sort:ProcessSort,page:number):{groups:AppGroup[];total:number;page:number;pages:number} {
  const key=query.trim().toLocaleLowerCase("en");
  const matched=groups.filter(g=>(scope==="all"||g.toolId||scope==="workspace"&&g.processes.some(p=>p.appCategory==="ai"||p.appCategory==="development"))&&(!key||[g.name,g.toolId||"",...g.processes.map(p=>`${p.name} ${p.pid}`)].some(text=>text.toLocaleLowerCase("en").includes(key))));
  matched.sort((a,b)=>order(a,b,sort)||a.name.localeCompare(b.name,"en")||a.id.localeCompare(b.id));
  const pages=Math.max(1,Math.ceil(matched.length/GROUP_PAGE_SIZE)),index=Math.max(0,Math.min(page,pages-1));
  return {groups:matched.slice(index*GROUP_PAGE_SIZE,(index+1)*GROUP_PAGE_SIZE),total:matched.length,page:index,pages};
}
export function memberPage(group:AppGroup,sort:ProcessSort,page:number,query:string):{rows:ProcessRow[];page:number;pages:number;start:number} {
  const key=query.trim().toLocaleLowerCase("en");
  const matches=(row:ProcessRow)=>key&&`${row.name} ${row.pid}`.toLocaleLowerCase("en").includes(key)?1:0;
  const pages=Math.max(1,Math.ceil(group.processes.length/MEMBER_PAGE_SIZE)),index=Math.max(0,Math.min(page,pages-1)),start=index*MEMBER_PAGE_SIZE;
  return {rows:[...group.processes].sort((a,b)=>matches(b)-matches(a)||order(a,b,sort)||a.pid-b.pid).slice(start,start+MEMBER_PAGE_SIZE),page:index,pages,start};
}
