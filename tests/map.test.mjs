import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aiMapTree,mapTiles,storageSeries,withRemainder} from '../src/map-model.ts';
test('AI map counts grouped outer boundaries once and preserves exact totals',()=>{
 const group={id:'ai:Ollama',title:'Ollama',logicalBytes:'9007199254740993',sizeComplete:false,items:[{path:'/home/.ollama',kind:'directory',logicalBytes:'9007199254740993',sizeComplete:false}]};
 const tree=aiMapTree({ai:[group],projects:[],protected:[]});
 assert.equal(tree.bytes,'9007199254740993');assert.equal(tree.complete,false);
 assert.equal(tree.children[0].children[0].path,'/home/.ollama');
 assert.equal(mapTiles(tree.children)[0].width,100);
 assert.deepEqual(mapTiles([]),[]);
});
test('map siblings partition the measured parent without re-counting nested totals',()=>{
 const nodes=[{id:'a',bytes:'80'},{id:'b',bytes:'10'},{id:'zero',bytes:'0'}];
 const children=withRemainder(nodes,{id:'root',bytes:'100',complete:true});
 assert.equal(children.at(-1).bytes,'10');
 const tiles=mapTiles(children);
 assert.deepEqual(tiles.map(t=>t.width*t.height),[8000,1000,1000]);
 assert.deepEqual(tiles.map(t=>[t.x,t.y]),[[0,0],[80,0],[80,50]]);
 assert.equal(withRemainder(nodes,{id:'root',bytes:'70',complete:false}).length,3);
});

test('every catalog tool has its own color in each theme, independent of scan order',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../src/ai-catalog.json',import.meta.url),'utf8'));
 const ids=catalog.map(tool=>storageSeries(tool.name));
 assert.equal(new Set(ids).size,catalog.length);
 assert.ok(ids.every(id=>id>0));
 assert.deepEqual(['Ollama','Codex','Claude Code'].map(storageSeries),[1,2,3]);
 assert.equal(storageSeries('Other tools'),0);
 const css=readFileSync(new URL('../src/tokens.css',import.meta.url),'utf8');
 const [dark,light]=css.split(':root[data-theme="light"]');
 for(const mode of [dark,light]) {
   const tokens=Object.fromEntries([...mode.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m=>[m[1],m[2]]));
   const colors=ids.map(id=>id<=3?tokens[['','--serigrafi-cherry','--serigrafi-teal','--serigrafi-saffron'][id]]:tokens['--storage-series-'+id]);
   assert.ok(colors.every(color=>/^#[a-f0-9]{6}$/i.test(color)));
   assert.equal(new Set(colors).size,catalog.length);
 }
});

test('matching root names show their parent without exposing the full private path',()=>{
 const paths=['C:\\Users\\sample\\.codeium\\windsurf','C:\\Users\\sample\\AppData\\Roaming\\Windsurf'];
 const group={id:'ai:Windsurf',title:'Windsurf',logicalBytes:'2',sizeComplete:true,
   items:paths.map(path=>({path,kind:'directory',logicalBytes:'1',sizeComplete:true}))};
 const locations=aiMapTree({ai:[group]}).children[0].children;
 assert.deepEqual(locations.map(n=>n.name),['.codeium/windsurf','Roaming/Windsurf']);
 assert.deepEqual(locations.map(n=>n.path),paths);
});

test('map labels show the final folder name and preserve full paths for explicit actions',()=>{
 for(const path of ['/private/work/models/', 'C:\\private\\work\\models\\', '\\\\server\\share\\models\\']){
  const group={id:'ai:Ollama',title:'Ollama',logicalBytes:'10',sizeComplete:true,items:[{path,kind:'directory',logicalBytes:'10',sizeComplete:true}]};
  const entry=aiMapTree({ai:[group],projects:[],protected:[]}).children[0].children[0];
  assert.equal(entry.name,'models');assert.equal(entry.path,path);
 }
});
