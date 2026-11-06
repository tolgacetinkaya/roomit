import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryBreakdown,memoryPercent,memoryMode,recordUsage,usageSegments,HISTORY_MS,HISTORY_LIMIT} from '../src/resource-history.ts';
// Chart input is tested independently of canvas drawing and native sampling.
const point=(at,values={})=>({at,cpu:20,ram:40,gpu:0,gpuPartial:false,breakBefore:false,...values});
test('RAM used and available partition OS total, excluding installed/reserved capacity',()=>{
 const result=memoryBreakdown('107374182400','32000000000','80530636800');
 assert.deepEqual(result,{used:'26843545600',available:'80530636800',total:'107374182400',usedPercent:25,availablePercent:75});
 assert.equal(BigInt(result.used)+BigInt(result.available),BigInt(result.total));
 assert.equal(memoryPercent('26843545600','137438953472'),19.53);
 assert.equal(memoryBreakdown('100','30').available,'70');
 for(const values of [['0','0'],['100','101'],['100','1','101'],['100','1','bad'],['bad','0'],['100','-1']])assert.equal(memoryBreakdown(...values),null);
 assert.equal(memoryBreakdown('100','0','100').usedPercent,0);
 assert.equal(memoryBreakdown('100','100','0').usedPercent,100);
});
test('RAM percentages preserve large byte counts and malformed settings fall back safely',()=>{
 assert.equal(memoryPercent('9007199254740993','18014398509481986'),50);
 assert.equal(memoryPercent('0','100'),0);
 assert.equal(memoryPercent('120','100'),120); // shared resident pages must not be silently capped
 for(const values of [['1','0'],['-1','10'],['bad','10']])assert.equal(memoryPercent(...values),null);
 assert.equal(memoryMode('capacity'),'capacity');assert.equal(memoryMode('percent'),'percent');
 assert.equal(memoryMode(null),'both');assert.equal(memoryMode('unknown'),'both');
});
test('history remains bounded by time and point count, rejecting duplicate/out-of-order snapshots',()=>{
 const base=1_000_000;let history=[];
 for(let i=0;i<200;i++)history=recordUsage(history,point(base+i*1000));
 assert.equal(history.length,HISTORY_LIMIT);assert.equal(history[0].at,base+199000-HISTORY_MS);
 const previous=structuredClone(history);
 assert.deepEqual(recordUsage(history,point(base)),previous);
 assert.deepEqual(recordUsage(history,point(history.at(-1).at)),previous);
 assert.deepEqual(history,previous);
 assert.equal(recordUsage(history,point(base+400000)).length,1);
});
test('zero readings remain valid and missing/invalid values never draw as idle',()=>{
 let history=recordUsage([],point(1000,{cpu:NaN,ram:101,gpu:0}));
 assert.equal(history[0].cpu,null);assert.equal(history[0].ram,null);assert.equal(history[0].gpu,0);
 history=recordUsage(history,point(2000,{gpu:null}));history=recordUsage(history,point(3000,{gpu:20}));
 assert.deepEqual(usageSegments(history,'gpu').map(segment=>segment.map(p=>p.gpu)),[[0],[20]]);
});
test('pause, missed samples, errors and partial GPU coverage break lines instead of interpolating',()=>{
 const history=[point(1000),point(3000),point(5000,{breakBefore:true}),point(13000),point(15000,{gpuPartial:true}),point(17000,{gpuPartial:true}),point(19000,{gpu:null}),point(21000)];
 assert.deepEqual(usageSegments(history,'gpu').map(segment=>segment.map(p=>p.at)),[[1000,3000],[5000],[13000],[15000,17000],[21000]]);
 assert.deepEqual(usageSegments(history,'cpu').map(segment=>segment.map(p=>p.at)),[[1000,3000],[5000],[13000,15000,17000,19000,21000]]);
});
