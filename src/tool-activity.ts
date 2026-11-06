import type {ProcessRow} from "./workspace-model";
export type ActivityState="live"|"paused"|"unavailable"|"waiting";
export function runningToolIds(rows:readonly ProcessRow[]):Set<string>{
  return new Set(rows.flatMap(row=>row.toolId?[row.toolId]:[]));
}
export function activityState(hasSample:boolean,paused:boolean,failed:boolean,pending:boolean):ActivityState{
  return paused?"paused":failed?"unavailable":!hasSample||pending?"waiting":"live";
}
export function prioritizeTools<T extends {id:string;name:string;evidence:readonly string[];installations:readonly string[]}>(tools:readonly T[],running:ReadonlySet<string>,state:ActivityState):T[]{
  return [...tools].sort((a,b)=>
    (state==="live"?Number(running.has(b.id))-Number(running.has(a.id)):0)||
    Number(Boolean(b.evidence.length||b.installations.length))-Number(Boolean(a.evidence.length||a.installations.length))||
    a.name.localeCompare(b.name,"en")||a.id.localeCompare(b.id,"en"));
}
