'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const servicePath = path.join(__dirname, '..', 'assets/js/guestops-service.js');

function createRuntime() {
  const calls = [];
  const rows = { guests: [], reservations: [], workspace_settings: [] };
  let failNextUpsert = false;

  class Query {
    constructor(table) { this.table = table; this.operation = 'select'; this.values = null; }
    select(columns) { this.operation = 'select'; calls.push({ table: this.table, operation: this.operation, columns }); return this; }
    eq() { return this; }
    order() { return this; }
    maybeSingle() {
      const data = this.table === 'workspace_memberships' ? { workspace_id: 'workspace-1' } : null;
      return Promise.resolve({ data, error: null });
    }
    single() {
      return Promise.resolve({ data: { workspace_id: 'workspace-1' }, error: null });
    }
    insert(values) {
      this.operation = 'insert';
      this.values = values;
      calls.push({ table: this.table, operation: this.operation, values });
      return Promise.resolve({ error: null });
    }
    upsert(values, options) {
      calls.push({ table: this.table, operation: 'upsert', values, options });
      if (failNextUpsert) {
        failNextUpsert = false;
        return Promise.resolve({ error: new Error('temporary database failure') });
      }
      rows[this.table].push(...(Array.isArray(values) ? values : [values]));
      return Promise.resolve({ error: null });
    }
    then(resolve, reject) {
      const data = rows[this.table] || [];
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    }
  }

  const client = {
    auth: { async getUser() { return { data: { user: { id: 'user-1' } }, error: null }; } },
    from(table) { return new Query(table); },
    async rpc(name) {
      calls.push({ rpc: name });
      return { data: name === 'next_guest_ticket' ? 'WL-001' : 'RSV-001', error: null };
    }
  };

  const runtime = { console, Date, Math, Promise, Error, Array, Number, String, JSON };
  runtime.window = runtime;
  runtime.AppAuth = { getContext() { return { userId: 'user-1', workspaceId: 'workspace-1', role: 'developer' }; } };
  vm.createContext(runtime);
  vm.runInContext(fs.readFileSync(servicePath, 'utf8'), runtime, { filename: 'guestops-service.js' });

  return {
    runtime,
    client,
    calls,
    rows,
    failOnce() { failNextUpsert = true; }
  };
}

test('Guest Operations initializes from an empty Supabase workspace', async () => {
  const { runtime, client, calls } = createRuntime();
  const state = await runtime.GuestOpsService.initialize(client, 'workspace-1');

  assert.equal(runtime.GuestOpsService.isReady(), true);
  assert.equal(runtime.GuestOpsService.workspaceId(), 'workspace-1');
  assert.deepEqual(Array.from(state.guests), []);
  assert.deepEqual(Array.from(state.reservations), []);
  assert.equal(state.settings.seatingDurationMinutes, 90);

  const reservationSelect = calls.find(call => call.table === 'reservations' && call.operation === 'select');
  assert.equal(reservationSelect.columns.includes('seated_at'), false);
});

test('Guest audit history is fetched only when a guest detail is requested', async () => {
  const { runtime, client, calls } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');

  const guestSelect = calls.find(call => call.table === 'guests' && call.operation === 'select');
  assert.equal(guestSelect.columns.includes('guest_status_history'), false);

  const audit = await runtime.GuestOpsService.loadGuestAudit('guest-1');
  assert.deepEqual(Array.from(audit), []);
  assert.equal(calls.some(call => call.table === 'guest_status_history' && call.operation === 'select'), true);
});

test('Ticket and reservation numbers are requested from database RPCs', async () => {
  const { runtime, client, calls } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');

  assert.equal(await runtime.GuestOpsService.nextTicket('2026-11-03'), 'WL-001');
  assert.equal(await runtime.GuestOpsService.nextReservationCode('2026-11-03'), 'RSV-001');
  assert.deepEqual(calls.filter(call => call.rpc).map(call => call.rpc), [
    'next_guest_ticket', 'next_reservation_code'
  ]);
});

test('Guest Operations persists guest, reservation, and workspace settings', async () => {
  const { runtime, client, calls, rows } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');

  await runtime.GuestOpsService.persist({
    guests: [{ id: 'guest-1', ticket: 'WL-001', day: '2026-11-03', name: 'Tamu Uji', pack: 2, status: 'waiting', created: 1793700000000 }],
    reservations: [{ id: 'reservation-1', code: 'RSV-001', date: '2026-11-04', time: '19:00', name: 'Tamu Reservasi', pack: 3, status: 'pending', created: 1793700000000 }],
    settings: { seatingDurationMinutes: 90 }
  });

  assert.equal(rows.guests.length, 1);
  assert.equal(rows.reservations.length, 1);
  assert.equal(calls.filter(call => call.table === 'workspace_settings' && call.operation === 'upsert').length, 1);
});

test('Guest Operations write queue recovers after a failed database write', async () => {
  const { runtime, client, failOnce, rows } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');
  const state = {
    guests: [],
    reservations: [{ id: 'reservation-1', code: 'RSV-001', date: '2026-11-04', time: '19:00', name: 'Tamu', pack: 2, status: 'pending', created: 1793700000000 }],
    settings: { seatingDurationMinutes: 90 }
  };

  failOnce();
  await assert.rejects(runtime.GuestOpsService.persist(state), /temporary database failure/);
  await runtime.GuestOpsService.persist(state);
  assert.equal(rows.reservations.length, 1);
});

test('Guest Operations writes only records that changed after the first save', async () => {
  const { runtime, client, calls } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');

  const state = {
    guests: [{
      id: 'guest-1',
      ticket: 'WL-001',
      day: '2026-11-03',
      name: 'Tamu Uji',
      pack: 2,
      status: 'waiting',
      created: 1793700000000
    }],
    reservations: [{
      id: 'reservation-1',
      code: 'RSV-001',
      date: '2026-11-04',
      time: '19:00',
      name: 'Tamu Reservasi',
      pack: 3,
      status: 'pending',
      created: 1793700000000
    }],
    settings: { seatingDurationMinutes: 90 }
  };

  await runtime.GuestOpsService.persist(state);
  state.guests[0].status = 'called';
  await runtime.GuestOpsService.persist(state);
  await runtime.GuestOpsService.persist(state);

  assert.equal(calls.filter(call => call.table === 'guests' && call.operation === 'upsert').length, 2);
  assert.equal(calls.filter(call => call.table === 'reservations' && call.operation === 'upsert').length, 1);
  assert.equal(calls.filter(call => call.table === 'workspace_settings' && call.operation === 'upsert').length, 1);
});

test('Guest status correction audit is appended to the history table', async () => {
  const { runtime, client, calls } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');

  await runtime.GuestOpsService.appendGuestAudit('guest-1', {
    at: 1793700000000,
    label: 'Dikoreksi',
    detail: 'Nama diperbarui',
    reason: 'Salah input',
    status: 'waiting'
  });

  assert.equal(calls.some(call => call.table === 'guest_status_history' && call.operation === 'insert'), true);
});

test('Guest Operations blocks initialization when auth context points to another workspace', async () => {
  const { runtime, client } = createRuntime();
  await assert.rejects(runtime.GuestOpsService.initialize(client, 'workspace-2'), /Identitas akun dan workspace tidak cocok/);
  assert.equal(runtime.GuestOpsService.isReady(), false);
});
