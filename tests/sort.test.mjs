import test from 'node:test';
import assert from 'node:assert/strict';
import { sortGroups } from '../src/groups.ts';

test('size sort stays exact beyond safe integers and does not mutate the scan groups', () => {
  const groups = [{id:'small',title:'Small',logicalBytes:'9007199254740992'}, {id:'large',title:'Large',logicalBytes:'9007199254740993'}];
  assert.deepEqual(sortGroups(groups,'size').map(g=>g.id),['large','small']);
  assert.deepEqual(groups.map(g=>g.id),['small','large']);
});
test('name sorting uses natural Turkish order and stable identity ties', () => {
  const groups = [
    {id:'3',title:'Araç 10',logicalBytes:'1'}, {id:'2',title:'Araç 2',logicalBytes:'999'},
    {id:'z',title:'Aynı',logicalBytes:'5'}, {id:'a',title:'Aynı',logicalBytes:'6'},
  ];
  assert.deepEqual(sortGroups(groups,'name').map(g=>g.id),['2','3','a','z']);
  assert.deepEqual(sortGroups([], 'size'),[]);
});
