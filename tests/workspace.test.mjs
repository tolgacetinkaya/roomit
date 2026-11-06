import test from 'node:test';
import assert from 'node:assert/strict';
import {toolUsage,processPage,gpuText,formatMemory,memoryCapacity} from '../src/workspace-model.ts';
import {formatBytes} from '../src/report.ts';
test('RAM uses binary units while storage keeps decimal GB',()=>{
 assert.equal(formatMemory('137438953472'),'128 GiB');
 assert.equal(formatMemory('137120000000'),'127,7 GiB');
 assert.equal(formatMemory('1073741824'),'1 GiB');
 assert.equal(formatMemory('1048576'),'1 MiB');
 assert.equal(formatMemory('1024'),'1 KiB');
 assert.equal(formatMemory('0'),'0 B');
 assert.equal(formatMemory('18446744073709551615'),'16 EiB');
 assert.throws(()=>formatMemory('-1'),RangeError);
 assert.equal(formatBytes('137438953472'),'137,44 GB');
});
test('installed RAM is separate from OS-visible capacity and never guessed',()=>{
 assert.equal(memoryCapacity('137120000000','137438953472'),'128 GiB takılı · 127,7 GiB sistem belleği');
 assert.equal(memoryCapacity('137120000000',null),'127,7 GiB sistem belleği · Takılı RAM okunamadı');
 assert.equal(memoryCapacity('137120000000','0'),memoryCapacity('137120000000'));
 assert.equal(memoryCapacity('137120000000','1073741824'),memoryCapacity('137120000000'));
});
test('tool process totals preserve bytes and distinguish unknown CPU from idle',()=>{
 const rows=[{pid:1,name:'codex',toolId:'codex',cpuPercent:null,memoryBytes:'9007199254740993'}, {pid:2,name:'helper',toolId:'codex',cpuPercent:5,memoryBytes:'4'}, {pid:3,name:'chrome',toolId:null,cpuPercent:90,memoryBytes:'5'}];
 assert.deepEqual(toolUsage(rows,'codex'),{processes:2,cpu:null,memory:'9007199254740997'});
 rows[0].cpuPercent=0;assert.equal(toolUsage(rows,'codex').cpu,5);
 assert.deepEqual(toolUsage(rows,'ollama'),{processes:0,cpu:null,memory:'0'});
});
test('GPU text distinguishes valid idle, warmup, missing, partial and unsupported readings',()=>{
 const reading=(status,percent=null)=>({status,percent,reason:'coverage',measuredProcesses:1,totalProcesses:1});
 assert.equal(gpuText(reading('measured',0)),'%0');
 for(const status of ['unavailable','unsupported','noCounter'])assert.equal(gpuText(reading(status,0)),'Ölçülemiyor');
 assert.equal(gpuText(undefined),'Ölçülemiyor');
 assert.equal(gpuText(reading('warmingUp',0)),'Ölçüm bekleniyor');
 assert.equal(gpuText(reading('noProcess')),'Çalışan süreç yok');
 assert.match(gpuText(reading('partial',12.5)),/En az %12,5 · kısmi/);
 assert.equal(gpuText(reading('measured',NaN)),'Ölçülemiyor');
 assert.equal(gpuText(reading('measured',101)),'Ölçülemiyor');
});
test('GPU sort keeps unavailable rows below measured zero and preserves input',()=>{
 const base={name:'test',toolId:'codex',cpuPercent:0,memoryBytes:'1'};
 const gpu=(status,percent)=>({status,percent,reason:'test',measuredProcesses:1,totalProcesses:1});
 const rows=[{...base,pid:1,gpu:gpu('noCounter',null)},{...base,pid:2,gpu:gpu('measured',0)},{...base,pid:3,gpu:gpu('partial',25)}];
 assert.deepEqual(processPage(rows,'',false,'gpu',0).map(p=>p.pid),[3,2,1]);
 assert.deepEqual(rows.map(p=>p.pid),[1,2,3]);
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
