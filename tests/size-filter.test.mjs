import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMinimumGb } from '../src/size-filter.ts';
test('GB input accepts comma or dot decimals, blank and zero with exact bytes', () => {
 for (const [text, expected] of [['5',5000000000n],['0,5',500000000n],['0.5',500000000n],[' 1,25 ',1250000000n],['',0n],['0',0n],['0.000000001',1n]]) assert.deepEqual(parseMinimumGb(text),{bytes:expected,error:null});
});
test('large decimal input stays exact beyond JavaScript safe integers', () => {
 assert.equal(parseMinimumGb('9007199.254740993').bytes,9007199254740993n);
 assert.equal(parseMinimumGb('18446744073.709551615').bytes,18446744073709551615n);
 assert.equal(parseMinimumGb('18446744073.709551616').bytes,null);
});
test('invalid negative, exponent and malformed values are rejected', () => {
 for (const text of ['-1','NaN','Infinity','1e3','1,2.3','5 GB','0.0000000001','1,','.',',5']) assert.equal(parseMinimumGb(text).bytes,null,text);
});
