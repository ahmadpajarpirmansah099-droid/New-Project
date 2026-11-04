'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const service = fs.readFileSync(path.join(root, 'assets/js/daily-stock-service.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'assets/js/daily-stock-ui.js'), 'utf8');

test('Daily SO loads its service before its UI and no longer loads the monolithic file', () => {
  const serviceIndex = html.indexOf('assets/js/daily-stock-service.js');
  const uiIndex = html.indexOf('assets/js/daily-stock-ui.js');

  assert.ok(serviceIndex >= 0, 'daily-stock-service.js must be loaded');
  assert.ok(uiIndex > serviceIndex, 'daily-stock-ui.js must load after the service');
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


test('Daily SO production, sales, purchase, and supplies use separate pages', () => {
  for (const pageId of ['dailyProductionRoot', 'dailySaleRoot', 'dailyPurchaseRoot', 'dailySuppliesRoot']) {
    assert.ok(ui.includes(pageId), pageId + ' must have its own page container');
  }
  assert.match(ui, /function renderTransactionPage\(type\)/);
  assert.match(ui, /id="dsStandaloneTransactionForm"/);
  assert.match(ui, /data-ds-transaction-date/);
});

test('Daily SO standalone pages use custom pickers instead of native dropdowns', () => {
  assert.match(ui, /data-ds-search-picker/);
  assert.match(ui, /dsTransactionUnitPicker/);
  assert.match(ui, /ds-direction-picker/);
  assert.doesNotMatch(ui, /function renderForm\(type\)/);
});

test('Daily SO transaction history uses workspace and division scoped service queries', () => {
  assert.match(service, /async function fetchTransactionHistory\(date, transactionTypes\)/);
  assert.match(service, /\.in\('transaction_type', types\)/);
  assert.match(ui, /fetchTransactionHistory\(state\.expenseDate/);
});
