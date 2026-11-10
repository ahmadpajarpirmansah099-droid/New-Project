(function(root) {
  'use strict';
  let client, context, data, generation=0;
  const copy=v=>JSON.parse(JSON.stringify(v));
  function reset(){generation++;client=null;context=null;data=null;}
  async function initialize(c,ctx){reset();client=c;context=copy(ctx);const token=generation;
    const result=await c.from('stock_opname_scopes').select('division_id,enabled').eq('division_id',ctx.activeDivisionId).maybeSingle();
    if(token!==generation)return;
    if(result.error){data={unavailable:result.error.message};return;}
    data={enabled:!!result.data?.enabled,developer:ctx.role==='developer'};
    if(data.enabled && !data.developer && ctx.role==='admin') await read();
  }
  function current(){return data;}
  function available(){return !!(data?.developer || data?.state);}
  async function rpc(name,args){
    const token=generation,c=client,ctx=context;
    if(!c||!ctx)throw Error('Sesi Stock Opname belum siap.');
    const auth=await c.auth.getUser();
    if(token!==generation||auth.error||auth.data?.user?.id!==ctx.userId)throw Error('Sesi berubah. Masuk kembali.');
    const res=await c.rpc(name,args);
    if(token!==generation)throw Error('Workspace berubah. Operasi dibatalkan.');
    if(res.error)throw Error(res.error.message);
    return res.data;
  }
  async function read(){const result=await rpc('stock_opname_read',{division:context.activeDivisionId});data={...data,...result};return data;}
  async function write(action,input,request){
    const result=await rpc('stock_opname_write',{division:context.activeDivisionId,expected_revision:data.revision,request,action,input});
    data={...data,...result};return data;
  }
  async function configure(enabled){await rpc('stock_opname_configure',{division:context.activeDivisionId,enabled});data.enabled=enabled;}
  const draftKey=()=>context?'stock-opname:draft:v1:'+context.userId+':'+context.workspaceId+':'+context.activeDivisionId:null;
  function readDraftStore(){
    try{
      const value=JSON.parse(root.localStorage.getItem(draftKey())||'null');
      if(value?.version===2&&value.drafts&&typeof value.drafts==='object')return value;
      if(value&&typeof value.kind==='string')return {version:2,activeKind:value.kind,drafts:{[value.kind]:value}};
    }catch(_){}
    return {version:2,activeKind:null,drafts:{}};
  }
  function saveDraft(value){
    const key=draftKey();if(!key)throw Error('Sesi belum siap.');
    const store=readDraftStore();store.version=2;store.activeKind=value.kind;store.drafts[value.kind]=value;
    root.localStorage.setItem(key,JSON.stringify(store));
  }
  function loadDraft(kind){const store=readDraftStore();return store.drafts[kind||store.activeKind]||null;}
  function clearDraft(kind){
    const key=draftKey();if(!key)return;
    if(!kind){root.localStorage.removeItem(key);return;}
    const store=readDraftStore();delete store.drafts[kind];
    if(store.activeKind===kind){const kinds=Object.keys(store.drafts);store.activeKind=kinds[kinds.length-1]||null;}
    if(Object.keys(store.drafts).length)root.localStorage.setItem(key,JSON.stringify(store));
    else root.localStorage.removeItem(key);
  }
  async function targetCatalog(destination){return rpc('stock_opname_target_catalog',{origin:context.activeDivisionId,destination});}
  root.StockOpnameService={initialize,reset,current,available,read,write,configure,saveDraft,loadDraft,clearDraft,targetCatalog};
})(window);
