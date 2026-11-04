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
  assert.doesNotMatch(ui, /dailyQuery\s*\(|\.from\s*\(/);
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
