import test from "node:test";
import assert from "node:assert/strict";
import {scanNotes} from "../src/scan-notes.ts";

const warnings = Array.from({length:45}, (_,i) => `Link/reparse point skipped: C:\\Data\\link-${i}`);
const report = {status:"completed",totalSizeComplete:false,stats:{skippedLinks:45,errors:0},warnings,warningsOmitted:0};

test("45 skipped links explain a partial total without implying read failures",()=>{
  const notes=scanNotes(report,"");
  assert.deepEqual(notes.reasons.map(({count,label})=>[count,label]),[[45,"Links skipped"]]);
  assert.equal(notes.logCount,45);
  assert.match(notes.summary,/No read errors/);
  assert.deepEqual(notes.messages,warnings);
});
test("search filters saved messages while scan counters and omitted totals remain intact",()=>{
  const notes=scanNotes({...report,warnings:warnings.slice(0,25),warningsOmitted:20}," LINK-20 ");
  assert.equal(notes.reasons[0].count,45);
  assert.equal(notes.logCount,45);
  assert.deepEqual(notes.messages,[warnings[20]]);
});
test("cancellation, limits and scan exclusions each retain their own meaning",()=>{
  const failed=scanNotes({...report,status:"cancelled",stats:{errors:2}},"");
  assert.match(failed.summary,/stopped/);
  assert.doesNotMatch(failed.summary,/No read errors/);
  assert.equal(failed.reasons[0].count,2);
  assert.match(scanNotes({...report,status:"limited"},"").summary,/limit/);
  const excluded=scanNotes({...report,totalSizeComplete:true,stats:{excludedEntries:1,errors:0},warnings:[]},"");
  assert.equal(excluded.logCount,0);
  assert.equal(excluded.reasons[0].label,"Excluded entries");
  assert.match(excluded.summary,/finished/);
});
