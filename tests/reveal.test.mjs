import test from 'node:test';
import assert from 'node:assert/strict';
import { isRevealShortcut } from '../src/reveal-shortcut.ts';
const key = (overrides = {}) => ({key:'Enter',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,repeat:false,isComposing:false,...overrides});
test('Windows uses Ctrl+Enter and Mac uses Command+Enter', () => {
 assert.equal(isRevealShortcut(key({ctrlKey:true}),false),true);
 assert.equal(isRevealShortcut(key({metaKey:true}),true),true);
 assert.equal(isRevealShortcut(key({metaKey:true}),false),false);
 assert.equal(isRevealShortcut(key({ctrlKey:true}),true),false);
});
test('plain Enter and other modifiers do not reveal a path', () => {
 for (const event of [key(), key({ctrlKey:true,shiftKey:true}),key({ctrlKey:true,altKey:true}),key({ctrlKey:true,metaKey:true}),key({ctrlKey:true,key:'a'})]) assert.equal(isRevealShortcut(event,false),false);
});
test('held keys and text composition do not open duplicate windows', () => {
 assert.equal(isRevealShortcut(key({ctrlKey:true,repeat:true}),false),false);
 assert.equal(isRevealShortcut(key({metaKey:true,isComposing:true}),true),false);
});
