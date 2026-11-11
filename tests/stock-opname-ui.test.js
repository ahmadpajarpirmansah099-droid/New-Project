'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function runtime() {
  const handlers = {}, writes = [], confirmations = [];
  const page = { innerHTML: '', contains: () => true };
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
    AppAuth: { getContext: () => ({}), getClient: () => ({}) },
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
    draft: kind => { const value = drafts[kind || letHolder.active]; return value && copy(value); },
    confirm: value => allowConfirm = value,
    storageFails: value => storageFails = value,
    writeFails: value => writeFails = value,
    input(dataset, value) { handlers.input({ target: { dataset, value, closest: () => null } }); },
    async click(name) {
      handlers.click({ target: { closest: () => ({ dataset: { soAction: name } }) }, preventDefault() {} });
      await new Promise(resolve => setImmediate(resolve));
    }
  };
}

for (const [kind, key] of [['receipt', 'm:a'], ['production', 'w:a'], ['sales', 's:a']]) {
  test(kind + ' does not send an expense category', async () => {
    const t = runtime(); await t.ui.open(kind);
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
  assert.doesNotMatch(t.page.innerHTML, /type="date"|<select\b/);
  await t.ui.open('expense');
  assert.match(t.page.innerHTML, /Pilih kategori/);
  assert.doesNotMatch(t.page.innerHTML, /<select\b/);
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
