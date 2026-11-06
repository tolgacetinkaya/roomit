import type { GroupedReport } from "./groups";
export interface MapNode { id: string; name: string; bytes: string; complete: boolean; path?: string; directory?: boolean; children?: MapNode[] }
export function aiMapTree(groups: GroupedReport): MapNode {
  const children = groups.ai.map(group => ({ id: group.id, name: group.title, bytes: group.logicalBytes, complete: group.sizeComplete,
    children: group.items.map(item => ({id:item.path, name:item.path.replace(/\\/g,"/").split("/").pop() || item.path, bytes:item.logicalBytes, complete:item.sizeComplete, path:item.path, directory:item.kind === "directory"})) }));
  return {id:"ai",name:"AI data",bytes:children.reduce((s,n)=>s+BigInt(n.bytes),0n).toString(),complete:children.every(n=>n.complete),children};
}
export function mapSlices(nodes: MapNode[], total: string): {node:MapNode;start:number;end:number}[] {
  const sum = BigInt(total); if (sum <= 0n) return [];
  let current = 0; return nodes.filter(n=>BigInt(n.bytes)>0n).map(node=>{
    const share = Number(BigInt(node.bytes)*1_000_000_000n/sum)/1_000_000_000;
    const start=current; current=Math.min(1,current+share); return {node,start,end:current};
  });
}
export function withRemainder(children: MapNode[], parent: MapNode): MapNode[] {
  const sum = children.reduce((s,n)=>s+BigInt(n.bytes),0n), rest=BigInt(parent.bytes)-sum;
  return rest>0n ? [...children,{id:parent.id+":remainder",name:"Other / unlisted",bytes:rest.toString(),complete:parent.complete}] : children;
}
