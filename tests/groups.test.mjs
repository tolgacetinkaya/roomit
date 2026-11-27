import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGroups, groupReport, sortGroups, topLevelFindings } from '../src/groups.ts';

const finding = (path, bytes, overrides = {}) => ({ path, logicalBytes: String(bytes), sizeComplete: true,
  kind: 'directory', category: 'buildOutput', disposition: 'reviewRequired', tool: '.NET', ruleId: 'test', reason: 'test', ...overrides });
const report = (findings, projects = [], resultsTruncated = false) => ({ findings, projects, resultsTruncated });

test('nested folders and duplicate findings are counted once', () => {
  const findings = [finding('/app/bin/nested', 4), finding('/app/bin', 10), finding('/app/bin', 10), finding('/app/obj', 5)];
  const grouped = groupReport(report(findings, [{ path: '/app', ecosystems: ['.NET'] }]));
  assert.equal(topLevelFindings(findings).length, 2);
  assert.equal(grouped.projects.length, 1);
  assert.equal(grouped.projects[0].logicalBytes, '15');
  assert.equal(grouped.projects[0].items.length, 2);
});

test('AI stores from several locations form one tool group without nested duplication', () => {
  const ai = { category: 'aiUserData', disposition: 'protected', tool: 'Cursor' };
  const grouped = groupReport(report([
    finding('/a/.cursor', 10, ai), finding('/a/.cursor/rules', 5, { ...ai, category: 'aiSettings' }),
    finding('/b/.cursor', 7, ai),
  ]));
  assert.equal(grouped.ai.length, 1);
  assert.equal(grouped.ai[0].logicalBytes, '17');
  assert.equal(grouped.ai[0].items.length, 2);
  assert.equal(grouped.projects.length, 0);
});

test('uses the nearest project boundary and keeps protected data separate', () => {
  const grouped = groupReport(report([
    finding('/repo/apps/web/node_modules', 8, { tool: 'Node.js', category: 'dependencies' }),
    finding('/repo/apps/web/.git', 9, { disposition: 'protected', category: 'protectedData' }),
    finding('/repo/apps/web2/bin', 3),
  ], [{ path: '/repo', ecosystems: ['Rust'] }, { path: '/repo/apps/web', ecosystems: ['Node.js'] }]));
  assert.equal(grouped.projects.find((group) => group.title === 'web').logicalBytes, '8');
  assert.equal(grouped.projects.find((group) => group.title === 'repo').logicalBytes, '3');
  assert.equal(grouped.protected[0].logicalBytes, '9');
});

test('Windows paths match without case sensitivity; Mac paths keep their case', () => {
  const windows = groupReport(report([finding('C:\\Work\\App\\bin', 7), finding('c:/work/app/obj', 3)], [{ path: 'C:/Work/App', ecosystems: ['.NET'] }]));
  assert.equal(windows.projects.length, 1);
  assert.equal(windows.projects[0].logicalBytes, '10');
  const mac = groupReport(report([finding('/App/bin', 7), finding('/app/obj', 3)]));
  assert.equal(mac.projects.length, 2);
});

test('truncated and partial groups stay lower bounds and byte sorting is exact', () => {
  const grouped = groupReport(report([finding('/a/bin', '9007199254740993'), finding('/b/bin', '9007199254740992')], [], true));
  assert.equal(grouped.projects[0].title, 'a');
  assert.equal(grouped.projects[0].sizeComplete, false);
  const partial = groupReport(report([finding('/c/bin', 8, { sizeComplete: false })]));
  assert.equal(partial.projects[0].sizeComplete, false);
});

test('search finds projects, tools and nested member paths', () => {
  const groups = groupReport(report([finding('/a/node_modules', 4, { tool: 'Node.js' }), finding('/b/bin', 8)])).projects;
  assert.equal(filterGroups(groups, 'node_modules').length, 1);
  assert.equal(filterGroups(groups, '.NET').length, 1);
  assert.equal(filterGroups(groups, '').length, 2);
});
test('Projects sorts by direct node_modules and retains projects with no outputs or older measurements', () => {
  const withSize = (path, size) => ({path, ecosystems:['Node.js'], nodeModules:{logicalBytes:size, sizeComplete:true}});
  const {projects} = groupReport(report([
    finding('/small/build', 999),
    finding('/old/node_modules', 8, {ruleId:'node-project-dependencies', tool:'Node.js'}),
  ], [withSize('/small','1'), withSize('/big','9007199254740993'), withSize('/empty','0'),
      {path:'/old', ecosystems:['Node.js']}, {path:'/unknown', ecosystems:['Rust']}]));
  assert.deepEqual(sortGroups(projects,'size',true).map(p=>p.title), ['big','old','small','empty','unknown']);
  assert.equal(projects.find(p=>p.title==='unknown').nodeModules, undefined);
});

test('targeted roots keep custom AI folders on the map once even with missing findings', () => {
  const r = report([finding('C:/AI/custom/model',4)], [], true);
  r.aiRootOwners = {'c:/ai/custom':'Claude Code','C:/skipped':'OpenCode','C:/design':'Open Design'};
  r.roots = [['C:/AI/custom','completed','10'],['C:/skipped','excluded','0'],['C:/design','completed','12']]
    .map(([path,status,logicalBytes])=>({path,status,logicalBytes,sizeComplete:true}));
  const groups = groupReport(r);
  assert.deepEqual(groups.ai.map(g=>[g.title,g.logicalBytes]),[['Open Design','12'],['Claude Code','10']]);
  assert.equal(groups.projects.length,0);
});
