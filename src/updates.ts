import {Channel,invoke,isTauri} from "@tauri-apps/api/core";
import {formatBytes} from "./report";
import {updateProgress} from "./update-model";
import "./updates.css";
interface Release {version:string;notes:string}
interface Progress {phase:"downloading"|"installing";downloaded:number;total:number|null}

export function installUpdates(scanBusy:()=>boolean,onBusyChange:()=>void):{busy:()=>boolean} {
  const banner=document.getElementById("update-banner")!,message=document.getElementById("update-message")!;
  const notes=document.getElementById("update-notes")!,check=document.getElementById("menu-check-updates") as HTMLButtonElement;
  const install=document.getElementById("install-update") as HTMLButtonElement, dismiss=document.getElementById("dismiss-update") as HTMLButtonElement;
  const bar=document.getElementById("update-progress") as HTMLProgressElement;
  const confirmation=document.getElementById("update-confirmation") as HTMLDialogElement;
  const confirm=document.getElementById("confirm-install-update") as HTMLButtonElement;
  const cancel=document.getElementById("cancel-install-update") as HTMLButtonElement;
  const portableButtons=["download-portable","menu-download-portable","confirm-download-portable"].map(id=>document.getElementById(id) as HTMLButtonElement);
  const windows=/Win/i.test(navigator.platform);
  portableButtons.forEach(button=>button.hidden=!windows);
  let checking=false,installing=false,downloading=false,release:Release|null=null;
  const locked=()=>installing||downloading||confirmation.open;
  function show(text:string):void {banner.hidden=false;message.textContent=text;}
  async function checkRelease(manual=false):Promise<void>{
    if(checking||locked())return;checking=true;check.disabled=true;check.textContent="Checking for updates…";
    if(manual){show("Checking GitHub releases…");install.hidden=true;notes.textContent="";}
    try{
      const found=await invoke<Release|null>("check_for_update");release=found;install.hidden=!found;
      if(found){show(`Roomit ${found.version} is available`);notes.textContent=found.notes;install.hidden=false;install.textContent="Review update…";}
      else if(manual){show("You are up to date. No newer release is available.");}
    }catch(error){if(manual){show(String(error));notes.textContent="You can try again from Roomit → Check for updates.";}}
    finally{checking=false;check.disabled=false;check.textContent="Check for updates";}
  }
  check.onclick=()=>{document.querySelector<HTMLDetailsElement>("#app-menu")!.open=false;void checkRelease(true);};
  dismiss.onclick=()=>{if(!locked())banner.hidden=true;};
  cancel.onclick=()=>confirmation.close();
  confirmation.addEventListener("close",()=>install.focus());
  install.onclick=()=>{
    if(checking||locked()||!release)return;
    confirmation.showModal();cancel.focus();
  };
  for(const button of portableButtons)button.onclick=async()=>{
    if(installing||downloading||checking)return;
    confirmation.close();document.querySelector<HTMLDetailsElement>("#app-menu")!.open=false;
    downloading=true;portableButtons.forEach(b=>b.disabled=true);install.disabled=true;check.disabled=true;
    show("Finding the latest portable EXE…");
    try{
      const version=await invoke<string>("download_latest_portable");
      show(`Roomit ${version} portable download opened in your browser`);
      notes.textContent="Your browser handles the download. Open the downloaded EXE yourself. No installer was started.";
    }catch(error){show(String(error));notes.textContent="The portable download could not be opened. Please try again.";}
    finally{downloading=false;portableButtons.forEach(b=>b.disabled=false);install.disabled=false;check.disabled=false;}
  };
  confirm.onclick=async()=>{
    if(!confirmation.open||installing||!release)return;
    confirmation.close();
    if(scanBusy()){show("Finish or cancel the current scan before installing this update.");return;}
    installing=true;install.disabled=true;check.disabled=true;dismiss.disabled=true;
    portableButtons.forEach(b=>b.disabled=true);
    onBusyChange();
    bar.hidden=false;bar.removeAttribute("value");
    show(`Downloading Roomit ${release.version}…`);
    notes.textContent="Roomit will close to install the signed update, then restart. Your saved scan and settings are kept.";
    const channel=new Channel<Progress>();channel.onmessage=p=>{
      const ratio=updateProgress(p.downloaded,p.total);if(ratio===null)bar.removeAttribute("value");else{bar.max=100;bar.value=ratio;}
      show(p.phase==="installing"?"Verified. Installing update and restarting…":`Downloading update · ${formatBytes(String(p.downloaded))}${p.total?` / ${formatBytes(String(p.total))}`:""}`);
    };
    try{await invoke("install_release",{onProgress:channel,installationConfirmed:true});}
    catch(error){show(String(error));notes.textContent="The update was not installed. You can retry. Your saved results and settings are unchanged.";}
    finally{installing=false;install.disabled=false;check.disabled=false;dismiss.disabled=false;portableButtons.forEach(b=>b.disabled=false);bar.hidden=true;onBusyChange();}
  };
  if(isTauri()){
    setTimeout(()=>void checkRelease(),5000);
    const interval=setInterval(()=>{if(!document.hidden)void checkRelease();},6*60*60*1000);
    addEventListener("pagehide",()=>clearInterval(interval),{once:true});
  }else{check.disabled=true;portableButtons.forEach(b=>b.disabled=true);check.title="Updates are available in the desktop app.";}
  return {busy:()=>installing};
}
