/** A missing or inconsistent total must not produce a fabricated percentage. */
export function updateProgress(downloaded:number,total:number|null):number|null {
  if(!Number.isFinite(downloaded)||downloaded<0||total===null||!Number.isFinite(total)||total<=0||downloaded>total)return null;
  return Math.min(100,downloaded/total*100);
}
