import catalog from "./ai-catalog.json";
import { icon } from "./icons";
const assets = import.meta.glob<string>("./assets/tools/*.{svg,png}", { eager: true, query: "?url", import: "default" });
const logoNames: Record<string,string> = { "claude-code":"claude", claude:"claude", chatgpt:"openai", copilot:"githubcopilot" };
export function toolId(name: string): string | undefined { return catalog.find(t => t.name === name)?.id; }
export function toolLogo(id: string, size = 32): HTMLImageElement {
  const name=logoNames[id]||id;
  const url = assets[`./assets/tools/${name}.svg`] || assets[`./assets/tools/${name}.png`];
  if (!url) return icon("ai", "tool-logo fallback-logo");
  const image = document.createElement("img"); image.src = url; image.alt = ""; image.className = "tool-logo"; image.width = size; image.height = size; return image;
}
