import { invoke, isTauri } from "@tauri-apps/api/core";
import { icon } from "./icons";
import { isRevealShortcut } from "./reveal-shortcut";

const mac = /Mac|iPhone|iPad/.test(navigator.platform);
export const revealShortcut = mac ? "⌘+Enter" : "Ctrl+Enter";
let opening = false;

export function revealActions(paths: string[]): HTMLElement {
  const actions = document.createElement("div"); actions.className = "reveal-actions";
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return actions;
  const message = document.createElement("span"); message.className = "reveal-message";
  message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
  const buttons: HTMLButtonElement[] = [];
  const addButton = (path: string, label: string, parent: HTMLElement): HTMLButtonElement => {
    const button = document.createElement("button"); button.type = "button";
    button.className = "secondary reveal-button"; button.dataset.revealPath = path;
    button.title = `${path}\nÜst klasörde seçili göster · ${revealShortcut}`;
    button.setAttribute("aria-label", `Klasörde göster: ${path}`);
    button.setAttribute("aria-keyshortcuts", mac ? "Meta+Enter" : "Control+Enter");
    button.append(icon("folder"), document.createTextNode(label));
    button.disabled = !isTauri();
    button.addEventListener("click", () => { void show(path); });
    buttons.push(button); parent.append(button); return button;
  };
  const show = async (path: string): Promise<void> => {
    if (opening || !isTauri()) return;
    opening = true; for (const button of buttons) button.disabled = true;
    message.classList.remove("warning"); message.textContent = "Konum açılıyor…";
    try { await invoke("reveal_path", { path }); message.textContent = mac ? "Finder’a gönderildi." : "Explorer’a gönderildi."; }
    catch (error: unknown) { message.classList.add("warning"); message.textContent = String(error); }
    finally { opening = false; for (const button of buttons) button.disabled = !isTauri(); }
  };
  if (unique.length === 1) addButton(unique[0], "Klasörde göster", actions);
  else {
    const menu = document.createElement("details"); menu.className = "reveal-locations";
    const summary = document.createElement("summary"); summary.textContent = `Klasörde göster · ${unique.length} konum`;
    summary.title = `Konumu seç · ${revealShortcut}`;
    menu.append(summary);
    const list = document.createElement("div"); list.className = "reveal-location-list";
    for (const path of unique) addButton(path, path, list);
    menu.append(list); actions.append(menu);
  }
  actions.append(message);
  return actions;
}

export function installRevealShortcut(results: HTMLElement): void {
  results.addEventListener("keydown", (event: KeyboardEvent) => {
    if (!isRevealShortcut(event, mac) || !(event.target instanceof HTMLElement)) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const direct = event.target.closest<HTMLButtonElement>("button[data-reveal-path]");
    if (direct) { event.preventDefault(); if (!direct.disabled) direct.click(); return; }
    // The closest focusable result owns the action; do not accidentally reveal
    // a parent project when a nested file row has keyboard focus.
    const owner = event.target.closest<HTMLElement>("[data-reveal-owner]");
    if (!owner) return;
    const actions = Array.from(owner.children).find((child) => child.classList.contains("reveal-actions"));
    if (!actions) return;
    const menu = actions.querySelector<HTMLDetailsElement>(".reveal-locations");
    event.preventDefault();
    if (menu) { menu.open = true; menu.querySelector<HTMLButtonElement>("button")?.focus(); }
    else { const button = actions.querySelector<HTMLButtonElement>("button"); if (button && !button.disabled) button.click(); }
  });
}
