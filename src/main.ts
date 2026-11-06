import { invoke, isTauri } from "@tauri-apps/api/core";
import "./styles.css";

type Category = "buildOutput" | "dependencies" | "pythonCache" | "aiUserData" | "protectedData";
interface Finding {
  path: string;
  category: Category;
  disposition: "reviewRequired" | "protected";
  ruleId: string;
  reason: string;
}
interface InspectionReport {
  root: string;
  scope: "directChildren";
  projects: string[];
  findings: Finding[];
  warnings: string[];
}

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing interface element: ${selector}`);
  return result;
}

const form = element<HTMLFormElement>("#inspect-form");
const input = element<HTMLInputElement>("#root");
const button = element<HTMLButtonElement>("#inspect-button");
const status = element<HTMLParagraphElement>("#status");
const results = element<HTMLDivElement>("#results");
const categoryLabels: Record<Category, string> = {
  buildOutput: "Derleme çıktısı", dependencies: "Bağımlılıklar", pythonCache: "Python cache",
  aiUserData: "AI kullanıcı verisi", protectedData: "Korunan veri",
};

// Filesystem paths and errors are untrusted text; never insert them as HTML.
function textNode(tag: string, value: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function showReport(report: InspectionReport): void {
  results.append(textNode("p", report.root, "report-path"));
  results.append(textNode("p", report.projects.length
    ? `Tanınan proje türleri: ${report.projects.join(" · ")}`
    : "Bu klasörün doğrudan öğelerinde desteklenen bir proje belirteci bulunamadı.", "muted"));
  if (report.findings.length) {
    const list = document.createElement("ul");
    list.className = "findings";
    for (const finding of report.findings) {
      const item = document.createElement("li");
      const heading = textNode("div", "", "finding-heading");
      heading.append(textNode("strong", categoryLabels[finding.category]));
      heading.append(textNode("span", finding.disposition === "protected" ? "Korunuyor" : "İnceleme gerekli", "tag"));
      item.append(heading, textNode("p", finding.path, "report-path"), textNode("p", finding.reason, "muted"));
      list.append(item);
    }
    results.append(list);
  } else {
    results.append(textNode("p", "Bu sınırlı incelemede eşleşen öğe bulunamadı. Bu sonuç, klasördeki her şeyin tarandığı anlamına gelmez.", "empty-state"));
  }
  for (const warning of report.warnings) results.append(textNode("p", warning, "warning"));
}

if (isTauri()) {
  element("#runtime-note").textContent = "Yalnızca girdiğin klasör incelenir. Hiçbir dosya değiştirilmez.";
} else {
  button.disabled = true;
  input.disabled = true;
  status.textContent = "Tarayıcı önizlemesi: Gerçek inceleme için Roomit’i masaüstünde aç.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const root = input.value.trim();
  if (!root || !isTauri()) return;
  button.disabled = true;
  input.disabled = true;
  results.replaceChildren();
  results.setAttribute("aria-busy", "true");
  status.className = "";
  status.textContent = "Klasör inceleniyor…";
  try {
    const report = await invoke<InspectionReport>("inspect_workspace", { root });
    showReport(report);
    status.textContent = `İnceleme tamamlandı: ${report.findings.length} öğe, ${report.warnings.length} uyarı. Dosyalar değiştirilmedi.`;
  } catch (error: unknown) {
    status.className = "warning";
    status.textContent = `Klasör incelenemedi: ${String(error)}`;
  } finally {
    results.setAttribute("aria-busy", "false");
    button.disabled = false;
    input.disabled = false;
  }
});
