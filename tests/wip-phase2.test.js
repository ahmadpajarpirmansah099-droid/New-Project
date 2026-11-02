'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const files = [
  'assets/js/masterdata-store.js',
  'assets/js/masterdata-service.js',
  'assets/js/wip-service.js'
];

function createRuntime(existingStorage) {
  const values = existingStorage || new Map();
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
  const runtime = {
    localStorage,
    crypto: { randomUUID: () => 'test-' + Math.random().toString(16).slice(2) },
    Date, Math, Intl, Set, Map, JSON, Number, String, Array, Object, Error
  };
  runtime.window = runtime;
  vm.createContext(runtime);
  files.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(rootDir, file), 'utf8'), runtime, { filename: file });
  });
  return { runtime, values };
}

function addMilk(runtime, options) {
  return runtime.MasterDataService.saveItem(Object.assign({
    nama_barang: 'Freshmilk',
    satuan_dasar: 'ML',
    konversi_satuan: [{ unit: 'L', factor: 1000 }],
    harga_referensi: '32000',
    satuan_harga: 'L',
    status: 'active'
  }, options || {}));
}

function addWip(runtime, input, lines) {
  return runtime.WipService.saveWip(Object.assign({
    nama_wip: 'Simple Syrup',
    hasil_per_batch: 1000,
    satuan_hasil: 'ML'
  }, input || {}), lines || [{
    component_type: 'material',
    item_id: addMilk(runtime).id,
    qty_input: 1,
    unit_input: 'L'
  }]);
}

test('WIP calculates batch cost and HPP per yield from Master Barang base-unit cost', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  const wip = addWip(runtime, {}, [{
    component_type: 'material',
    item_id: milk.id,
    qty_input: 2,
    unit_input: 'L'
  }]);

  const result = runtime.WipService.calculateHpp(wip.id);
  assert.equal(result.valid, true);
  assert.equal(result.batch_cost, 64000);
  assert.equal(result.yield_quantity, 1000);
  assert.equal(result.hpp_per_yield, 64);
  assert.equal(result.is_estimated, true);
});

test('WIP prefers last purchase price and does not mark it as estimated', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  const data = runtime.MasterDataStore.load();
  data.masterItems[0].harga_beli_terakhir_per_satuan_dasar = 40;
  runtime.MasterDataStore.save(data);
  const wip = addWip(runtime, {}, [{
    component_type: 'material', item_id: milk.id, qty_input: 500, unit_input: 'ML'
  }]);

  const result = runtime.WipService.calculateHpp(wip.id);
  assert.equal(result.batch_cost, 20000);
  assert.equal(result.hpp_per_yield, 20);
  assert.equal(result.is_estimated, false);
});

test('Missing material price produces an invalid HPP reason, never zero', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime, { harga_referensi: '0' });
  const wip = addWip(runtime, {}, [{
    component_type: 'material', item_id: milk.id, qty_input: 100, unit_input: 'ML'
  }]);

  const result = runtime.WipService.calculateHpp(wip.id);
  assert.equal(result.valid, false);
  assert.match(result.reason, /Harga bahan Freshmilk belum tersedia/);
  assert.equal(Object.hasOwn(result, 'hpp_per_yield'), false);
});

test('Nested WIP HPP is calculated recursively', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  const syrup = addWip(runtime, { nama_wip: 'Syrup Base', hasil_per_batch: 500, satuan_hasil: 'ML' }, [{
    component_type: 'material', item_id: milk.id, qty_input: 1, unit_input: 'L'
  }]);
  const drinkBase = addWip(runtime, { nama_wip: 'Drink Base', hasil_per_batch: 250, satuan_hasil: 'ML' }, [{
    component_type: 'wip', component_wip_id: syrup.id, qty_input: 100, unit_input: 'ML'
  }]);

  const result = runtime.WipService.calculateHpp(drinkBase.id);
  assert.equal(result.valid, true);
  assert.equal(result.batch_cost, 6400);
  assert.equal(result.hpp_per_yield, 25.6);
  assert.equal(result.is_estimated, true);
});

test('WIP cycle references are rejected', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  const first = addWip(runtime, { nama_wip: 'First', hasil_per_batch: 100, satuan_hasil: 'ML' }, [{
    component_type: 'material', item_id: milk.id, qty_input: 10, unit_input: 'ML'
  }]);
  const second = addWip(runtime, { nama_wip: 'Second', hasil_per_batch: 100, satuan_hasil: 'ML' }, [{
    component_type: 'wip', component_wip_id: first.id, qty_input: 10, unit_input: 'ML'
  }]);

  assert.throws(() => runtime.WipService.saveWip({
    id: first.id, nama_wip: 'First', hasil_per_batch: 100, satuan_hasil: 'ML'
  }, [{
    component_type: 'wip', component_wip_id: second.id, qty_input: 1, unit_input: 'ML'
  }]), /membentuk siklus/);
});

test('WIP component unit must match child yield unit', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  const child = addWip(runtime, { nama_wip: 'Syrup', satuan_hasil: 'ML' }, [{
    component_type: 'material', item_id: milk.id, qty_input: 1, unit_input: 'L'
  }]);

  assert.throws(() => runtime.WipService.saveWip({
    nama_wip: 'Coffee Base', hasil_per_batch: 100, satuan_hasil: 'ML'
  }, [{
    component_type: 'wip', component_wip_id: child.id, qty_input: 10, unit_input: 'GR'
  }]), /harus sama dengan satuan hasil/);
});

test('Inactive material cannot be added to a new recipe and invalidates existing HPP', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  const wip = addWip(runtime, {}, [{
    component_type: 'material', item_id: milk.id, qty_input: 100, unit_input: 'ML'
  }]);
  runtime.MasterDataService.setItemStatus(milk.id, 'inactive');

  const result = runtime.WipService.calculateHpp(wip.id);
  assert.equal(result.valid, false);
  assert.match(result.reason, /sudah nonaktif/);
  assert.throws(() => runtime.WipService.saveWip({
    nama_wip: 'Another WIP', hasil_per_batch: 100, satuan_hasil: 'ML'
  }, [{
    component_type: 'material', item_id: milk.id, qty_input: 10, unit_input: 'ML'
  }]), /nonaktif/);
});

test('WIP records and recipe lines persist under the separate Master Data key', () => {
  const values = new Map([['waitlist_frontend_demo_v1', 'keep-me']]);
  const first = createRuntime(values);
  const milk = addMilk(first.runtime);
  const wip = addWip(first.runtime, {}, [{
    component_type: 'material', item_id: milk.id, qty_input: 100, unit_input: 'ML'
  }]);

  const second = createRuntime(values);
  assert.equal(values.get('waitlist_frontend_demo_v1'), 'keep-me');
  assert.equal(second.runtime.WipService.findWip(wip.id).nama_wip, 'Simple Syrup');
  assert.equal(second.runtime.WipService.getLines(wip.id).length, 1);
});
