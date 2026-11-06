import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotTitle, snapshotDate } from '../src/snapshot.ts';

test('saved snapshots distinguish partial and cancelled scans', () => {
  assert.equal(snapshotTitle({status:'completed',totalSizeComplete:true}, true), 'Kaydedilen tarama sonuçları');
  assert.match(snapshotTitle({status:'cancelled',totalSizeComplete:false}, true), /İptal edildi, kısmi/);
  assert.match(snapshotTitle({status:'completed',totalSizeComplete:false}, false), /Kısmi/);
  assert.match(snapshotTitle({status:'limited',totalSizeComplete:false}, true), /Kısmi/);
});

test('scan date is explicit and invalid timestamps never show a fabricated date', () => {
  assert.match(snapshotDate(Date.UTC(2026,10,4,9,0)), /2026/);
  for (const value of [undefined,0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER]) assert.equal(snapshotDate(value),'Tarama tarihi bilinmiyor.');
});
