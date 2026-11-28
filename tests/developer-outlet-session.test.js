'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets/js/auth.js'), 'utf8');
const helpers = source.slice(source.indexOf('  const developerOutletKey ='), source.indexOf('  function setMessage('));
assert.ok(helpers.includes('function savedDeveloperOutlet'), 'developer outlet helpers must exist');

function setup(storage) {
  return vm.runInNewContext(helpers + ';({ savedDeveloperOutlet, rememberDeveloperOutlet, forgetDeveloperOutlet })', {
    window: { sessionStorage: storage }
  });
}

test('developer outlet survives refresh only for the same account and an available outlet', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const selection = setup(storage);
  selection.rememberDeveloperOutlet({ isGlobalDeveloper: true, userId: 'dev-1', workspaceId: 'mannaka' });
  assert.equal(selection.savedDeveloperOutlet('dev-1', [{ id: 'lazy-jennie' }, { id: 'mannaka' }]), 'mannaka');
  assert.equal(selection.savedDeveloperOutlet('dev-2', [{ id: 'mannaka' }]), null);
  assert.equal(selection.savedDeveloperOutlet('dev-1', [{ id: 'lazy-jennie' }]), null);
  selection.forgetDeveloperOutlet('dev-1');
  assert.equal(selection.savedDeveloperOutlet('dev-1', [{ id: 'mannaka' }]), null);
});

test('non-developer selections are never saved', () => {
  const values = new Map();
  const selection = setup({
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  });
  selection.rememberDeveloperOutlet({ isGlobalDeveloper: false, userId: 'admin-1', workspaceId: 'mannaka' });
  assert.equal(values.size, 0);
});

test('blocked browser storage does not interrupt outlet selection', () => {
  const selection = setup({
    getItem() { throw new Error('storage blocked'); },
    setItem() { throw new Error('storage blocked'); },
    removeItem() { throw new Error('storage blocked'); }
  });
  assert.equal(selection.savedDeveloperOutlet('dev-1', [{ id: 'mannaka' }]), null);
  assert.doesNotThrow(() => selection.rememberDeveloperOutlet({ isGlobalDeveloper: true, userId: 'dev-1', workspaceId: 'mannaka' }));
  assert.doesNotThrow(() => selection.forgetDeveloperOutlet('dev-1'));
});
