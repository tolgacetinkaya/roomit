import {Channel, invoke, isTauri} from "@tauri-apps/api/core";
import {open} from "@tauri-apps/plugin-dialog";
import {archiveCopy as copy} from "./locales/en-archive";
import {formatGb, parseMinimumGb} from "./size-filter";
import {formatBytes, formatCount} from "./report";
import type {ScanProgress} from "./report";
import {pathKey, pathName} from "./groups";
import {revealActions, installRevealShortcut} from "./reveal";

interface Folder {label:string; path:string}
interface Snapshot {id:string; roots:string[]; complete:boolean; warnings:string[]; filesScanned:number}
type Kind="file"|"folder";
interface Candidate {path:string; bytes:string; count:number; category:keyof typeof copy.category; directOnly?:boolean}
interface Page {rows:Candidate[]; total:number; matchedBytes:string}
const pageSize=50;
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text="",cls=""):HTMLElementTagNameMap[K]{
  const el=document.createElement(tag);el.className=cls;el.textContent=text;return el;
}
function button(label:string,action:()=>void,cls="secondary"){
  const btn=node("button",label,cls);btn.type="button";btn.onclick=action;return btn;
}
function candidateCard(row:Candidate,kind:Kind,minimum:bigint){
  const card=node("article","","result-card archive-card");card.tabIndex=0;card.dataset.revealOwner="";
  const head=node("div","","member-heading");
  head.append(node("strong",pathName(row.path)),node("strong",formatBytes(row.bytes)));
  const category=copy.category[row.category]??copy.category.mixed;
  const bytes = BigInt(row.bytes);
  // Keep everyday totals short, but show exact GB if rounding would obscure the cutoff.
  const hundredthGb = 10_000_000n;
  const rounded = ((bytes + hundredthGb / 2n) / hundredthGb) * hundredthGb;
  const size = bytes > minimum && rounded !== bytes && rounded > minimum
    ? copy.approximate(formatGb(rounded))
    : formatGb(bytes);
  const measurement = kind === "folder"
    ? copy.folderReason(formatCount(row.count), row.count === 1, Boolean(row.directOnly), size)
    : copy.fileReason(copy.fileTypes[row.category] ?? copy.fileTypes.mixed, size);
  let reason = minimum ? copy.meetsMinimum(measurement, formatGb(minimum)) : copy.noMinimum(measurement);
  if (kind === "file" && row.category === "installer") reason += " " + copy.installerNote;
  card.append(head,node("span",category,"item-context"),node("p",reason),node("p",row.path,"report-path"),revealActions([row.path]));
  return card;
}

export function installArchive(blocked:()=>boolean,onBusy:()=>void) {
  const panel=node("section","","archive-panel");installRevealShortcut(panel);
  const config=node("section","","panel archive-config");
  const scope=node("fieldset"),legend=node("legend",copy.choose);
  const choices=node("div","","archive-choices"),scopeHelp=node("p",copy.scopeHelp,"hint");
  const add=button(copy.add,()=>void choose());
  const discoveryStatus=node("div","","hint"),retryFolders=button(copy.retryFolders,()=>void loadFolders());
  scope.append(legend,scopeHelp,choices,add,discoveryStatus,retryFolders);
  const size=node("form","","archive-size");
  const sizeLabel=node("label",copy.minimum);sizeLabel.htmlFor="archive-minimum";
  const input=node("input");input.id=sizeLabel.htmlFor;input.type="text";input.inputMode="decimal";input.value="1";input.maxLength=30;
  const help=node("small",copy.minimumHelp,"hint");help.id="archive-minimum-help";
  const validation=node("span","","warning");validation.id="archive-minimum-error";validation.setAttribute("role","status");
  input.setAttribute("aria-describedby",help.id+" "+validation.id);
  const apply=node("button",copy.apply,"secondary");apply.type="submit";
  const sizeControls=node("div","","archive-actions");sizeControls.append(input,apply);size.append(sizeLabel,sizeControls,help,validation);
  const scan=button(copy.start,()=>void scanFolders(),"archive-primary");
  const cancel=button(copy.cancel,()=>void cancelScan());
  const controls=node("div","","archive-actions");controls.append(scan,cancel);
  const status=node("p","","hint");status.setAttribute("role","status");
  const progress=node("progress");progress.setAttribute("aria-label",copy.scanning);
  config.append(scope,size,controls,progress,status);
  const result=node("section","","panel archive-results");
  const title=node("h3",copy.results),scopeInfo=node("p","","report-path"),changed=node("p",copy.scopeChanged,"warning");
  title.tabIndex=-1;
  const warnings=node("details"),warningTitle=node("summary",copy.details);warnings.append(warningTitle);
  const modes=node("div","","view-switch");
  const folders=button(copy.folders,()=>switchKind("folder")),files=button(copy.files,()=>switchKind("file"));modes.append(folders,files);
  const summary=node("p","","archive-total");summary.setAttribute("role","status");
  const cards=node("div","","archive-grid"),pager=node("div","","archive-actions"),pageLabel=node("span","","hint");
  const prev=button(copy.prev,()=>void loadPage(pageNumber-1)),next=button(copy.next,()=>void loadPage(pageNumber+1));
  const retry=button(copy.retry,()=>void loadPage(pageNumber));pager.append(prev,pageLabel,next);
  result.append(title,scopeInfo,changed,warnings,modes,summary,cards,retry,pager,node("p",copy.caution,"hint"));
  panel.append(config,result);

  const options=new Map<string,Folder>(),selected=new Set<string>();
  let loaded=false,discovering=false,picking=false,stopping=false,scanId="",requestedScope="";
  let snapshot:Snapshot|null=null,kind:Kind="folder",minimum=1000000000n,pageNumber=1,queryRevision=0;
  function selectedScope(){return JSON.stringify([...selected].sort());}
  function sync(){
    const locked=Boolean(scanId)||picking||blocked();
    scan.disabled=locked||!isTauri()||!selected.size;scan.textContent=snapshot?copy.rescan:copy.start;
    add.disabled=locked||!isTauri();retryFolders.disabled=locked||discovering;
    choices.querySelectorAll("input").forEach(check=>{check.disabled=locked;});
    input.disabled=Boolean(scanId);apply.disabled=!snapshot||Boolean(scanId);
    cancel.hidden=!scanId;cancel.disabled=stopping;cancel.textContent=stopping?copy.cancelling:copy.cancel;
    progress.hidden=!scanId;result.hidden=!snapshot;changed.hidden=!snapshot||selectedScope()===requestedScope;
    files.setAttribute("aria-pressed",String(kind==="file"));folders.setAttribute("aria-pressed",String(kind==="folder"));
  }
  function renderChoices(){
    choices.replaceChildren();
    for(const [key,folder] of options){
      const label=node("label","","archive-choice"),check=node("input");check.type="checkbox";check.checked=selected.has(key);
      const text=node("span");text.append(node("strong",folder.label),node("small",folder.path,"report-path"));
      check.onchange=()=>{if(check.checked)selected.add(key);else selected.delete(key);sync();};
      label.append(check,text);choices.append(label);
    }
    sync();
  }
  async function loadFolders(){
    if(discovering||loaded)return;
    if(!isTauri()){discoveryStatus.textContent=copy.unavailable;return;}
    discovering=true;discoveryStatus.textContent=copy.loadingFolders;retryFolders.hidden=true;
    try{
      for(const folder of await invoke<Folder[]>("personal_folders"))options.set(pathKey(folder.path),folder);
      loaded=true;discoveryStatus.textContent="";renderChoices();
    }catch(e){discoveryStatus.textContent=String(e);retryFolders.hidden=false;}
    finally{discovering=false;sync();}
  }
  async function choose(){
    if(add.disabled)return;
    picking=true;onBusy();sync();
    try{
      const paths=await open({title:copy.picker,directory:true,multiple:true,canCreateDirectories:false,fileAccessMode:"scoped"});
      for(const path of paths??[]){const key=pathKey(path);if(!options.has(key))options.set(key,{path,label:pathName(path)});selected.add(key);}
      renderChoices();
    }catch(e){status.textContent=String(e);}
    finally{picking=false;onBusy();sync();}
  }
  function readMinimum(){
    const parsed=parseMinimumGb(input.value);validation.textContent=parsed.error??"";
    input.setAttribute("aria-invalid",String(parsed.bytes===null));
    if(parsed.bytes===null){input.focus();return false;}
    minimum=parsed.bytes;return true;
  }
  size.onsubmit=e=>{e.preventDefault();if(readMinimum()&&snapshot)void loadPage(1);};
  async function scanFolders(){
    if(scan.disabled||!readMinimum())return;
    scanId=crypto.randomUUID();const id=scanId,scopeKey=selectedScope();
    status.textContent=copy.scanning+"…";onBusy();sync();
    const onProgress=new Channel<ScanProgress>();
    let lastProgress=0;
    onProgress.onmessage=p=>{const now=Date.now();if(scanId!==id||stopping||now-lastProgress<800)return;lastProgress=now;status.textContent=copy.scanning+" · "+formatCount(p.stats.filesScanned)+" "+copy.filesScanned+" · "+p.currentPath;};
    try{
      const report=await invoke<Snapshot>("scan_archive",{paths:[...selected].map(key=>options.get(key)!.path),scanId:id,onProgress});
      snapshot=report;requestedScope=scopeKey;
      status.textContent=formatCount(report.filesScanned)+" "+copy.filesScanned+(report.complete?"":" · "+copy.incomplete);
      scopeInfo.textContent=copy.previousScan+" · "+report.roots.join(" · ");
      warnings.replaceChildren(warningTitle,...report.warnings.map(w=>node("p",w,"hint")));warnings.hidden=!report.warnings.length;
      sync();await loadPage(1);
      if(!panel.hidden){title.focus({preventScroll:true});result.scrollIntoView({block:"start"});}
    }catch(e){if(snapshot)await loadPage(1);status.textContent=String(e)+(snapshot?" "+copy.cancelledOld:"");}
    finally{scanId="";stopping=false;onBusy();sync();}
  }
  async function cancelScan(){
    if(!scanId||stopping)return;
    const id=scanId;stopping=true;sync();
    try{await invoke("cancel_scan",{scanId});}
    catch(e){if(scanId===id){status.textContent=String(e);stopping=false;sync();}}
  }
  function switchKind(value:Kind){
    if(kind===value)return;
    kind=value;sync();void loadPage(1);
  }
  async function loadPage(page:number){
    if(!snapshot)return;
    const revision=++queryRevision;pageNumber=page;retry.hidden=true;pager.hidden=true;
    cards.replaceChildren();summary.textContent=copy.loading;cards.setAttribute("aria-busy","true");
    try{
      const appliedMinimum = minimum;
      const data=await invoke<Page>("archive_page",{id:snapshot.id,kind,minimumBytes:String(appliedMinimum),page});
      if(revision!==queryRevision)return;
      const unit=kind==="file"?(data.total===1?copy.file:copy.filePlural):(data.total===1?copy.collection:copy.collections);
      summary.textContent=data.total?copy.total+" · "+formatBytes(data.matchedBytes)+" · "+formatCount(data.total)+" "+unit+" · "+(appliedMinimum?copy.threshold+" "+formatGb(appliedMinimum):copy.emptySize):copy.zero;
      cards.replaceChildren(...data.rows.map(row=>candidateCard(row,kind,appliedMinimum)));
      const pages=Math.ceil(data.total/pageSize);
      pager.hidden=pages<=1;prev.disabled=page===1;next.disabled=page>=pages;
      pageLabel.textContent=copy.page+" "+page+" / "+pages;
    }catch(e){if(revision===queryRevision){summary.textContent=String(e);retry.hidden=false;}}
    finally{if(revision===queryRevision)cards.removeAttribute("aria-busy");}
  }
  retryFolders.hidden=true;retry.hidden=true;pager.hidden=true;sync();
  return {panel,open(){sync();void loadFolders();},sync,busy:()=>Boolean(scanId)||picking};
}
