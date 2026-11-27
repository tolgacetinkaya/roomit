import {Channel, invoke, isTauri} from "@tauri-apps/api/core";
import {formatBytes} from "./report";
import type {InspectionReport} from "./report";
import {revealActions} from "./reveal";

type Group = {bytes:string; paths:string[]};
type Progress = {file:number; count:number; percent:number};
type Verified = {matches:string[][]; skipped:number};

function modelGroup(group:Group, indexId:string):HTMLElement {
  const details=document.createElement("details"), heading=document.createElement("summary");
  heading.textContent=`${group.paths.length} candidate files · ${formatBytes(group.bytes)} each`;
  details.append(heading);
  details.addEventListener("toggle",()=>{
    if(!details.open||details.childElementCount>1)return;
    details.append(revealActions(group.paths));
    const button=document.createElement("button"); button.type="button"; button.className="secondary";
    button.textContent="Verify contents (SHA-256)"; button.disabled=!isTauri();
    const cancel=document.createElement("button"); cancel.type="button"; cancel.textContent="Cancel"; cancel.hidden=true;
    const status=document.createElement("p"); status.className="hint"; status.setAttribute("role","status");
    const matches=document.createElement("div");
    button.onclick=async()=>{
      const requestId=crypto.randomUUID(), progress=new Channel<Progress>();
      button.disabled=true; cancel.hidden=false; cancel.disabled=false;
      const stop=()=>invoke("cancel_verification",{requestId}).catch(()=>false);
      cancel.onclick=()=>{cancel.disabled=true;void stop();};
      const observer=new MutationObserver(()=>{if(!button.isConnected){observer.disconnect();void stop();}});
      observer.observe(document.body,{childList:true,subtree:true});
      matches.replaceChildren();status.textContent="Reading model files…";
      progress.onmessage=p=>{status.textContent=`Verifying file ${p.file} of ${p.count} · ${Math.floor(p.percent)}%`;};
      try {
        const result=await invoke<Verified>("verify_models",{indexId,bytes:group.bytes,requestId,onProgress:progress});
        status.textContent=`${result.matches.length} identical-content groups · ${result.skipped} files skipped or changed`;
        for(const paths of result.matches){
          const item=document.createElement("div"), label=document.createElement("strong");
          label.textContent=`${paths.length} verified copies`;item.append(label,revealActions(paths));matches.append(item);
        }
      }catch(error){status.textContent=String(error);}
      finally{observer.disconnect();button.disabled=false;cancel.hidden=true;}
    };
    details.append(button,cancel,status,matches);
  });
  return details;
}

export function modelPanel(report:InspectionReport):HTMLElement {
  const panel=document.createElement("section");panel.className="panel model-copies";
  const heading=document.createElement("h3");heading.textContent="Possible model copies";
  const help=document.createElement("p"); help.className="hint";
  const groups=report.modelGroups;
  help.textContent=groups==null?"Rescan to check model files.":groups.length?
    "Candidates have equal file sizes and distinct file identities. Verify contents to compare files on this device.":
    "No equal-size candidates in the measured files. Scan all AI tools or choose a folder containing models.";
  if(report.skippedModels)help.textContent+=` ${report.skippedModels} model files could not be identified.`;
  panel.append(heading,help);
  const list=document.createElement("div"),more=document.createElement("button");
  more.type="button"; more.textContent="Show more groups";more.className="secondary";
  let count=0;
  function append(){
    const end=Math.min(count+20,groups?.length??0);
    for(;count<end;count++)list.append(modelGroup(groups![count],report.sizeIndexId));
    more.hidden=count===(groups?.length??0);
  }
  more.onclick=append;append();panel.append(list,more);return panel;
}
