import { CPU_CEILING, OBSERVATION_MINUTES, observedMinutes } from "./tool-memory";
import type { ToolMemoryObservation } from "./tool-memory";
import { formatMemory } from "./workspace-model";

function historyPlot(label: string, maximum: string, values: number[], times: number[]): HTMLElement {
  const figure = document.createElement("figure");
  const title = document.createElement("figcaption");
  title.textContent = label;
  const scale = document.createElement("span");
  scale.textContent = maximum;
  title.append(scale);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 300 48");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("points", values.map((v, i) => `${times[i] * 300},${47 - v * 46}`).join(" "));
  line.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(line);
  figure.append(title, svg);
  return figure;
}

export function toolMemoryCard(name: string, initiallyOpen: boolean) {
  const element = document.createElement("details");
  element.className = "tool-memory";
  element.hidden = true;
  element.open = initiallyOpen;
  const summary = document.createElement("summary");
  const charts = document.createElement("div");
  element.append(summary, charts);
  let current: ToolMemoryObservation | undefined;
  function draw() {
    if (!element.open || !current || element.hidden) return;
    const { points, latest } = current;
    const span = OBSERVATION_MINUTES * 60_000;
    const times = points.map(p => 1 - (latest.at - p.at) / span);
    const peak = Math.max(...points.map(p => p.bytes));
    const time = document.createElement("small");
    time.textContent = `Last ${OBSERVATION_MINUTES} min · latest sample on the right`;
    charts.replaceChildren(
      historyPlot("Device CPU", `0–${CPU_CEILING}%`, points.map(p => p.cpu / CPU_CEILING), times),
      historyPlot("Resident RAM", `0–${formatMemory(String(peak))}`, points.map(p => p.bytes / peak), times),
      time,
    );
  }
  element.ontoggle = draw;
  function update(observation?: ToolMemoryObservation) {
    current = observation;
    element.hidden = !current || observedMinutes(current) < OBSERVATION_MINUTES;
    if (element.hidden || !current) {
      element.open = false;
      return;
    }
    summary.textContent = `${formatMemory(String(current.latest.bytes))} RAM · low CPU for ${observedMinutes(current)} min`;
    summary.title = `Show CPU and RAM history for ${name}`;
    draw();
  }
  return { element, update };
}
