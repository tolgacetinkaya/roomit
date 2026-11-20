import { toolUsage } from "./workspace-model.ts";
import type { ProcessRow } from "./workspace-model";

export const OBSERVATION_MINUTES = 20;
export const CPU_CEILING = 1;
export const RAM_FLOOR = 1024n ** 3n;
const windowMs = OBSERVATION_MINUTES * 60_000;
const maxGapMs = 6_000;
const bucketMs = 5_000;

export interface ToolMemoryPoint {
  at: number;
  cpu: number;
  bytes: number;
}

export interface ToolMemoryObservation {
  since: number;
  latest: ToolMemoryPoint;
  points: ToolMemoryPoint[];
  pids: Set<number>;
}

export function observedMinutes(observation: ToolMemoryObservation): number {
  return Math.floor((observation.latest.at - observation.since) / 60_000);
}

// Each entry represents one uninterrupted sequence of qualifying samples.
export function observeToolMemory(
  observations: Map<string, ToolMemoryObservation>, at: number, rows: ProcessRow[],
): void {
  const members = new Map<string, ProcessRow[]>();
  for (const row of rows) {
    if (!row.toolId) continue;
    const group = members.get(row.toolId);
    if (group) group.push(row);
    else members.set(row.toolId, [row]);
  }
  for (const id of observations.keys()) {
    if (!members.has(id)) observations.delete(id);
  }
  for (const [id, group] of members) {
    const previous = observations.get(id);
    const usage = toolUsage(group, id);
    if (usage.cpu === null || !Number.isFinite(usage.cpu) || usage.cpu > CPU_CEILING ||
        BigInt(usage.memory) < RAM_FLOOR) {
      observations.delete(id);
      continue;
    }
    const latest = { at, cpu: usage.cpu, bytes: Number(usage.memory) };
    const pids = new Set(group.map(row => row.pid));
    if (!previous || at < previous.latest.at || at - previous.latest.at > maxGapMs ||
        !group.some(row => previous.pids.has(row.pid))) {
      observations.set(id, { since: at, latest, points: [latest], pids });
      continue;
    }
    if (at === previous.latest.at) continue;
    const points = previous.points;
    // Evaluate every sample for continuity, keep one chart point per bucket.
    if (Math.floor(at / bucketMs) === Math.floor(previous.latest.at / bucketMs)) points.pop();
    while (points.length && points[0].at < at - windowMs) points.shift();
    points.push(latest);
    previous.latest = latest;
    previous.pids = pids;
  }
}
