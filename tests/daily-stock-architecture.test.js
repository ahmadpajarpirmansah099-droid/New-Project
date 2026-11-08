'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const service = fs.readFileSync(path.join(root, 'assets/js/daily-stock-service.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'assets/js/daily-stock-ui.js'), 'utf8');

const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');

test('Daily SO assets load on demand in dependency order', () => {
  assert.doesNotMatch(html, /<link[^>]+daily-stock\.css/i);
  assert.doesNotMatch(html, /<script[^>]+daily-stock-(?:service|ui)\.js/i);
  assert.match(app, /function loadDailyStockFeature\(/);
  assert.match(app, /loadStyle[\s\S]*?daily-stock-service\.js[\s\S]*?daily-stock-ui\.js/);
  assert.match(app, /page === 'daily-stock'[\s\S]*?loadDailyStockFeature\([\s\S]*?\.then\(\(\) => go\(page\)\)/);
  assert.doesNotMatch(html, /assets\/js\/daily-stock\.js(?:\?|["'])/);
});

test('Daily SO UI delegates database reads and writes to the service module', () => {
  assert.match(service, /root\.DailyStockService\s*=/);
  assert.match(service, /async function fetchExpenseHistory\(/);
  assert.match(service, /async function switchDivision\(/);
  assert.equal(ui.includes('dailyQuery('), false);
  assert.equal(ui.includes('client.from('), false);
  assert.equal(ui.includes('supabase.from('), false);
  assert.doesNotMatch(ui, /sessionGeneration|dataLoadGeneration|sessionAbortController/);
});

test('Daily SO UI passes physical count input values into the service', () => {
  assert.match(ui, /function readPhysicalCountInputs\(/);
  assert.match(ui, /savePhysicalCounts\(readPhysicalCountInputs\(\)\)/);
  assert.match(ui, /closeCount\(readPhysicalCountInputs\(\)\)/);
});

test('Daily SO keeps its authentication reset in the service lifecycle', () => {
  assert.match(service, /app:auth-signed-out/);
  assert.match(ui, /root\.DailyStockUI\s*=/);
});


test('Daily SO production, sales, and purchase use separate pages', () => {
  for (const pageId of ['dailyProductionRoot', 'dailySaleRoot', 'dailyPurchaseRoot']) {
    assert.ok(ui.includes(pageId), pageId + ' must have its own page container');
  }
  assert.doesNotMatch(ui, /dailySuppliesRoot|stock-supplies/);
  assert.match(ui, /function renderTransactionPage\(type\)/);
  assert.match(ui, /id="dsStandaloneTransactionForm"/);
  assert.match(ui, /data-ds-transaction-date/);
});

test('Daily SO keeps Supplies in stock counts and legacy transaction history', () => {
  assert.match(ui, /counts\.supply/);
  assert.match(ui, /supply_purchase:\s*'Supplies Masuk'/);
  assert.match(ui, /supply_usage:\s*'Supplies Keluar'/);
  assert.match(ui, /rowLabel\(kind\).*kind === 'supply'.*Supplies/);
});

test('Daily SO standalone pages use custom pickers instead of native dropdowns', () => {
  assert.match(ui, /data-ds-search-picker/);
  assert.match(ui, /dsTransactionUnitPicker/);
  assert.doesNotMatch(ui, /ds-direction-picker/);
  assert.doesNotMatch(ui, /function renderForm\(type\)/);
});

test('Daily SO transaction history uses workspace and division scoped service queries', () => {
  assert.match(service, /async function fetchTransactionHistory\(date, transactionTypes\)/);
  assert.match(service, /\.in\('transaction_type', types\)/);
  assert.match(ui, /fetchTransactionHistory\(state\.expenseDate/);
});


test('Daily SO sales and WIP production are available in every division', () => {
  assert.ok(service.includes('function canUseSales() { return true; }'));
  assert.equal(ui.includes('Fitur ini tidak tersedia untuk divisi Service.'), false);
  assert.ok(ui.includes("if (action === 'stock-production') { await goToTransactionPage('production'); return; }"));
  assert.ok(ui.includes("if (action === 'stock-sale') { await goToTransactionPage('sale'); return; }"));
  assert.equal(ui.includes("divisionIsService() && ['stock-sale','stock-production']"), false);
});


test('Production WIP uses a prefilled list of active WIPs for batch entry', () => {
  assert.ok(ui.includes("wips.map((wip, index) => productionRowMarkup(wip, index))"));
  assert.match(ui, /data-production-quantity/);
  assert.ok(ui.includes("values.items = Array.from(form.querySelectorAll"));
  assert.doesNotMatch(ui, /data-production-action="add"/);
  assert.doesNotMatch(ui, /Cari nama WIP/);
});


test('Sales uses a prefilled list of active menus for multi-menu entry', () => {
  assert.ok(ui.includes("menus.map((menu, index) => salesRowMarkup(menu, index))"));
  assert.ok(ui.includes("if (type === 'sale') wireSalesBatch(target, form);"));
  assert.ok(ui.includes("values.items = Array.from(form.querySelectorAll('[data-sales-row]'))"));
  assert.ok(service.includes("const entries = Array.isArray(form.items) && form.items.length"));
  assert.doesNotMatch(ui, /Cari nama menu/);
});
