import test from 'node:test';
import assert from 'node:assert/strict';
import {updateProgress,updateInstallationCopy} from '../src/update-model.ts';
import {reportMessage} from '../src/legacy-messages.ts';

test('Mac update consent describes app replacement while Windows retains portable installer warning',()=>{
  const mac=updateInstallationCopy(false), windows=updateInstallationCopy(true);
  assert.match(mac.body,/Applications/);
  assert.match(mac.body,/replaces this Roomit app/);
  assert.doesNotMatch(mac.body,/EXE|runs an installer/);
  assert.match(windows.body,/will not replace that file/);
});

test('download progress handles missing totals, measured zero and complete downloads',()=>{
  assert.equal(updateProgress(0,100),0);
  assert.equal(updateProgress(50,200),25);
  assert.equal(updateProgress(200,200),100);
  for(const [done,total]of [[5,null],[5,0],[-1,10],[10,5],[NaN,100],[5,Infinity]])assert.equal(updateProgress(done,total),null);
});

test('old generated report explanations are displayed in English without changing suffix paths',()=>{
  assert.equal(reportMessage('AI aracına ait geçmiş, ayar veya proje verileri içerebilir; cache kabul edilmez.'),'May contain AI history, settings, or project data. Not classified as cache.');
  assert.equal(reportMessage('Disk listesi alınamadı: G:\\Arşiv'),'Could not load disks: G:\\Arşiv');
  assert.equal(reportMessage('Already English'),'Already English');
  assert.equal(reportMessage('Disk/klasör taranamadı: G:\\Arşiv: Access denied'),'Could not scan disk/folder: G:\\Arşiv: Access denied');
});
