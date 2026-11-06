import test from 'node:test';
import assert from 'node:assert/strict';
import {toolUsage,processPage} from '../src/workspace-model.ts';
test('tool process totals preserve bytes and distinguish unknown CPU from idle',()=>{
 const rows=[{pid:1,name:'codex',toolId:'codex',cpuPercent:null,memoryBytes:'9007199254740993'}, {pid:2,name:'helper',toolId:'codex',cpuPercent:5,memoryBytes:'4'}, {pid:3,name:'chrome',toolId:null,cpuPercent:90,memoryBytes:'5'}];
 assert.deepEqual(toolUsage(rows,'codex'),{processes:2,cpu:null,memory:'9007199254740997'});
 rows[0].cpuPercent=0;assert.equal(toolUsage(rows,'codex').cpu,5);
 assert.deepEqual(toolUsage(rows,'ollama'),{processes:0,cpu:null,memory:'0'});
});
test('process list is bounded, searchable and leaves snapshots untouched',()=>{
 const rows=Array.from({length:123},(_,i)=>({pid:i+1,name:i%2?'Chrome':'Docker',toolId:i%3===0?'codex':null,cpuPercent:i/2,memoryBytes:String(i)}));
 assert.equal(processPage(rows,'',false,'memory',0).length,50);
 assert.equal(processPage(rows,'',false,'memory',2).length,23);
 assert.equal(processPage(rows,'',false,'cpu',0)[0].pid,123);
 assert.equal(processPage(rows,'docker',false,'memory',0)[0].name,'Docker');
 assert(processPage(rows,'',true,'memory',0).every(p=>p.toolId));
 assert.equal(rows[0].pid,1);
});
