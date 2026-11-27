import { setTheme } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { appearanceCopy } from "./locales/en-appearance";
import "./theme-switch.css";

export function installThemePicker(select: HTMLSelectElement): void {
  const root = document.documentElement;
  const systemDark = matchMedia("(prefers-color-scheme: dark)");
  select.labels![0].querySelector("span")!.textContent = appearanceCopy.label;
  for (const [value, label] of Object.entries(appearanceCopy.choices)) {
    select.add(new Option(label, value));
  }
  select.value = root.dataset.themePreference || "system";

  function applyAppearance(): void {
    const theme = select.value === "system" ? (systemDark.matches ? "dark" : "light") : select.value;
    if (theme !== root.dataset.theme) {
      root.dataset.theme = theme;
      window.dispatchEvent(new Event("roomit-theme-change"));
    }
  }

  function syncNativeTheme(): void {
    if (isTauri()) {
      const theme = select.value === "light" || select.value === "dark" ? select.value : null;
      void setTheme(theme).catch(error => console.warn("Could not apply native appearance", error));
    }
  }

  select.addEventListener("change", () => {
    root.dataset.themePreference = select.value;
    try {
      localStorage.setItem("roomit-theme", select.value);
    } catch {
      // The choice still applies to this window.
    }
    applyAppearance();
    syncNativeTheme();
  });
  systemDark.addEventListener("change", applyAppearance);
  applyAppearance();
  syncNativeTheme();
}
