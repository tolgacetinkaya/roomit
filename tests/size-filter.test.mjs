import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMinimumGb, filterSizeEntries, sizeListIncomplete } from '../src/size-filter.ts';
const entry = (path, bytes, kind = 'file', sizeComplete = true) => ({path,logicalBytes:String(bytes),kind,sizeComplete});
test('GB input accepts comma or dot decimals, blank and zero with exact bytes', () => {
 for (const [text, expected] of [['5',5000000000n],['0,5',500000000n],['0.5',500000000n],[' 1,25 ',1250000000n],['',0n],['0',0n],['0.000000001',1n]]) assert.deepEqual(parseMinimumGb(text),{bytes:expected,error:null});
});
test('minimum comparison is inclusive and does not use rounded display numbers', () => {
 const entries = [entry('/below',4999999999n),entry('/equal',5000000000n),entry('/above',5000000001n)];
 assert.deepEqual(filterSizeEntries(entries,5000000000n,'','file').map(e=>e.path),['/equal','/above']);
});
test('large decimal input stays exact beyond JavaScript safe integers', () => {
 assert.equal(parseMinimumGb('9007199.254740993').bytes,9007199254740993n);
 assert.equal(parseMinimumGb('18446744073.709551615').bytes,18446744073709551615n);
 assert.equal(parseMinimumGb('18446744073.709551616').bytes,null);
});
test('invalid negative, exponent and malformed values are rejected', () => {
 for (const text of ['-1','NaN','Infinity','1e3','1,2.3','5 GB','0.0000000001','1,','.',',5']) assert.equal(parseMinimumGb(text).bytes,null,text);
});
test('files and folders are filtered individually with path search and partial labels retained', () => {
 const entries = [entry('/Models/archive.bin',5000000000n),entry('/Models',6000000000n,'directory',false),entry('/small-a',3000000000n),entry('/small-b',3000000000n)];
 assert.deepEqual(filterSizeEntries(entries,5000000000n,'models','file').map(e=>e.path),['/Models/archive.bin']);
 assert.equal(filterSizeEntries(entries,5000000000n,'','directory')[0].sizeComplete,false);
 assert.equal(filterSizeEntries(entries,5000000000n,'missing','file').length,0);
 assert.equal(filterSizeEntries([entry('/empty',0)],0n,'','file').length,1);
 assert.equal(entries.length,4);
});
test('retention warning distinguishes thresholds above the cutoff from ties at it', () => {
 const entries = [entry('/a',10),entry('/b',8),entry('/dir',20,'directory')];
 assert.equal(sizeListIncomplete(entries,'file',true,8n),true);
 assert.equal(sizeListIncomplete(entries,'file',true,9n),false);
 assert.equal(sizeListIncomplete(entries,'file',false,0n),false);
 assert.equal(sizeListIncomplete([], 'file',true,0n),true);
});
