import test from 'node:test';
import assert from 'node:assert/strict';
import {aiMapTree,mapSlices,withRemainder} from '../src/map-model.ts';
test('AI map counts grouped outer boundaries once and preserves exact totals',()=>{
 const group={id:'ai:Ollama',title:'Ollama',logicalBytes:'9007199254740993',sizeComplete:false,items:[{path:'/home/.ollama',kind:'directory',logicalBytes:'9007199254740993',sizeComplete:false}]};
 const tree=aiMapTree({ai:[group],projects:[],protected:[]});
 assert.equal(tree.bytes,'9007199254740993');assert.equal(tree.complete,false);
 assert.equal(tree.children[0].children[0].path,'/home/.ollama');
 assert.equal(mapSlices(tree.children,tree.bytes)[0].end,1);
 assert.deepEqual(mapSlices([], '0'),[]);
});
test('map siblings partition the measured parent without re-counting nested totals',()=>{
 const nodes=[{id:'a',bytes:'80'},{id:'b',bytes:'10'},{id:'zero',bytes:'0'}];
 const children=withRemainder(nodes,{id:'root',bytes:'100',complete:true});
 assert.equal(children.at(-1).bytes,'10');
 const slices=mapSlices(children,'100');assert.equal(slices.length,3);assert.equal(slices[0].end,.8);assert.equal(slices.at(-1).end,1);
 assert.equal(withRemainder(nodes,{id:'root',bytes:'70',complete:false}).length,3);
});
