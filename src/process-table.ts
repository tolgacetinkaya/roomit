import {gpuText} from "./workspace-model";
import type {ProcessRow,ProcessSort} from "./workspace-model";
import {memoryText,percentText} from "./resource-cards";
import type {MemoryMode} from "./resource-history";
import {groupPage,memberPage} from "./process-groups";
import type {AppGroup} from "./process-groups";
import {toolLogo} from "./tool-logos";
import {icon} from "./icons";
import {formatCount} from "./report";
import "./process-table.css";

export interface ProcessTableState {expanded:Set<string>;memberPages:Map<string,number>;page:number;filterKey?:string}
interface Input {groups:AppGroup[];query:string;scope:import("./process-groups").ProcessScope;sort:ProcessSort;totalMemory:string;mode:MemoryMode;error:string}
interface Cells {row:HTMLTableRowElement;cpu:HTMLTableCellElement;ram:HTMLTableCellElement;gpu:HTMLTableCellElement}
interface Child extends Cells {name:HTMLElement}
interface Group extends Cells {head:HTMLTableSectionElement;body:HTMLTableSectionElement;toggle:HTMLButtonElement;label:HTMLElement;count:HTMLTableCellElement;children:Map<number,Child>;footer:HTMLTableRowElement;previous:HTMLButtonElement;next:HTMLButtonElement;range:HTMLElement;value:AppGroup}
const cell=()=>document.createElement("td");
const button=(text:string)=>{const b=document.createElement("button");b.type="button";b.className="text-button";b.textContent=text;return b;};
function values(row:HTMLTableRowElement):Cells {
  const cpu=cell(),ram=cell(),gpu=cell();cpu.className="process-cpu";ram.className="process-memory";gpu.className="process-gpu";row.append(cpu,ram,gpu);return {row,cpu,ram,gpu};
}
// Move only nodes whose position changed; ordinary live samples update text.
function reconcile(parent:HTMLElement,nodes:HTMLElement[]):void {
  const keep=new Set(nodes);for(const child of [...parent.children])if(!keep.has(child as HTMLElement))child.remove();
  let cursor=parent.firstElementChild;
  for(const node of nodes){if(node===cursor)cursor=cursor.nextElementSibling;else parent.insertBefore(node,cursor);}
}

export function createProcessTable(state:ProcessTableState):{element:HTMLElement;update:(input:Input)=>void} {
  const root=document.createElement("div"),table=document.createElement("table");root.tabIndex=-1;table.className="process-table grouped-process-table";
  table.setAttribute("aria-label","Application groups and processes");
  const head=document.createElement("thead"),heading=document.createElement("tr");
  for(const text of ["Application / process","Processes / PID","CPU","RAM","GPU"]){const th=document.createElement("th");th.scope="col";th.textContent=text;heading.append(th);}head.append(heading);table.append(head);
  const empty=document.createElement("p");empty.className="hint";empty.textContent="No applications match your search.";
  const pager=document.createElement("div");pager.className="process-pager";
  const previous=button("Previous"),next=button("Next"),pageLabel=document.createElement("span");
  previous.setAttribute("aria-label","Previous application groups");next.setAttribute("aria-label","Next application groups");
  pager.append(previous,pageLabel,next);root.append(table,empty,pager);
  const groups=new Map<string,Group>();let latest:Input|undefined,filterKey=state.filterKey||"",sequence=0;
  previous.onclick=()=>{state.page--;paint();};next.onclick=()=>{state.page++;paint();};
  function updateCells(cells:Cells,value:{cpuPercent:number|null;memoryBytes:string;gpu?:ProcessRow["gpu"]}):void {
    const input=latest!;
    cells.cpu.textContent=input.error?"Unavailable":percentText(value.cpuPercent);
    cells.cpu.title=value.cpuPercent===null?"A complete CPU measurement is not available yet.":"Share of total device CPU capacity";
    cells.ram.textContent=input.error?"Unavailable":memoryText(value.memoryBytes,input.totalMemory,input.mode);
    cells.gpu.textContent=gpuText(input.error?undefined:value.gpu);
    cells.gpu.title=input.error||value.gpu?.reason||"No group GPU measurement is available. Missing values do not mean zero.";
  }
  function makeGroup(value:AppGroup):Group {
    const head=document.createElement("tbody"),body=document.createElement("tbody"),row=document.createElement("tr");
    head.className="process-group-header";body.className="process-group-members";body.id=`process-members-${++sequence}`;
    const first=cell(),toggle=button("");toggle.className="process-group-toggle";toggle.setAttribute("aria-controls",body.id);
    const arrow=document.createElement("span");arrow.className="process-group-chevron";arrow.textContent="›";arrow.setAttribute("aria-hidden","true");
    const logo=value.toolId?toolLogo(value.toolId,20):/chrome/i.test(value.name)?toolLogo("chrome",20):/docker/i.test(value.name)?toolLogo("docker",20):icon("computer");
    const label=document.createElement("span");label.className="process-group-name";toggle.append(arrow,logo,label);first.append(toggle);
    const count=cell();count.className="process-group-count";row.append(first,count);const cells=values(row);head.append(row);
    const footer=document.createElement("tr"),controls=cell();controls.colSpan=5;const wrap=document.createElement("div");wrap.className="process-member-pager";
    const previous=button("Previous processes"),next=button("Next processes"),range=document.createElement("span");wrap.append(previous,range,next);controls.append(wrap);footer.append(controls);
    const group={...cells,head,body,toggle,label,count,children:new Map<number,Child>(),footer,previous,next,range,value};
    toggle.onclick=()=>{if(state.expanded.has(value.id))state.expanded.delete(value.id);else state.expanded.add(value.id);paint();};
    previous.onclick=()=>{state.memberPages.set(value.id,Math.max(0,(state.memberPages.get(value.id)||0)-1));paint();};
    next.onclick=()=>{state.memberPages.set(value.id,(state.memberPages.get(value.id)||0)+1);paint();};
    return group;
  }
  function paint():void {
    if(!latest)return;const input=latest;
    const active=document.activeElement instanceof HTMLElement&&root.contains(document.activeElement)?document.activeElement:null;
    const selection=groupPage(input.groups,input.query,input.scope,input.sort,state.page);state.page=selection.page;
    const alive=new Set(input.groups.map(group=>group.id));
    for(const id of state.expanded)if(!alive.has(id)){state.expanded.delete(id);state.memberPages.delete(id);}
    for(const id of state.memberPages.keys())if(!alive.has(id))state.memberPages.delete(id);
    const visible=new Set(selection.groups.map(group=>group.id));
    for(const [id,group]of groups)if(!visible.has(id)){group.head.remove();group.body.remove();groups.delete(id);}
    const sections:HTMLElement[]=[head];
    for(const value of selection.groups){
      let group=groups.get(value.id);if(!group){group=makeGroup(value);groups.set(value.id,group);}group.value=value;
      const open=state.expanded.has(value.id);group.toggle.setAttribute("aria-expanded",String(open));
      group.toggle.setAttribute("aria-label",`${open?"Collapse":"Expand"} ${value.name}`);group.label.textContent=value.name;
      group.count.textContent=`${formatCount(value.processes.length)} ${value.processes.length===1?"process":"processes"}`;
      updateCells(group,value);group.body.hidden=!open;
      if(open){
        const members=memberPage(value,input.sort,state.memberPages.get(value.id)||0,input.query);state.memberPages.set(value.id,members.page);
        const childIds=new Set(members.rows.map(p=>p.pid));
        for(const [pid,child]of group.children)if(!childIds.has(pid)){child.row.remove();group.children.delete(pid);}
        const rows:HTMLElement[]=[];
        for(const process of members.rows){
          let child=group.children.get(process.pid);
          if(!child){const row=document.createElement("tr");row.className="process-child";const name=cell(),pid=cell();pid.textContent=String(process.pid);name.className="process-child-name";row.append(name,pid);child={...values(row),name};group.children.set(process.pid,child);}
          child.name.textContent=process.name;updateCells(child,process);rows.push(child.row);
        }
        group.previous.disabled=members.page===0;group.next.disabled=members.page+1>=members.pages;
        group.previous.setAttribute("aria-label",`Previous ${value.name} processes`);group.next.setAttribute("aria-label",`Next ${value.name} processes`);
        group.range.textContent=`${formatCount(members.start+1)}–${formatCount(members.start+members.rows.length)} of ${formatCount(value.processes.length)} processes`;
        group.footer.hidden=members.pages<=1;rows.push(group.footer);reconcile(group.body,rows);
      }else{group.body.replaceChildren();group.children.clear();}
      sections.push(group.head,group.body);
    }
    reconcile(table,sections);
    empty.hidden=selection.total!==0;table.hidden=selection.total===0;pager.hidden=selection.pages<=1;
    previous.disabled=state.page===0;next.disabled=state.page+1>=selection.pages;
    pageLabel.textContent=`Page ${state.page+1} of ${selection.pages} · ${formatCount(selection.total)} application groups · ${formatCount(input.groups.reduce((n,g)=>n+g.processes.length,0))} accessible processes`;
    if(active&&document.activeElement!==active){if(active.isConnected)active.focus({preventScroll:true});else (root.querySelector<HTMLButtonElement>(".process-group-toggle")||root).focus({preventScroll:true});}
  }
  return {element:root,update(input){const key=JSON.stringify([input.query,input.scope,input.sort]);if(key!==filterKey){state.page=0;state.memberPages.clear();filterKey=key;state.filterKey=key;}latest=input;paint();}};
}
