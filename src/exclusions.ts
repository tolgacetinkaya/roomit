import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface ExclusionView { userPaths: string[]; automaticPaths: string[]; notes: string[] }

export function installExclusions(onState: () => void, onSaved: () => void) {
  const add = document.querySelector<HTMLButtonElement>("#add-exclusion")!;
  const retry = document.querySelector<HTMLButtonElement>("#retry-exclusions")!;
  const list = document.querySelector<HTMLUListElement>("#exclusion-list")!;
  const status = document.querySelector<HTMLParagraphElement>("#exclusion-status")!;
  const count = document.querySelector<HTMLSpanElement>("#exclusion-count")!;
  let paths: string[] = [], loaded = false, busy = false, scanBusy = false;
  function controls() {
    add.disabled = !isTauri() || !loaded || busy || scanBusy;
    retry.disabled = busy || scanBusy;
    for (const button of list.querySelectorAll("button")) button.disabled = busy || scanBusy;
  }
  function render() {
    list.replaceChildren(); count.textContent = `· ${paths.length} folders + automatic`;
    for (const path of paths) {
      const row = document.createElement("li");
      const name = document.createElement("span"); name.textContent = path; name.title = path;
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "text-button";
      remove.textContent = "Remove from list"; remove.setAttribute("aria-label", `${path}: remove folder from exclusions`);
      remove.addEventListener("click", () => void change([], path)); row.append(name, remove); list.append(row);
    }
    if (!paths.length) { const empty = document.createElement("li"); empty.textContent = "No folders added yet."; empty.className = "hint"; list.append(empty); }
    controls();
  }
  async function load() {
    if (busy || scanBusy || !isTauri()) return;
    busy = true; status.textContent = "Loading settings…"; controls(); onState();
    try {
      const data = await invoke<ExclusionView>("get_exclusions"); paths = data.userPaths;
      const automatic = document.querySelector<HTMLUListElement>("#automatic-exclusion-list")!; automatic.replaceChildren();
      for (const path of data.automaticPaths) { const row = document.createElement("li"); row.textContent = path; automatic.append(row); }
      document.querySelector("#automatic-exclusion-note")!.textContent = data.notes.join(" ");
      loaded = true; render(); retry.hidden = true; status.className = "hint";
      status.textContent = "Your choices are saved on this device. Removing an exclusion does not change the folder.";
    } catch (error) {
      loaded = false; status.className = "warning";
      status.textContent = `Settings could not be loaded. Scanning is paused to preserve your exclusions. ${String(error)}`;
      count.textContent = "· Settings unavailable"; retry.hidden = false;
      document.querySelector<HTMLDetailsElement>("#exclusion-settings")!.open = true;
    } finally { busy = false; controls(); onState(); }
  }
  async function change(additions: string[], remove: string | null) {
    if (!loaded || busy || scanBusy) return;
    busy = true; controls(); onState();
    try {
      paths = await invoke<string[]>("change_exclusions", { add: additions, remove }); render();
      status.className = "hint"; status.textContent = "Saved. Applies to your next scan."; onSaved();
    } catch (error) {
      status.className = "warning"; status.textContent = `Could not save. Your previous choices were preserved. ${String(error)}`;
    } finally { busy = false; controls(); onState(); }
  }
  add.addEventListener("click", async () => {
    if (!loaded || busy || scanBusy) return;
    busy = true; controls(); onState();
    let selected: string[] | null = null;
    try {
      selected = await open({ directory: true, multiple: true, recursive: true,
        title: "Roomit — Select folders to exclude", canCreateDirectories: false, fileAccessMode: "scoped" });
    } catch (error) { status.className = "warning"; status.textContent = `Could not open the folder picker: ${String(error)}`; }
    finally { busy = false; controls(); onState(); }
    if (selected?.length) await change(selected, null);
  });
  retry.addEventListener("click", () => void load());
  if (!isTauri()) { status.textContent = "Folder selection and saved settings are available in the desktop app."; count.textContent = "· Available on desktop"; }
  return { get ready() { return loaded && !busy; }, get busy() { return busy; },
    update(disabled: boolean) { scanBusy = disabled; controls(); }, load };
}
