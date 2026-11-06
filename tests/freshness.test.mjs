import test from 'node:test';
import assert from 'node:assert/strict';
import { freshnessNotice } from '../src/freshness.ts';

test('actual changes show stale warning and leave rescan to the user', () => {
  const notice = freshnessNotice({indexId:'scan',stale:true,unavailable:null});
  assert.equal(notice.title,'Sonuçlar güncel değil');
  assert.equal(notice.warning,true); assert.match(notice.message,/Tarama otomatik başlamaz/);
});
test('active session monitoring never asserts saved data is current', () => {
  assert.equal(freshnessNotice(null).title,'');
  const notice = freshnessNotice({indexId:'scan',stale:false,unavailable:null});
  assert.equal(notice.warning,false); assert.match(notice.message,/izleniyor/); assert.doesNotMatch(notice.message,/güncel\b/);
});
test('incomplete monitoring is explicit and cannot clear an observed change', () => {
  const notice = freshnessNotice({indexId:'scan',stale:false,unavailable:'Disk disconnected'});
  assert.equal(notice.title,'Güncellik doğrulanamıyor'); assert.equal(notice.warning,true);
  assert.equal(freshnessNotice({indexId:'scan',stale:true,unavailable:'Later error'}).title,'Sonuçlar güncel değil');
});
