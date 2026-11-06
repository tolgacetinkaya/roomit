export interface ProcessRow { pid:number; name:string; toolId:string|null; cpuPercent:number|null; memoryBytes:string }
export interface ToolUsage { processes:number; cpu:number|null; memory:string }
export function toolUsage(rows:ProcessRow[],id:string):ToolUsage {
  const selected=rows.filter(p=>p.toolId===id);
  return {processes:selected.length,cpu:selected.length&&selected.every(p=>p.cpuPercent!==null)?Math.min(100,selected.reduce((s,p)=>s+p.cpuPercent!,0)):null,memory:selected.reduce((s,p)=>s+BigInt(p.memoryBytes),0n).toString()};
}
export function processPage(rows:ProcessRow[],query:string,aiOnly:boolean,sort:"memory"|"cpu",page:number):ProcessRow[]{
  const key=query.trim().toLocaleLowerCase("tr");
  const matched=rows.filter(p=>(!aiOnly||p.toolId)&&(!key||`${p.name} ${p.pid} ${p.toolId||""}`.toLocaleLowerCase("tr").includes(key)));
  matched.sort((a,b)=>sort==="cpu"?(b.cpuPercent??-1)-(a.cpuPercent??-1)||a.pid-b.pid:BigInt(a.memoryBytes)>BigInt(b.memoryBytes)?-1:BigInt(a.memoryBytes)<BigInt(b.memoryBytes)?1:a.pid-b.pid);
  return matched.slice(page*50,(page+1)*50);
}
