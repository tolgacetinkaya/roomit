import { invoke } from "@tauri-apps/api/core";
import { formatBytes, sizeLabel } from "./report";
import type { SizedEntry } from "./report";
import { pathName } from "./groups";
import { icon } from "./icons";
import { revealActions } from "./reveal";

interface Cursor { sortKey: string; path: string }
interface SizePage {
  entries: SizedEntry[]; total: string | null; first: Cursor | null; last: Cursor | null;
  hasPrevious: boolean; hasNext: boolean;
}
let activeCleanup: (() => void) | null = null;
export function disposeSizeBrowser(): void { activeCleanup?.(); activeCleanup = null; }
const node = (tag: string, text = "", className = ""): HTMLElement => {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
};
function entryCard(entry: SizedEntry): HTMLElement {
  const card = node("article", "", "result-card size-result"); card.tabIndex = 0; card.dataset.revealOwner = "";
  const heading = node("div", "", "member-heading");
  const title = node("span", "", "size-entry-title");
  title.append(icon(entry.kind === "file" ? "file" : "folder"), node("strong", pathName(entry.path)));
  heading.append(title, node("span", sizeLabel(entry.logicalBytes, entry.sizeComplete)));
  card.append(heading, node("p", entry.path, "report-path"), revealActions([entry.path])); return card;
}

export function renderSizeBrowser(indexId: string, minimum: bigint, search: string): HTMLElement {
  const root = node("div", "", "size-browser");
  root.append(node("p", `${minimum > 0n ? formatBytes(minimum.toString()) + " ve üzeri" : "Boyut sınırı yok"} · Ölçülen dosya ve alt klasörler`, "size-filter-summary"),
    node("p", "Tüm eşleşmeler sayfa sayfa gösterilir. Klasör boyutu alt dosyalarını da içerir; bu boyutları birlikte toplama.", "hint"));
  const jumps = node("nav", "", "size-jumps"); jumps.setAttribute("aria-label", "Boyut listelerine git"); root.append(jumps);
  const cleanup: (() => void)[] = [];
  activeCleanup = () => { for (const dispose of cleanup) dispose(); };
  for (const kind of ["file", "directory"] as const) {
    const panel = node("section", "", "size-page-panel");
    const heading = node("div", "", "section-header");
    const name = kind === "file" ? "Dosyalar" : "Klasörler";
    const jump = document.createElement("button"); jump.type = "button"; jump.className = "text-button";
    jump.textContent = kind === "file" ? "Dosyalara git" : "Klasörlere git";
    jump.addEventListener("click", () => { panel.scrollIntoView({ block: "start" }); heading.tabIndex = -1; heading.focus({ preventScroll: true }); }); jumps.append(jump);
    const count = node("span", "Yükleniyor…", "section-count");
    heading.append(node("h3", name), count);
    const status = node("p", "", "hint"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const progress = document.createElement("progress"); progress.setAttribute("aria-label", `${name} yükleniyor`);
    const list = node("div", "", "group-list size-page-list");
    const controls = node("div", "", "size-page-controls");
    const button = (text: string): HTMLButtonElement => {
      const element = document.createElement("button"); element.type = "button"; element.className = "secondary"; element.textContent = text; return element;
    };
    const previous = button("Önceki"), next = button("Sonraki"), cancel = button("Yüklemeyi iptal et"), retry = button("Tekrar dene");
    const previousTop = button("Önceki"), nextTop = button("Sonraki");
    previous.setAttribute("aria-label", `Önceki ${kind === "file" ? "dosya" : "klasör"} sayfası`);
    next.setAttribute("aria-label", `Sonraki ${kind === "file" ? "dosya" : "klasör"} sayfası`);
    previousTop.setAttribute("aria-label", previous.getAttribute("aria-label")!); nextTop.setAttribute("aria-label", next.getAttribute("aria-label")!);
    const topControls = node("div", "", "size-page-top-controls"); topControls.append(previousTop, nextTop); heading.append(topControls);
    cancel.setAttribute("aria-label", `${name} yüklemesini iptal et`);
    retry.hidden = true; controls.append(previous, next, cancel, retry);
    panel.append(heading, status, progress, list, controls); root.append(panel);
    let disposed = false, currentRequest: string | null = null, total: string | null = null;
    let page: SizePage | null = null, pageNumber = 1;
    let lastAttempt: { cursor: Cursor | null; direction: "next" | "previous"; target: number } = { cursor: null, direction: "next", target: 1 };
    const cancelRequest = (id: string): void => { void invoke("cancel_size_query", { requestId: id }).catch(() => {}); };
    const update = (): void => {
      const busy = currentRequest !== null;
      panel.setAttribute("aria-busy", String(busy)); progress.hidden = !busy; cancel.hidden = !busy;
      previous.disabled = busy || !page?.hasPrevious; next.disabled = busy || !page?.hasNext;
      previousTop.disabled = previous.disabled; nextTop.disabled = next.disabled;
      count.textContent = total !== null ? `${new Intl.NumberFormat("tr-TR").format(BigInt(total))} ${kind === "file" ? "dosya" : "klasör"} · Sayfa ${pageNumber}` : busy ? "Yükleniyor…" : "—";
    };
    const load = async (cursor: Cursor | null, direction: "next" | "previous", target: number): Promise<void> => {
      if (disposed) return;
      if (currentRequest) cancelRequest(currentRequest);
      const requestId = crypto.randomUUID(); currentRequest = requestId;
      lastAttempt = { cursor, direction, target }; status.className = "hint"; status.textContent = "Sonuçlar yükleniyor…";
      retry.hidden = true; cancel.disabled = false; update();
      try {
        const response = await invoke<SizePage>("query_size_entries", { request: {
          indexId, requestId, kind, minimumBytes: minimum.toString(), query: search,
          cursor, direction, includeTotal: total === null,
        } });
        if (disposed || currentRequest !== requestId) return;
        page = response; pageNumber = target; total = response.total ?? total;
        list.replaceChildren(...response.entries.map(entryCard));
        if (!response.entries.length) list.append(node("div", "Bu boyut ve arama koşullarına uyan öğe bulunamadı.", "empty-note"));
        status.textContent = response.entries.length ? `Bu sayfada ${response.entries.length} öğe gösteriliyor.` : "Eşleşme yok.";
        if (cursor) { panel.scrollIntoView({ block: "start" }); heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      } catch (error: unknown) {
        if (disposed || currentRequest !== requestId) return;
        status.className = "warning"; status.textContent = String(error); retry.hidden = false;
      } finally {
        if (!disposed && currentRequest === requestId) { currentRequest = null; update(); }
      }
    };
    for (const element of [previous, previousTop]) element.addEventListener("click", () => { if (page?.first) void load(page.first, "previous", Math.max(1, pageNumber - 1)); });
    for (const element of [next, nextTop]) element.addEventListener("click", () => { if (page?.last) void load(page.last, "next", pageNumber + 1); });
    retry.addEventListener("click", () => { void load(lastAttempt.cursor, lastAttempt.direction, lastAttempt.target); });
    cancel.addEventListener("click", () => {
      if (!currentRequest) return;
      const requestId = currentRequest; currentRequest = null; cancelRequest(requestId);
      status.className = "hint"; status.textContent = "Sonuç yükleme iptal edildi. Tekrar deneyebilirsin.";
      retry.hidden = false; update();
    });
    cleanup.push(() => { disposed = true; if (currentRequest) cancelRequest(currentRequest); currentRequest = null; });
    void load(null, "next", 1);
  }
  return root;
}
