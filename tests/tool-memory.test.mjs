import test from 'node:test';
import assert from 'node:assert/strict';
import {observeToolMemory, observedMinutes, RAM_FLOOR} from '../src/tool-memory.ts';

const row = (pid = 1, cpuPercent = 1, bytes = RAM_FLOOR, toolId = 'codex') =>
  ({pid, cpuPercent, memoryBytes: String(bytes), toolId});
const start = 10_000;

test('continuous samples qualify at 20 minutes and history stays bounded beyond the window', () => {
  const entries = new Map();
  for (let seconds = 0; seconds <= 3600; seconds += 2) {
    observeToolMemory(entries, start + seconds * 1000, [row()]);
    if (seconds === 1198) assert.equal(observedMinutes(entries.get('codex')), 19);
    if (seconds === 1200) assert.equal(observedMinutes(entries.get('codex')), 20);
  }
  const entry = entries.get('codex');
  assert.equal(observedMinutes(entry), 60);
  assert.ok(entry.points.length <= 241);
  assert.ok(entry.points[0].at >= entry.latest.at - 1_200_000);
  assert.deepEqual(entry.points.at(-1), entry.latest);
});

test('aggregate tool members, keep tools separate, ignore unrelated processes', () => {
  const entries = new Map();
  observeToolMemory(entries, start, [
    row(1, 0.5, RAM_FLOOR / 2n), row(2, 0.5, RAM_FLOOR / 2n),
    row(3, 0, RAM_FLOOR, 'ollama'), row(4, 80, RAM_FLOOR, null),
  ]);
  assert.equal(entries.size, 2);
  assert.equal(entries.get('codex').latest.cpu, 1);
  assert.equal(entries.get('codex').latest.bytes, Number(RAM_FLOOR));
  observeToolMemory(entries, start + 2000, [row(1, 0.6), row(2, 0.5), row(3, 0, RAM_FLOOR, 'ollama')]);
  assert.deepEqual([...entries.keys()], ['ollama']);
});

test('missing CPU, an exited tool, a short CPU spike or RAM dip ends the observation', () => {
  for (const rows of [[], [row(1, null)], [row(1, 1.01)], [row(1, 0, RAM_FLOOR - 1n)]]) {
    const entries = new Map();
    observeToolMemory(entries, start, [row()]);
    observeToolMemory(entries, start + 2000, rows);
    assert.equal(entries.size, 0);
    observeToolMemory(entries, start + 4000, [row()]);
    assert.equal(entries.get('codex').since, start + 4000);
  }
});

test('gaps, clock rollback and complete process replacement start a fresh observation', () => {
  const entries = new Map();
  observeToolMemory(entries, start, [row()]);
  observeToolMemory(entries, start, [row()]);
  assert.equal(entries.get('codex').points.length, 1);
  for (const [at, pid] of [[start + 7000, 1], [start + 6000, 1], [start + 8000, 2]]) {
    observeToolMemory(entries, at, [row(pid)]);
    assert.equal(entries.get('codex').since, at);
    assert.equal(entries.get('codex').points.length, 1);
  }
});
