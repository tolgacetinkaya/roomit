import {pathKey, pathName} from "./groups.ts";
import type {GroupedReport} from "./groups.ts";
import type {InspectionReport} from "./report";

export interface Workspace {path:string; running:string[]; recent:string[]; lastUsed:number|null; sessionFiles?:string[]}
export interface ProjectDiscovery {projects:Workspace[]; warnings:string[]}
export interface LocationContext {project?:string; linkedProjects?:string[]; tools:string[]}

export function locationLookup(report:InspectionReport, groups:GroupedReport, workspaces:Workspace[]) {
  const projects=new Map<string,LocationContext>();
  const owners=new Map<string,string>();
  for(const project of report.projects) projects.set(pathKey(project.path),{project:project.path,tools:[]});
  for(const item of workspaces) projects.set(pathKey(item.path),{project:item.path,tools:[...new Set([...item.running,...item.recent])]});
  for(const group of groups.ai) for(const item of group.items) owners.set(pathKey(item.path),group.title);
  const chatFolders=new Map<string,string>();
  for(const [path] of Object.entries(report.breakdown?.["claude-code"]?.projects??{})) {
    chatFolders.set(pathKey(path),pathName(path));
  }
  // A dated chat folder can contain sessions from several projects.
  const sessions=new Map<string,Set<string>>();
  for(const workspace of workspaces)for(const file of workspace.sessionFiles??[]){
    const key=pathKey(file);
    const ancestors:string[]=[];
    for(let p=key;p;p=p.slice(0,Math.max(0,p.lastIndexOf("/")))){
      ancestors.push(p);
      if(owners.get(p)==="Codex"){
        for(const ancestor of ancestors){
          const links=sessions.get(ancestor)??new Set<string>();links.add(workspace.path);sessions.set(ancestor,links);
        }
        break;
      }
    }
  }
  return (path:string):LocationContext=>{
    const key=pathKey(path);
    let project:LocationContext|undefined, tool:string|undefined, storageProject:string|undefined;
    for(let ancestor=key;ancestor;){
      project??=projects.get(ancestor);
      storageProject??=chatFolders.get(ancestor);
      const owner=owners.get(ancestor);
      if(owner&&!tool) {
        tool=owner;
        if(owner==="Open Design"){
          const managed=key.slice(ancestor.length+1).match(/^(?:namespaces\/[^/]+\/data\/)?projects\/([^/]+)/);
          storageProject??=managed?.[1];
        }
      }
      const split=ancestor.lastIndexOf("/");
      if(split<=0)break;
      ancestor=ancestor.slice(0,split);
    }
    return {project:project?.project??storageProject,linkedProjects:[...(sessions.get(key)??[])],tools:[...new Set([...(project?.tools??[]),...(tool?[tool]:[])])]};
  };
}
