'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../assets/js/stock-dashboard-model.js');
const model = globalThis.StockDashboardModel;
const item = {key:'m:a', name:'Bahan A', kind:'material', unit:'g', price:10, is_supply:false};
const supply = {key:'m:s', name:'Cup', kind:'material', unit:'pcs', price:2000, is_supply:true};
const wip = {key:'w:a', name:'Sirup (WIP)', kind:'wip', unit:'ml', price:20};
const menu = {id:'a', nama_menu:'Minuman', harga_jual:1000};
const recipe = {menu_id:'a', component_type:'material', item_id:'a'};
function fixture() {
  return {catalog:[item,supply,wip], state:{periods:[{id:'p1', start:'2026-11-01', status:'active', opening:{'m:a':100,'m:s':20,'w:a':10}, opening_catalog:[item,supply,wip]}], documents:[]}};
}
function doc(type, date, postings, extra={}) { return {id:type+date, type, start:date, end:date, period_id:'p1', postings, ...extra}; }
function report(data, start='2026-11-01', end='2026-11-30') { return model.build(data,start,end); }
function close(data, date='2026-11-30') {
  Object.assign(data.state.periods[0], {status:'closed', end:date, physical:{'m:a':95,'m:s':30,'w:a':8}, result:[
    {...item, physical:95, variance:-5, variance_value:-50},
    {...supply, physical:30, variance:10, variance_value:20000},
    {...wip, physical:8, variance:-2, variance_value:-40}
  ]});
}
test('calendar range excludes cross-month, reversed and nonexistent dates', () => {
  assert.equal(model.validRange('2026-11-25','2026-12-05'), false);
  assert.equal(model.validRange('2026-11-20','2026-11-10'), false);
  assert.equal(model.validRange('2026-02-29','2026-02-29'), false);
  assert.equal(model.validRange('2028-02-29','2028-02-29'), true);
  assert.deepEqual(model.monthBounds('2028-02-10'), {start:'2028-02-01',end:'2028-02-29'});
  assert.throws(() => report(fixture(),'2026-11-25','2026-12-05'), /satu bulan/);
});
test('six cards and five chart series reconcile from transaction snapshots', () => {
  const data = fixture();
  data.state.documents = [
    doc('receipt','2026-11-02',[{...item,qty:20}]),
    doc('expense','2026-11-03',[{...item,qty:-2}],{category:'QC'}),
    doc('expense','2026-11-03',[{...item,qty:-3}],{category:'QC'}),
    doc('production','2026-11-04',[{...item,qty:-20},{...wip,qty:10}],{lines:[{key:wip.key,qty:2}]}),
    doc('sales','2026-11-05',[{...item,qty:-4}],{lines:[{key:'s:a',qty:2}],catalog_snapshot:{menus:[menu],menuRecipeLines:[recipe]}})
  ];
  close(data);
  const r=report(data);
  assert.deepEqual(r.totals,{sales:2000,units:2,production:200,receipt:200,expense:50,supplies:20000});
  assert.equal(r.expenses[0].items.length,1);
  assert.equal(r.expenses[0].items[0].qty,5);
  assert.equal(r.production[0].transactions,1);
  assert.equal(r.production[0].batches,2);
  assert.equal(r.sales[0].hpp,40);
  assert.equal(r.monthly.rows.find(row=>row.key===item.key).system,91);
  assert.equal(r.monthly.rows.find(row=>row.key===item.key).variance,4);
  assert.equal(r.monthly.rows.find(row=>row.key===wip.key).variance,-12);
  for(const key of ['sales','production','receipt']) assert.equal(r.days.reduce((n,day)=>n+day[key],0),r.totals[key]);
  assert.equal(r.days.reduce((n,day)=>n+day.expense,0),20050);
  assert.equal(r.monthly.rows.some(row=>row.key===supply.key),false);
});
test('daily transaction filter still returns full calendar monthly stock',()=>{
  const data=fixture();data.state.documents=[doc('expense','2026-11-04',[{...item,qty:-5}],{category:'QC'})];
  const r=report(data,'2026-11-12','2026-11-12');
  assert.equal(r.totals.expense,0);assert.equal(r.monthly.rows.find(row=>row.key===item.key).system,95);
  assert.equal(r.monthly.closed,false);assert.equal(r.monthly.rows[0].physical,null);
});
test('intermediate close does not replace calendar opening or double count movements',()=>{
  const data=fixture();close(data,'2026-11-08');
  data.state.documents=[doc('expense','2026-11-07',[{...item,qty:-10}],{category:'QC'})];
  data.state.periods.push({id:'p2',start:'2026-11-09',status:'active',opening:{'m:a':95,'m:s':30,'w:a':8},opening_catalog:[item,supply,wip]});
  data.state.documents.push(doc('expense','2026-11-10',[{...item,qty:-10}],{period_id:'p2',category:'QC'}));
  const r=report(data);assert.equal(r.monthly.rows.find(row=>row.key===item.key).system,80);assert.equal(r.monthly.closed,false);
});
test('month opening can be reconstructed from an earlier active period',()=>{
  const data=fixture();data.state.periods[0].start='2026-10-25';
  data.state.documents=[doc('expense','2026-10-30',[{...item,qty:-10}],{category:'QC'}),doc('expense','2026-11-03',[{...item,qty:-5}],{category:'QC'})];
  assert.equal(report(data).monthly.rows.find(row=>row.key===item.key).system,85);
});
test('month closing price values full-month variance and includes inactive historical items',()=>{
  const data=fixture();close(data);data.catalog=[];data.state.periods[0].result[0].price=15;
  const r=report(data);assert.equal(r.monthly.rows.length,2);assert.equal(r.monthly.total,-115);assert.equal(r.monthly.complete,true);
});
test('supply flags and historical import source survive current master reclassification',()=>{
  const data=fixture();close(data);data.catalog[1]={...supply,is_supply:false};
  assert.equal(report(data).totals.supplies,20000);
  delete data.state.periods[0].result[1].is_supply;
  data.state.periods[0].physical_source_refs={'m:s':{source_kind:'barapp_supplies_so'}};
  assert.equal(report(data).totals.supplies,20000);
});
test('positive and negative supply values preserve signs in card and graph',()=>{
  const data=fixture();close(data);data.state.periods[0].result[1].variance=-10;data.state.periods[0].result[1].variance_value=-20000;
  const r=report(data);assert.equal(r.totals.supplies,-20000);assert.equal(r.days.at(-1).expense,-20000);
});
test('voided and held-period documents are excluded; move corrections offset expenses',()=>{
  const data=fixture();data.state.periods.push({id:'p2',start:'2026-11-10',status:'held',opening:{}});
  data.state.documents=[doc('receipt','2026-11-02',[{...item,qty:5}],{void:true}),doc('receipt','2026-11-03',[{...item,qty:100}],{period_id:'p2'}),doc('expense','2026-11-04',[{...item,qty:-10}],{category:'Move'}),doc('adjustment','2026-11-05',[{...item,qty:10}],{category:'Move'})];
  const r=report(data);assert.equal(r.totals.receipt,0);assert.equal(r.totals.expense,0);assert.equal(r.monthly.rows.find(row=>row.key===item.key).system,100);
});
test('imported sales prefer saved actual totals and preserve original range',()=>{
  const data=fixture();data.state.documents=[doc('sales','2026-11-08',[],{start:'2026-11-05',source_sales:[{menu_id:'a',menu_name:'Minuman',qty:2,gross_sales_snapshot:1800,total_hpp_snapshot:400}],catalog_snapshot:{menus:[{...menu,harga_jual:999999}]}})];
  const r=report(data);assert.equal(r.totals.sales,1800);assert.equal(r.sales[0].hpp,400);assert.equal(r.days[7].sales,1800);assert.equal(r.days[4].sales,0);assert.equal(r.rangeSales,1);
  assert.equal(report(data,'2026-11-05','2026-11-07').totals.sales,0);
});
test('missing sales data is explicitly flagged and no current master price is substituted',()=>{
  const data=fixture();data.state.documents=[doc('sales','2026-11-08',[],{lines:[{key:'s:a',qty:2}]})];
  const r=report(data);assert.equal(r.totals.units,2);assert.equal(r.missingSales,1);assert.equal(r.sales[0].details[0].sales,null);
});
test('production with two WIPs and multiple material postings allocates each cost once',()=>{
  const data=fixture();const other={...wip,key:'w:b',name:'WIP B'};
  data.state.documents=[doc('production','2026-11-05',[{...item,qty:-2},{...wip,qty:1},{...item,qty:-3},{...supply,qty:-1},{...other,qty:2}],{lines:[{key:wip.key,qty:1},{key:other.key,qty:2}]})];
  const r=report(data);assert.equal(r.totals.production,2050);assert.equal(r.production.find(row=>row.key===wip.key).value,20);assert.equal(r.production.find(row=>row.key===other.key).value,2030);
});
test('zero-value receipts are hidden and empty state has complete chart dates',()=>{
  const data=fixture();data.state.documents=[doc('receipt','2026-11-02',[{...item,qty:10,price:0}])];
  const r=report(data);assert.equal(r.receipts.length,0);assert.equal(r.days.length,30);
  assert.equal(report({state:{periods:[],documents:[]},catalog:[]}).monthly.available,false);
});

test('new master items do not invalidate an already closed historical month',()=>{
  const data=fixture();close(data);data.catalog.push({...item,key:'m:new',name:'Added later'});
  const r=report(data);assert.equal(r.monthly.complete,true);assert.equal(r.monthly.rows.length,2);
});
test('a closed prior period without next opening does not invent current month stock',()=>{
  const data=fixture();close(data);const r=report(data,'2026-12-01','2026-12-31');assert.equal(r.monthly.available,false);
  assert.equal(model.validRange('2026-13-01','2026-13-02'),false);
});
