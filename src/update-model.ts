/** A missing or inconsistent total must not produce a fabricated percentage. */
export function updateProgress(downloaded:number,total:number|null):number|null {
  if(!Number.isFinite(downloaded)||downloaded<0||total===null||!Number.isFinite(total)||total<=0||downloaded>total)return null;
  return Math.min(100,downloaded/total*100);
}

export function updateInstallationCopy(windows:boolean):{title:string;body:string} {
  return windows ? {
    title:"Install Roomit on this computer?",
    body:"This update runs an installer and installs or updates Roomit on your computer. If you opened a portable EXE, it will not replace that file. After installation, use the installed Roomit app. Roomit will close during installation and restart afterward. Your saved scans and settings are kept.",
  } : {
    title:"Update Roomit and restart?",
    body:"This update replaces this Roomit app with a verified update and restarts it. Your saved scans and settings are kept. Move Roomit from the disk image into Applications and open that copy before updating.",
  };
}
