import assert from "node:assert/strict";
import test from "node:test";
import {scanReadout} from "../src/scan-readout.ts";

const report={scope:"ai",aiToolId:"codex",root:"Codex data locations",totalSizeComplete:true,status:"completed",
  stats:{filesScanned:12,totalLogicalBytes:"100"},roots:[{status:"completed",path:"/demo/.codex",logicalBytes:"100",sizeComplete:true}]};
const groups={ai:[{title:"Codex",logicalBytes:"100",sizeComplete:true,items:[]}]};
test("one app explains its total with disjoint file types",()=>{
  const data={complete:true,categories:{chats:{bytes:"70"},logs:{bytes:"30"}}};
  const result=scanReadout({...report,breakdown:{codex:data}},groups);
  assert.equal(result.total,100n);
  assert.deepEqual(result.rows.map(r=>[r.label,r.bytes]),[["Chats",70n],["Logs",30n]]);
});
test("incomplete classification falls back to measured folders and preserves partial status",()=>{
  const result=scanReadout({...report,status:"cancelled",breakdown:{codex:{complete:false,categories:{logs:{bytes:"17"}}}}},groups);
  assert.equal(result.complete,false);
  assert.deepEqual(result.rows.map(r=>r.label),[".codex"]);
});
test("reports distinguish an excluded location from an empty measured folder",()=>{
  const empty={...report,stats:{filesScanned:0,totalLogicalBytes:"0"}};
  for(const [status,missing] of [["excluded",true],["failed",true],["completed",false]]){
    assert.equal(Boolean(scanReadout({...empty,roots:[{...report.roots[0],status,logicalBytes:"0"}]}, {ai:[]}).missing),missing);
  }
});
test("multi-tool summary retains exact totals when grouping small tools",()=>{
  const ai=["15","12","10","7","3"].map((bytes,i)=>({title:"Tool "+i,logicalBytes:bytes,sizeComplete:true}));
  const result=scanReadout({...report,aiToolId:null},{ai});
  assert.equal(result.total,47n);assert.equal(result.rows.at(-1).bytes,10n);assert.equal(result.toolCount,5);
  assert.equal(result.largestTool.title,"Tool 0");
});

test("folder scope keeps parent directories out of the summary",()=>{
  const result=scanReadout({...report,scope:"recursive",aiToolId:null,root:"C:/Users/private/workspace"},{ai:[]});
  assert.equal(result.scope,"Folder · workspace");
  assert.equal(result.largestTool,null);
});
