'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('desktop setting toggles dark and light without using persistent storage',()=>{
 let click;
 const button={attributes:{},setAttribute(name,value){this.attributes[name]=value;},addEventListener(name,fn){assert.equal(name,'click');click=fn;}};
 const desc={textContent:''};const root={dataset:{}};
 const document={documentElement:root,getElementById(id){return id==='desktopThemeToggle'?button:id==='desktopThemeDescription'?desc:null;}};
 vm.runInNewContext(fs.readFileSync('assets/js/desktop-theme.js','utf8'),{document});
 click(); assert.equal(root.dataset.desktopTheme,'dark');assert.equal(button.attributes['aria-pressed'],'true');assert.equal(button.attributes['aria-label'],'Aktifkan mode terang');assert.match(desc.textContent,/Mode gelap aktif/);
 click(); assert.equal(root.dataset.desktopTheme,undefined);assert.equal(button.attributes['aria-pressed'],'false');assert.equal(button.attributes['aria-label'],'Aktifkan mode gelap');assert.match(desc.textContent,/Mode terang aktif/);
});
