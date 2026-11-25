'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const menuUi = fs.readFileSync(path.join(rootDir, 'assets/js/menu-ui.js'), 'utf8');
const wipUi = fs.readFileSync(path.join(rootDir, 'assets/js/wip-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'assets/css/style.css'), 'utf8');

test('Menu cards expose open HPP detail popups with selling price and margin', () => {
  assert.match(menuUi, /data-menu-action="show-breakdown"/);
  assert.match(menuUi, /renderHppDetails\(hpp\.details, 1, 0, root\.MenuService\.getLines\(menu\.id\)\)/);
  assert.match(menuUi, /Total HPP per porsi/);
  assert.match(menuUi, /Harga jual/);
  assert.match(menuUi, /Margin kotor/);
});

test('WIP cards expose open ingredient detail popups and HPP per yield', () => {
  assert.match(wipUi, /data-wip-action="show-breakdown"/);
  assert.match(wipUi, /renderHppDetails\(hpp\.details, 1, 0, root\.WipService\.getLines\(wip\.id\)\)/);
  assert.match(wipUi, /Total biaya batch/);
  assert.match(wipUi, /HPP per /);
});

test('menu popup keeps nested WIP ingredients collapsed by default and allows toggling', () => {
  assert.match(menuUi, /data-menu-action="toggle-wip-details"/);
  assert.match(menuUi, /class="recipe-breakdown-nested" hidden/);
  assert.match(menuUi, /nested\.hidden = !nested\.hidden/);
  assert.match(menuUi, /Lihat bahan WIP/);
  assert.match(menuUi, /Tutup bahan WIP/);
});

test('nested WIP ingredients are expanded proportionally to the quantity used', () => {
  assert.match(menuUi, /quantity \/ Number\(child\.hasil_per_batch\)/);
  assert.match(wipUi, /quantity \/ Number\(child\.hasil_per_batch\)/);
  assert.match(menuUi, /renderHppDetails\(childHpp\.details, childScale, depth \+ 1, root\.WipService\.getLines\(child\.id\)\)/);
  assert.match(wipUi, /renderHppDetails\(childHpp\.details, childScale, depth \+ 1, root\.WipService\.getLines\(child\.id\)\)/);
});

test('recipe HPP breakdown styling supports nested rows and dark theme variables', () => {
  assert.match(css, /\.recipe-breakdown-nested/);
  assert.match(css, /\.recipe-breakdown-line/);
  assert.match(css, /\.menu-breakdown\[hidden\], \.wip-breakdown\[hidden\]/);
  assert.match(css, /var\(--ui-surface\)/);
});
