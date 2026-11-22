'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const TEST_TODAY = '2026-11-23';
function dateOffset(days) {
  const date = new Date(TEST_TODAY + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
const TEST_YESTERDAY = dateOffset(1);
const fixedNow = Date.parse('2026-11-22T17:00:00.000Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}

function contentsOfStockOpnameUi() {
  return fs.readFileSync('assets/js/stock-opname-ui.js', 'utf8');
}

function contentsOfStockOpnameStyles() {
  return fs.readFileSync('assets/css/style.css', 'utf8');
}

function runtime() {
  const handlers = {}, writes = [], confirmations = [];
  let pageHtml = '', pageRenders = 0;
  const history = { set outerHTML(value) { const start=pageHtml.indexOf('<section class="so-panel so-history-panel"'); if(start>=0)pageHtml=pageHtml.slice(0,start)+value; } };
  let partsEnabled=false;
  const parts={toolbar:{innerHTML:''},rows:{innerHTML:''},input:{value:''},results:{innerHTML:''}};
  const liveForm={querySelector(selector){return ({'[data-so-expense-toolbar]':parts.toolbar,'[data-so-expense-rows]':parts.rows,'[data-so-expense-search]':parts.input,'[data-so-expense-results]':parts.results})[selector]||null;}};
  const page = { get innerHTML(){return pageHtml;}, set innerHTML(value){pageHtml=value;pageRenders++;}, contains: () => true, querySelector: selector => selector==='.so-form'&&partsEnabled?liveForm:selector==='#soHistory' && pageHtml.includes('id="soHistory"') ? history : null };
  const searchResults = { innerHTML: '' };
  const searchContainerClasses = new Set();
  const searchContainer = { classList: { toggle(name, force) { if (force) searchContainerClasses.add(name); else searchContainerClasses.delete(name); }, contains(name) { return searchContainerClasses.has(name); } }, querySelector: () => searchResults };
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
    Intl, Date: FixedDate, Number, crypto: { randomUUID: () => 'request' },
    confirm: () => { throw Error('Stock Opname must not use a browser confirmation'); },
    addEventListener() {},
    document: {
      getElementById: id => id === 'page-stock-opname' ? page : null,
      addEventListener: (name, fn) => handlers[name] = fn,
      body: { appendChild() {} },
      createElement(name) {
        if(name==='template'){const template={innerHTML:'',content:{querySelector:()=>({get innerHTML(){return template.innerHTML;}})}};return template;}
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
      async targetCatalog() { return [{key:'m:destination',name:'Susu tujuan',unit:'ML'}]; },
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
    enableExpenseParts() { partsEnabled=true; }, parts,
    searchResults,
    draft: kind => { const value = drafts[kind || letHolder.active]; return value && copy(value); },
    seedDraft(value) { drafts[value.kind]=copy(value); letHolder.active=value.kind; },
    setExcel(value) { w.StockExcel = value; },
    async importFile(file) { await handlers.change({target:{dataset:{soExcelImport:''},files:[file],value:'file'}}); },
    confirm: value => allowConfirm = value,
    storageFails: value => storageFails = value,
    writeFails: value => writeFails = value,
    input(dataset, value) { handlers.input({ target: { dataset, value, parentElement: { querySelector: () => searchResults }, closest: selector => selector === '.so-receipt-search' ? searchContainer : null } }); },
    expenseSearchVisible() { return searchContainer.classList.contains('has-results'); },
    async click(name, dataset = {}) {
      handlers.click({ target: { closest: () => ({ dataset: { soAction: name, ...dataset } }) }, preventDefault() {} });
      await new Promise(resolve => setImmediate(resolve));
    }
  };
}

test('Stock Opname render keeps month navigation visible and does not use the legacy table-only class', () => {
  const t = runtime();
  const classes = new Set();
  t.page.classList = {
    add: value => classes.add(value),
    remove: value => classes.delete(value),
    contains: value => classes.has(value)
  };
  t.ui.render();
  assert.equal(classes.has('so-table-only'), false);
  assert.doesNotMatch(t.page.innerHTML, /so-table-only/);
  assert.match(t.page.innerHTML, /class="so-overview"/);
  assert.match(t.page.innerHTML, /class="so-month-nav"/);
  assert.match(t.page.innerHTML, /data-so-action="month-prev"/);
  assert.match(t.page.innerHTML, /data-so-action="month-next"/);
  assert.match(t.page.innerHTML, /class="so-layout-table"/);
  assert.doesNotMatch(contentsOfStockOpnameUi(), /so-table-only/);
});

test('active Stock Opname dashboard places period and transaction cards in one row', () => {
  const t = runtime();
  t.ui.render();
  const html = t.page.innerHTML;
  const rowStart = html.indexOf('<div class="so-dashboard-row">');
  const overviewStart = html.indexOf('<section class="so-overview"', rowStart);
  const overviewEnd = html.indexOf('</section>', overviewStart);
  const transactionStart = html.indexOf('<section class="so-panel so-transaction-actions"', overviewEnd);
  const transactionEnd = html.indexOf('</section>', transactionStart);
  assert.ok(rowStart >= 0, 'dashboard row wrapper should render');
  assert.ok(overviewStart > rowStart, 'period card should be inside dashboard row');
  assert.ok(overviewEnd > overviewStart, 'period card should close before transaction card');
  assert.ok(transactionStart > overviewEnd, 'transaction card should follow the period card');
  assert.ok(transactionEnd > transactionStart, 'transaction card should be inside dashboard row');
  const row = html.slice(rowStart, transactionEnd + '</section>'.length);
  assert.match(row, /class="so-overview"/);
  assert.match(html, /data-so-action="refresh"/);
  assert.doesNotMatch(html, /data-sd="open">Dashboard<\/button>/);
  assert.doesNotMatch(row, /Berjalan/);
  assert.match(row, /class="so-month-nav"/);
  assert.match(row, /class="so-month-name">November 2026<\/span>/);
  assert.match(row, /data-so-action="month-prev"/);
  assert.match(row, /data-so-action="month-next"/);
  assert.match(row, /class="so-panel so-transaction-actions"/);
  const iconByKind = {
    receipt: 'package-plus',
    expense: 'package-minus',
    production: 'cooking-pot',
    sales: 'receipt-text'
  };
  const labelByKind = {
    receipt: 'Barang Masuk',
    expense: 'Pengeluaran',
    production: 'Produksi WIP',
    sales: 'Sales'
  };
  for (const [kind, icon] of Object.entries(iconByKind)) {
    assert.match(row, new RegExp('data-so-kind="' + kind + '" class="so-transaction-button"'));
    assert.match(row, new RegExp('data-lucide="' + icon + '"'));
    assert.ok(row.includes('<span>' + labelByKind[kind] + '</span>'), labelByKind[kind] + ' label should remain');
  }
  assert.doesNotMatch(row, /Transaksi Stok|Pilih transaksi yang ingin dicatat\./);
});

test('Stock Opname period card gives secondary status, clear month controls, and soft action hover', () => {
  const css = contentsOfStockOpnameStyles();
  assert.match(css, /#page-stock-opname \.so-period-copy \.so-period-status\s*\{[^}]*font:\s*500 13px\/1\.35/);
  assert.match(css, /#page-stock-opname \.so-period-copy \.so-month-name\s*\{[^}]*font:\s*700 20px/);
  assert.match(css, /#page-stock-opname \.so-overview \.so-month-nav > button\s*\{[^}]*box-shadow:/);
  assert.match(css, /#page-stock-opname \.so-overview \.so-actions > button\s*\{[^}]*box-shadow:/);
  assert.match(css, /#page-stock-opname \.so-overview \.so-actions > button:hover:not\(:disabled\)\s*\{[^}]*transform:\s*translateY\(-2px\) scale\(1\.01\)/);
  assert.match(css, /#page-stock-opname \.so-period-copy \.so-month-nav\s*\{[^}]*grid-template-columns:\s*42px minmax\(0, 1fr\) 42px/);
  assert.match(css, /#page-stock-opname \.so-period-copy \.so-month-name\s*\{[^}]*text-align:\s*center/);
  assert.match(css, /#page-stock-opname \.so-overview,\s*#page-stock-opname \.so-overview:is\([^)]*\)\s*\{[^}]*border-inline-start:\s*1px solid var\(--so-line\)/);
  assert.match(css, /#page-stock-opname \.so-overview \.so-month-nav > button\s*\{[^}]*color:\s*var\(--so-ink\)[^}]*border:\s*1px solid #d5d8e0[^}]*box-shadow:\s*0 4px 12px[^}]*font:\s*800 24px\/1/);
  assert.match(css, /#page-stock-opname \.so-transaction-actions \.so-actions > button:hover:not\(:disabled\)\s*\{[^}]*transform:\s*translateY\(-2px\) scale\(1\.01\)[^}]*box-shadow:\s*0 8px 17px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?so-transaction-actions \.so-actions > button \{ transition: none/);
});

test('Barang Masuk cleans restored date values and defaults the received date to today', async () => {
  const t = runtime();
  t.seedDraft({ kind: 'receipt', end: '2026-11-19|', start: '2026-11-19|', counts: {}, receiptItems: [], note: '', touched: true });
  await t.ui.open('receipt');
  const expectedToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const expectedLabel = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  assert.equal(t.draft('receipt').end, expectedToday);
  assert.match(t.page.innerHTML, new RegExp(expectedLabel));
  assert.equal(t.page.innerHTML.includes('2026|'), false);
});

test('receipt, expense, production, and sales forms render with visible in-app date controls', async () => {
  const t = runtime();
  for (const kind of ['receipt', 'expense', 'production', 'sales']) {
    await t.ui.open(kind);
    assert.match(t.page.innerHTML, kind==='receipt' ? /class="so-panel so-form so-receipt-reference-form"/ : /class="so-panel so-form"/, kind + ' form should render');
    assert.match(t.page.innerHTML, /data-so-action="pick-date"/, kind + ' should include a date picker button');
    assert.match(t.page.innerHTML, /data-so-field="end"/, kind + ' should include the transaction date');
    if (kind === 'sales') assert.match(t.page.innerHTML, /data-so-field="start"/, 'sales should include the start date');
  }
});

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
  await t.click('expense-add',{soItemKey:'m:a'});
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

test('refresh restores physical counts in an already open correction form and keeps today visible in history', async () => {
  const t = runtime(), p = t.data.state.periods[0];
  p.status = 'reopened'; p.end = TEST_TODAY;
  await t.ui.open('close');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '42');
  t.input({ soKey: 'w:a', soProp: 'qty' }, '');
  p.end = TEST_TODAY;
  p.result = [{ key: 'm:a', unit: 'ML', physical: 5781 }, { key: 'w:a', unit: 'ML', physical: 200 }];
  await t.click('refresh');
  assert.equal(t.draft('close').counts['m:a'].qty, '42');
  assert.equal(t.draft('close').counts['w:a'].qty, '200');
  assert.equal(t.draft('close').end, TEST_TODAY);
  assert.match(t.page.innerHTML, /23 November 2026/);
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

test('transaction dates and unit selections remain available outside the Stock Opname close panel', async () => {
  const t = runtime(); await t.ui.open('close');
  const closePanel = t.page.innerHTML.match(/<section class="so-panel so-form">[\s\S]*?<\/section>/)?.[0] || '';
  assert.ok(closePanel);
  assert.doesNotMatch(closePanel, /Tanggal|data-so-action="pick-date"/);
  await t.ui.open('receipt');
  await t.click('receipt-add', { soItemKey: 'm:a' });
  assert.match(t.page.innerHTML, /data-so-action="pick-date"/);
  assert.match(t.page.innerHTML, /data-so-action="pick-choice"/);
  assert.doesNotMatch(t.page.innerHTML, /type="date"/);
  assert.match(t.page.innerHTML, /<details class="so-unit-dropdown"/);
  await t.ui.open('expense');
  assert.match(t.page.innerHTML, /aria-label="Kategori pengeluaran"/);
  assert.match(t.page.innerHTML, /data-so-action="expense-category"/);
});

test('opname results show two compact rows and keep full movements expandable', async () => {
  const t = runtime();
  t.data.state.periods[0].end = TEST_TODAY;
  t.data.state.periods[0].result = [{ name: 'Apple Juice', unit: 'ML', opening: 2388, movements: { sales: -300, receipt: 6000 }, system: 8088, physical: 5781, variance: -2307, price: 47, variance_value: -108429 }];
  await t.ui.open('close');
  assert.match(t.page.innerHTML, /class="so-result-item"><summary><span class="so-result-top"/);
  assert.match(t.page.innerHTML, /class="so-result-bottom"><span>Sistem 8\.088 → Fisik 5\.781 ML<\/span><span>Selisih -2\.307 ML/);
  assert.match(t.page.innerHTML, /<dt>Stock Awal<\/dt>.*<dt>Sales<\/dt>.*<dt>Barang Masuk<\/dt>.*<dt>Harga \/ ML<\/dt>/);
});

test('total selisih rupiah nets gains and losses at the bottom of each result', async () => {
  const t = runtime();
  t.data.state.periods[0].end = TEST_TODAY;
  t.data.state.periods[0].result = [
    { name: 'Bahan A', unit: 'GR', movements: {}, system: 2, physical: 1, variance: -1, variance_value: -2705 },
    { name: 'Bahan B', unit: 'GR', movements: {}, system: 1, physical: 3, variance: 2, variance_value: 7680 },
    { name: 'Bahan C', unit: 'GR', movements: {}, system: 1, physical: 1, variance: 0, variance_value: 0 }
  ];
  await t.ui.open('close');
  assert.match(t.page.innerHTML, /<div class="so-result-total"><span>Total selisih rupiah<\/span><strong>Rp4\.975<\/strong><\/div>/);
  assert.ok(t.page.innerHTML.indexOf('Bahan C') < t.page.innerHTML.indexOf('so-result-total'));
});

test('main page hides global history and each active form shows only its own history', async () => {
  const t = runtime(), p = t.data.state.periods[0];
  p.opening = { 'm:a': 100 };
  p.opening_catalog = [{ key: 'm:a', name: 'Susu', unit: 'ML' }];
  p.end = TEST_TODAY;
  p.result = [{ key: 'm:a', name: 'Susu', unit: 'ML', movements: {}, system: 90, physical: 88, variance: -2, variance_value: -20 }];
  t.data.state.documents = [
    { id: 'r', period_id: 'period', type: 'receipt', start: TEST_TODAY, end: TEST_TODAY, postings: [{ key: 'm:a', name: 'Susu', qty: 10, unit: 'ML' }] },
    { id: 's', period_id: 'period', type: 'sales', start: TEST_YESTERDAY, end: TEST_YESTERDAY, postings: [{ key: 's:a', name: 'Menu', qty: 20, unit: 'PCS' }] }
  ];
  t.ui.render();
  assert.doesNotMatch(t.page.innerHTML, /Riwayat /);
  assert.doesNotMatch(t.page.innerHTML, /so-history-tabs/);
  await t.ui.open('close');
  assert.match(t.page.innerHTML, /Riwayat Stock Opname/);
  assert.doesNotMatch(t.page.innerHTML, /Riwayat (?:Barang Masuk|Sales)/);
  assert.doesNotMatch(t.page.innerHTML, /class="so-history-compact-details"/);
  await t.ui.open('receipt');
  await t.click('receipt-add',{soItemKey:'m:a'});
  t.input({ soKey: 'm:a', soProp: 'qty' }, '2');
  assert.match(t.page.innerHTML, /Riwayat Barang Masuk/);
  assert.match(t.page.innerHTML, /23 November 2026/);
  assert.doesNotMatch(t.page.innerHTML, /Riwayat Sales|22 November 2026/);
  assert.equal(t.draft('receipt').counts['m:a'].qty, '2');
  await t.ui.open('sales');
  assert.match(t.page.innerHTML, /Riwayat Sales/);
  assert.match(t.page.innerHTML, /Belum ada riwayat hari ini/);
  assert.doesNotMatch(t.page.innerHTML, /Riwayat Barang Masuk|22 November 2026/);
  await t.click('history-more');
  assert.match(t.page.innerHTML, /22 November 2026/);
  await t.ui.open('receipt');
  assert.match(t.page.innerHTML, /Riwayat Barang Masuk/);
  assert.doesNotMatch(t.page.innerHTML, /Riwayat Sales|22 November 2026/);
  assert.equal(t.draft('receipt').counts['m:a'].qty, '2');
});


test('Stock Opname history date groups open only for today by default', () => {
  const source = contentsOfStockOpnameUi();
  assert.match(source, /function historyDate\(date,entries,content,unit='transaksi',expanded=false\)/);
  assert.match(source, /date===today\(\)/);
  assert.doesNotMatch(source, /,'transaksi',index===0\)/);
});


test('Stock Opname histories for all six types default to today and keep older dates hidden', async () => {
  const t = runtime(), p = t.data.state.periods[0];
  p.start = TEST_TODAY;
  p.end = TEST_TODAY;
  p.opening = { 'm:a': 100 };
  p.opening_catalog = [{ key: 'm:a', name: 'Susu', unit: 'ML' }];
  p.result = [{ key: 'm:a', name: 'Susu', unit: 'ML', movements: {}, system: 100, physical: 99, variance: -1, variance_value: -10 }];
  t.data.state.periods.unshift({
    id: 'previous-period', start: TEST_YESTERDAY, end: TEST_YESTERDAY, status: 'closed',
    opening: { 'm:a': 20 },
    opening_catalog: [{ key: 'm:a', name: 'Susu', unit: 'ML' }],
    result: [{ key: 'm:a', name: 'Susu', unit: 'ML', movements: {}, system: 20, physical: 18, variance: -2, variance_value: -20 }]
  });
  t.data.state.documents = [
    ...['receipt','expense','production','sales'].flatMap(kind => [
      { id: kind+'-today', period_id: 'period', type: kind, category: 'Waste', start: TEST_TODAY, end: TEST_TODAY, postings: [{ key: kind==='sales'?'s:a':kind==='production'?'w:a':'m:a', name: kind==='sales'?'Menu':kind==='production'?'WIP':'Susu', qty: kind==='expense'?-2:2, unit: 'ML' }] },
      { id: kind+'-older', period_id: 'period', type: kind, category: 'Waste', start: TEST_YESTERDAY, end: TEST_YESTERDAY, postings: [{ key: kind==='sales'?'s:a':kind==='production'?'w:a':'m:a', name: kind==='sales'?'Menu':kind==='production'?'WIP':'Susu', qty: kind==='expense'?-3:3, unit: 'ML' }] }
    ])
  ];
  for (const kind of ['receipt','expense','production','sales','initial','close']) {
    await t.ui.open(kind);
    assert.match(t.page.innerHTML, /23 November 2026/);
    assert.match(t.page.innerHTML, /class="so-history-date"><details open>/, kind+' today date should be open');
    assert.doesNotMatch(t.page.innerHTML, /22 November 2026/, kind+' older date should stay hidden');
  }
});

test('history shows an empty today state and reveals previous dates only after clicking', async () => {
  const t = runtime();
  t.data.state.documents = [{
    id: 'yesterday-receipt', period_id: 'period', type: 'receipt',
    start: TEST_YESTERDAY, end: TEST_YESTERDAY,
    postings: [{ key: 'm:a', name: 'Susu', qty: 5, unit: 'ML' }]
  }];
  await t.ui.open('receipt');
  assert.match(t.page.innerHTML, /Belum ada riwayat hari ini/);
  assert.doesNotMatch(t.page.innerHTML, /so-history-date/);
  assert.match(t.page.innerHTML, /Tampilkan tanggal sebelumnya/);
  await t.click('history-more');
  assert.match(t.page.innerHTML, /Belum ada riwayat hari ini/);
  assert.match(t.page.innerHTML, /<span>22 November 2026<\/span>/);
  assert.match(t.page.innerHTML, /class="so-history-date"><details>/);
  assert.doesNotMatch(t.page.innerHTML, /class="so-history-date"><details open>/);
});

test('history card styling and transaction evidence panel use the requested class structure', async () => {
  const source = contentsOfStockOpnameUi();
  const css = contentsOfStockOpnameStyles();
  const historyStart = css.indexOf('.so-history-head {');
  const historyEnd = css.indexOf('\n.so-result {', historyStart);
  assert.ok(historyStart >= 0 && historyEnd > historyStart);
  const historyBlock = css.slice(historyStart, historyEnd);
  assert.doesNotMatch(historyBlock, /!important/);
  assert.match(historyBlock, /\.so-history-date\s*\{[^}]*background:\s*var\(--ui-surface\)/s);
  assert.match(historyBlock, /\.so-history-date:has\(> details\[open\]\)/);
  assert.match(historyBlock, /\.so-history-category-chip/);
  assert.match(historyBlock, /\.so-history-transactions\s*\{[^}]*border-top:\s*1px solid var\(--ui-line\)/s);
  assert.match(historyBlock, /#page-stock-opname \.so-history-actions \.so-history-link\s*\{[^}]*background:\s*transparent;/s);
  assert.match(historyBlock, /#page-stock-opname \.so-history-actions \.so-history-link\s*\{[^}]*border:\s*0;/s);
  assert.match(historyBlock, /#page-stock-opname \.so-history-link::after/);
  assert.match(historyBlock, /#page-stock-opname \.so-history-link:hover::after/);
  assert.match(source, /so-date-material-row--actions/);
  assert.doesNotMatch(source, /class="so-history-transactions"/);
  assert.doesNotMatch(source, /class="so-history-transaction"/);
  assert.doesNotMatch(source, /Transaksi per bukti/);
  assert.match(source, /class="so-history-category-chip"/);
  assert.match(source, /Tampilkan tanggal sebelumnya/);
  assert.match(historyBlock, /\.so-history-date > details > summary\s*\{[^}]*font: 800 16px\/1\.35/);
  assert.match(historyBlock, /\.so-history \.so-date-material-row span\s*\{[^}]*font-size: 13px/);
  assert.match(historyBlock, /\.so-history \.so-opening-lines > div\s*\{[^}]*font-size: 13px/);
  assert.match(historyBlock, /\.so-history \.so-date-material-category h4\.so-history-category-chip\s*\{[^}]*font-size: 10px/);
});

test('history highlights expense outflows and consumed Sales ingredients in red', async () => {
  const t = runtime();
  t.data.state.documents = [
    { id: 'expense-out', period_id: 'period', type: 'expense', category: 'Waste', start: TEST_TODAY, end: TEST_TODAY, postings: [{ key: 'm:a', name: 'Susu', qty: -2, unit: 'ML' }] },
    {
      id: 'sales-consumption', period_id: 'period', type: 'sales', start: TEST_TODAY, end: TEST_TODAY,
      catalog_snapshot: {
        menus: [{ id: 'cola', nama_menu: 'Cola' }],
        menuRecipeLines: [{ menu_id: 'cola', component_type: 'material', item_id: 'a' }]
      },
      lines: [{ key: 's:cola', qty: 2 }],
      postings: [{ key: 'm:a', name: 'Susu', qty: -250, unit: 'ML' }]
    }
  ];
  await t.ui.open('expense');
  assert.match(t.page.innerHTML, /<strong class="is-negative">2 ML<\/strong>/);
  await t.ui.open('sales');
  assert.match(t.page.innerHTML, /Bahan terpakai/);
  assert.match(t.page.innerHTML, /<strong class="is-negative">250 ML<\/strong>/);
});

test('daily receipt history shows today first and loads older dates in order', async () => {
  const t = runtime();
  const receipt = (id, day, qty) => ({
    id, period_id: 'period', type: 'receipt', start: day, end: day,
    postings: [{ key: 'm:a', name: 'Susu', qty, unit: 'ML' }]
  });
  t.data.state.documents = [
    ...Array.from({ length: 12 }, (_, i) => receipt('today-' + i, TEST_TODAY, i + 1)),
    ...Array.from({ length: 10 }, (_, i) => receipt('older-' + i, dateOffset(i + 1), 1))
  ];
  await t.ui.open('receipt');
  const html = t.page.innerHTML;
  assert.equal((html.match(/class="so-history-date"/g) || []).length, 1);
  assert.match(html, /class="so-history-date"><details open>/);
  assert.match(html, /<span>23 November 2026<\/span>/);
  assert.match(html, /Susu<\/span><strong>78 ML/);
  assert.match(html, /so-date-material-row--actions/);
  assert.doesNotMatch(html, /so-history-transaction/);
  assert.doesNotMatch(html, /Transaksi per bukti/);
  assert.match(html, /data-so-action="void"/);
  assert.doesNotMatch(html, /<span>22 November 2026<\/span>/);
  assert.match(html, /Tampilkan tanggal sebelumnya/);
  assert.match(html, /data-so-action="history-more"/);
  await t.click('history-more');
  assert.equal((t.page.innerHTML.match(/class="so-history-date"/g) || []).length, 11);
  assert.equal((t.page.innerHTML.match(/class="so-history-date"><details open>/g) || []).length, 1);
  assert.match(t.page.innerHTML, /<span>22 November 2026<\/span>/);
  assert.match(t.page.innerHTML, /<span>13 November 2026<\/span>/);
  assert.doesNotMatch(t.page.innerHTML, /data-so-action="history-more"/);
});

test('resetting Stock Awal preserves transactions and requires complete manual input', async () => {
  const t = runtime(); t.data.state.periods[0].status = 'reopened';
  t.data.state.documents = [{ id: 'sale-1', period_id: 'period', type: 'sales', postings: [] }];
  await t.click('reset-opening');
  assert.equal(t.data.state.periods[0].status, 'opening_pending');
  assert.equal(t.data.state.documents.length, 1);
  await t.ui.open('initial');
  const history = t.page.innerHTML.match(/<section class="so-panel so-history-panel" id="soHistory">[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(history, /Belum ada riwayat hari ini/);
  assert.doesNotMatch(history, /1 November 2026/);
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
  await t.click('expense-add',{soItemKey:'m:a'});
  t.input({ soKey: 'm:a', soProp: 'qty' }, '9'); t.writeFails(true);
  await t.click('submit');
  assert.equal(t.draft().counts['m:a'].qty, '9');
  assert.match(t.page.innerHTML, /Koneksi terputus/);
  t.writeFails(false); await t.click('submit');
  assert.equal(t.writes[0].request, t.writes[1].request);
  assert.deepEqual(t.writes[0].input, t.writes[1].input);
  assert.equal(t.draft('expense'), undefined);
});

test('Stock Opname close form removes its duplicate ledger and date control', async () => {
  const t = runtime();
  await t.ui.open('close');
  const html = t.page.innerHTML;
  const panel = html.match(/<section class="so-panel so-form">[\s\S]*?<\/section>/)?.[0] || '';
  assert.ok(panel, 'Stock Opname panel should remain visible');
  assert.doesNotMatch(panel, /so-count-ledger|data-so-key=|data-so-prop=/);
  assert.doesNotMatch(panel, /Tanggal|data-so-action="pick-date"/);
  assert.match(panel, /Isi jumlah fisik pada kolom STOK FISIK di tabel bawah/);
  assert.match(panel, /Unduh Template Kosong/);
  assert.match(panel, /Impor Excel/);
  assert.match(panel, /Simpan Draft/);
  assert.match(panel, /Tutup Form/);
  assert.match(panel, /Konfirmasi/);
  assert.match(html, /class="so-layout-table"/);
  t.input({ soKey: 'm:a', soProp: 'qty' }, '1.5');
  assert.equal(t.draft('close').counts['m:a'].qty, '1.5');
  assert.match(html, /class="so-table-header-pill">STOK SISTEM<\/span>/);
});

test('Stock Opname close exposes a single physical count surface in the month table', async () => {
  const t = runtime();
  await t.ui.open('close');
  const html = t.page.innerHTML;
  const panel = html.match(/<section class="so-panel so-form">[\s\S]*?<\/section>/)?.[0] || '';
  const table = html.match(/<section class="so-layout-table"[\s\S]*?<\/section>/)?.[0] || '';
  assert.ok(panel, 'Stock Opname form should be present');
  assert.ok(table, 'month table should be present');
  assert.doesNotMatch(panel, /<table\b|data-so-prop="qty"|data-so-key=/);
  assert.match(table, /class="so-physical-input"[^>]*data-so-key="m:a"/);
  assert.match(table, /class="so-physical-input"[^>]*data-so-key="w:a"/);
  assert.equal((html.match(/class="so-physical-input"/g) || []).length, 2);
});

test('Stock Awal keeps its own count ledger and conversion controls', async () => {
  const t = runtime();
  t.data.state.periods[0].status = 'opening_pending';
  t.data.state.periods[0].opening_reset_at = 'reset-1';
  await t.ui.open('initial');
  const panel = t.page.innerHTML.match(/<section class="so-panel so-form">[\s\S]*?<\/section>/)?.[0] || '';
  assert.ok(panel);
  assert.match(panel, /so-count-ledger/);
  assert.match(panel, /Konversi fisik/);
  assert.match(panel, /data-so-action="pick-date"/);
});

test('missing recipe disables its input and offers master-data navigation', async () => {
  const t = runtime(); t.data.catalog[1].error = 'Resep WIP belum lengkap';
  await t.ui.open('production');
  assert.match(t.page.innerHTML, /Resep WIP belum lengkap/);
  assert.match(t.page.innerHTML, /aria-label="Produksi WIP WIP" value="" disabled/);
  assert.match(t.page.innerHTML, /data-so-page="wips"/);
});

test('Barang Masuk matches the compact reference form and keeps item quantity, unit, date, invoice and note',async()=>{
 const t=runtime();
 await t.ui.open('receipt');
 assert.match(t.page.innerHTML,/Catat Barang Masuk/);
 assert.match(t.page.innerHTML,/Bahan baku/);
 assert.match(t.page.innerHTML,/Cari nama barang/);
 assert.match(t.page.innerHTML,/Jumlah/);
 assert.match(t.page.innerHTML,/Satuan/);
 assert.match(t.page.innerHTML,/Pilih satuan/);
 assert.match(t.page.innerHTML,/Harga invoice total \(opsional\)/);
 assert.match(t.page.innerHTML,/Tanggal diterima/);
 assert.match(t.page.innerHTML,/class="so-receipt-details-grid"/);
 assert.match(t.page.innerHTML,/class="so-receipt-quantity-unit-grid"/);
 assert.match(t.page.innerHTML,/Catatan \/ nomor invoice/);
 assert.match(t.page.innerHTML,/Batal/);
 assert.match(t.page.innerHTML,/Simpan Barang Masuk/);
 assert.doesNotMatch(t.page.innerHTML,/Simpan Draft/);
 t.input({soReceiptSearch:''},'su');
 assert.match(t.searchResults.innerHTML,/Susu/);
 await t.click('receipt-add',{soItemKey:'m:a'});
 assert.match(t.page.innerHTML,/data-so-selected-key="m:a"/);
 assert.doesNotMatch(t.page.innerHTML,/readonly/);
 assert.match(t.page.innerHTML,/value="Susu"/);
 t.input({soReceiptSearch:'',soSelectedKey:'m:a'},'su');
 assert.equal(t.draft('receipt').counts['m:a'],undefined);
 assert.match(t.searchResults.innerHTML,/Susu/);
 await t.click('receipt-add',{soItemKey:'m:a'});
 assert.match(t.page.innerHTML,/data-so-prop="qty" aria-label="Barang Masuk Susu"/);
 assert.match(t.page.innerHTML,/aria-label="Satuan dasar Susu"/);
 t.input({soKey:'m:a',soProp:'qty'},'3');
 t.input({soKey:'m:a',soProp:'invoice_total'},'25000');
 t.input({soField:'note'},'INV-2026-001');
 assert.equal(t.draft('receipt').counts['m:a'].qty,'3');
 assert.equal(t.draft('receipt').note,'INV-2026-001');
 await t.click('submit');
 assert.equal(t.writes.at(-1).input.lines.length,1);
 assert.equal(t.writes.at(-1).input.lines[0].qty,'3');
 assert.equal(t.writes.at(-1).input.lines[0].unit,'ML');
 assert.equal(t.writes.at(-1).input.lines[0].invoice_total,'25000');
 assert.equal(t.writes.at(-1).input.lines[0].note,'INV-2026-001');
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
  {id:'e1',period_id:'period',type:'expense',category:'Kalibrasi',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:-2,unit:'ML'}]},
  {id:'e2',period_id:'period',type:'expense',category:'Lainnya',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:-3,unit:'ML'},{key:'m:b',name:'Gula',qty:-100,unit:'GR'}]},
  {id:'e3',period_id:'period',type:'expense',category:'QC',void:true,start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:-99,unit:'ML'}]}
 ];
 await t.ui.open('expense');
 const html=t.page.innerHTML;
 assert.match(html,/23 November 2026/);
 assert.equal((html.match(/class="so-date-material-row(?: so-date-material-row--actions)?"/g)||[]).length,3);
 assert.match(html,/Susu<\/span><strong class="is-negative">2 ML/);
 assert.match(html,/Susu<\/span><strong class="is-negative">3 ML/);
 assert.doesNotMatch(html,/Susu<\/span><strong>5 ML/);
 assert.match(html,/<h4 class="so-history-category-chip">Kalibrasi<\/h4>/);
 assert.match(html,/<h4 class="so-history-category-chip">Lainnya<\/h4>/);
 assert.match(html,/Gula<\/span><strong class="is-negative">100 GR/);
 assert.match(html,/data-so-action="void"/);
 assert.doesNotMatch(html,/<h4 class="so-history-category-chip">QC<\/h4>/);
});

test('daily receipt history totals repeated materials without original records',async()=>{
 const t=runtime();
 t.data.state.documents=[
  {id:'r1',period_id:'period',type:'receipt',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:100,unit:'ML'}]},
  {id:'r2',period_id:'period',type:'receipt',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:50,unit:'ML'},{key:'m:b',name:'Gula',qty:20,unit:'GR'}]}
 ];
 await t.ui.open('receipt');
 const html=t.page.innerHTML;
 assert.match(html,/23 November 2026/);
 assert.equal((html.match(/class="so-date-material-row(?: so-date-material-row--actions)?"/g)||[]).length,2);
 assert.match(html,/Susu<\/span><strong>150 ML/);
 assert.match(html,/Gula<\/span><strong>20 GR/);
 assert.equal((html.match(/class="so-date-material-row so-date-material-row--actions"/g)||[]).length,2);
 assert.match(html,/data-so-action="void"/);
 assert.doesNotMatch(html,/so-history-transactions/);
});



test('multi-item receipt shows its transaction actions beside each related material row',async()=>{
 const t=runtime();
 t.data.state.documents=[{id:'receipt-multi',period_id:'period',type:'receipt',start:TEST_TODAY,end:TEST_TODAY,postings:[
  {key:'m:a',name:'Susu',qty:10,unit:'ML'},
  {key:'m:b',name:'Gula',qty:20,unit:'GR'}
 ]}];
 await t.ui.open('receipt');
 const html=t.page.innerHTML;
 assert.equal((html.match(/class="so-date-material-row so-date-material-row--actions"/g)||[]).length,2);
 assert.equal((html.match(/data-so-action="void" data-so-id="receipt-multi"/g)||[]).length,2);
 await t.click('void',{soId:'receipt-multi'});
 assert.equal(t.writes.at(-1).action,'void');
 assert.equal(t.writes.at(-1).input.id,'receipt-multi');
});

test('grouped Barang Masuk history exposes per-transaction cancellation and updates stock',async()=>{
 const t=runtime();
 t.data.state.documents=[{id:'receipt-1',period_id:'period',type:'receipt',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:10,unit:'ML'}]}];
 await t.ui.open('receipt');
 assert.match(t.page.innerHTML,/data-so-action="void" data-so-id="receipt-1"/);
 await t.click('void',{soId:'receipt-1'});
 assert.equal(t.writes.at(-1).action,'void');
 assert.equal(t.writes.at(-1).input.id,'receipt-1');
});

test('editable history exposes text-only Edit and Batalkan actions on every active-month transaction',async()=>{
 const t=runtime();
 t.data.state.periods[0].legacy_period_ids=['legacy-november'];
 t.data.state.documents=[
  {id:'receipt-legacy',period_id:'legacy-november',type:'receipt',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:10,unit:'ML'}]},
  {id:'receipt-current',period_id:'period',type:'receipt',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:b',name:'Gula',qty:20,unit:'GR'}]}
 ];
 await t.ui.open('receipt');
 const html=t.page.innerHTML;
 assert.equal((html.match(/class="so-history-link"/g)||[]).length,4);
 assert.match(html,/class="so-history-link" data-so-action="edit" data-so-id="receipt-legacy"/);
 assert.match(html,/class="so-history-link" data-so-action="void" data-so-id="receipt-legacy"/);
 assert.match(html,/class="so-history-link" data-so-action="edit" data-so-id="receipt-current"/);
 assert.match(html,/class="so-history-link" data-so-action="void" data-so-id="receipt-current"/);
 await t.click('edit',{soId:'receipt-legacy'});
 assert.equal(t.draft('receipt').id,'receipt-legacy');
});

test('daily expense history distinguishes inward adjustments from outward expenses',async()=>{
 const t=runtime();
 t.data.state.documents=[
 {id:'e1',period_id:'period',type:'expense',category:'Waste',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:-5,unit:'ML'}]},
 {id:'m1',period_id:'period',type:'move_in',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:3,unit:'ML'}]}
 ];
 await t.ui.open('expense');
 assert.match(t.page.innerHTML,/Susu<\/span><strong class="is-negative">5 ML/);
 assert.match(t.page.innerHTML,/Masuk \/ penyesuaian/);
 assert.match(t.page.innerHTML,/3 ML/);
});

test('expense material totals remain separated by category, including repeated material',async()=>{
 const t=runtime();
 t.data.state.documents=[
 {id:'a',period_id:'period',type:'expense',category:'Waste',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:-2,unit:'ML'}]},
 {id:'b',period_id:'period',type:'expense',category:'Waste',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:-4,unit:'ML'}]},
 {id:'c',period_id:'period',type:'expense',category:'QC',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'m:a',name:'Susu',qty:-5,unit:'ML'}]}
 ];
 await t.ui.open('expense');
 const html=t.page.innerHTML;
 assert.match(html,/<h4 class="so-history-category-chip">QC<\/h4>/);
 assert.match(html,/<h4 class="so-history-category-chip">Waste<\/h4>/);
 assert.match(html,/Susu<\/span><strong class="is-negative">6 ML/);
 assert.match(html,/Susu<\/span><strong class="is-negative">5 ML/);
 assert.equal((html.match(/class="so-date-material-row(?: so-date-material-row--actions)?"/g)||[]).length,2);
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

test('feature history is isolated and switching forms preserves each local draft', async () => {
  const t=runtime();
  t.data.state.documents=[
    {id:'expense-history',period_id:'period',type:'expense',category:'Waste',start:dateOffset(3),end:dateOffset(3),postings:[{key:'m:a',name:'Susu',qty:-4,unit:'ML'}]},
    {id:'production-history',period_id:'period',type:'production',start:dateOffset(2),end:dateOffset(2),postings:[{key:'w:a',name:'WIP',qty:5,unit:'ML'}]},
    {id:'sales-history',period_id:'period',type:'sales',start:TEST_TODAY,end:TEST_TODAY,postings:[{key:'s:a',name:'Menu',qty:3,unit:'PCS'}]}
  ];
  await t.ui.open('sales');
  t.input({soKey:'s:a',soProp:'qty'},'12');
  assert.match(t.page.innerHTML,/Riwayat Sales/);
  assert.doesNotMatch(t.page.innerHTML,/Riwayat Pengeluaran|Riwayat Produksi WIP/);
  await t.ui.open('expense');
  assert.match(t.page.innerHTML,/Riwayat Pengeluaran/);
  assert.doesNotMatch(t.page.innerHTML,/Riwayat Sales|Riwayat Produksi WIP/);
  assert.equal(t.draft('sales').counts['s:a'].qty,'12');
  await t.ui.open('production');
  assert.match(t.page.innerHTML,/Riwayat Produksi WIP/);
  assert.doesNotMatch(t.page.innerHTML,/Riwayat Sales|Riwayat Pengeluaran/);
  await t.click('history-more');
  assert.match(t.page.innerHTML,/Riwayat Produksi WIP/);
  assert.equal(t.writes.length,0);
});

test('Pengeluaran search results become visible while typing and redundant notices are omitted', async () => {
 const t=runtime(); await t.ui.open('expense');
 assert.doesNotMatch(t.page.innerHTML,/Belum ada barang dipilih|Draft lokal tersimpan di perangkat ini/);
 t.input({soExpenseSearch:''},'su');
 assert.equal(t.expenseSearchVisible(),true);
 assert.match(t.searchResults.innerHTML,/data-so-item-key="m:a"/);
 t.input({soExpenseSearch:''},'');
 assert.equal(t.expenseSearchVisible(),false);
});

test('Pengeluaran searches and selects materials and WIP one by one', async () => {
 const t=runtime(); await t.ui.open('expense');
 assert.match(t.page.innerHTML,/Cari barang atau WIP/);
 assert.doesNotMatch(t.page.innerHTML,/aria-label="Pengeluaran (?:Susu|WIP)"/);
 t.input({soExpenseSearch:''},'su'); assert.match(t.searchResults.innerHTML,/data-so-item-key="m:a"/);
 await t.click('expense-add',{soItemKey:'m:a'}); t.input({soKey:'m:a',soProp:'qty'},'5');
 t.input({soExpenseSearch:''},'wip'); assert.match(t.searchResults.innerHTML,/data-so-item-key="w:a"/);
 await t.click('expense-add',{soItemKey:'w:a'}); t.input({soKey:'w:a',soProp:'qty'},'3');
 await t.click('expense-add',{soItemKey:'w:a'});
 assert.deepEqual(t.draft('expense').expenseItems,['m:a','w:a']);
 await t.click('submit');
 assert.equal(t.writes[0].input.lines.length,2);
 assert.equal(t.writes[0].input.lines[0].qty,'5'); assert.equal(t.writes[0].input.lines[1].qty,'3');
});

test('legacy expense drafts restore pre-existing materials and WIP', async () => {
 const t=runtime(); t.seedDraft({kind:'expense',request:'legacy',counts:{'m:a':{qty:'7',unit:'ML'},'w:a':{qty:'0',unit:'ML'}},mapping:{},category:'Waste',start:'2026-11-01',end:'2026-11-01'});
 await t.ui.open('expense');
 assert.match(t.page.innerHTML,/aria-label="Pengeluaran Susu" value="7"/);
 assert.match(t.page.innerHTML,/aria-label="Pengeluaran WIP" value="0"/);
 await t.click('submit'); assert.equal(t.writes[0].input.lines[0].qty,'7');
});

test('removing an expense item clears only its draft values and Move mapping', async () => {
 const t=runtime(); await t.ui.open('expense');
 await t.click('expense-add',{soItemKey:'m:a'}); await t.click('expense-add',{soItemKey:'w:a'});
 t.input({soKey:'m:a',soProp:'qty'},'5'); t.input({soKey:'w:a',soProp:'qty'},'3');
 t.input({soMap:'m:a'},'m:destination'); await t.click('expense-remove',{soItemKey:'m:a'});
 assert.equal(t.draft('expense').counts['m:a'],undefined);
 assert.equal(t.draft('expense').mapping['m:a'],undefined);
 assert.equal(t.draft('expense').counts['w:a'].qty,'3');
 await t.click('submit'); assert.equal(t.writes[0].input.lines.length,1);
 assert.equal(t.writes[0].input.lines[0].key,'w:a');
});

test('Move keeps selected item, destination and mapping when submitting', async () => {
 const t=runtime(); t.data.targets=[{id:'destination',name:'Outlet'}];
 t.seedDraft({kind:'expense',request:'move',counts:{'m:a':{qty:'5',unit:'ML'}},mapping:{'m:a':'m:destination'},category:'Move',target:'destination',start:'2026-11-01',end:'2026-11-01'});
 await t.ui.open('expense'); await t.click('submit');
 assert.equal(t.writes[0].input.target,'destination');
 assert.equal(t.writes[0].input.mapping[0].target,'m:destination');
 assert.equal(t.writes[0].input.lines[0].qty,'5');
});

test('expense category uses in-page options and selection preserves selected items', async () => {
 const t=runtime(); await t.ui.open('expense');
 assert.match(t.page.innerHTML, /class="so-category-dropdown"/);
 assert.match(t.page.innerHTML, /data-so-action="expense-category" data-so-value="Waste" aria-pressed="true"/);
 assert.doesNotMatch(t.page.innerHTML, /data-so-field="category" data-so-title="Pilih kategori"/);
 await t.click('expense-add',{soItemKey:'m:a'}); t.input({soKey:'m:a',soProp:'qty'},'5');
 await t.click('expense-category',{soValue:'Kalibrasi'});
 assert.equal(t.draft('expense').category,'Kalibrasi');
 assert.equal(t.draft('expense').counts['m:a'].qty,'5');
 assert.match(t.page.innerHTML, /data-so-value="Kalibrasi" aria-pressed="true"/);
 await t.click('submit'); assert.equal(t.writes[0].input.category,'Kalibrasi');
});

test('selecting Move via in-page category retains safeguards', async () => {
 const t=runtime(); await t.ui.open('expense');
 await t.click('expense-add',{soItemKey:'m:a'}); t.input({soKey:'m:a',soProp:'qty'},'5');
 await t.click('expense-category',{soValue:'Move'});
 assert.match(t.page.innerHTML,/Belum ada outlet\/divisi tujuan yang aktif/);
 await t.click('submit'); assert.equal(t.writes.length,0);
 assert.equal(t.draft('expense').counts['m:a'].qty,'5');
});

test('expense selection updates form sections without replacing page or form', async () => {
 const t=runtime(); t.data.catalog[0].units.push({unit:'Botol',factor:1000});
 await t.ui.open('expense'); t.enableExpenseParts(); const before=t.pageRenders();
 await t.click('expense-add',{soItemKey:'m:a'});
 assert.equal(t.pageRenders(),before); assert.match(t.parts.rows.innerHTML,/Pengeluaran Susu/);
 t.input({soKey:'m:a',soProp:'qty'},'4');
 await t.click('expense-category',{soValue:'Move'});
 assert.equal(t.pageRenders(),before); assert.match(t.parts.toolbar.innerHTML,/Belum ada outlet/);
 await t.click('unit-option',{soKey:'m:a',soValue:'Botol'});
 assert.equal(t.pageRenders(),before);
 assert.equal(t.draft('expense').counts['m:a'].qty,'4');
 assert.equal(t.draft('expense').counts['m:a'].unit,'Botol');
 assert.equal(t.draft('expense').category,'Move');
 assert.equal(t.writes.length,0);
});

test('Stock Opname table uses lime header pills and inline physical counts during opname', async () => {
  const t = runtime();
  await t.ui.open('close');
  t.ui.render();
  assert.match(t.page.innerHTML, /class="so-table-header-pill">STOK AWAL<\/span>/);
  assert.match(t.page.innerHTML, /class="so-table-header-pill">STOK FISIK<\/span>/);
  assert.match(t.page.innerHTML, /class="so-physical-input"[^>]*data-so-key="m:a"[^>]*placeholder="Isi"/);
  t.input({soKey:'m:a',soProp:'qty'},'17');
  assert.equal(t.draft('close').counts['m:a'].qty,'17');
  assert.match(t.page.innerHTML, /so-layout-ledger/);
});

test('new Stock Opname table shows active master items and all requested columns', () => {
  const t = runtime();
  t.data.catalog.push({ key: 'm:cup', name: 'Cup takeaway Dingin', unit: 'PCS' });
  t.ui.render();
  for (const label of ['NAMA ITEM', 'STOK AWAL', 'BARANG MASUK', 'BARANG KELUAR', 'TERPAKAI OPERASIONAL', 'STOK SISTEM', 'STOK FISIK']) {
    assert.match(t.page.innerHTML, new RegExp(label));
  }
  assert.match(t.page.innerHTML, /Susu/);
  assert.match(t.page.innerHTML, /Cup tak\.\. Dingin/);
  assert.match(t.page.innerHTML, /data-label="STOK AWAL"><span>0 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="BARANG MASUK"><span>0 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="BARANG KELUAR"><span>0 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="STOK SISTEM"><span>0 ML<\/span>/);
  t.data.state.periods[0].opening['m:a'] = 125;
  t.ui.render();
  assert.match(t.page.innerHTML, /data-label="STOK AWAL"><span>125 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="STOK SISTEM"><span>125 ML<\/span>/);
  assert.match(t.page.innerHTML, /<tr class="so-table-group"><th scope="rowgroup" colspan="7"><span class="so-table-header-pill">WIP<\/span><\/th><\/tr>/);
  assert.match(t.page.innerHTML, /<th scope="row" data-label="NAMA ITEM">[\s\S]*?WIP[\s\S]*?<\/th>/);
  assert.doesNotMatch(t.page.innerHTML, /<th scope="row" data-label="NAMA ITEM">Menu<\/th>/);
});

test('main table accumulates receipt and expense postings by master item until the first opname closes', () => {
  const t = runtime();
  t.data.state.periods[0].legacy_period_ids = ['old-period'];
  t.data.state.documents = [
    { id: 'r-current', period_id: 'period', type: 'receipt', postings: [{ key: 'm:a', qty: 100 }, { key: 'w:a', qty: 999 }] },
    { id: 'r-legacy', period_id: 'old-period', type: 'receipt', postings: [{ key: 'm:a', qty: 25 }] },
    { id: 'e-current', period_id: 'period', type: 'expense', category: 'Waste', postings: [{ key: 'm:a', qty: -7 }] },
    { id: 'e-legacy', period_id: 'old-period', type: 'expense', category: 'QC', postings: [{ key: 'm:a', qty: -3 }] },
    { id: 'e-void', period_id: 'period', type: 'expense', category: 'Waste', void: true, postings: [{ key: 'm:a', qty: -500 }] },
    { id: 'production', period_id: 'period', type: 'production', postings: [{ key: 'm:a', qty: -40 }, { key: 'w:a', qty: 8 }] },
    { id: 'sales', period_id: 'period', type: 'sales', postings: [{ key: 'm:a', qty: -20 }, { key: 'w:a', qty: -4 }] },
    { id: 'sales-void', period_id: 'period', type: 'sales', void: true, postings: [{ key: 'm:a', qty: -500 }] }
  ];
  t.ui.render();
  assert.match(t.page.innerHTML, /data-label="BARANG MASUK"><span>125 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="BARANG KELUAR"><span>10 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="TERPAKAI OPERASIONAL"><span>60 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="STOK SISTEM"><span>55 ML<\/span>/);
});

test('WIP rows show production output, expense and operational consumption separately', () => {
  const t = runtime();
  t.data.state.periods[0].opening['w:a'] = 10;
  t.data.state.periods[0].opening['w:b'] = 20;
  t.data.catalog.push({ key: 'w:b', name: 'WIP Terpakai Produksi', unit: 'ML', units: [{ unit: 'ML', factor: 1 }] });
  t.data.state.documents = [
    { id: 'expense-wip', period_id: 'period', type: 'expense', category: 'Waste', postings: [{ key: 'w:a', qty: -2 }] },
    { id: 'production-wip', period_id: 'period', type: 'production', postings: [{ key: 'w:a', qty: 50 }, { key: 'w:b', qty: -5 }] },
    { id: 'sales-wip', period_id: 'period', type: 'sales', postings: [{ key: 'w:a', qty: -7 }] }
  ];
  t.ui.render();
  assert.match(t.page.innerHTML, /<th scope="row" data-label="NAMA ITEM">[\s\S]*?WIP[\s\S]*?<\/th>[\s\S]*?data-label="BARANG MASUK"><span>50 ML<\/span>[\s\S]*?data-label="BARANG KELUAR"><span>2 ML<\/span>[\s\S]*?data-label="TERPAKAI OPERASIONAL"><span>7 ML<\/span>[\s\S]*?data-label="STOK SISTEM"><span>51 ML<\/span>/);
  assert.match(t.page.innerHTML, /<th scope="row" data-label="NAMA ITEM">[\s\S]*?WIP Terpakai Produksi[\s\S]*?<\/th>[\s\S]*?data-label="TERPAKAI OPERASIONAL"><span>5 ML<\/span>[\s\S]*?data-label="STOK SISTEM"><span>15 ML<\/span>/);
});

test('system stock uses the requested balance formula and colors negative values red', () => {
  const t = runtime();
  t.data.state.periods[0].opening['m:a'] = 15;
  t.data.state.documents = [
    { id: 'receipt', period_id: 'period', type: 'receipt', postings: [{ key: 'm:a', qty: 5 }] },
    { id: 'expense', period_id: 'period', type: 'expense', postings: [{ key: 'm:a', qty: -2 }] },
    { id: 'production', period_id: 'period', type: 'production', postings: [{ key: 'm:a', qty: -8 }] },
    { id: 'sales', period_id: 'period', type: 'sales', postings: [{ key: 'm:a', qty: -7 }] }
  ];

  t.ui.render();
  assert.match(t.page.innerHTML, /data-label="STOK SISTEM"><span>3 ML<\/span>/);
  assert.doesNotMatch(t.page.innerHTML, /class="so-table-negative"/);

  t.data.state.periods[0].opening['m:a'] = 12;
  t.ui.render();
  assert.match(t.page.innerHTML, /data-label="STOK SISTEM"><span>0 ML<\/span>/);
  assert.doesNotMatch(t.page.innerHTML, /class="so-table-negative"/);

  t.data.state.periods[0].opening['m:a'] = 10;
  t.ui.render();
  assert.match(t.page.innerHTML, /data-label="STOK SISTEM"><span class="so-table-negative">-2 ML<\/span>/);
});

test('movement table shows only the selected calendar month and starts the next month fresh', async () => {
  const t = runtime();
  t.data.state.documents = [
    { id: 'legacy', period_id: 'old-period', type: 'receipt', postings: [{ key: 'm:a', qty: 40 }] },
    { id: 'legacy-production', period_id: 'old-period', type: 'production', postings: [{ key: 'm:a', qty: -40 }] },
    { id: 'new-receipt', period_id: 'next-period', type: 'receipt', postings: [{ key: 'm:a', qty: 6 }] },
    { id: 'new-expense', period_id: 'next-period', type: 'expense', category: 'Waste', postings: [{ key: 'm:a', qty: -2 }] },
    { id: 'new-production', period_id: 'next-period', type: 'production', postings: [{ key: 'm:a', qty: -5 }] },
    { id: 'new-sales', period_id: 'next-period', type: 'sales', postings: [{ key: 'm:a', qty: -6 }] }
  ];
  t.data.state.periods[0].status = 'closed';
  t.data.state.periods[0].legacy_period_ids = ['old-period'];
  t.data.month = '2026-11';
  t.ui.render();
  assert.match(t.page.innerHTML, /data-label="BARANG MASUK"><span>40 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="BARANG KELUAR"><span>0 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="TERPAKAI OPERASIONAL"><span>40 ML<\/span>/);
  t.data.state.periods.push({ id: 'next-period', previous_id: 'period', start: '2026-12-01', status: 'active', opening: {} });
  t.ui.render();
  await t.click('month-next');
  assert.match(t.page.innerHTML, /data-label="BARANG MASUK"><span>6 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="BARANG KELUAR"><span>2 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="TERPAKAI OPERASIONAL"><span>11 ML<\/span>/);
  assert.match(t.page.innerHTML, /data-label="STOK SISTEM"><span class="so-table-negative">-7 ML<\/span>/);
});


test('Stock Opname close targets the month selected in the navigator', async () => {
  const t = runtime();
  t.data.state.periods.push({ id: 'dec', previous_id: 'period', start: '2026-12-01', status: 'active', opening: {} });
  t.data.month = '2026-12';
  t.ui.render();
  await t.click('month-prev');
  assert.match(t.page.innerHTML, /November 2026/);
  await t.ui.open('close');
  const documentDate = t.draft('close').end;
  t.input({ soKey: 'm:a', soProp: 'qty' }, '1');
  t.input({ soKey: 'w:a', soProp: 'qty' }, '0');
  await t.click('submit');
  assert.equal(t.writes.length, 1);
  assert.equal(t.writes[0].action, 'close');
  assert.equal(t.writes[0].input.month, '2026-11-01');
  assert.equal(t.writes[0].input.end, documentDate);
  assert.equal(t.writes[0].input.date, documentDate);
});

test('Sales form rejects a date range that crosses a calendar month before writing', async () => {
  const t = runtime(); await t.ui.open('sales');
  t.input({ soField: 'start' }, '2026-11-30');
  t.input({ soField: 'end' }, '2026-12-01');
  await t.click('submit');
  assert.equal(t.writes.length, 0);
  assert.match(t.page.innerHTML, /Rentang Sales tidak boleh melewati pergantian bulan/);
  assert.equal(t.draft('sales').start, '2026-11-30');
  assert.equal(t.draft('sales').end, '2026-12-01');
});

test('Sales form accepts a date range contained within one calendar month', async () => {
  const t = runtime(); await t.ui.open('sales');
  t.input({ soField: 'start' }, '2026-11-10');
  t.input({ soField: 'end' }, '2026-11-20');
  t.input({ soKey: 's:a', soProp: 'qty' }, '3');
  await t.click('submit');
  assert.equal(t.writes.length, 1);
  assert.equal(t.writes[0].action, 'save');
  assert.equal(t.writes[0].input.start, '2026-11-10');
  assert.equal(t.writes[0].input.end, '2026-11-20');
});

test('Stock Opname notices stay compact and do not render as large colored cards', () => {
  const css = contentsOfStockOpnameStyles();
  assert.match(css, /\.so-notice\s*\{[^}]*padding:\s*0;[^}]*background:\s*transparent;[^}]*border:\s*0;/);
  assert.match(css, /\.so-warning\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*color:/);
  assert.match(css, /\.so-form-head p\s*\{[^}]*font-size:\s*12px;[^}]*line-height:\s*1\.45;/);
  assert.match(css, /\.so-status\s*\{[^}]*font-size:\s*11px;[^}]*line-height:\s*1\.4;/);
});

test('Stock Opname feature forms do not show explanatory text beneath the title', async () => {
  const t=runtime();
  for (const kind of ['receipt','expense','production','sales','close']) {
    await t.ui.open(kind);
    assert.match(t.page.innerHTML,kind==='receipt' ? /class="so-form-head so-receipt-reference-head"[\s\S]*?<h2>Catat Barang Masuk<\/h2>/ : /class="so-form-head"><h2>[^<]+<\/h2><\/header>/);
    assert.doesNotMatch(t.page.innerHTML,/Catat barang yang digunakan atau dipindahkan|Isi jumlah batch|Pilih rentang tanggal|Catat bahan dan suplies yang diterima|Cocokkan stok sistem dengan fisik/);
  }
});

test('Stock Opname transaction icons are aligned and sized consistently', () => {
  const css = contentsOfStockOpnameStyles();
  assert.match(css, /\.so-transaction-actions \.so-transaction-button\s*\{[^}]*align-items:\s*center;[^}]*gap:\s*9px;/);
  assert.match(css, /\.so-transaction-actions \.so-transaction-icon\s*\{[^}]*width:\s*19px;[^}]*height:\s*19px;[^}]*flex:\s*0 0 19px;/);
});



test('Barang Masuk reference form keeps search free of backdrop blur', () => {
 const css=contentsOfStockOpnameStyles();
 const js=contentsOfStockOpnameUi();
 assert.ok(css.includes('.so-receipt-quantity-unit-grid'));
 assert.ok(css.includes('.so-receipt-details-grid'));
 assert.doesNotMatch(css, /so-receipt-search-active/);
 assert.doesNotMatch(js, /updateReceiptSearchMask|scheduleReceiptSearchMask|so-receipt-search-active/);
});
