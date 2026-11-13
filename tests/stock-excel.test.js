'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const XLSX=require('../assets/vendor/xlsx-0.20.3.min.js');
let book;
const lib={...XLSX,writeFile(value){book=value;}};
const window={XLSX:lib};
vm.runInNewContext(fs.readFileSync('assets/js/stock-excel.js','utf8'),{window});
const rows=[{key:'m:1',name:'Susu',unit:'ML',units:[{unit:'ML',factor:1}]}];
const base={kind:'close',start:'2026-11-08',end:'2026-11-08',scope:'division',period:'period',rows};
function file(wb){const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});return {name:'data.xlsx',size:bytes.length,arrayBuffer:async()=>bytes};}
test('exported opname imports its physical count without a write',async()=>{
 await window.StockExcel.exportFile({...base,rows:[{...rows[0],qty:123,system:120,variance:3}]});
 const result=await window.StockExcel.readFile(file(book),base);
 assert.equal(result['m:1'].qty,'123');assert.equal(result['m:1'].unit,'ML');
});
test('reject mismatched date, division, period and units',async()=>{
 await window.StockExcel.exportFile({...base,rows:[{...rows[0],qty:123}]});const f=file(book);
 for(const change of [{scope:'other'},{period:'other'},{end:'2026-11-09'},{rows:[{...rows[0],units:[{unit:'GR'}]}]}]) await assert.rejects(window.StockExcel.readFile(f,{...base,...change}));
});
test('reject formulas, duplicate rows and negative quantities',async()=>{
 for(const variant of ['formula','duplicate','negative']){
  await window.StockExcel.exportFile({...base,rows:[{...rows[0],qty:123}]});
  if(variant==='formula')book.Sheets.Data.C2={t:'n',v:123,f:'100+23'};
  if(variant==='negative')book.Sheets.Data.C2={t:'n',v:-1};
  if(variant==='duplicate')XLSX.utils.sheet_add_aoa(book.Sheets.Data,[['m:1','Susu',1,'ML']],{origin:'A3'});
  await assert.rejects(window.StockExcel.readFile(file(book),base));
 }
});
test('sales data accepts zero and rejects wrong file type',async()=>{
 const ctx={...base,kind:'sales',rows:[{key:'s:1',name:'Teh'}]};
 await window.StockExcel.exportFile({...ctx,rows:[{key:'s:1',name:'Teh',qty:0}]});
 assert.equal((await window.StockExcel.readFile(file(book),ctx))['s:1'].qty,'0');
 await assert.rejects(window.StockExcel.readFile({name:'sales.csv',size:1},ctx));
});
