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
  'assets/js/wip-service.js',
  'assets/js/menu-service.js'
];

function createRuntime(existingStorage) {
  const values = existingStorage || new Map();
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
  const runtime = {
    localStorage,
    crypto: { randomUUID: () => 'menu-test-' + Math.random().toString(16).slice(2) },
    Date, Math, Intl, Set, Map, JSON, Number, String, Array, Object, Error
  };
  runtime.window = runtime;
  vm.createContext(runtime);
  files.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(rootDir, file), 'utf8'), runtime, { filename: file });
  });
  return { runtime, values };
}

function addMilk(runtime, overrides) {
  return runtime.MasterDataService.saveItem(Object.assign({
    nama_barang: 'Freshmilk',
    satuan_dasar: 'ML',
    konversi_satuan: [{ unit: 'L', factor: 1000 }],
    harga_referensi: '32000',
    satuan_harga: 'L',
    status: 'active'
  }, overrides || {}));
}

function addSyrup(runtime, milk) {
  return runtime.WipService.saveWip({
    nama_wip: 'Syrup Base', hasil_per_batch: 500, satuan_hasil: 'ML'
  }, [{
    component_type: 'material', item_id: milk.id, qty_input: 1, unit_input: 'L'
  }]);
}

function saveMenu(runtime, lines, overrides) {
  return runtime.MenuService.saveMenu(Object.assign({
    nama_menu: 'Iced Latte',
    harga_jual: 28000
  }, overrides || {}), lines);
}

test('Menu HPP sums direct material costs for one serving and calculates margin', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  const menu = saveMenu(runtime, [{
    component_type: 'material', item_id: milk.id, qty_input: 100, unit_input: 'ML'
  }], { harga_jual: 10000 });

  const result = runtime.MenuService.calculateHpp(menu.id);
  assert.equal(result.valid, true);
  assert.equal(result.hpp_per_serving, 3200);
  assert.equal(result.selling_price, 10000);
  assert.equal(result.margin_amount, 6800);
  assert.equal(result.margin_pct, 68);
  assert.equal(result.is_estimated, true);
});

test('Menu uses recursive WIP HPP per yield without dividing the menu recipe again', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  const syrup = addSyrup(runtime, milk);
  const menu = saveMenu(runtime, [{
    component_type: 'wip', component_wip_id: syrup.id, qty_input: 20, unit_input: 'ML'
  }]);

  const result = runtime.MenuService.calculateHpp(menu.id);
  assert.equal(result.valid, true);
  assert.equal(result.hpp_per_serving, 1280);
  assert.equal(result.is_estimated, true);
});

test('Menu HPP prefers last purchase price and does not mark the result estimated', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  const data = runtime.MasterDataStore.load();
  data.masterItems[0].harga_beli_terakhir_per_satuan_dasar = 40;
  runtime.MasterDataStore.save(data);
  const menu = saveMenu(runtime, [{
    component_type: 'material', item_id: milk.id, qty_input: 100, unit_input: 'ML'
  }]);

  const result = runtime.MenuService.calculateHpp(menu.id);
  assert.equal(result.hpp_per_serving, 4000);
  assert.equal(result.is_estimated, false);
});

test('Menu with zero selling price is invalid and has no margin percentage', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  const menu = saveMenu(runtime, [{
    component_type: 'material', item_id: milk.id, qty_input: 100, unit_input: 'ML'
  }], { harga_jual: 0 });

  const result = runtime.MenuService.calculateHpp(menu.id);
  assert.equal(result.valid, false);
  assert.match(result.reason, /Harga jual menu harus lebih besar dari 0/);
  assert.equal(Object.hasOwn(result, 'margin_pct'), false);
});

test('Missing material price makes Menu HPP invalid instead of zero', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime, { harga_referensi: '0' });
  const menu = saveMenu(runtime, [{
    component_type: 'material', item_id: milk.id, qty_input: 100, unit_input: 'ML'
  }]);

  const result = runtime.MenuService.calculateHpp(menu.id);
  assert.equal(result.valid, false);
  assert.match(result.reason, /Harga bahan Freshmilk belum tersedia/);
});

test('Inactive materials and WIP components cannot be added to a new menu', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  runtime.MasterDataService.setItemStatus(milk.id, 'inactive');

  assert.throws(() => saveMenu(runtime, [{
    component_type: 'material', item_id: milk.id, qty_input: 10, unit_input: 'ML'
  }]), /nonaktif/);
});

test('WIP component unit must match the WIP yield unit', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  const syrup = addSyrup(runtime, milk);

  assert.throws(() => saveMenu(runtime, [{
    component_type: 'wip', component_wip_id: syrup.id, qty_input: 10, unit_input: 'GR'
  }]), /harus sama dengan satuan hasil/);
});

test('Duplicate menu names are rejected case-insensitively within the scope', () => {
  const { runtime } = createRuntime();
  const milk = addMilk(runtime);
  saveMenu(runtime, [{
    component_type: 'material', item_id: milk.id, qty_input: 10, unit_input: 'ML'
  }]);

  assert.throws(() => saveMenu(runtime, [{
    component_type: 'material', item_id: milk.id, qty_input: 20, unit_input: 'ML'
  }], { nama_menu: 'iced latte' }), /Nama menu sudah digunakan/);
});

test('Menu and recipe lines persist without touching Guest Operational data', () => {
  const values = new Map([['waitlist_frontend_demo_v1', 'guest-data-safe']]);
  const first = createRuntime(values);
  const milk = addMilk(first.runtime);
  const menu = saveMenu(first.runtime, [{
    component_type: 'material', item_id: milk.id, qty_input: 10, unit_input: 'ML'
  }]);

  const second = createRuntime(values);
  assert.equal(values.get('waitlist_frontend_demo_v1'), 'guest-data-safe');
  assert.equal(second.runtime.MenuService.findMenu(menu.id).nama_menu, 'Iced Latte');
  assert.equal(second.runtime.MenuService.getLines(menu.id).length, 1);
});
