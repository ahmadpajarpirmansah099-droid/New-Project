'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function runtime(){const storage=new Map(),w={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};w.window=w;vm.createContext(w);vm.runInContext(fs.readFileSync('assets/js/stock-opname-service.js','utf8'),w);return w;}
function client(user='a',rpc){return {auth:{getUser:async()=>({data:{user:{id:user}}})},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{enabled:true}})}),rpc:rpc|| (async()=>({data:{state:{periods:[],documents:[]},revision:0}}))};}
const ctx={userId:'a',workspaceId:'w',activeDivisionId:'d',role:'admin'};
test('draft survives reinitialization and is isolated across accounts and divisions',async()=>{
const w=runtime(),s=w.StockOpnameService;await s.initialize(client(),ctx);s.saveDraft({kind:'close',counts:{a:0}});s.reset();await s.initialize(client(),ctx);assert.equal(s.loadDraft().counts.a,0);
await s.initialize(client('b'),{...ctx,userId:'b'});assert.equal(s.loadDraft(),null);await s.initialize(client(),{...ctx,activeDivisionId:'other'});assert.equal(s.loadDraft(),null);
});
test('late read cannot leak into switched workspace',async()=>{
const w=runtime(),s=w.StockOpnameService;await s.initialize(client(),ctx);let resolve;
const p=s.initialize(client('a',()=>new Promise(r=>resolve=r)),ctx);await new Promise(r=>setImmediate(r));s.reset();resolve({data:{state:{secret:true}}});await assert.rejects(p,/Workspace berubah/);assert.equal(s.current(),null);
});
test('failed write preserves local draft and revision',async()=>{
const w=runtime(),s=w.StockOpnameService;let fail=false;await s.initialize(client('a',async()=>fail?{error:{message:'offline'}}:{data:{state:{periods:[],documents:[]},revision:7}}),ctx);s.saveDraft({kind:'sales'});fail=true;await assert.rejects(s.write('save',{},'id'),/offline/);assert.equal(s.current().revision,7);assert.equal(s.loadDraft().kind,'sales');
});
test('write passes optimistic revision and idempotency ID to server',async()=>{
const w=runtime(),s=w.StockOpnameService,calls=[];await s.initialize(client('a',async(name,args)=>{calls.push({name,args});return {data:{state:{periods:[],documents:[]},revision:3}};}),ctx);await s.write('close',{date:'2026-11-01'},'request');const c=calls.at(-1);assert.equal(c.name,'stock_opname_write');assert.equal(c.args.expected_revision,3);assert.equal(c.args.request,'request');assert.equal(c.args.division,'d');
});
test('developer config does not load operational records',async()=>{
const w=runtime(),s=w.StockOpnameService;await s.initialize(client('a',()=>{throw Error('unexpected operational read');}),{...ctx,role:'developer'});assert.equal(s.current().developer,true);assert.equal(s.current().state,undefined);
});
