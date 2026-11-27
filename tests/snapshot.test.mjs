import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotTitle, snapshotDate, snapshotDuration } from '../src/snapshot.ts';

test('app-scoped saved results identify their scope even when cancelled', () => {
  const report={scope:'ai',aiToolId:'codex',root:'Codex data locations',status:'cancelled',totalSizeComplete:false};
  assert.equal(snapshotTitle(report,true),'Saved scan results · Codex data locations · Cancelled, partial');
});

test('saved snapshots distinguish partial and cancelled scans', () => {
  assert.equal(snapshotTitle({status:'completed',totalSizeComplete:true}, true), 'Saved scan results');
  assert.match(snapshotTitle({status:'cancelled',totalSizeComplete:false}, true), /Cancelled, partial/);
  assert.match(snapshotTitle({status:'completed',totalSizeComplete:false}, false), /Partial/);
  assert.match(snapshotTitle({status:'limited',totalSizeComplete:false}, true), /Partial/);
});

test('scan date is explicit and invalid timestamps never show a fabricated date', () => {
  assert.match(snapshotDate(Date.UTC(2026,10,4,9,0)), /2026/);
  for (const value of [undefined,0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER]) assert.equal(snapshotDate(value),'Scan date unknown.');
});

test('scan time survives cancellation and restoration without inventing a time for old reports', () => {
  for (const value of [null, undefined, -1, Infinity, 1.5]) assert.equal(snapshotDuration(value), '');
  assert.equal(snapshotDuration(75), 'Scan time <1s');
  assert.equal(snapshotDuration(3950999), 'Scan time 1h 5m 50s');
  assert.match(snapshotTitle({status:'cancelled', scanDurationMs:94150},true), /Cancelled, partial · Scan time 1m 34s$/);
});
