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
  let failNextBatch = false;

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
    upsert(values, options) {
      calls.push({ table: this.table, operation: 'upsert', values, options });
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
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      if (name === 'save_guest_operations') {
        const working = {
          guests: rows.guests.map(row => ({ ...row })),
          reservations: rows.reservations.map(row => ({ ...row })),
          workspace_settings: rows.workspace_settings.map(row => ({ ...row }))
        };
        const versions = { guests: [], reservations: [] };
        try {
          const apply = (table, entries) => {
            for (const entry of entries) {
              const { expected_updated_at: expected, ...record } = entry;
              const index = working[table].findIndex(row => row.id === record.id);
              if (expected == null) {
                if (index >= 0) throw new Error(`Data ${table === 'guests' ? 'tamu' : 'reservasi'} sudah ada.`);
                const updatedAt = '2026-11-15T07:00:00.000Z';
                working[table].push({ ...record, updated_at: updatedAt });
                versions[table].push({ id: record.id, updated_at: updatedAt });
                continue;
              }
              if (index < 0 || working[table][index].updated_at !== expected) {
                throw new Error(`Data ${table === 'guests' ? 'tamu' : 'reservasi'} sudah berubah di perangkat lain.`);
              }
              const updatedAt = new Date(Date.parse(expected) + 1).toISOString();
              working[table][index] = { ...working[table][index], ...record, updated_at: updatedAt };
              versions[table].push({ id: record.id, updated_at: updatedAt });
            }
          };

          // Mirror the database transaction: settings, reservations and guests commit together.
          apply('reservations', args.p_reservations || []);
          apply('guests', args.p_guests || []);
          if (args.p_settings) {
            const setting = working.workspace_settings.find(row =>
              row.workspace_id === args.p_workspace_id && row.setting_key === 'guest_operations'
            );
            if (setting) setting.setting_value = args.p_settings;
            else working.workspace_settings.push({
              workspace_id: args.p_workspace_id,
              setting_key: 'guest_operations',
              setting_value: args.p_settings
            });
          }
          if (failNextBatch) {
            failNextBatch = false;
            throw new Error('temporary database failure');
          }
          rows.guests.splice(0, rows.guests.length, ...working.guests);
          rows.reservations.splice(0, rows.reservations.length, ...working.reservations);
          rows.workspace_settings.splice(0, rows.workspace_settings.length, ...working.workspace_settings);
          return { data: versions, error: null };
        } catch (error) {
          return { data: null, error };
        }
      }
      if (name === 'correct_guest_record') {
        const updatedAt = '2026-11-03T10:00:00.000Z';
        return {
          data: {
            guest: {
              id: args.p_guest_id,
              workspace_id: 'workspace-1',
              ticket: 'WL-001',
              service_date: '2026-11-03',
              guest_name: args.p_guest_name,
              pack: args.p_pack,
              phone: args.p_phone,
              status: 'waiting',
              created_at: '2026-11-03T09:00:00.000Z',
              updated_at: updatedAt,
              resolved_at: null,
              seated_at: null
            },
            audit: {
              changed_at: updatedAt,
              label: 'Dikoreksi',
              detail: 'Nama dan pack diperbarui',
              reason: args.p_reason
            }
          },
          error: null
        };
      }
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
    failOnce() { failNextBatch = true; }
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

test('Guest Operations loads the exact updated_at value for optimistic corrections', async () => {
  const { runtime, client, calls, rows } = createRuntime();
  const updatedAt = '2026-11-03T09:00:00.123456+00:00';
  rows.guests.push({
    id: 'guest-1',
    ticket: 'WL-001',
    service_date: '2026-11-03',
    guest_name: 'Tamu Awal',
    pack: 2,
    phone: '081111111111',
    status: 'waiting',
    created_at: '2026-11-03T08:00:00.000Z',
    updated_at: updatedAt,
    resolved_at: null,
    seated_at: null,
    reservation_id: null
  });

  const state = await runtime.GuestOpsService.initialize(client, 'workspace-1');
  assert.equal(state.guests[0].updatedAt, updatedAt);

  await runtime.GuestOpsService.correctGuestRecord('guest-1', {
    name: 'Tamu Koreksi',
    pack: 3,
    phone: '082222222222',
    reason: 'Salah input',
    expectedUpdatedAt: state.guests[0].updatedAt
  });

  const correction = calls.find(call => call.rpc === 'correct_guest_record');
  assert.equal(correction.args.p_expected_updated_at, updatedAt);
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

test('Guest Operations persists guests and reservations in one RPC transaction', async () => {
  const { runtime, client, calls, rows } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');

  await runtime.GuestOpsService.persist({
    guests: [{ id: 'guest-1', ticket: 'WL-001', day: '2026-11-03', name: 'Tamu Uji', pack: 2, status: 'waiting', created: 1793700000000 }],
    reservations: [{ id: 'reservation-1', code: 'RSV-001', date: '2026-11-04', time: '19:00', name: 'Tamu Reservasi', pack: 3, status: 'pending', created: 1793700000000 }],
    settings: { seatingDurationMinutes: 90 }
  });

  assert.equal(rows.guests.length, 1);
  assert.equal(rows.reservations.length, 1);
  const save = calls.find(call => call.rpc === 'save_guest_operations');
  assert.equal(save.args.p_guests.length, 1);
  assert.equal(save.args.p_reservations.length, 1);
  assert.equal(save.args.p_guests[0].expected_updated_at, null);
  assert.equal(save.args.p_reservations[0].expected_updated_at, null);
  assert.equal(save.args.p_settings.seatingDurationMinutes, 90);
  assert.ok(rows.guests[0].updated_at);
  assert.ok(rows.reservations[0].updated_at);
  assert.equal(rows.workspace_settings.length, 1);
  assert.equal(calls.filter(call => call.table === 'workspace_settings' && call.operation === 'upsert').length, 0);
});

test('Guest Operations saves settings-only changes through the atomic RPC', async () => {
  const { runtime, client, calls, rows } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');

  const state = {
    guests: [],
    reservations: [],
    settings: { seatingDurationMinutes: 90 }
  };
  await runtime.GuestOpsService.persist(state);
  state.settings.seatingDurationMinutes = 120;
  await runtime.GuestOpsService.persist(state);

  const saves = calls.filter(call => call.rpc === 'save_guest_operations');
  assert.equal(saves.length, 2);
  for (const save of saves) {
    assert.equal(save.args.p_guests.length, 0);
    assert.equal(save.args.p_reservations.length, 0);
  }
  assert.equal(saves[0].args.p_settings.seatingDurationMinutes, 90);
  assert.equal(saves[1].args.p_settings.seatingDurationMinutes, 120);
  assert.equal(rows.workspace_settings.length, 1);
  assert.equal(rows.workspace_settings[0].setting_value.seatingDurationMinutes, 120);
  assert.equal(calls.filter(call => call.table === 'workspace_settings' && call.operation === 'upsert').length, 0);
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
  assert.equal(rows.reservations.length, 0);
  assert.equal(rows.workspace_settings.length, 0);
  await runtime.GuestOpsService.persist(state);
  assert.equal(rows.reservations.length, 1);
  assert.equal(rows.workspace_settings.length, 1);
});

test('Guest Operations writes only changed rows with their last-seen versions', async () => {
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

  const saves = calls.filter(call => call.rpc === 'save_guest_operations');
  assert.equal(saves.length, 2);
  assert.equal(saves[0].args.p_guests.length, 1);
  assert.equal(saves[0].args.p_reservations.length, 1);
  assert.equal(saves[0].args.p_settings.seatingDurationMinutes, 90);
  assert.ok(saves[1].args.p_guests[0].expected_updated_at);
  assert.equal(saves[1].args.p_reservations.length, 0);
  assert.equal(saves[1].args.p_settings, null);
  assert.equal(calls.filter(call => call.table === 'guests' && call.operation === 'upsert').length, 0);
  assert.equal(calls.filter(call => call.table === 'reservations' && call.operation === 'upsert').length, 0);
  assert.equal(calls.filter(call => call.table === 'workspace_settings' && call.operation === 'upsert').length, 0);
});

test('Guest Operations batch rejects a stale guest without partially saving the reservation', async () => {
  const { runtime, client, calls, rows } = createRuntime();
  const guestVersion = '2026-11-03T09:00:00.123456+00:00';
  const reservationVersion = '2026-11-03T08:00:00.000Z';
  rows.guests.push({
    id: 'guest-1', workspace_id: 'workspace-1', ticket: 'WL-001',
    service_date: '2026-11-03', guest_name: 'Tamu', pack: 2, phone: '081111111111',
    status: 'waiting', created_at: '2026-11-03T07:00:00.123456+00:00',
    updated_at: guestVersion, resolved_at: null, seated_at: null, reservation_id: null
  });
  rows.reservations.push({
    id: 'reservation-1', workspace_id: 'workspace-1', code: 'RSV-001',
    reservation_date: '2026-11-03', reservation_time: '19:00:00', guest_name: 'Tamu',
    pack: 2, phone: null, smoking: null, note: null, table_label: null, status: 'pending',
    created_at: '2026-11-03T07:00:00.654321+00:00', updated_at: reservationVersion
  });

  const state = await runtime.GuestOpsService.initialize(client, 'workspace-1');
  assert.equal(state.guests[0].updatedAt, guestVersion);
  assert.equal(state.reservations[0].updatedAt, reservationVersion);
  // Simulate another device saving the guest after this device loaded both rows.
  rows.guests[0].phone = '089999999999';
  rows.guests[0].updated_at = '2026-11-03T10:00:00.000Z';
  state.guests[0].status = 'called';
  state.reservations[0].table = 'VIP 1';

  await assert.rejects(runtime.GuestOpsService.persist(state), /Data tamu sudah berubah/);
  const attemptedSave = calls.find(call => call.rpc === 'save_guest_operations');
  assert.equal(attemptedSave.args.p_guests[0].expected_updated_at, guestVersion);
  assert.equal(attemptedSave.args.p_reservations[0].expected_updated_at, reservationVersion);
  assert.equal(attemptedSave.args.p_guests[0].created_at, '2026-11-03T07:00:00.123456+00:00');
  assert.equal(attemptedSave.args.p_reservations[0].created_at, '2026-11-03T07:00:00.654321+00:00');
  assert.equal(rows.guests[0].phone, '089999999999');
  assert.equal(rows.guests[0].status, 'waiting');
  assert.equal(rows.reservations[0].table_label, null);
  assert.equal(rows.reservations[0].updated_at, reservationVersion);
});

test('Guest correction uses one atomic RPC and keeps server-generated audit data', async () => {
  const { runtime, client, calls } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');

  const result = await runtime.GuestOpsService.correctGuestRecord('guest-1', {
    name: 'Tamu Baru',
    pack: 3,
    phone: '08123456789',
    reason: 'Salah input',
    expectedUpdatedAt: '2026-11-03T09:00:00.000Z'
  });

  const call = calls.find(item => item.rpc === 'correct_guest_record');
  assert.ok(call);
  assert.equal(call.args.p_guest_name, 'Tamu Baru');
  assert.equal(call.args.p_pack, 3);
  assert.equal(call.args.p_phone, '08123456789');
  assert.equal(call.args.p_reason, 'Salah input');
  assert.equal(call.args.p_expected_updated_at, '2026-11-03T09:00:00.000Z');
  assert.equal(result.guest.name, 'Tamu Baru');
  assert.equal(result.audit.label, 'Dikoreksi');
  assert.equal(result.audit.reason, 'Salah input');
  assert.equal(calls.some(item => item.table === 'guest_status_history' && item.operation === 'insert'), false);
});

test('Guest Operations blocks initialization when auth context points to another workspace', async () => {
  const { runtime, client } = createRuntime();
  await assert.rejects(runtime.GuestOpsService.initialize(client, 'workspace-2'), /Identitas akun dan workspace tidak cocok/);
  assert.equal(runtime.GuestOpsService.isReady(), false);
});
