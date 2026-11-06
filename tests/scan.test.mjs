import test from 'node:test';
import assert from 'node:assert/strict';
import { scanTarget, usedPercent } from '../src/scan.ts';
const disk = (path, totalSpace = '1000', availableSpace = '300') => ({ path, name: path, totalSpace, availableSpace, removable: false });
test('AI scan targets known locations without requiring or falling back to disks', () => {
  assert.deepEqual(scanTarget('ai', '', '', [], true), {mode:'ai',root:''});
  assert.deepEqual(scanTarget('ai', '/ordinary-folder', 'G:\\', [disk('G:\\')], false), {mode:'ai',root:''});
});
test('single disk targets exactly the selected mount without falling back', () => {
  const disks = [disk('C:\\'), disk('G:\\')];
  assert.deepEqual(scanTarget('disk', 'C:\\work', 'G:\\', disks, false), { mode: 'disk', root: 'G:\\' });
  assert.equal(scanTarget('disk', '', '', disks, false), null);
  assert.equal(scanTarget('disk', '', 'G:\\', [disks[0]], false), null);
  assert.equal(scanTarget('disk', '', 'G:\\', disks, true), null);
});
test('Mac volume paths remain distinct and folder/computer scopes stay explicit', () => {
  const disks = [disk('/'), disk('/System/Volumes/Data'), disk('/Volumes/Archive')];
  assert.deepEqual(scanTarget('disk', '', '/Volumes/Archive', disks, false), { mode: 'disk', root: '/Volumes/Archive' });
  assert.equal(scanTarget('disk', '', '/volumes/archive', disks, false), null);
  assert.deepEqual(scanTarget('computer', '/folder', '/Volumes/Archive', disks, false), { mode: 'computer', root: '' });
  assert.equal(scanTarget('computer', '', '', [], false), null);
  assert.deepEqual(scanTarget('folder', ' /project ', '', [], true), { mode: 'folder', root: '/project' });
});
test('capacity meters use exact integer counts and handle unavailable capacities', () => {
  assert.equal(usedPercent(disk('/', '1000', '300')), 70);
  assert.equal(usedPercent(disk('/', '0', '0')), null);
  assert.equal(usedPercent(disk('/', '1000', '1001')), 0);
  assert.equal(usedPercent(disk('/', '18446744073709551615', '0')), 100);
});
