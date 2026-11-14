'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(initial){
 let click,change,ready;const emitted=[];const button={attributes:{},setAttribute(name,value){this.attributes[name]=value;},addEventListener(name,fn){assert.equal(name,'click');click=fn;}};
 const description={textContent:''},root={dataset:{}};
 const system={matches:initial,addEventListener(name,fn){assert.equal(name,'change');change=fn;}};
 const document={documentElement:root,readyState:'loading',getElementById(id){return id==='desktopThemeToggle'?button:id==='desktopThemeDescription'?description:null;},addEventListener(name,fn){assert.equal(name,'DOMContentLoaded');ready=fn;}};
 vm.runInNewContext(fs.readFileSync('assets/js/desktop-theme.js','utf8'),{document,window:{matchMedia:()=>system,Event:class {constructor(type){this.type=type;}},dispatchEvent:event=>emitted.push(event.type)}});
 return {root,button,description,emitted,ready:()=>ready(),click:()=>click(),change:value=>change({matches:value})};
}
test('theme starts with system preference and follows changes',()=>{
 const t=setup(true);assert.equal(t.root.dataset.desktopTheme,'dark');t.ready();assert.equal(t.button.attributes['aria-pressed'],'true');assert.match(t.description.textContent,/mengikuti sistem/);
 t.change(false);assert.equal(t.root.dataset.desktopTheme,undefined);assert.equal(t.button.attributes['aria-label'],'Aktifkan mode gelap');
 t.change(true);assert.equal(t.root.dataset.desktopTheme,'dark');assert.equal(t.emitted.filter(x=>x==='app:desktop-theme-change').length,3);
});
test('manual choice remains active until reload, then follows system again',()=>{
 const t=setup(false);t.ready();t.click();assert.equal(t.root.dataset.desktopTheme,'dark');assert.equal(t.button.attributes['aria-label'],'Aktifkan mode terang');assert.match(t.description.textContent,/pilihan manual/);
 t.change(false);assert.equal(t.root.dataset.desktopTheme,'dark');assert.equal(t.emitted.length,1);t.click();assert.equal(t.root.dataset.desktopTheme,undefined);
 const reloaded=setup(true);reloaded.ready();assert.equal(reloaded.root.dataset.desktopTheme,'dark');assert.match(reloaded.description.textContent,/mengikuti sistem/);
});
