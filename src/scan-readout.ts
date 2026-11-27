import type {GroupedReport} from "./groups";
import type {InspectionReport} from "./report";
import {storageCopy as copy} from "./locales/en-storage.ts";
import {pathName} from "./groups.ts";

interface Share {label:string; bytes:bigint; complete:boolean}
function largest(rows:Share[], restLabel:string):Share[] {
  const ordered=rows.filter(r=>r.bytes>0n).sort((a,b)=>a.bytes===b.bytes?a.label.localeCompare(b.label):a.bytes>b.bytes?-1:1);
  if(ordered.length<=4)return ordered;
  const rest=ordered.slice(3);
  return [...ordered.slice(0,3),{label:restLabel,bytes:rest.reduce((sum,r)=>sum+r.bytes,0n),complete:rest.every(r=>r.complete)}];
}

export function scanReadout(report:InspectionReport, groups:GroupedReport) {
  const tools=groups.ai;
  const scoped=report.scope==="ai" && Boolean(report.aiToolId);
  const scope=report.scope==="ai" ? (scoped ? pathName(report.root) : copy.allTools)
    : report.scope==="computer" ? copy.computer
    : (report.scope==="disk" ? copy.disk : copy.folder)+" · "+pathName(report.root);
  const total=scoped?BigInt(report.stats.totalLogicalBytes):tools.reduce((sum,g)=>sum+BigInt(g.logicalBytes),0n);
  const finished=report.totalSizeComplete && report.status==="completed";
  const complete=finished && (scoped || (!report.resultsTruncated && tools.every(g=>g.sizeComplete)));
  const roots=report.roots??[];
  const measuredRoots=roots.filter(r=>["completed","cancelled","limited"].includes(r.status));
  const missing=roots.length && !measuredRoots.length ? (roots.every(r=>r.status==="excluded")?copy.excluded:copy.unavailable) : null;
  // groupReport ranks tools by measured bytes before any display filter or sort.
  const largestTool=!scoped && tools[0] && BigInt(tools[0].logicalBytes)>0n ? tools[0] : null;
  const base={scope,missing,total,complete,largestTool,toolCount:tools.length,files:report.stats.filesScanned};
  const id=report.aiToolId || (tools.length===1?({"Claude Code":"claude-code",Codex:"codex"} as Record<string,string>)[tools[0].title]:undefined);
  const data=id?report.breakdown?.[id]:undefined;
  if(data){
    const rows=Object.entries(copy.categories).map(([key,label])=>({label,bytes:BigInt(data.categories[key]?.bytes??"0"),complete:data.complete && finished}));
    // Only draw parts of this total when the classified file bytes reconcile.
    if(total>0n && rows.reduce((sum,r)=>sum+r.bytes,0n)===total){
      return {...base,label:copy.byType,rows:largest(rows,copy.categories.other)};
    }
  }
  if(scoped || tools.length===1){
    const rows=scoped?measuredRoots:tools[0].items;
    return {...base,label:copy.byLocation,rows:largest(rows.map(r=>({label:pathName(r.path),bytes:BigInt(r.logicalBytes),complete:r.sizeComplete})),copy.otherLocations)};
  }
  return {...base,label:copy.byTool,rows:largest(tools.map(g=>({label:g.title,bytes:BigInt(g.logicalBytes),complete:g.sizeComplete})),copy.otherTools)};
}
