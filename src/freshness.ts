import { invoke, isTauri } from "@tauri-apps/api/core";

export interface WatchStatus { indexId: string; stale: boolean; unavailable: string | null }
export function freshnessNotice(status: WatchStatus | null): { title: string; message: string; warning: boolean } {
  if (status?.stale) return { title: "Sonuçlar güncel değil", message: "Taranan klasörlerde değişiklik algılandı. Güncel sonuçlar için Yeniden tara düğmesine bas. Tarama otomatik başlamaz.", warning: true };
  if (status?.unavailable) return { title: "Güncellik doğrulanamıyor", message: `${status.unavailable} Güncel durumu görmek için yeniden tarayabilirsin.`, warning: true };
  if (!status) return { title: "", message: "Değişiklik izlemesi hazırlanıyor…", warning: false };
  return { title: "", message: "Uygulama açıkken bu kapsamdaki değişiklikler izleniyor. Yeniden taramayı sen başlatırsın.", warning: false };
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
        current = { indexId: id!, stale: false, unavailable: `Değişiklik izlemesi okunamadı: ${String(error)}` }; render();
      }
      if (request === generation && !current?.stale) timer = setTimeout(() => void poll(), 2000);
    }
    void poll();
  }
  window.addEventListener("beforeunload", () => { generation++; clearTimeout(timer); });
  return { set };
}
