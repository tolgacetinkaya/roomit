import {storageCopy} from "./locales/en-storage";
import {sizeLabel} from "./report";
import type {InspectionReport} from "./report";
import {revealActions} from "./reveal";

export interface Bucket { bytes:string; locations:string[] }
export interface ToolStorage { complete:boolean; categories:Record<string,Bucket>; projects:Record<string,Bucket> }

const labels=storageCopy.categories;

export function categoryPanel(id:string, report:InspectionReport|null):HTMLElement {
  const section=document.createElement("section");
  section.className="storage-categories";
  const data=report?.breakdown?.[id];
  const complete=Boolean(data?.complete);
  const heading=document.createElement("h4");
  heading.textContent="Local data by type"; section.append(heading);
  if(!data){
    const help=document.createElement("p"); help.className="hint";
    help.textContent="Scan app data to measure chats, logs, cache and other files.";
    section.append(help); return section;
  }
  for(const [key,label] of Object.entries(labels)){
    const bucket=data.categories[key];
    const row=document.createElement("div"); row.className="storage-category"; row.dataset.revealOwner="";
    const name=document.createElement("span"); name.textContent=label;
    const size=document.createElement("strong"); size.textContent=sizeLabel(bucket?.bytes??"0",complete);
    row.append(name,size);
    if(bucket?.locations.length) row.append(revealActions(bucket.locations));
    else {
      const button=document.createElement("button"); button.type="button"; button.disabled=true;
      button.className="secondary"; button.textContent="Show in folder"; button.title="No matching file location in this scan"; row.append(button);
    }
    section.append(row);
  }
  const projects=Object.entries(data.projects).sort((a,b)=>BigInt(a[1].bytes)>BigInt(b[1].bytes)?-1:BigInt(a[1].bytes)<BigInt(b[1].bytes)?1:0);
  if(projects.length){
    const details=document.createElement("details"), summary=document.createElement("summary");
    summary.textContent=`Chat storage by project (${projects.length})`; details.append(summary);
    details.addEventListener("toggle",()=>{
      if(!details.open||details.childElementCount>1)return;
      for(const [path,bucket] of projects){
        const row=document.createElement("div"); row.className="storage-category";
        const name=document.createElement("span"); name.textContent=path.split(/[\\/]/).pop()||path; name.title=path;
        const size=document.createElement("strong"); size.textContent=sizeLabel(bucket.bytes,complete);
        row.append(name,size,revealActions([path])); details.append(row);
      }
    });
    section.append(details);
  }
  return section;
}
