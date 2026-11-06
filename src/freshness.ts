import { invoke, isTauri } from "@tauri-apps/api/core";

export interface WatchStatus { indexId: string; stale: boolean; unavailable: string | null }
export function freshnessNotice(status: WatchStatus | null): { title: string; message: string; warning: boolean } {
  if (status?.stale) return { title: "Results are out of date", message: "Changes detected in scanned folders. Select Rescan to refresh your results. Scanning does not start automatically.", warning: true };
  if (status?.unavailable) return { title: "Freshness could not be verified", message: `${status.unavailable} Rescan to see the current state.`, warning: true };
  if (!status) return { title: "", message: "Preparing change monitoring…", warning: false };
  return { title: "", message: "Changes in this scope are monitored while Roomit is open. You choose when to rescan.", warning: false };
}

export function installFreshness() {
  const banner = document.querySelector<HTMLElement>("#snapshot-banner")!;
  const title = document.querySelector<HTMLElement>("#snapshot-watch-state")!;
  const copy = document.querySelector<HTMLElement>("#snapshot-freshness")!;
  let indexId: string | null = null, generation = 0;
  let current: WatchStatus | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function render() {
    const notice = freshnessNotice(current);
    title.hidden = !notice.title; title.textContent = notice.title; copy.textContent = notice.message;
    banner.classList.toggle("snapshot-outdated", notice.warning);
  }
  function set(id: string | null) {
    if (indexId === id) { render(); return; }
    indexId = id; const request = ++generation; clearTimeout(timer); current = null; render();
    if (!id || !isTauri()) return;
    async function poll() {
      try {
        const status = await invoke<WatchStatus>("watch_status", { indexId: id });
        if (request !== generation || status.indexId !== id) return;
        current = status; render();
      } catch (error) {
        if (request !== generation) return;
        current = { indexId: id!, stale: false, unavailable: `Could not read monitoring status: ${String(error)}` }; render();
      }
      if (request === generation && !current?.stale) timer = setTimeout(() => void poll(), 2000);
    }
    void poll();
  }
  window.addEventListener("beforeunload", () => { generation++; clearTimeout(timer); });
  return { set };
}
