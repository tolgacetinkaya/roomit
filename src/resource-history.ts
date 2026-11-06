export type MemoryMode="capacity"|"percent"|"both";
export const HISTORY_MS=120_000;
export const HISTORY_LIMIT=121;
export type ResourceKey="cpu"|"ram"|"gpu";
export interface UsagePoint {at:number;cpu:number|null;ram:number|null;gpu:number|null;gpuPartial:boolean;breakBefore:boolean}
export function validPercent(value:unknown):number|null {
  return typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
}
export function memoryMode(value:string|null):MemoryMode {return value==="capacity"||value==="percent"?value:"both";}
function bytes(value:string):bigint|null {try{const result=BigInt(value);return result>=0n?result:null;}catch{return null;}}
export function memoryPercent(value:string,total:string):number|null {
  const amount=bytes(value),capacity=bytes(total);
  if(amount===null||capacity===null||capacity===0n)return null;
  // Process resident totals may overlap (shared pages); never cap to a fake 100%.
  return Number((amount*10_000n+capacity/2n)/capacity)/100;
}
export interface MemoryBreakdown {used:string;available:string;total:string;usedPercent:number;availablePercent:number}
export function memoryBreakdown(total:string,used:string,available?:string):MemoryBreakdown|null {
  const capacity=bytes(total),reported=bytes(used),free=available===undefined?null:bytes(available);
  if(capacity===null||capacity===0n||reported===null||reported>capacity||(available!==undefined&&(free===null||free>capacity)))return null;
  // "Boş / kullanılabilir" includes reusable cache. Make the complement and
  // denominator explicit instead of mixing strict free pages and available RAM.
  const availableBytes=free??capacity-reported,usedBytes=capacity-availableBytes;
  return {used:String(usedBytes),available:String(availableBytes),total:String(capacity),usedPercent:memoryPercent(String(usedBytes),total)!,availablePercent:memoryPercent(String(availableBytes),total)!};
}
export function recordUsage(history:readonly UsagePoint[],point:UsagePoint):UsagePoint[] {
  const last=history[history.length-1];
  if(!Number.isFinite(point.at)||point.at<=0||(last&&point.at<=last.at))return [...history];
  const clean={...point,cpu:validPercent(point.cpu),ram:validPercent(point.ram),gpu:validPercent(point.gpu)};
  return [...history.filter(p=>p.at>=point.at-HISTORY_MS),clean].slice(-HISTORY_LIMIT);
}
export function usageSegments(history:readonly UsagePoint[],key:ResourceKey):UsagePoint[][] {
  const segments:UsagePoint[][]=[];let current:UsagePoint[]=[];
  for(const point of history){
    const previous=current[current.length-1];
    if(point[key]===null||point.breakBefore||(previous&&point.at-previous.at>6000)||(key==="gpu"&&previous&&previous.gpuPartial!==point.gpuPartial)){
      if(current.length)segments.push(current);current=[];
    }
    if(point[key]!==null)current.push(point);
  }
  if(current.length)segments.push(current);return segments;
}
