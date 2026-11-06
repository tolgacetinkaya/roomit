import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, sizeLabel, matchesFilter, scanSummary } from '../src/report.ts';

test('byte formatting uses decimal units with English numbers', () => {
  assert.equal(formatBytes('0'), '0 B');
  assert.equal(formatBytes('999'), '999 B');
  assert.equal(formatBytes('1000'), '1 KB');
  assert.equal(formatBytes('1500'), '1.5 KB');
  assert.equal(formatBytes('1000000000'), '1 GB');
  assert.equal(formatBytes('1073741824'), '1.07 GB');
});

test('u64 byte counts survive IPC formatting without conversion to JS numbers', () => {
  assert.equal(formatBytes('18446744073709551615'), '18.45 EB');
  assert.throws(() => formatBytes('-1'), RangeError);
});

test('unknown/partial sizes are lower bounds, including zero', () => {
  assert.equal(sizeLabel('1500', true), '1.5 KB');
  assert.equal(sizeLabel('1500', false), 'At least 1.5 KB · partial');
  assert.equal(sizeLabel('0', false), 'At least 0 B · partial');
});

test('AI and protected filters do not imply removable files', () => {
  const ai = { category: 'aiModels', disposition: 'protected' };
  const build = { category: 'buildOutput', disposition: 'reviewRequired' };
  const secret = { category: 'protectedData', disposition: 'protected' };
  assert.equal(matchesFilter(ai, 'ai'), true);
  assert.equal(matchesFilter(ai, 'protected'), true);
  assert.equal(matchesFilter(ai, 'development'), false);
  assert.equal(matchesFilter(build, 'development'), true);
  assert.equal(matchesFilter(secret, 'ai'), false);
  assert.equal(matchesFilter(secret, 'all'), true);
});

test('cancelled, limited and skipped-entry scans never claim complete totals', () => {
  const base = { status: 'completed', totalSizeComplete: true, stats: { filesScanned: 1001, directoriesScanned: 3 } };
  assert.match(scanSummary(base), /^Scan completed\. 1,001 files, 3 folders/);
  assert.match(scanSummary({ ...base, status: 'cancelled' }), /Scan cancelled\. Results are partial/);
  assert.match(scanSummary({ ...base, status: 'limited' }), /Scan limit reached\. Results are partial/);
  assert.match(scanSummary({ ...base, totalSizeComplete: false }), /Sizes are partial because some items were skipped/);
});

test('computer summaries distinguish processed disks from failed or unscanned disks', () => {
  const report = { scope: 'computer', status: 'limited', totalSizeComplete: false,
    stats: { filesScanned: 12, directoriesScanned: 4 },
    roots: [{ status: 'completed' }, { status: 'limited' }, { status: 'failed' }, { status: 'notScanned' }] };
  assert.match(scanSummary(report), /Results are partial\. 2\/4 disks processed/);
});
