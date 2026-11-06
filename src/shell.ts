import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { icon } from "./icons";
import type { ResultView } from "./results";

/** Window chrome is separate from scan state; navigation never starts a scan. */
export function installShell(navigate:(view:ResultView)=>void, openScan:()=>void):{setTitle:(title:string)=>void} {
  const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
  const toggle=get<HTMLButtonElement>("sidebar-toggle"), menu=get<HTMLDetailsElement>("app-menu");
  const menuSidebar=get<HTMLButtonElement>("menu-sidebar"), status=get<HTMLParagraphElement>("shell-status");
  const minimize=get<HTMLButtonElement>("window-minimize"), maximize=get<HTMLButtonElement>("window-maximize"), close=get<HTMLButtonElement>("window-close");
  toggle.append(icon("sidebar"));minimize.append(icon("minimize"));maximize.append(icon("maximize"));close.append(icon("close"));
  get("sidebar-new-scan").prepend(icon("plus"));
  document.documentElement.classList.toggle("platform-mac",/Mac/i.test(navigator.platform));
  let collapsed=false;
  try {collapsed=localStorage.getItem("roomit-sidebar-collapsed")==="true";}catch{/* Storage may be unavailable; navigation still works. */}
  function updateSidebar():void {
    document.documentElement.classList.toggle("sidebar-collapsed",collapsed);
    get("app-sidebar").hidden=collapsed;
    toggle.setAttribute("aria-expanded",String(!collapsed));
    const label=`Kenar çubuğunu ${collapsed?"göster":"gizle"}`;
    toggle.setAttribute("aria-label",label);toggle.title=`${label} (${ /Mac/i.test(navigator.platform)?"⌘":"Ctrl"}+B)`;menuSidebar.textContent=label;
  }
  function flipSidebar():void {collapsed=!collapsed;updateSidebar();try{localStorage.setItem("roomit-sidebar-collapsed",String(collapsed));}catch{}}
  function closeMenu():void {menu.open=false;}
  toggle.onclick=flipSidebar;menuSidebar.onclick=()=>{flipSidebar();closeMenu();toggle.focus();};
  document.querySelector<HTMLAnchorElement>(".brand")!.onclick=event=>{event.preventDefault();navigate("control");};
  get("sidebar-new-scan").onclick=openScan;
  get("menu-new-scan").onclick=()=>{closeMenu();openScan();};
  for(const button of menu.querySelectorAll<HTMLButtonElement>("[data-shell-view]"))button.onclick=()=>{closeMenu();navigate(button.dataset.shellView as ResultView);get("main").focus({preventScroll:true});};
  document.addEventListener("click",event=>{if(event.target instanceof Node&&!menu.contains(event.target))closeMenu();});
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&menu.open){closeMenu();menu.querySelector("summary")?.focus();return;}
    if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==="b"&&!(event.target instanceof Element&&event.target.closest("input,textarea,select,[contenteditable=true]"))){event.preventDefault();flipSidebar();}
  });
  updateSidebar();
  const fail=(error:unknown)=>{status.hidden=false;status.textContent=`Pencere işlemi yapılamadı: ${String(error)}`;};
  async function act(action:()=>Promise<unknown>):Promise<void>{try{await action();status.hidden=true;}catch(error){fail(error);}}
  if(isTauri()) {
    const window=getCurrentWindow();
    async function syncMaximize():Promise<void>{
      const expanded=await window.isMaximized();
      maximize.replaceChildren(icon(expanded?"restore":"maximize"));
      maximize.setAttribute("aria-label",expanded?"Pencereyi geri yükle":"Pencereyi büyüt");maximize.title=expanded?"Geri yükle":"Büyüt";
    }
    minimize.onclick=()=>void act(()=>window.minimize());close.onclick=()=>void act(()=>window.close());
    maximize.onclick=()=>void act(async()=>{await window.toggleMaximize();await syncMaximize();});
    // Only the non-interactive context strip drags. Menu/window buttons never do.
    get("shell-view-title").parentElement!.addEventListener("mousedown",event=>{
      if(event.button!==0||!(event.target instanceof HTMLElement)||!event.target.hasAttribute("data-window-drag"))return;
      event.preventDefault();
      void act(event.detail===2?async()=>{await window.toggleMaximize();await syncMaximize();}:()=>window.startDragging());
    });
    let windowCleanup:(()=>void)|undefined;
    void act(syncMaximize);
    void window.onResized(()=>void act(syncMaximize)).then(unlisten=>windowCleanup=unlisten).catch(fail);
    addEventListener("pagehide",()=>windowCleanup?.(),{once:true});
  } else {
    for(const button of [minimize,maximize,close]){button.disabled=true;button.title="Masaüstü uygulamasında kullanılabilir";}
  }
  return {setTitle:title=>{get("shell-view-title").textContent=title;}};
}
