'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createRuntime(flush) {
  const listeners = {};
  const messages = [];
  let closed = 0;
  const submitButton = { disabled: false };
  const form = {
    id: 'mdItemForm',
    dataset: {},
    querySelector: () => submitButton,
    elements: {
      mdItemId: { value: 'item-1' }, mdItemName: { value: 'Sirup Madu Rasa' },
      mdBaseUnit: { value: 'GR' }, mdReferencePrice: { value: '113390' },
      mdPriceUnit: { value: 'BOTOL' }, mdStatus: { value: 'active' },
      mdIsSupply: { checked: false }
    }
  };
  const host = { innerHTML: '' };
  const document = {
    readyState: 'complete',
    addEventListener: (name, callback) => { listeners[name] = callback; },
    getElementById: id => id === 'mdItemForm' ? form : id === 'masterDataRoot' ? host : null,
    querySelectorAll: () => []
  };
  const runtime = {
    document,
    Intl,
    confirm: () => true,
    closeSheet: () => { closed += 1; },
    toast: message => messages.push(message),
    MasterDataStore: { flush },
    MasterDataService: {
      ACTIVE: 'active', INACTIVE: 'inactive',
      saveItem: () => ({ id: 'item-1' }),
      getCounts: () => ({ total: 1, active: 1, inactive: 0 }),
      listItems: () => []
    }
  };
  runtime.window = runtime;
  vm.createContext(runtime);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/masterdata-ui.js'), 'utf8'), runtime);
  return { listeners, form, submitButton, messages, host, closed: () => closed };
}

test('Master Barang form uses stacked labels instead of floating labels', () => {
  const source = fs.readFileSync(path.join(__dirname, '../assets/js/masterdata-ui.js'), 'utf8');
  assert.doesNotMatch(source, /class="md-field flt(?: flt--static)?"/);
  assert.ok(source.includes('class="md-field"><span class="flt-label">Status</span>'));
  assert.ok(source.includes('class="md-field"><span class="flt-label">Harga referensi *</span>'));
});

test('Master Barang waits for database acknowledgement before showing saved', async () => {
  let resolveFlush;
  const state = createRuntime(() => new Promise(resolve => { resolveFlush = resolve; }));
  const pending = state.listeners.submit({ target: state.form, preventDefault() {} });

  assert.equal(state.form.dataset.saving, 'true');
  assert.equal(state.submitButton.disabled, true);
  assert.deepEqual(state.messages, []);
  assert.equal(state.closed(), 0);

  resolveFlush({ ok: true });
  await pending;

  assert.equal(state.form.dataset.saving, undefined);
  assert.equal(state.submitButton.disabled, false);
  assert.equal(state.closed(), 1);
  assert.deepEqual(state.messages, ['Master Barang berhasil disimpan.']);
});

test('Master Barang does not claim success when the database rejects a save', async () => {
  const state = createRuntime(async () => {
    state.messages.push('Master Data berubah. Muat ulang sebelum menyimpan kembali.');
    return false;
  });

  await state.listeners.submit({ target: state.form, preventDefault() {} });

  assert.equal(state.form.dataset.saving, undefined);
  assert.equal(state.submitButton.disabled, false);
  assert.equal(state.closed(), 1);
  assert.deepEqual(state.messages, ['Master Data berubah. Muat ulang sebelum menyimpan kembali.']);
});
