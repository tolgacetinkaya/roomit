export const archiveCopy = {
  tabs:"Large item views", all:"All large items", candidates:"Archive candidates",
  intro:"Review personal media, documents, archives and installers that you could store elsewhere.",
  choose:"Choose personal folders", add:"Add a folder…", picker:"Select personal folders to inspect",
  scopeHelp:"Only selected folders and their subfolders will be scanned. Your files stay in place.",
  unavailable:"Open Roomit on your desktop to scan personal folders.",
  retryFolders:"Retry folder discovery", loadingFolders:"Finding personal folders…",
  minimum:"Minimum size (GB)", minimumHelp:"Applies to one file or the combined size of matching files in a collection.",
  start:"Scan selected folders", rescan:"Scan selected folders again", cancel:"Cancel scan", cancelling:"Cancelling…",
  apply:"Apply size filter", scanning:"Scanning", filesScanned:"files inspected",
  scopeChanged:"The folder selection has changed. Scan again to update these results.",
  results:"Archive candidates", previousScan:"Results from", incomplete:"Partial scan",
  folders:"Folder collections", files:"Individual files", page:"Page", prev:"Previous", next:"Next",
  loading:"Loading candidates…", retry:"Retry results", collection:"collection", collections:"collections",
  file:"file", filePlural:"files",
  total:"Matching logical size", threshold:"at or above", zero:"No candidates meet this size in the scanned folders.",
  caution:"Check project references and backups before archiving.",
  details:"Scan notes", cancelledOld:"Showing the previous scan.",
  emptySize:"All sizes",
  category:{photo:"Photos",video:"Videos",audio:"Audio",document:"Documents",diskImage:"Disk images",installer:"Installers",archive:"Archives",mixed:"Mixed file types"},
  fileTypes:{
    photo:"photo", video:"video", audio:"audio file", document:"document", diskImage:"disk image",
    installer:"installer candidate", archive:"compressed archive", mixed:"file",
  },
  installerNote:"Its name or extension suggests an installer. Installation status is unknown.",
  approximate:(size:string) => `about ${size}`,
  fileReason:(type:string, size:string) => `This ${type} is ${size}`,
  folderReason(count:string, single:boolean, directOnly:boolean, size:string) {
    const scope = directOnly ? "directly in this folder" : "across this folder and its subfolders";
    return single
      ? `1 matching file ${scope} takes up ${size}`
      : `${count} matching files ${scope} total ${size}`;
  },
  meetsMinimum:(reason:string, minimum:string) => `${reason}, meeting your ${minimum} minimum.`,
  noMinimum:(reason:string) => `${reason}. All sizes are included.`,
} as const;
