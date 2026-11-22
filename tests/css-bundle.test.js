'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('app styles ship as a single stylesheet', () => {
  const links = [...read('index.html').matchAll(/<link rel="stylesheet" href="assets\/css\/([^"?]+)/g)].map((match) => match[1]);
  assert.deepEqual(links, ['visual-tokens.css', 'style.css']);

  const css = read('assets/css/style.css');
  const sections = ['style.css', 'auth.css', 'app-overrides.css', 'masterdata.css', 'wip.css', 'menu.css',
    'masterdata-export.css', 'desktop.css', 'user-monitoring.css', 'visual-polish.css', 'stock-opname.css', 'desktop-theme.css'];
  for (const file of sections) {
    assert.ok(css.includes(`/* ---------- ${file} ---------- */`), `${file} section missing from style.css`);
    if (file !== 'style.css') assert.ok(!fs.existsSync(path.join(root, 'assets/css', file)), `${file} should live inside style.css only`);
  }
});

test('shared and lazy-loaded styles stay separate files', () => {
  assert.match(read('assets/js/app.js'), /assets\/css\/user-guide\.css/, 'app.js loads the guide stylesheet on demand');
  assert.ok(fs.existsSync(path.join(root, 'assets/css/user-guide.css')));
  assert.match(read('assets/user-guide-guest-operational.html'), /css\/visual-tokens\.css/, 'the embedded guide reuses shared tokens');
  assert.ok(fs.existsSync(path.join(root, 'assets/css/visual-tokens.css')));
});


test('Stock Opname overview and transaction forms are not hidden by legacy table-only styling', () => {
  const css = read('assets/css/style.css');
  assert.doesNotMatch(css, /so-table-only/);
});

test('wide desktop dashboard queue is capped and scrolls internally', () => {
  const css = read('assets/css/style.css');
  const rule = css.slice(css.lastIndexOf('/* DESKTOP — cap active queue height'));
  assert.match(rule, /@media \(min-width: 1150px\)/);
  assert.match(rule, /#page-dashboard > #dashboardList\s*\{[^}]*height: 324px/s);
  assert.match(rule, /#page-dashboard > #dashboardList\s*\{[^}]*max-height: 324px/s);
  assert.match(rule, /#page-dashboard > #dashboardList\s*\{[^}]*overflow-y: auto/s);
});

