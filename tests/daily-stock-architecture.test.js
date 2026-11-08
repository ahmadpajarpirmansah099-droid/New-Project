'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Daily SO is removed from app navigation and startup', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  const startup = read('assets/js/app-startup.js');
  assert.doesNotMatch(html, /data-page="daily-stock"|Daily SO/i);
  assert.doesNotMatch(app, /daily-stock|DailyStockUI|DailyStockService/i);
  assert.doesNotMatch(startup, /daily_stock_counts|DailyStockService|daily-stock|Daily SO/i);
});

test('Master Barang, WIP, recipes, and Menu remain integrated', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  const store = read('assets/js/masterdata-store.js');
  for (const id of ['page-master-items', 'page-wips', 'page-menus']) assert.ok(html.includes(id), id);
  for (const script of ['masterdata-store.js', 'masterdata-service.js', 'masterdata-ui.js', 'wip-service.js', 'wip-ui.js', 'menu-service.js', 'menu-ui.js']) assert.ok(html.includes(script), script);
  assert.match(app, /window\.MasterDataUI[\s\S]*?master-items/);
  assert.match(app, /window\.WipUI[\s\S]*?wips/);
  assert.match(app, /window\.MenuUI[\s\S]*?menus/);
  assert.match(store, /masterItems/);
  assert.match(store, /wipRecipeLines/);
  assert.match(store, /menuRecipeLines/);
});

test('All Divisions summary no longer depends on Daily SO tables', () => {
  const startup = read('assets/js/app-startup.js');
  assert.match(startup, /workspace_module_state/);
  assert.doesNotMatch(startup, /daily_stock_counts|stockResult|Daily SO/i);
});
