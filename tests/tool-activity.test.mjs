import test from 'node:test';
import assert from 'node:assert/strict';
import {activityState,prioritizeTools,runningToolIds} from '../src/tool-activity.ts';
const tool=(id,name,installed=true)=>({id,name,evidence:[],installations:installed?['sample']:[]});
test('CLI and desktop processes are prioritized even at zero CPU; duplicate processes count as one tool',()=>{
  const tools=[tool('cursor','Cursor'),tool('codex','Codex'),tool('claude-code','Claude Code'),tool('archive','Archived data',false)];
  const original=structuredClone(tools);
  const running=runningToolIds([{toolId:'codex',cpuPercent:0},{toolId:'codex',cpuPercent:0},{toolId:'claude-code',cpuPercent:null},{toolId:null}]);
  assert.equal(running.size,2);
  assert.deepEqual(prioritizeTools(tools,running,'live').map(t=>t.id),['claude-code','codex','cursor','archive']);
  assert.deepEqual(tools,original);
});
test('stopped tools lose priority and stale samples are not treated as running now',()=>{
  const tools=[tool('a','A tool'),tool('codex','Codex')];
  const running=runningToolIds([{toolId:'codex'}]);
  assert.equal(prioritizeTools(tools,running,'live')[0].id,'codex');
  assert.equal(prioritizeTools(tools,new Set(),'live')[0].id,'a');
  for(const state of ['paused','unavailable','waiting'])assert.equal(prioritizeTools(tools,running,state)[0].id,'a');
  assert.equal(activityState(true,false,false,false),'live');
  assert.equal(activityState(false,false,false,false),'waiting');
  assert.equal(activityState(true,false,false,true),'waiting');
  assert.equal(activityState(true,false,true,false),'unavailable');
  assert.equal(activityState(true,true,false,false),'paused');
});
