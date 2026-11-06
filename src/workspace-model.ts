export type GpuStatus="measured"|"partial"|"warmingUp"|"noCounter"|"unavailable"|"unsupported"|"noProcess";
export interface GpuReading {percent:number|null;status:GpuStatus;reason:string;measuredProcesses:number;totalProcesses:number}
export interface ProcessRow { pid:number; name:string; toolId:string|null; cpuPercent:number|null; memoryBytes:string;gpu?:GpuReading }
export type ProcessSort="memory"|"cpu"|"gpu";
export function gpuText(reading?:GpuReading):string {
  if(!reading)return "Ölçülemiyor";
  if(reading.status==="noProcess")return "Çalışan süreç yok";
  if(reading.status==="warmingUp")return "Ölçüm bekleniyor";
  if((reading.status==="measured"||reading.status==="partial")&&reading.percent!==null&&Number.isFinite(reading.percent)&&reading.percent>=0&&reading.percent<=100){
    const value=`%${reading.percent.toLocaleString("tr-TR",{maximumFractionDigits:1})}`;
    return reading.status==="partial"?`En az ${value} · kısmi`:value;
  }
  return "Ölçülemiyor";
}
function gpuSortValue(reading?:GpuReading):number {
  return reading&&(reading.status==="measured"||reading.status==="partial")&&reading.percent!==null&&Number.isFinite(reading.percent)&&reading.percent>=0&&reading.percent<=100?reading.percent:-1;
}
export interface ToolUsage { processes:number; cpu:number|null; memory:string }
export function toolUsage(rows:ProcessRow[],id:string):ToolUsage {
  const selected=rows.filter(p=>p.toolId===id);
  return {processes:selected.length,cpu:selected.length&&selected.every(p=>p.cpuPercent!==null)?Math.min(100,selected.reduce((s,p)=>s+p.cpuPercent!,0)):null,memory:selected.reduce((s,p)=>s+BigInt(p.memoryBytes),0n).toString()};
}
export function processPage(rows:ProcessRow[],query:string,aiOnly:boolean,sort:ProcessSort,page:number):ProcessRow[]{
  const key=query.trim().toLocaleLowerCase("tr");
  const matched=rows.filter(p=>(!aiOnly||p.toolId)&&(!key||`${p.name} ${p.pid} ${p.toolId||""}`.toLocaleLowerCase("tr").includes(key)));
  matched.sort((a,b)=>sort==="gpu"?gpuSortValue(b.gpu)-gpuSortValue(a.gpu)||a.pid-b.pid:sort==="cpu"?(b.cpuPercent??-1)-(a.cpuPercent??-1)||a.pid-b.pid:BigInt(a.memoryBytes)>BigInt(b.memoryBytes)?-1:BigInt(a.memoryBytes)<BigInt(b.memoryBytes)?1:a.pid-b.pid);
  return matched.slice(page*50,(page+1)*50);
}
