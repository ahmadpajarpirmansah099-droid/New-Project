'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function runtime() {
  const handlers = {}, writes = [], confirmations = [];
  let pageHtml = '', pageRenders = 0;
  const history = { set outerHTML(value) { const start=pageHtml.indexOf('<section class="so-panel so-history-panel"'); if(start>=0)pageHtml=pageHtml.slice(0,start)+value; } };
  const page = { get innerHTML(){return pageHtml;}, set innerHTML(value){pageHtml=value;pageRenders++;}, contains: () => true, querySelector: selector => selector==='#soHistory' && pageHtml.includes('id="soHistory"') ? history : null };
  const searchResults = { innerHTML: '' };
  const drafts = {}, letHolder = { active: null };
  let allowConfirm = true, storageFails = false, writeFails = false;
  const data = {
    state: { periods: [{ id: 'period', start: '2026-11-01', status: 'active', opening: {} }], documents: [] },
    catalog: [
      { key: 'm:a', name: 'Susu', unit: 'ML', units: [{ unit: 'ML', factor: 1 }] },
      { key: 'w:a', name: 'WIP', unit: 'ML', yield: 100, units: [{ unit: 'ML', factor: 1 }] },
      { key: 's:a', name: 'Menu' }
    ], targets: []
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  const w = {
    Intl, Date, Number, crypto: { randomUUID: () => 'request' },
    confirm: () => { throw Error('Stock Opname must not use a browser confirmation'); },
    addEventListener() {},
    document: {
      getElementById: id => id === 'page-stock-opname' ? page : null,
      addEventListener: (name, fn) => handlers[name] = fn,
      body: { appendChild() {} },
      createElement(name) {
        assert.equal(name, 'dialog');
        const buttons = Object.fromEntries(['[data-so-accept]', '[data-so-decline]'].map(key => [key, {
          addEventListener(type, fn) { this[type] = fn; },
          focus() { queueMicrotask(() => buttons[allowConfirm ? '[data-so-accept]' : '[data-so-decline]'].click()); }
        }]));
        const message = { set textContent(value) { confirmations.push(value); } };
        return {
          setAttribute() {}, close() {}, remove() {}, showModal() {}, addEventListener() {},
          querySelector(key) { return key === '#soConfirmMessage' ? message : buttons[key] || {}; }
        };
      }
    },
    AppAuth: { getContext: () => ({ activeDivisionId: 'division' }), getClient: () => ({}) },
    MasterDataStore: { initialize: async () => {} },
    StockOpnameService: {
      current: () => data,
      async read() { return data; },
      saveDraft(value) { if (storageFails) throw Error('Quota exceeded'); drafts[value.kind] = copy(value); letHolder.active = value.kind; },
      loadDraft: kind => { const value = drafts[kind || letHolder.active]; return value && copy(value); },
      clearDraft(kind) { if (kind) delete drafts[kind]; else for (const key of Object.keys(drafts)) delete drafts[key]; if (!kind || letHolder.active === kind) letHolder.active = Object.keys(drafts).at(-1) || null; },
      async write(action, input, request) {
        writes.push({ action, input: copy(input), request });
        if (writeFails) throw Error('Koneksi terputus');
      },
      async resetOpening(action, input, request) {
        writes.push({ action: 'opening_' + action, input: copy(input), request });
        const p = data.state.periods[0];
        if (action === 'reset') { p.opening = {}; p.status = 'opening_pending'; delete p.result; }
        else { p.opening = Object.fromEntries(Object.entries(input.counts).map(([key, value]) => [key, Number(value.qty)])); p.status = 'reopened'; }
      }
    }
  };
  w.window = w;
  vm.createContext(w);
  vm.runInContext(fs.readFileSync('assets/js/stock-opname-ui.js', 'utf8'), w);
  return {
    ui: w.StockOpnameUI, data, writes, confirmations, page,
    pageRenders: () => pageRenders,
    searchResults,
    draft: kind => { const value = drafts[kind || letHolder.active]; return value && copy(value); },
    setExcel(value) { w.StockExcel = value; },
    async importFile(file) { await handlers.change({target:{dataset:{soExcelImport:''},files:[file],value:'file'}}); },
    confirm: value => allowConfirm = value,
    storageFails: value => storageFails = value,
    writeFails: value => writeFails = value,
    input(dataset, value) { handlers.input({ target: { dataset, value, parentElement: { querySelector: () => searchResults }, closest: () => null } }); },
    async click(name, dataset = {}) {
      handlers.click({ target: { closest: () => ({ dataset: { soAction: name, ...dataset } }) }, preventDefault() {} });
      await new Promise(resolve => setImmediate(resolve));
    }
  };
}

for (const [kind, key] of [['receipt', 'm:a'], ['production', 'w:a'], ['sales', 's:a']]) {
  test(kind + ' does not send an expense category', async () => {
    const t = runtime(); await t.ui.open(kind);
    if(kind==='receipt')await t.click('receipt-add',{soItemKey:key});
    t.input({ soKey: key, soProp: 'qty' }, '5');
    await t.click('submit');
    assert.equal(t.writes.length, 1);
    assert.equal(t.writes[0].input.category, null);
  });
}

test('switching forms retains each local draft and restores the selected form', async () => {
  const t = runtime(); await t.ui.open('expense');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '9');
  await t.ui.open('receipt');
  assert.equal(t.draft('expense').counts['m:a'].qty, '9');
  await t.ui.open('expense');
  assert.equal(t.page.innerHTML.includes('value="9"'), true);
  t.confirm(true); await t.click('submit');
  assert.equal(t.writes[0].input.type, 'expense');
  assert.equal(t.writes[0].input.category, 'Waste');
  assert.equal(t.writes[0].input.lines[0].qty, '9');
});

test('switching blank forms does not ask to replace a draft', async () => {
  const t = runtime(); await t.ui.open('production');
  await t.ui.open('receipt');
  await t.click('cancel');
  await t.ui.open('sales');
  assert.equal(t.confirmations.length, 0);
  assert.equal(t.draft('production').kind, 'production');
  assert.equal(t.draft('receipt').kind, 'receipt');
  assert.equal(t.draft('sales').kind, 'sales');
});

test('entered zero is still protected when changing forms', async () => {
  const t = runtime(); await t.ui.open('close');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '0');
  await t.ui.open('expense');
  assert.equal(t.draft('close').counts['m:a'].qty, '0');
  assert.equal(t.confirmations.length, 0);
});

test('reopened opname restores saved physical counts behind an empty local draft', async () => {
  const t = runtime(), p = t.data.state.periods[0];
  await t.ui.open('close'); // Old blank draft saved before the period was reopened.
  p.status = 'reopened'; p.end = '2026-11-08';
  p.result = [{ key: 'm:a', unit: 'ML', physical: 5781 }, { key: 'w:a', unit: 'ML', physical: 0 }];
  await t.ui.open('expense');
  await t.ui.open('close');
  assert.equal(t.draft('close').counts['m:a'].qty, '5781');
  assert.equal(t.draft('close').counts['w:a'].qty, '0');
  assert.equal(t.draft('close').end, '2026-11-08');
  assert.match(t.page.innerHTML, /kolom yang kosong diisi dari stok fisik opname tersimpan/);
});

test('correction draft keeps edited counts and fills blank items from saved opname', async () => {
  const t = runtime(), p = t.data.state.periods[0];
  p.status = 'reopened'; p.end = '2026-11-08';
  p.result = [{ key: 'm:a', unit: 'ML', physical: 5781 }, { key: 'w:a', unit: 'ML', physical: 200 }];
  await t.ui.open('close');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '0');
  t.input({ soKey: 'w:a', soProp: 'qty' }, '');
  await t.ui.open('expense');
  p.result.push({ key: 'm:b', unit: 'GR', physical: 15 });
  t.data.catalog.push({ key: 'm:b', name: 'Bahan B', unit: 'GR', units: [{ unit: 'GR', factor: 1 }] });
  await t.ui.open('close');
  assert.equal(t.draft('close').counts['m:a'].qty, '0');
  assert.equal(t.draft('close').counts['w:a'].qty, '200');
  assert.equal(t.draft('close').counts['m:b'].qty, '15');
});

test('refresh restores physical counts in an already open correction form and fixes a later date', async () => {
  const t = runtime(), p = t.data.state.periods[0];
  p.status = 'reopened'; p.end = '2026-11-11';
  await t.ui.open('close');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '42');
  t.input({ soKey: 'w:a', soProp: 'qty' }, '');
  p.end = '2026-11-08';
  p.result = [{ key: 'm:a', unit: 'ML', physical: 5781 }, { key: 'w:a', unit: 'ML', physical: 200 }];
  await t.click('refresh');
  assert.equal(t.draft('close').counts['m:a'].qty, '42');
  assert.equal(t.draft('close').counts['w:a'].qty, '200');
  assert.equal(t.draft('close').end, '2026-11-08');
  assert.match(t.page.innerHTML, /8 November 2026/);
  assert.match(t.page.innerHTML, /value="200"/);
});

test('cancelled correction closes its old form and does not reuse its draft for the next period', async () => {
  const t = runtime(), p = t.data.state.periods[0];
  p.status = 'reopened'; p.end = '2026-11-08';
  await t.ui.open('close');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '5781');
  p.status = 'closed';
  t.data.state.periods.push({ id: 'next-period', start: '2026-11-08', status: 'active', opening: {} });
  await t.click('refresh');
  assert.equal(t.draft('close'), undefined);
  assert.match(t.page.innerHTML, /Koreksi opname sudah dibatalkan/);
  assert.doesNotMatch(t.page.innerHTML, /class="so-panel so-form"/);
  await t.ui.open('close');
  assert.equal(t.draft('close').basePeriod, 'next-period');
  assert.equal(t.draft('close').counts['m:a'], undefined);
});

test('Pulihkan Draft also fills missing correction rows without losing edited values', async () => {
  const t = runtime(), p = t.data.state.periods[0];
  p.status = 'reopened'; p.end = '2026-11-08';
  p.result = [{ key: 'm:a', unit: 'ML', physical: 5781 }, { key: 'w:a', unit: 'ML', physical: 200 }];
  await t.ui.open('close');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '42');
  p.result.push({ key: 'm:b', unit: 'GR', physical: 15 });
  await t.click('restore');
  assert.equal(t.draft('close').counts['m:a'].qty, '42');
  assert.equal(t.draft('close').counts['m:b'].qty, '15');
});

test('changed date alone is protected as an unfinished draft', async () => {
  const t = runtime(); await t.ui.open('sales');
  t.input({ soField: 'start' }, '2026-10-20');
  await t.ui.open('receipt');
  assert.equal(t.draft('sales').start, '2026-10-20');
  assert.equal(t.confirmations.length, 0);
});

test('stock opname dates and selections render as in-app web controls', async () => {
  const t = runtime(); await t.ui.open('close');
  assert.match(t.page.innerHTML, /data-so-action="pick-date"/);
  assert.match(t.page.innerHTML, /data-so-action="pick-choice"/);
  assert.doesNotMatch(t.page.innerHTML, /type="date"/);
  assert.match(t.page.innerHTML, /<details class="so-unit-dropdown"/);
  await t.ui.open('expense');
  assert.match(t.page.innerHTML, /Pilih kategori/);
  assert.match(t.page.innerHTML, /data-so-action="pick-choice"/);
});

test('opname results show two compact rows and keep full movements expandable', () => {
  const t = runtime();
  t.data.state.periods[0].result = [{ name: 'Apple Juice', unit: 'ML', opening: 2388, movements: { sales: -300, receipt: 6000 }, system: 8088, physical: 5781, variance: -2307, price: 47, variance_value: -108429 }];
  t.ui.render();
  assert.match(t.page.innerHTML, /class="so-result-item"><summary><span class="so-result-top"/);
  assert.match(t.page.innerHTML, /class="so-result-bottom"><span>Sistem 8\.088 → Fisik 5\.781 ML<\/span><span>Selisih -2\.307 ML/);
  assert.match(t.page.innerHTML, /<dt>Stock Awal<\/dt>.*<dt>Sales<\/dt>.*<dt>Barang Masuk<\/dt>.*<dt>Harga \/ ML<\/dt>/);
});

test('total selisih rupiah nets gains and losses at the bottom of each result', () => {
  const t = runtime();
  t.data.state.periods[0].result = [
    { name: 'Bahan A', unit: 'GR', movements: {}, system: 2, physical: 1, variance: -1, variance_value: -2705 },
    { name: 'Bahan B', unit: 'GR', movements: {}, system: 1, physical: 3, variance: 2, variance_value: 7680 },
    { name: 'Bahan C', unit: 'GR', movements: {}, system: 1, physical: 1, variance: 0, variance_value: 0 }
  ];
  t.ui.render();
  assert.match(t.page.innerHTML, /<div class="so-result-total"><span>Total selisih rupiah<\/span><strong>Rp4\.975<\/strong><\/div>/);
  assert.ok(t.page.innerHTML.indexOf('Bahan C') < t.page.innerHTML.indexOf('so-result-total'));
});

test('history follows the selected feature without touching an unfinished local draft', async () => {
  const t = runtime(), p = t.data.state.periods[0];
  p.opening = { 'm:a': 100 };
  p.opening_catalog = [{ key: 'm:a', name: 'Susu', unit: 'ML' }];
  p.result = [{ key: 'm:a', name: 'Susu', unit: 'ML', movements: {}, system: 90, physical: 88, variance: -2, variance_value: -20 }];
  t.data.state.documents = [
    { id: 'r', period_id: 'period', type: 'receipt', start: '2026-11-02', end: '2026-11-02', postings: [{ key: 'm:a', name: 'Susu', qty: 10, unit: 'ML' }] },
    { id: 's', period_id: 'period', type: 'sales', start: '2026-11-08', end: '2026-11-08', postings: [{ key: 'm:a', name: 'Susu', qty: -20, unit: 'ML' }] }
  ];
  t.ui.render();
  assert.match(t.page.innerHTML, /Riwayat Stock Opname/);
  assert.doesNotMatch(t.page.innerHTML, /class="so-history-compact-details"/);
  await t.ui.open('receipt');
  await t.click('receipt-add',{soItemKey:'m:a'});
  t.input({ soKey: 'm:a', soProp: 'qty' }, '2');
  assert.match(t.page.innerHTML, /Riwayat Barang Masuk/);
  assert.match(t.page.innerHTML, /2 November 2026/);
  assert.doesNotMatch(t.page.innerHTML, /8 November 2026/);
  await t.click('history-tab', { soKind: 'sales' });
  assert.match(t.page.innerHTML, /Riwayat Sales/);
  assert.match(t.page.innerHTML, /8 November 2026/);
  assert.doesNotMatch(t.page.innerHTML, /<summary><span>2 November 2026<\/span>/);
  assert.equal(t.draft('receipt').counts['m:a'].qty, '2');
  await t.click('history-tab', { soKind: 'initial' });
  assert.match(t.page.innerHTML, /Stock Awal 1 November 2026/);
  assert.match(t.page.innerHTML, /100 ML/);
});

test('daily receipt history paginates complete dates without original transaction controls', async () => {
  const t = runtime();
  const receipt = (id, day, qty) => ({
    id, period_id: 'period', type: 'receipt', start: day, end: day,
    postings: [{ key: 'm:a', name: 'Susu', qty, unit: 'ML' }]
  });
  t.data.state.documents = [
    ...Array.from({ length: 12 }, (_, i) => receipt('recent-' + i, '2026-11-11', i + 1)),
    ...Array.from({ length: 10 }, (_, i) => receipt('older-' + i, '2026-11-' + String(i + 1).padStart(2, '0'), 1))
  ];
  await t.click('history-tab', { soKind: 'receipt' });
  const html = t.page.innerHTML;
  assert.equal((html.match(/class="so-history-date"/g) || []).length, 10);
  assert.match(html, /class="so-history-date"><details open>/);
  assert.match(html, /Susu<\/span><strong>78 ML/);
  assert.doesNotMatch(html, /Transaksi asli|data-so-action="(?:edit|void)"/);
  assert.doesNotMatch(html, /<span>1 November 2026<\/span>/);
  assert.match(html, /data-so-action="history-more"/);
  await t.click('history-more');
  assert.equal((t.page.innerHTML.match(/class="so-history-date"/g) || []).length, 11);
  assert.match(t.page.innerHTML, /<span>1 November 2026<\/span>/);
  assert.doesNotMatch(t.page.innerHTML, /data-so-action="history-more"/);
});

test('resetting Stock Awal preserves transactions and requires complete manual input', async () => {
  const t = runtime(); t.data.state.periods[0].status = 'reopened';
  t.data.state.documents = [{ id: 'sale-1', period_id: 'period', type: 'sales', postings: [] }];
  await t.click('reset-opening');
  assert.equal(t.data.state.periods[0].status, 'opening_pending');
  assert.equal(t.data.state.documents.length, 1);
  await t.ui.open('initial');
  assert.match(t.page.innerHTML, /1 November 2026/);
  assert.doesNotMatch(t.page.innerHTML, /data-so-key="m:a"[^>]*value="[1-9]/);
  t.input({ soKey: 'm:a', soProp: 'qty' }, '0');
  t.input({ soKey: 'w:a', soProp: 'qty' }, '5');
  await t.click('submit');
  assert.equal(t.writes.at(-1).action, 'opening_confirm');
  assert.equal(t.writes.at(-1).input.counts['m:a'].qty, '0');
  assert.equal(t.data.state.documents.length, 1);
});

test('an old device draft cannot refill Stock Awal after an external reset', async () => {
  const t = runtime(); const p = t.data.state.periods[0];
  p.status = 'opening_pending'; p.opening_reset_at = 'reset-1';
  await t.ui.open('initial'); t.input({ soKey: 'm:a', soProp: 'qty' }, '9');
  assert.equal(t.draft('initial').counts['m:a'].qty, '9');
  p.opening_reset_at = 'reset-2'; t.ui.render();
  assert.equal(t.draft('initial'), undefined);
  await t.ui.open('initial');
  assert.doesNotMatch(t.page.innerHTML, /data-so-key="m:a"[^>]*value="9"/);
  assert.equal(t.draft('initial').resetMarker, 'reset-2');
});

test('storage failure keeps the form open and never claims a draft was saved', async () => {
  const t = runtime(); await t.ui.open('expense'); t.storageFails(true);
  t.input({ soKey: 'm:a', soProp: 'qty' }, '9');
  await t.click('draft');
  assert.match(t.page.innerHTML, /Penyimpanan perangkat penuh/);
  assert.doesNotMatch(t.page.innerHTML, /Draft tersimpan di perangkat\./);
  await t.click('cancel');
  assert.match(t.page.innerHTML, /data-so-action="submit"/);
  t.storageFails(false); await t.click('draft');
  assert.equal(t.draft().counts['m:a'].qty, '9');
});

test('Move with no active destination never submits a one-sided expense', async () => {
  const t = runtime(); await t.ui.open('expense');
  t.input({ soField: 'category' }, 'Move');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '9');
  await t.click('submit');
  assert.equal(t.writes.length, 0);
  assert.match(t.page.innerHTML, /tujuan Move/);
  assert.equal(t.draft().counts['m:a'].qty, '9');
});

test('failed transaction keeps its draft and reuses the same request on retry', async () => {
  const t = runtime(); await t.ui.open('expense');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '9'); t.writeFails(true);
  await t.click('submit');
  assert.equal(t.draft().counts['m:a'].qty, '9');
  assert.match(t.page.innerHTML, /Koneksi terputus/);
  t.writeFails(false); await t.click('submit');
  assert.equal(t.writes[0].request, t.writes[1].request);
  assert.deepEqual(t.writes[0].input, t.writes[1].input);
  assert.equal(t.draft('expense'), undefined);
});

test('counting form separates system stock and converted physical quantity for desktop', async () => {
  const t = runtime(); t.data.catalog[0].units.push({ unit: 'Botol', factor: 1000 });
  await t.ui.open('close');
  assert.match(t.page.innerHTML, /so-desktop-only so-stock">Stok sistem/);
  assert.match(t.page.innerHTML, /so-desktop-only so-conversion">Konversi fisik/);
  assert.match(t.page.innerHTML, /data-so-conversion="m:a">—/);
  t.input({ soKey: 'm:a', soProp: 'qty' }, '1.5');
  t.input({ soKey: 'm:a', soProp: 'unit' }, 'Botol'); t.ui.render();
  assert.match(t.page.innerHTML, /data-so-conversion="m:a">1\.500 ML/);
  assert.match(t.page.innerHTML, /class="so-system-mobile">Sistem:/);
});

test('missing recipe disables its input and offers master-data navigation', async () => {
  const t = runtime(); t.data.catalog[1].error = 'Resep WIP belum lengkap';
  await t.ui.open('production');
  assert.match(t.page.innerHTML, /Resep WIP belum lengkap/);
  assert.match(t.page.innerHTML, /aria-label="Produksi WIP WIP" value="" disabled/);
  assert.match(t.page.innerHTML, /data-so-page="wips"/);
});

test('Barang Masuk only displays selected items and searches names while typing', async()=>{
 const t=runtime();
 await t.ui.open('receipt');
 assert.match(t.page.innerHTML,/Cari barang masuk/);
 assert.doesNotMatch(t.page.innerHTML,/data-so-prop="qty" aria-label="Barang Masuk Susu"/);
 t.input({soReceiptSearch:''},'su');
 assert.match(t.searchResults.innerHTML,/Susu/);
 assert.match(t.searchResults.innerHTML,/data-so-item-key="m:a"/);
 await t.click('receipt-add',{soItemKey:'m:a'});
 assert.match(t.page.innerHTML,/data-so-prop="qty" aria-label="Barang Masuk Susu"/);
 assert.equal((t.draft('receipt').receiptItems||[]).length,1);
 t.input({soReceiptSearch:''},'su');
 assert.doesNotMatch(t.searchResults.innerHTML,/data-so-item-key="m:a"/);
 await t.click('receipt-add',{soItemKey:'m:a'});
 assert.equal(t.draft('receipt').receiptItems.length,1);
});

test('Barang Masuk preserves selected entries and invoice values in draft and edit',async()=>{
 const t=runtime();
 await t.ui.open('receipt');await t.click('receipt-add',{soItemKey:'m:a'});
 t.input({soKey:'m:a',soProp:'qty'},'3');
 t.input({soKey:'m:a',soProp:'invoice_total'},'25000');
 await t.ui.open('expense');await t.ui.open('receipt');
 assert.match(t.page.innerHTML,/value="25000"/);
 assert.deepEqual(t.draft('receipt').receiptItems,['m:a']);
 await t.click('submit');
 assert.equal(t.writes.at(-1).input.lines.length,1);
 assert.equal(t.writes.at(-1).input.lines[0].invoice_total,'25000');
});

test('Barang Masuk removes an item from its local draft and avoids sending it',async()=>{
 const t=runtime();await t.ui.open('receipt');
 await t.click('receipt-add',{soItemKey:'m:a'});
 t.input({soKey:'m:a',soProp:'qty'},'4');
 await t.click('receipt-remove',{soItemKey:'m:a'});
 assert.equal(t.draft('receipt').counts['m:a'],undefined);
 assert.equal(t.draft('receipt').receiptItems.length,0);
 assert.doesNotMatch(t.page.innerHTML,/data-so-prop="qty" aria-label="Barang Masuk Susu"/);
 await t.click('submit');
 assert.equal(t.writes.length,0);
});

test('daily expense history groups materials by category without original transaction controls',async()=>{
 const t=runtime();
 t.data.state.documents=[
  {id:'e1',period_id:'period',type:'expense',category:'Kalibrasi',start:'2026-11-08',end:'2026-11-08',postings:[{key:'m:a',name:'Susu',qty:-2,unit:'ML'}]},
  {id:'e2',period_id:'period',type:'expense',category:'Lainnya',start:'2026-11-08',end:'2026-11-08',postings:[{key:'m:a',name:'Susu',qty:-3,unit:'ML'},{key:'m:b',name:'Gula',qty:-100,unit:'GR'}]},
  {id:'e3',period_id:'period',type:'expense',category:'QC',void:true,start:'2026-11-08',end:'2026-11-08',postings:[{key:'m:a',name:'Susu',qty:-99,unit:'ML'}]}
 ];
 await t.click('history-tab',{soKind:'expense'});
 const html=t.page.innerHTML;
 assert.match(html,/8 November 2026/);
 assert.equal((html.match(/class="so-date-material-row"/g)||[]).length,3);
 assert.match(html,/Susu<\/span><strong>2 ML/);
 assert.match(html,/Susu<\/span><strong>3 ML/);
 assert.doesNotMatch(html,/Susu<\/span><strong>5 ML/);
 assert.match(html,/<h4>Kalibrasi<\/h4>/);
 assert.match(html,/<h4>Lainnya<\/h4>/);
 assert.match(html,/Gula<\/span><strong>100 GR/);
 assert.doesNotMatch(html,/Transaksi asli|data-so-action="(?:edit|void|adjust)"/);
 assert.doesNotMatch(html,/<h4>QC<\/h4>/);
});

test('daily receipt history totals repeated materials without original records',async()=>{
 const t=runtime();
 t.data.state.documents=[
  {id:'r1',period_id:'period',type:'receipt',start:'2026-11-08',end:'2026-11-08',postings:[{key:'m:a',name:'Susu',qty:100,unit:'ML'}]},
  {id:'r2',period_id:'period',type:'receipt',start:'2026-11-08',end:'2026-11-08',postings:[{key:'m:a',name:'Susu',qty:50,unit:'ML'},{key:'m:b',name:'Gula',qty:20,unit:'GR'}]}
 ];
 await t.click('history-tab',{soKind:'receipt'});
 const html=t.page.innerHTML;
 assert.match(html,/8 November 2026/);
 assert.equal((html.match(/class="so-date-material-row"/g)||[]).length,2);
 assert.match(html,/Susu<\/span><strong>150 ML/);
 assert.match(html,/Gula<\/span><strong>20 GR/);
 assert.doesNotMatch(html,/Transaksi asli|data-so-action="(?:edit|void)"/);
});

test('daily expense history distinguishes inward adjustments from outward expenses',async()=>{
 const t=runtime();
 t.data.state.documents=[
 {id:'e1',period_id:'period',type:'expense',category:'Waste',start:'2026-11-08',end:'2026-11-08',postings:[{key:'m:a',name:'Susu',qty:-5,unit:'ML'}]},
 {id:'m1',period_id:'period',type:'move_in',start:'2026-11-08',end:'2026-11-08',postings:[{key:'m:a',name:'Susu',qty:3,unit:'ML'}]}
 ];
 await t.click('history-tab',{soKind:'expense'});
 assert.match(t.page.innerHTML,/Susu<\/span><strong>5 ML/);
 assert.match(t.page.innerHTML,/Masuk \/ penyesuaian/);
 assert.match(t.page.innerHTML,/3 ML/);
});

test('expense material totals remain separated by category, including repeated material',async()=>{
 const t=runtime();
 t.data.state.documents=[
 {id:'a',period_id:'period',type:'expense',category:'Waste',start:'2026-11-08',end:'2026-11-08',postings:[{key:'m:a',name:'Susu',qty:-2,unit:'ML'}]},
 {id:'b',period_id:'period',type:'expense',category:'Waste',start:'2026-11-08',end:'2026-11-08',postings:[{key:'m:a',name:'Susu',qty:-4,unit:'ML'}]},
 {id:'c',period_id:'period',type:'expense',category:'QC',start:'2026-11-08',end:'2026-11-08',postings:[{key:'m:a',name:'Susu',qty:-5,unit:'ML'}]}
 ];
 await t.click('history-tab',{soKind:'expense'});
 const html=t.page.innerHTML;
 assert.match(html,/<h4>QC<\/h4>/);
 assert.match(html,/<h4>Waste<\/h4>/);
 assert.match(html,/Susu<\/span><strong>6 ML/);
 assert.match(html,/Susu<\/span><strong>5 ML/);
 assert.equal((html.match(/class="so-date-material-row"/g)||[]).length,2);
});


test('desktop unit selection preserves quantity and submits selected unit', async () => {
  const t = runtime();
  t.data.catalog[0].units = [{unit:'ML',factor:1},{unit:'LITER',factor:1000}];
  await t.ui.open('receipt');
  await t.click('receipt-add',{soItemKey:'m:a'});
  assert.match(t.page.innerHTML, /data-so-value="LITER"/);
  t.input({soKey:'m:a',soProp:'qty'},'2');
  await t.click('unit-option',{soKey:'m:a',soValue:'LITER'});
  assert.equal(t.draft('receipt').counts['m:a'].qty,'2');
  assert.equal(t.draft('receipt').counts['m:a'].unit,'LITER');
  await t.click('submit');
  assert.equal(t.writes.at(-1).input.lines[0].unit,'LITER');
});

test('Excel import replaces draft only after approval and never writes a transaction', async () => {
  const t=runtime(); await t.ui.open('sales');
  t.input({soKey:'s:a',soProp:'qty'},'2');
  t.setExcel({readFile:async()=>({'s:a':{qty:'9'}})});
  t.confirm(false); await t.importFile({});
  assert.equal(t.draft('sales').counts['s:a'].qty,'2');
  t.confirm(true); await t.importFile({});
  assert.equal(t.draft('sales').counts['s:a'].qty,'9');
  assert.equal(t.writes.length,0);
});

test('Excel import preserves existing draft if validation or storage fails', async () => {
  const t=runtime(); await t.ui.open('sales');
  t.input({soKey:'s:a',soProp:'qty'},'2');
  t.setExcel({readFile:async()=>{throw Error('File tidak cocok');}});
  await t.importFile({}); assert.equal(t.draft('sales').counts['s:a'].qty,'2');
  t.setExcel({readFile:async()=>({'s:a':{qty:'9'}})});
  t.storageFails(true); await t.importFile({});
  assert.equal(t.draft('sales').counts['s:a'].qty,'2');
  assert.equal(t.writes.length,0);
});

test('opname template leaves physical counts blank even when the draft is filled', async () => {
  const t=runtime(); await t.ui.open('close');
  t.input({soKey:'m:a',soProp:'qty'},'42');
  let exported; t.setExcel({exportFile:async value=>{exported=value;}});
  await t.click('excel-form');
  assert.equal(exported.kind,'close');
  assert.equal(exported.rows.find(row=>row.key==='m:a').qty,'');
  assert.equal(exported.rows.find(row=>row.key==='m:a').unit,'ML');
  assert.equal(t.draft('close').counts['m:a'].qty,'42');
  assert.equal(t.writes.length,0);
});

test('sales template leaves quantities blank even when the draft is filled', async () => {
  const t=runtime(); await t.ui.open('sales');
  t.input({soKey:'s:a',soProp:'qty'},'42');
  let exported; t.setExcel({exportFile:async value=>{exported=value;}});
  await t.click('excel-form');
  assert.equal(exported.kind,'sales');
  assert.equal(exported.rows.find(row=>row.key==='s:a').qty,'');
  assert.equal(exported.rows.find(row=>row.key==='s:a').name,'Menu');
  assert.equal(t.draft('sales').counts['s:a'].qty,'42');
  assert.equal(t.writes.length,0);
});

test('switching history tabs and showing more does not rerender an open sales form', async () => {
  const t=runtime(); await t.ui.open('sales');
  t.input({soKey:'s:a',soProp:'qty'},'12');
  const before=t.pageRenders();
  await t.click('history-tab',{soKind:'expense'});
  assert.equal(t.pageRenders(),before);
  assert.match(t.page.innerHTML,/Riwayat Pengeluaran/);
  assert.equal(t.draft('sales').counts['s:a'].qty,'12');
  await t.click('history-tab',{soKind:'sales'});
  await t.click('history-more');
  assert.equal(t.pageRenders(),before);
  assert.match(t.page.innerHTML,/Riwayat Sales/);
  assert.equal(t.draft('sales').counts['s:a'].qty,'12');
  assert.equal(t.writes.length,0);
});
