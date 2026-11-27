import test from 'node:test';
import assert from 'node:assert/strict';
import {locationLookup} from '../src/project-context.ts';

test('large folders show the nearest workspace and only evidenced session projects',()=>{
  const report={projects:[{path:'G:/src/app'}],breakdown:{'claude-code':{projects:{'C:/user/.claude/projects/abc':{}}}}};
  const ai=[['Codex','C:/user/.codex'],['Open Design','C:/user/design'],['Claude Code','C:/user/.claude']]
    .map(([title,path])=>({title,items:[{path}]}));
  const lookup=locationLookup(report,{ai},[
    {path:'G:/src/app',running:['Claude Code'],recent:[],sessionFiles:['C:/user/.codex/sessions/day/a.jsonl']},
    {path:'G:/src/site',running:[],recent:['Codex'],sessionFiles:['C:/user/.codex/sessions/day/b.jsonl']}]);
  assert.deepEqual(lookup('g:/src/APP/packages').tools,['Claude Code']);
  assert.equal(lookup('G:/src/app2').project,undefined);
  assert.deepEqual(lookup('C:/user/.codex/sessions/day').linkedProjects,['G:/src/app','G:/src/site']);
  assert.deepEqual(lookup('C:/user/.codex/sessions/day/a.jsonl').linkedProjects,['G:/src/app']);
  assert.deepEqual(lookup('C:/user').linkedProjects,[]);
  assert.equal(lookup('C:/user/design/namespaces/stable/data/projects/abc/files').project,'abc');
  assert.equal(lookup('C:/user/.claude/projects/abc/session.jsonl').project,'abc');
});
