import test from 'node:test';
import assert from 'node:assert/strict';
import { freshnessNotice } from '../src/freshness.ts';

test('actual changes show stale warning and leave rescan to the user', () => {
  const notice = freshnessNotice({indexId:'scan',stale:true,unavailable:null});
  assert.equal(notice.title,'Results are out of date');
  assert.equal(notice.warning,true); assert.match(notice.message,/Scanning does not start automatically/);
});
test('active session monitoring never asserts saved data is current', () => {
  assert.equal(freshnessNotice(null).title,'');
  const notice = freshnessNotice({indexId:'scan',stale:false,unavailable:null});
  assert.equal(notice.warning,false); assert.match(notice.message,/monitored/); assert.doesNotMatch(notice.message,/results are current/i);
});
test('incomplete monitoring is explicit and cannot clear an observed change', () => {
  const notice = freshnessNotice({indexId:'scan',stale:false,unavailable:'Disk disconnected'});
  assert.equal(notice.title,'Freshness could not be verified'); assert.equal(notice.warning,true);
  assert.equal(freshnessNotice({indexId:'scan',stale:true,unavailable:'Later error'}).title,'Results are out of date');
});
