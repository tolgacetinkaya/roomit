import type { Finding, InspectionReport, Project } from "./report";

export type GroupKind = "project" | "ai" | "protected";
export interface ResultGroup {
  id: string;
  kind: GroupKind;
  title: string;
  location: string;
  tools: string[];
  logicalBytes: string;
  sizeComplete: boolean;
  items: Finding[];
}
export interface GroupedReport { projects: ResultGroup[]; ai: ResultGroup[]; protected: ResultGroup[] }

function pathKey(path: string): string {
  const normal = path.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  return /^[a-z]:/i.test(normal) || normal.startsWith("//") ? normal.toLowerCase() : normal;
}
function parentKey(path: string): string {
  if (!path || path === "/") return "";
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : slash === 0 ? "/" : path.slice(0, slash);
}
export function pathName(path: string): string {
  const clean = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return clean.slice(clean.lastIndexOf("/") + 1) || path;
}
function parentPath(path: string): string {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator > 0 ? path.slice(0, separator) : path;
}

/** Parent directory findings already contain the bytes of nested findings.
 * Retain the visible outer boundary once, before any category/tool grouping. */
export function topLevelFindings<T extends { path: string; kind: "file" | "directory" }>(findings: T[]): T[] {
  const directories = new Set(findings.filter((item) => item.kind === "directory").map((item) => pathKey(item.path)));
  const seen = new Set<string>();
  return findings.filter((item) => {
    const key = pathKey(item.path);
    if (seen.has(key)) return false;
    seen.add(key);
    for (let parent = parentKey(key); parent; parent = parentKey(parent)) {
      if (directories.has(parent)) return false;
    }
    return true;
  });
}

export function groupReport(report: InspectionReport): GroupedReport {
  const projects = new Map<string, Project>(report.projects.map((project) => [pathKey(project.path), project]));
  const groups = new Map<string, ResultGroup>();
  for (const item of topLevelFindings(report.findings)) {
    let project: Project | undefined;
    for (let key = pathKey(item.path); key && !project; key = parentKey(key)) project = projects.get(key);
    const ai = item.category.startsWith("ai");
    const kind: GroupKind = ai ? "ai" : item.disposition === "protected" ? "protected" : "project";
    const location = project?.path ?? parentPath(item.path);
    const id = ai ? `ai:${item.tool}` : `${kind}:${pathKey(location)}`;
    let group = groups.get(id);
    if (!group) {
      group = { id, kind, title: ai ? item.tool : pathName(location), location: ai ? "" : location,
        tools: [], logicalBytes: "0", sizeComplete: !report.resultsTruncated, items: [] };
      groups.set(id, group);
    }
    group.items.push(item);
    if (!group.tools.includes(item.tool)) group.tools.push(item.tool);
    group.logicalBytes = (BigInt(group.logicalBytes) + BigInt(item.logicalBytes)).toString();
    group.sizeComplete &&= item.sizeComplete;
  }
  const result: GroupedReport = { projects: [], ai: [], protected: [] };
  for (const group of groups.values()) {
    group.items.sort((a, b) => compareBytes(a.logicalBytes, b.logicalBytes) || a.path.localeCompare(b.path));
    result[group.kind === "project" ? "projects" : group.kind].push(group);
  }
  for (const items of [result.projects, result.ai, result.protected]) items.sort((a, b) => compareBytes(a.logicalBytes, b.logicalBytes) || a.id.localeCompare(b.id));
  return result;
}
function compareBytes(a: string, b: string): number { return BigInt(a) > BigInt(b) ? -1 : BigInt(a) < BigInt(b) ? 1 : 0; }
export function filterGroups(groups: ResultGroup[], query: string): ResultGroup[] {
  const key = query.trim().toLocaleLowerCase("tr");
  if (!key) return groups;
  return groups.filter((group) => [group.title, group.location, ...group.tools, ...group.items.map((item) => item.path)]
    .some((text) => text.toLocaleLowerCase("tr").includes(key)));
}
