import type { GroupedReport } from "./groups";
import { pathName } from "./groups.ts";

export interface MapNode { id: string; name: string; bytes: string; complete: boolean; path?: string; directory?: boolean; children?: MapNode[] }

export function aiMapTree(groups: GroupedReport): MapNode {
  const children = groups.ai.map(group => {
    const locations = group.items.map(item => ({id:item.path, name:pathName(item.path), bytes:item.logicalBytes,
      complete:item.sizeComplete, path:item.path, directory:item.kind === "directory"}));
    const counts = new Map<string, number>();
    for (const {name} of locations) {
      const key = name.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const location of locations) {
      if (counts.get(location.name.toLowerCase())! > 1) {
        location.name = location.path.split(/[/\\]+/).filter(Boolean).slice(-2).join("/");
      }
    }
    return {id:group.id, name:group.title, bytes:group.logicalBytes, complete:group.sizeComplete, children:locations};
  });
  return {id:"ai",name:"AI data",bytes:children.reduce((s,n)=>s+BigInt(n.bytes),0n).toString(),complete:children.every(n=>n.complete),children};
}

// Palette slots follow tool identity across scans and themes, regardless of size or rank.
const toolSeries = [
  "Ollama", "Codex", "Claude Code", "Claude", "LM Studio", "Gemini CLI", "Qwen",
  "Windsurf", "ZCode", "GitHub Copilot", "OpenCode", "Open Design", "Cursor",
  "ChatGPT", "Aider", "Jan", "AnythingLLM", "Antigravity", "Trae", "Kimi",
];

export function storageSeries(name: string): number {
  return toolSeries.indexOf(name) + 1;
}

interface Tile {node:MapNode; x:number; y:number; width:number; height:number}

export function mapTiles(nodes: MapNode[]): Tile[] {
  const items = nodes.filter(node => BigInt(node.bytes) > 0n);
  const tiles: Tile[] = [];
  function split(start:number, end:number, total:bigint, x:number, y:number, width:number, height:number): void {
    if (end - start === 1) {
      tiles.push({node:items[start], x, y, width, height});
      return;
    }
    let middle = start + 1;
    let left = BigInt(items[start].bytes);
    while (middle < end - 1 && 2n * left + BigInt(items[middle].bytes) < total) {
      left += BigInt(items[middle++].bytes);
    }
    const right = total - left;
    // Compute both fractions directly so a tiny sibling survives a large rounded share.
    const first = Number(left) / Number(total), second = Number(right) / Number(total);
    if (width * 1.65 >= height) {
      split(start, middle, left, x, y, width * first, height);
      split(middle, end, right, x + width * first, y, width * second, height);
    } else {
      split(start, middle, left, x, y, width, height * first);
      split(middle, end, right, x, y + height * first, width, height * second);
    }
  }
  if (items.length) split(0, items.length, items.reduce((sum,n) => sum + BigInt(n.bytes), 0n), 0, 0, 100, 100);
  return tiles;
}

export function withRemainder(children: MapNode[], parent: MapNode): MapNode[] {
  const sum = children.reduce((s,n)=>s+BigInt(n.bytes),0n), rest=BigInt(parent.bytes)-sum;
  return rest>0n ? [...children,{id:parent.id+":remainder",name:"Other / unlisted",bytes:rest.toString(),complete:parent.complete}] : children;
}
