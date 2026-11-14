'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('embedded guide follows desktop theme changes and remains light on mobile',()=>{
 const handlers={},frameHandlers={},guideRoot={dataset:{}},links=[];let desktop=true;
 const guide={head:{appendChild:link=>links.push(link)},documentElement:guideRoot,getElementById:id=>links.find(link=>link.id===id),createElement:()=>({})};
 const frame={contentDocument:guide,setAttribute(){},addEventListener(name,fn){frameHandlers[name]=fn;}};
 const root={replaceChildren(value){assert.equal(value,frame);}};
 const document={documentElement:{dataset:{desktopTheme:'dark'}},getElementById:id=>id==='page-user-guide'?{}:id==='userGuideRoot'?root:null,createElement:name=>{assert.equal(name,'iframe');return frame;}};
 const window={matchMedia:()=>({matches:desktop}),addEventListener:(name,fn)=>{handlers[name]=fn;}};
 vm.runInNewContext(fs.readFileSync('assets/js/user-guide.js','utf8'),{document,window});
 frameHandlers.load();assert.equal(guideRoot.dataset.guideDark,'true');assert.equal(links.length,1);
 delete document.documentElement.dataset.desktopTheme;handlers['app:desktop-theme-change']();assert.equal(guideRoot.dataset.guideDark,undefined);
 document.documentElement.dataset.desktopTheme='dark';desktop=false;handlers.resize();assert.equal(guideRoot.dataset.guideDark,undefined);assert.equal(links.length,1);
 desktop=true;handlers.resize();assert.equal(guideRoot.dataset.guideDark,'true');
});
