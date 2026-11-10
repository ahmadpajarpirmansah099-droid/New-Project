'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function runtime() {
  const handlers = {}, writes = [], confirmations = [];
  const page = { innerHTML: '', contains: () => true };
  let draft = null, allowConfirm = true, storageFails = false, writeFails = false;
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
      saveDraft(value) { if (storageFails) throw Error('Quota exceeded'); draft = copy(value); },
      loadDraft: () => draft && copy(draft),
      clearDraft: () => draft = null,
      async write(action, input, request) {
        writes.push({ action, input: copy(input), request });
        if (writeFails) throw Error('Koneksi terputus');
      }
    }
  };
  w.window = w;
  vm.createContext(w);
  vm.runInContext(fs.readFileSync('assets/js/stock-opname-ui.js', 'utf8'), w);
  return {
    ui: w.StockOpnameUI, data, writes, confirmations, page,
    draft: () => draft,
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

test('closed local draft survives declining a replacement and can be restored', async () => {
  const t = runtime(); await t.ui.open('expense');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '9');
  await t.click('cancel'); t.confirm(false); await t.ui.open('receipt');
  assert.equal(t.draft().kind, 'expense');
  assert.equal(t.draft().counts['m:a'].qty, '9');
  assert.match(t.confirmations.at(-1), /akan diganti/);
  await t.click('restore'); t.confirm(true); await t.click('submit');
  assert.equal(t.writes[0].input.type, 'expense');
  assert.equal(t.writes[0].input.category, 'Waste');
  assert.equal(t.writes[0].input.lines[0].qty, '9');
});

test('explicit replacement confirmation allows a new draft', async () => {
  const t = runtime(); await t.ui.open('expense');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '9');
  await t.click('cancel'); await t.ui.open('receipt');
  assert.equal(t.draft().kind, 'receipt');
  assert.match(t.confirmations.at(-1), /akan diganti/);
});

test('switching blank forms does not ask to replace a draft', async () => {
  const t = runtime(); await t.ui.open('production');
  await t.ui.open('receipt');
  await t.click('cancel');
  await t.ui.open('sales');
  assert.equal(t.confirmations.length, 0);
  assert.equal(t.draft().kind, 'sales');
});

test('entered zero is still protected when changing forms', async () => {
  const t = runtime(); await t.ui.open('close');
  t.input({ soKey: 'm:a', soProp: 'qty' }, '0');
  t.confirm(false); await t.ui.open('expense');
  assert.equal(t.draft().kind, 'close');
  assert.match(t.confirmations[0], /akan diganti/);
});

test('changed date alone is protected as an unfinished draft', async () => {
  const t = runtime(); await t.ui.open('sales');
  t.input({ soField: 'start' }, '2026-10-20');
  t.confirm(false); await t.ui.open('receipt');
  assert.equal(t.draft().kind, 'sales');
  assert.equal(t.draft().start, '2026-10-20');
  assert.match(t.confirmations[0], /akan diganti/);
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
  assert.equal(t.draft(), null);
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
