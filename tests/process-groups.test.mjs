import test from 'node:test';
import assert from 'node:assert/strict';
import {groupProcesses,groupPage,memberPage,processScope} from '../src/process-groups.ts';
const row=(pid,appId,values={})=>({pid,appId,appName:'Chrome',name:'chrome.exe',toolId:null,cpuPercent:2,memoryBytes:'100',...values});
const gpu=(percent,status='measured')=>({percent,status,reason:'engine aggregate',measuredProcesses:2,totalProcesses:2});

test('default scope includes AI and development groups without hiding their helper totals',()=>{
  assert.equal(processScope(null),'workspace');assert.equal(processScope('invalid'),'workspace');
  assert.equal(processScope('ai'),'ai');assert.equal(processScope('all'),'all');
  const ai=['zcode','lmstudio','codex','claude','claude-code'].map((id,i)=>row(i+1,'tool:'+id,{toolId:id,appName:id,name:id+'.exe',appCategory:'ai'}));
  const groups=groupProcesses([...ai,
    row(10,'studio',{appName:'Android Studio',name:'studio64.exe',appCategory:'development'}),
    row(11,'studio',{appName:'Android Studio',name:'java.exe',appCategory:'development'}),
    row(12,'vscode',{appName:'Visual Studio Code',name:'Code.exe',appCategory:'development'}),
    row(13,'chrome'),row(14,'java',{name:'java.exe'}),row(15,'system',{name:'System'})],new Map());
  const selected=groupPage(groups,'','workspace','memory',0);
  assert.equal(selected.total,7);assert.equal(groupPage(groups,'','ai','memory',0).total,5);
  assert.equal(groupPage(groups,'','all','memory',0).total,10);
  assert.equal(groupPage(groups,'11','workspace','memory',0).groups[0].memoryBytes,'200');
  assert.equal(groupPage(groups,'chrome','workspace','memory',0).total,0);
  assert(!selected.groups.some(g=>['chrome','java','system'].includes(g.id)));
});

test('application totals use every member and exact RAM bytes, not a displayed page',()=>{
  const rows=Array.from({length:123},(_,i)=>row(i+1,'chrome',{memoryBytes:i===0?'9007199254740993':'1',cpuPercent:0.1}));
  const group=groupProcesses(rows,new Map([['chrome',gpu(12)]]))[0];
  assert.equal(group.processes.length,123);assert.equal(group.memoryBytes,'9007199254741115');
  assert(Math.abs(group.cpuPercent-12.3)<0.001);assert.equal(group.gpu.percent,12);
  assert.equal(memberPage(group,'memory',0,'').rows.length,50);
  assert.equal(memberPage(group,'memory',2,'').rows.length,23);
});
test('tool groups include helpers; separate executable identities never merge by name',()=>{
  const rows=[row(1,'tool:codex',{toolId:'codex',name:'codex.exe'}),row(2,'tool:codex',{toolId:'codex',name:'ChatGPT.exe'}),row(3,'first'),row(4,'second')];
  const groups=groupProcesses(rows,new Map(),new Map([['codex','Codex']]));
  assert.equal(groups.length,3);assert.equal(groups[0].name,'Codex');assert.equal(groups[0].processes.length,2);
  assert.equal(groupProcesses([row(1,undefined),row(2,undefined)],new Map()).length,2);
});
test('missing CPU or GPU values are not replaced with zero or summed process peaks',()=>{
  const rows=[row(1,'a',{cpuPercent:null,gpu:gpu(60)}),row(2,'a',{gpu:gpu(50)})];
  const unknown=groupProcesses(rows,new Map())[0];assert.equal(unknown.cpuPercent,null);assert.equal(unknown.gpu,undefined);
  const measured=groupProcesses(rows,new Map([['a',gpu(60,'partial')]]))[0];
  assert.equal(measured.gpu.percent,60);assert.equal(measured.gpu.status,'partial');
  assert.equal(groupProcesses([row(1,'a',{cpuPercent:0,gpu:gpu(0)})],new Map())[0].gpu.percent,0);
});
test('search and AI filters select whole groups without reducing totals',()=>{
  const groups=groupProcesses([row(1,'chrome'),row(2,'chrome'),row(3,'tool:codex',{toolId:'codex',appName:'Codex'})],new Map());
  const found=groupPage(groups,'2','all','memory',0);assert.equal(found.total,1);assert.equal(found.groups[0].memoryBytes,'200');
  assert.equal(found.groups[0].processes.length,2);assert.equal(groupPage(groups,'','ai','memory',0).groups[0].toolId,'codex');
  assert.equal(groupPage(groups,'missing','all','memory',99).page,0);
});
test('group sorting and pagination use aggregate totals, with stable ties and clamped pages',()=>{
  const rows=Array.from({length:123},(_,i)=>row(i+1,'app-'+i,{memoryBytes:String(i+1)}));
  rows.push(row(124,'app-0',{memoryBytes:'1000'}));
  const copy=structuredClone(rows),groups=groupProcesses(rows,new Map());
  assert.equal(groupPage(groups,'','all','memory',0).groups[0].id,'app-0');
  assert.equal(groupPage(groups,'','all','memory',0).groups.length,50);
  assert.equal(groupPage(groups,'','all','memory',9).groups.length,23);
  assert.equal(groupPage(groups,'','all','memory',9).page,2);assert.deepEqual(rows,copy);
});
test('PID search puts the match on the first child page and membership shrink clamps pages',()=>{
  const group=groupProcesses(Array.from({length:123},(_,i)=>row(i+1,'a')),new Map())[0];
  assert.equal(memberPage(group,'memory',0,'123').rows[0].pid,123);
  assert.equal(memberPage(group,'memory',99,'').page,2);
  group.processes=group.processes.slice(0,2);assert.equal(memberPage(group,'memory',2,'').page,0);
});
