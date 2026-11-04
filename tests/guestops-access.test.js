'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'assets/js/app.js'), 'utf8');
const match = appSource.match(/function canAccessGuestOperations\(\) \{[\s\S]*?\n\}/);
assert.ok(match, 'canAccessGuestOperations must exist in app.js');
const accessFunction = match[0];

function canAccess(context) {
  const runtime = {
    window: { AppAuth: { getContext: () => context } }
  };
  return vm.runInNewContext(accessFunction + ';canAccessGuestOperations();', runtime);
}

function developer(divisionName, divisionMode = 'single') {
  return {
    isGlobalDeveloper: true,
    divisionMode,
    activeDivisionId: 'active',
    activeDivisionName: divisionName,
    divisions: [{ id: 'active', name: divisionName }]
  };
}

test('Developer can open Guest Operations in Service division', () => {
  assert.equal(canAccess(developer('Service')), true);
});

test('Developer cannot open Guest Operations in all-divisions mode', () => {
  assert.equal(canAccess(developer('Bar', 'all')), false);
});

for (const division of ['Bar', 'Kitchen', 'Pastry']) {
  test('Developer cannot open Guest Operations in ' + division + ' division', () => {
    assert.equal(canAccess(developer(division)), false);
  });
}

test('Service role can open Guest Operations only in Service division', () => {
  const context = {
    isGlobalDeveloper: false,
    workspaceRole: 'service',
    divisionMode: 'single',
    activeDivisionId: 'active',
    divisions: [{ id: 'active', name: 'Service' }]
  };
  assert.equal(canAccess(context), true);
  context.divisions[0].name = 'Bar';
  assert.equal(canAccess(context), false);
});


test('Developer access follows the active division ID, not the first listed division', () => {
  assert.equal(canAccess({
    isGlobalDeveloper: true,
    divisionMode: 'single',
    activeDivisionId: 'service-id',
    activeDivisionName: 'Service',
    divisions: [
      { id: 'bar-id', name: 'Bar' },
      { id: 'service-id', name: 'Service' }
    ]
  }), true);
});

test('Admin role cannot open Guest Operations even in Service division', () => {
  assert.equal(canAccess({
    isGlobalDeveloper: false,
    workspaceRole: 'admin',
    activeDivisionId: 'active',
    divisions: [{ id: 'active', name: 'Service' }]
  }), false);
});
