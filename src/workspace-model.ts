export type GpuStatus="measured"|"partial"|"warmingUp"|"noCounter"|"unavailable"|"unsupported"|"noProcess";
export interface GpuReading {percent:number|null;status:GpuStatus;reason:string;measuredProcesses:number;totalProcesses:number}
export interface ProcessRow { pid:number; name:string; toolId:string|null; cpuPercent:number|null; memoryBytes:string;gpu?:GpuReading;appId?:string;appName?:string;appCategory?:"ai"|"development"|"other" }
export type ProcessSort="memory"|"cpu"|"gpu";
const memoryNumber=new Intl.NumberFormat("en-US");
// RAM follows binary units. Disk sizes and the user's decimal GB filter use
// their existing formatter; neither can be reused for physical/process memory.
export function formatMemory(value:string):string {
  const bytes=BigInt(value);
  if(bytes<0n)throw new RangeError("Memory byte count must be nonnegative");
  const units=["B","KiB","MiB","GiB","TiB","PiB","EiB"];
  let unit=0,divisor=1n;
  while(bytes>=divisor*1024n&&unit<units.length-1){divisor*=1024n;unit++;}
  if(!unit)return `${memoryNumber.format(bytes)} B`;
  const rounded=(bytes*100n+divisor/2n)/divisor;
  const fraction=(rounded%100n).toString().padStart(2,"0").replace(/0+$/,"");
  return `${memoryNumber.format(rounded/100n)}${fraction?`.${fraction}`:""} ${units[unit]}`;
}
export function memoryCapacity(total:string,installed?:string|null):string {
  // Installed capacity and OS-visible capacity differ when firmware reserves
  // memory. Do not round the OS total up to the user's expected DIMM capacity.
  if(installed&&BigInt(installed)>0n&&BigInt(installed)>=BigInt(total))return `${formatMemory(installed)} installed · ${formatMemory(total)} system memory`;
  return `${formatMemory(total)} system memory · Installed RAM unavailable`;
}
export function gpuText(reading?:GpuReading):string {
  if(!reading)return "Unavailable";
  if(reading.status==="noProcess")return "No running processes";
  if(reading.status==="warmingUp")return "Waiting for measurement";
  if((reading.status==="measured"||reading.status==="partial")&&reading.percent!==null&&Number.isFinite(reading.percent)&&reading.percent>=0&&reading.percent<=100){
    const value=`${reading.percent.toLocaleString("en-US",{maximumFractionDigits:1})}%`;
    return reading.status==="partial"?`At least ${value} · partial`:value;
  }
  return "Unavailable";
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
  const key=query.trim().toLocaleLowerCase("en");
  const matched=rows.filter(p=>(!aiOnly||p.toolId)&&(!key||`${p.name} ${p.pid} ${p.toolId||""}`.toLocaleLowerCase("en").includes(key)));
  matched.sort((a,b)=>sort==="gpu"?gpuSortValue(b.gpu)-gpuSortValue(a.gpu)||a.pid-b.pid:sort==="cpu"?(b.cpuPercent??-1)-(a.cpuPercent??-1)||a.pid-b.pid:BigInt(a.memoryBytes)>BigInt(b.memoryBytes)?-1:BigInt(a.memoryBytes)<BigInt(b.memoryBytes)?1:a.pid-b.pid);
  return matched.slice(page*50,(page+1)*50);
}
