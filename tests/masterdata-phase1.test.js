'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const storePath = path.join(rootDir, 'assets/js/masterdata-store.js');
const servicePath = path.join(rootDir, 'assets/js/masterdata-service.js');

function createRuntime(existingStorage) {
  const values = existingStorage || new Map();
  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };

  const runtime = {
    localStorage,
    crypto: { randomUUID: () => 'test-id-' + Math.random().toString(16).slice(2) },
    console,
    Date,
    Math,
    Intl,
    Set,
    Map,
    JSON,
    Number,
    String,
    Array,
    Object,
    Error
  };
  runtime.window = runtime;
  vm.createContext(runtime);
  vm.runInContext(fs.readFileSync(storePath, 'utf8'), runtime, { filename: 'masterdata-store.js' });
  vm.runInContext(fs.readFileSync(servicePath, 'utf8'), runtime, { filename: 'masterdata-service.js' });
  return { runtime, values };
}

function validItem(overrides) {
  return Object.assign({
    nama_barang: 'Freshmilk',
    satuan_dasar: 'ML',
    konversi_satuan: [{ unit: 'L', factor: 1000 }],
    harga_referensi: '32000',
    satuan_harga: 'L',
    status: 'active'
  }, overrides || {});
}

test('Master Data uses a separate localStorage key and preserves Guest Operations data', () => {
  const values = new Map([['waitlist_frontend_demo_v1', 'existing-guest-data']]);
  const { runtime } = createRuntime(values);

  const data = runtime.MasterDataStore.load();

  assert.equal(values.get('waitlist_frontend_demo_v1'), 'existing-guest-data');
  assert.ok(values.has('guestops_masterdata_demo_v1'));
  assert.equal(data.active_scope_id, 'scope-demo-default');
  assert.deepEqual(Array.from(Object.keys(data)).sort(), [
    'active_scope_id', 'masterItems', 'menuRecipeLines', 'menus',
    'schema_version', 'updated_at', 'wipRecipeLines', 'wips'
  ].sort());
});

test('Master Barang converts KG to GR and computes the reference price per base unit', () => {
  const { runtime } = createRuntime();
  const item = runtime.MasterDataService.saveItem(validItem({
    nama_barang: 'Milac Gold',
    satuan_dasar: 'GR',
    konversi_satuan: [{ unit: 'KG', factor: 1000 }],
    harga_referensi: '295000',
    satuan_harga: 'KG'
  }));

  assert.equal(item.harga_per_satuan_dasar, 295);
  assert.equal(runtime.MasterDataService.getConversionFactor(item, 'kg'), 1000);
  assert.equal(runtime.MasterDataService.getConversionFactor(item, 'GR'), 1);
});

test('Master Barang converts Liter to ML', () => {
  const { runtime } = createRuntime();
  const item = runtime.MasterDataService.saveItem(validItem({
    nama_barang: 'Freshmilk Liter',
    satuan_dasar: 'ML',
    konversi_satuan: [{ unit: 'LITER', factor: 1000 }],
    harga_referensi: '32000',
    satuan_harga: 'LITER'
  }));

  assert.equal(runtime.MasterDataService.getConversionFactor(item, 'LITER'), 1000);
  assert.equal(item.harga_per_satuan_dasar, 32);
});

test('Duplicate names are rejected without case sensitivity in the same scope', () => {
  const { runtime } = createRuntime();
  runtime.MasterDataService.saveItem(validItem({ nama_barang: 'Simple Sirup' }));

  assert.throws(
    () => runtime.MasterDataService.saveItem(validItem({ nama_barang: 'simple sirup' })),
    /Nama barang sudah terdaftar/
  );
});

test('Invalid conversion factors and unavailable price units are rejected', () => {
  const { runtime } = createRuntime();

  assert.throws(
    () => runtime.MasterDataService.saveItem(validItem({
      konversi_satuan: [{ unit: 'L', factor: 0 }]
    })),
    /Faktor konversi/
  );

  assert.throws(
    () => runtime.MasterDataService.saveItem(validItem({ satuan_harga: 'GALON' })),
    /Satuan harga harus tersedia/
  );
});

test('Base unit must have factor one and units cannot be duplicated', () => {
  const { runtime } = createRuntime();

  assert.throws(
    () => runtime.MasterDataService.saveItem(validItem({
      konversi_satuan: [{ unit: 'ML', factor: 10 }, { unit: 'L', factor: 1000 }]
    })),
    /faktor 1/
  );

  assert.throws(
    () => runtime.MasterDataService.saveItem(validItem({
      konversi_satuan: [{ unit: 'L', factor: 1000 }, { unit: 'l', factor: 1000 }]
    })),
    /tidak boleh duplikat/
  );
});

test('Changing a conversion factor requires confirmation and refreshes linked recipe quantity', () => {
  const { runtime } = createRuntime();
  const item = runtime.MasterDataService.saveItem(validItem({
    nama_barang: 'Susu',
    satuan_dasar: 'ML',
    konversi_satuan: [{ unit: 'L', factor: 1000 }],
    satuan_harga: 'L'
  }));

  const data = runtime.MasterDataStore.load();
  data.wipRecipeLines.push({
    id: 'line-1',
    wip_id: 'wip-1',
    component_type: 'material',
    item_id: item.id,
    qty_input: 2,
    unit_input: 'L',
    qty_base: 2000
  });
  runtime.MasterDataStore.save(data);

  const update = validItem({
    id: item.id,
    nama_barang: 'Susu',
    satuan_dasar: 'ML',
    konversi_satuan: [{ unit: 'L', factor: 1200 }],
    satuan_harga: 'L'
  });

  assert.throws(
    () => runtime.MasterDataService.saveItem(update),
    /membutuhkan konfirmasi/
  );

  const saved = runtime.MasterDataService.saveItem(update, () => true);
  const after = runtime.MasterDataStore.load();

  assert.equal(saved.harga_per_satuan_dasar, 26.666666666666668);
  assert.equal(after.wipRecipeLines[0].qty_base, 2400);
});

test('A conversion unit used by a recipe cannot be removed silently', () => {
  const { runtime } = createRuntime();
  const item = runtime.MasterDataService.saveItem(validItem({
    nama_barang: 'Susu',
    satuan_dasar: 'ML',
    konversi_satuan: [{ unit: 'L', factor: 1000 }],
    satuan_harga: 'L'
  }));

  const data = runtime.MasterDataStore.load();
  data.menuRecipeLines.push({
    id: 'line-menu-1',
    menu_id: 'menu-1',
    component_type: 'material',
    item_id: item.id,
    qty_input: 0.2,
    unit_input: 'L',
    qty_base: 200
  });
  runtime.MasterDataStore.save(data);

  assert.throws(
    () => runtime.MasterDataService.saveItem(validItem({
      id: item.id,
      nama_barang: 'Susu',
      satuan_dasar: 'ML',
      konversi_satuan: [],
      harga_referensi: '32000',
      satuan_harga: 'ML'
    }), () => true),
    /masih digunakan/
  );

  assert.equal(runtime.MasterDataService.findItem(item.id).konversi_satuan.length, 2);
});

test('Deactivation preserves the item record and makes its status inactive', () => {
  const { runtime } = createRuntime();
  const item = runtime.MasterDataService.saveItem(validItem());

  const updated = runtime.MasterDataService.setItemStatus(item.id, 'inactive');

  assert.equal(updated.status, 'inactive');
  assert.equal(runtime.MasterDataService.findItem(item.id).id, item.id);
  assert.equal(runtime.MasterDataService.listItems({ status: 'active' }).length, 0);
  assert.equal(runtime.MasterDataService.listItems({ status: 'inactive' }).length, 1);
});

test('Master Data can be loaded again after a page refresh', () => {
  const values = new Map();
  const first = createRuntime(values);
  first.runtime.MasterDataService.saveItem(validItem({ nama_barang: 'Beans Espresso' }));

  const second = createRuntime(values);
  const items = second.runtime.MasterDataService.listItems({ status: 'all' });

  assert.equal(items.length, 1);
  assert.equal(items[0].nama_barang, 'Beans Espresso');
});
