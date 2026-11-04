'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const storePath = path.join(rootDir, 'assets/js/masterdata-store.js');
const dailyServicePath = path.join(rootDir, 'assets/js/daily-stock-service.js');
const dailyUiPath = path.join(rootDir, 'assets/js/daily-stock-ui.js');

function createStoreRuntime(options = {}) {
  const calls = [];
  let resolveModuleState;
  const moduleStatePromise = options.deferModuleState
    ? new Promise((resolve) => { resolveModuleState = resolve; })
    : Promise.resolve({ data: null, error: null });
  let context = { userId: 'user-1', workspaceId: 'workspace-1', activeDivisionId: 'division-1' };

  class Query {
    constructor(table) { this.table = table; }
    select() { return this; }
    eq() { return this; }
    abortSignal(signal) { this.signal = signal; return this; }
    maybeSingle() {
      if (this.table === 'workspace_memberships') return Promise.resolve({ data: { workspace_id: 'workspace-1' }, error: null });
      return moduleStatePromise;
    }
    upsert(values) { calls.push({ table: this.table, operation: 'upsert', values }); return this; }
    then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); }
  }

  const client = {
    auth: { async getUser() { return { data: { user: { id: 'user-1' } }, error: null }; } },
    from(table) { return new Query(table); }
  };
  const runtime = { document: {}, AbortController, console, Date, Math, Promise, Error, Array, Number, String, Object, JSON, Set };
  runtime.window = runtime;
  runtime.AppAuth = { getClient: () => client, getContext: () => context };
  vm.createContext(runtime);
  vm.runInContext(fs.readFileSync(storePath, 'utf8'), runtime, { filename: 'masterdata-store.js' });
  return { runtime, client, calls, setContext(value) { context = value; }, resolveModuleState };
}

function createDailyRuntime(options = {}) {
  const listeners = {};
  const authContext = { userId: 'user-1', workspaceId: 'workspace-1', activeDivisionId: 'division-1', divisions: [{ id: 'division-1', name: 'BAR' }] };
  const client = { from() { throw new Error('Database should not be reached by initialize test'); } };
  const runtime = {
    AbortController, console, Date, Math, Promise, Error, Array, Number, String, Object, Intl,
    document: { readyState: 'loading', addEventListener() {}, querySelector() { return null; } },
    addEventListener(name, callback) { listeners[name] = callback; },
    AppAuth: { getClient: () => client, getContext: () => authContext },
    MasterDataStore: {
      isReady: () => true,
      load: () => ({ masterItems: [], wips: [], menus: [], wipRecipeLines: [], menuRecipeLines: [] }),
      assertSession: options.assertSession || (async () => ({ userId: 'user-1', workspaceId: 'workspace-1', divisionId: 'division-1' }))
    }
  };
  runtime.window = runtime;
  vm.createContext(runtime);
  vm.runInContext(fs.readFileSync(dailyServicePath, 'utf8'), runtime, { filename: 'daily-stock-service.js' });
  vm.runInContext(fs.readFileSync(dailyUiPath, 'utf8'), runtime, { filename: 'daily-stock-ui.js' });
  return { runtime, fireSignedOut() { listeners['app:auth-signed-out']?.(); } };
}

test('Master Data rejects an authenticated user when workspace context differs', async () => {
  const env = createStoreRuntime();
  env.setContext({ userId: 'user-1', workspaceId: 'workspace-2', activeDivisionId: 'division-1' });
  await assert.rejects(env.runtime.MasterDataStore.initialize(env.client, 'workspace-1', 'division-1'), /Identitas akun, workspace, atau divisi tidak cocok/);
  assert.equal(env.runtime.MasterDataStore.isReady(), false);
});

test('Master Data does not publish a late workspace load after logout/reset', async () => {
  const env = createStoreRuntime({ deferModuleState: true });
  const initializing = env.runtime.MasterDataStore.initialize(env.client, 'workspace-1', 'division-1');
  await new Promise((resolve) => setImmediate(resolve));
  env.runtime.MasterDataStore.reset();
  env.resolveModuleState({ data: { payload: { schema_version: 1, masterItems: [{ id: 'old-workspace-item' }] } }, error: null });
  await assert.rejects(initializing, /Sesi workspace berubah/);
  assert.equal(env.runtime.MasterDataStore.isReady(), false);
  assert.deepEqual(Array.from(env.runtime.MasterDataStore.load().masterItems), []);
});

test('Master Data queued writes are cancelled when the account session resets', async () => {
  const env = createStoreRuntime();
  await env.runtime.MasterDataStore.initialize(env.client, 'workspace-1', 'division-1');
  env.runtime.MasterDataStore.save({
    schema_version: 1, active_scope_id: 'scope-1', masterItems: [{ id: 'item-1' }],
    wips: [], wipRecipeLines: [], menus: [], menuRecipeLines: []
  });
  const pendingWrite = env.runtime.MasterDataStore.flush();
  env.runtime.MasterDataStore.reset();
  await pendingWrite;
  assert.equal(env.calls.some((call) => call.operation === 'upsert'), false);
});

test('Daily SO refuses initialization when the verified workspace session is rejected', async () => {
  const env = createDailyRuntime({ assertSession: async () => { throw new Error('Identitas akun dan workspace tidak cocok.'); } });
  await assert.rejects(env.runtime.DailyStockUI.initialize(), /Identitas akun dan workspace tidak cocok/);
});

test('Daily SO cancels initialization when logout occurs during session verification', async () => {
  let resolveSession;
  const env = createDailyRuntime({ assertSession: () => new Promise((resolve) => { resolveSession = resolve; }) });
  const initializing = env.runtime.DailyStockUI.initialize();
  env.fireSignedOut();
  resolveSession({ userId: 'user-1', workspaceId: 'workspace-1', divisionId: 'division-1' });
  await assert.rejects(initializing, /Sesi workspace berubah/);
});
