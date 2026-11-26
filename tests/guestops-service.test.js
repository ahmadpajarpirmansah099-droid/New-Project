'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const servicePath = path.join(__dirname, '..', 'assets/js/guestops-service.js');

function dayKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function guestRow(id, day) {
  return {
    id, ticket: 'WL-001', service_date: day, guest_name: 'Tamu Uji', pack: 2,
    phone: null, smoking: null, status: 'waiting',
    created_at: day + 'T01:00:00+00:00', resolved_at: null, seated_at: null,
    table_label: null, reservation_id: null, updated_at: day + 'T01:00:00+00:00'
  };
}

function createRuntime() {
  const calls = [];
  const rows = { guests: [], reservations: [], workspace_settings: [] };
  let failNextUpsert = false;
  let reservationSeatResponse = null;

  class Query {
    constructor(table) { this.table = table; this.operation = 'select'; this.values = null; this.filters = []; }
    select(columns) { this.operation = 'select'; calls.push({ table: this.table, operation: this.operation, columns }); return this; }
    eq() { return this; }
    in(column, values) { this.filters.push({ column, values }); return this; }
    gte(column, value) { this.filters.push({ column, gte: value }); return this; }
    lte(column, value) { this.filters.push({ column, lte: value }); return this; }
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
      const data = (rows[this.table] || []).filter(row => this.filters.every(filter => {
        if (filter.values) return filter.values.includes(row[filter.column]);
        const value = row[filter.column];
        if (filter.gte !== undefined && !(value >= filter.gte)) return false;
        if (filter.lte !== undefined && !(value <= filter.lte)) return false;
        return true;
      }));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    }
  }

  const client = {
    auth: { async getUser() { return { data: { user: { id: 'user-1' } }, error: null }; } },
    from(table) { return new Query(table); },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      if (name === 'seat_guest_reservation') return { data: reservationSeatResponse, error: null };
      return { data: name === 'next_guest_ticket' ? 'WL-001' : name === 'next_reservation_code' ? 'RSV-001' : null, error: null };
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
    failOnce() { failNextUpsert = true; },
    setReservationSeatResponse(value) { reservationSeatResponse = value; }
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


test('Reservation seating is delegated to the atomic database RPC', async () => {
  const { runtime, client, calls, setReservationSeatResponse } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');
  setReservationSeatResponse({
    created: true,
    guest: {
      id: 'guest-seated-1', workspace_id: 'workspace-1', reservation_id: 'reservation-1',
      ticket: 'WL-009', service_date: '2026-11-19', guest_name: 'Tamu Reservasi',
      pack: 3, phone: '08123456789', smoking: false, status: 'seated',
      created_at: '2026-11-19T10:00:00.123Z', seated_at: '2026-11-19T10:00:00.123Z',
      resolved_at: '2026-11-19T10:00:00.123Z', table_label: 'VIP 2'
    },
    reservation: {
      id: 'reservation-1', workspace_id: 'workspace-1', code: 'RSV-009',
      reservation_date: '2026-11-19', reservation_time: '19:00:00',
      guest_name: 'Tamu Reservasi', pack: 3, phone: '08123456789',
      smoking: 'Non Smoking', note: null, table_label: 'VIP 2',
      status: 'seated', created_at: '2026-11-18T10:00:00.000Z'
    }
  });

  const result = await runtime.GuestOpsService.seatReservation('reservation-1', ' VIP 2 ');

  const call = calls.find(item => item.rpc === 'seat_guest_reservation');
  assert.deepEqual(JSON.parse(JSON.stringify(call.args)), {
    p_reservation_id: 'reservation-1',
    p_table_label: 'VIP 2'
  });
  assert.equal(result.created, true);
  assert.equal(result.guest.ticket, 'WL-009');
  assert.equal(result.guest.reservationId, 'reservation-1');
  assert.equal(result.reservation.status, 'seated');
  assert.equal(result.reservation.table, 'VIP 2');
  assert.equal(calls.some(item => ['guests', 'reservations'].includes(item.table) && ['insert', 'upsert'].includes(item.operation)), false);
});

test('Reservation seating returns the existing guest for a safe retry', async () => {
  const { runtime, client, setReservationSeatResponse } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');
  setReservationSeatResponse({
    created: false,
    guest: {
      id: 'guest-seated-1', workspace_id: 'workspace-1', reservation_id: 'reservation-1',
      ticket: 'WL-009', service_date: '2026-11-19', guest_name: 'Tamu Reservasi',
      pack: 3, phone: null, smoking: null, status: 'seated',
      created_at: '2026-11-19T10:00:00.000Z', seated_at: '2026-11-19T10:00:00.000Z',
      resolved_at: '2026-11-19T10:00:00.000Z', table_label: 'Meja 05'
    },
    reservation: {
      id: 'reservation-1', workspace_id: 'workspace-1', code: 'RSV-009',
      reservation_date: '2026-11-19', reservation_time: '19:00:00',
      guest_name: 'Tamu Reservasi', pack: 3, phone: null, smoking: null,
      note: null, table_label: 'Meja 05', status: 'seated',
      created_at: '2026-11-18T10:00:00.000Z'
    }
  });

  const result = await runtime.GuestOpsService.seatReservation('reservation-1', 'Meja 05');
  assert.equal(result.created, false);
  assert.equal(result.guest.ticket, 'WL-009');
  assert.equal(result.reservation.table, 'Meja 05');
});

test('Reservation seating rejects invalid table labels before calling the database', async () => {
  const { runtime, client, calls } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');

  await assert.rejects(runtime.GuestOpsService.seatReservation('reservation-1', ' '.repeat(81)), /Nomor atau nama meja belum sesuai/);
  assert.equal(calls.some(item => item.rpc === 'seat_guest_reservation'), false);
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

test('A queued save writes the status the user acted on, not a later refresh', async () => {
  const { runtime, client, rows } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');

  const state = {
    guests: [{
      id: 'guest-1', ticket: 'WL-001', day: '2026-11-03', name: 'Tamu Uji',
      pack: 2, status: 'waiting', created: 1793700000000
    }],
    reservations: [],
    settings: { seatingDurationMinutes: 90 }
  };
  await runtime.GuestOpsService.persist(state);

  state.guests[0].status = 'seated';
  const saving = runtime.GuestOpsService.persist(state);
  // A 30 s refresh replaces the live state before the queued write actually runs.
  state.guests[0].status = 'waiting';
  await saving;

  const lastGuest = rows.guests[rows.guests.length - 1];
  assert.equal(lastGuest.status, 'seated');
});

test('Guest Operations reports a write in progress until it settles', async () => {
  const { runtime, client, failOnce } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');
  const state = {
    guests: [],
    reservations: [{
      id: 'reservation-1', code: 'RSV-001', date: '2026-11-04', time: '19:00',
      name: 'Tamu', pack: 2, status: 'pending', created: 1793700000000
    }],
    settings: { seatingDurationMinutes: 90 }
  };

  const saving = runtime.GuestOpsService.persist(state);
  assert.equal(runtime.GuestOpsService.isWriting(), true);
  await saving;
  assert.equal(runtime.GuestOpsService.isWriting(), false);

  failOnce();
  state.reservations[0].status = 'cancelled';
  await assert.rejects(runtime.GuestOpsService.persist(state), /temporary database failure/);
  assert.equal(runtime.GuestOpsService.isWriting(), false);
});

test('Guest correction sends the reason through the database RPC', async () => {
  const { runtime, client, calls } = createRuntime();
  await runtime.GuestOpsService.initialize(client, 'workspace-1');

  await runtime.GuestOpsService.correctGuest({
    id: 'guest-1',
    ticket: 'WL-001',
    day: '2026-11-03',
    name: 'Nama Baru',
    pack: 3,
    phone: '08123456789',
    status: 'waiting',
    created: 1793700000000
  }, 'Nama sebelumnya salah input');

  const correction = calls.find(call => call.rpc === 'correct_guest_with_reason');
  assert.deepEqual(JSON.parse(JSON.stringify(correction.args)), {
    p_guest_id: 'guest-1',
    p_guest_name: 'Nama Baru',
    p_pack: 3,
    p_phone: '08123456789',
    p_reason: 'Nama sebelumnya salah input'
  });
  assert.equal(calls.some(call => call.table === 'guest_status_history' && call.operation === 'insert'), false);
});

test('A device holding an old copy cannot overwrite a guest changed elsewhere', async () => {
  const { runtime, client, rows, calls } = createRuntime();
  rows.guests.push(guestRow('guest-1', dayKey(new Date())));

  const state = await runtime.GuestOpsService.initialize(client, 'workspace-1');
  state.guests[0].status = 'seated';
  state.guests[0].tableLabel = 'A1';

  // Another device saved the same guest after this tab loaded it.
  rows.guests[0].guest_name = 'Nama Baru';
  rows.guests[0].updated_at = new Date(Date.now() + 1000).toISOString();

  await assert.rejects(
    runtime.GuestOpsService.persist(state),
    error => error.code === 'stale_write'
  );
  assert.equal(calls.some(call => call.table === 'guests' && call.operation === 'upsert'), false);
});

test('A normal save records its own version so the next save is not blocked', async () => {
  const { runtime, client, rows } = createRuntime();
  rows.guests.push(guestRow('guest-1', dayKey(new Date())));

  const state = await runtime.GuestOpsService.initialize(client, 'workspace-1');
  state.guests[0].status = 'seated';
  state.guests[0].tableLabel = 'A1';
  await runtime.GuestOpsService.persist(state);

  state.guests[0].status = 'done';
  await runtime.GuestOpsService.persist(state);

  const saved = rows.guests.filter(row => row.id === 'guest-1').pop();
  assert.equal(saved.status, 'done');
});

test('Only recent guests load by default and older history stays tracked once fetched', async () => {
  const { runtime, client, rows, calls } = createRuntime();
  const today = new Date();
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 100);
  const oldDay = dayKey(oldDate);

  rows.guests.push(guestRow('guest-today', dayKey(today)), guestRow('guest-old', oldDay));

  const state = await runtime.GuestOpsService.initialize(client, 'workspace-1');
  assert.deepEqual(state.guests.map(guest => guest.id), ['guest-today']);
  assert.equal(runtime.GuestOpsService.covers(dayKey(today), dayKey(today)), true);
  assert.equal(runtime.GuestOpsService.covers(oldDay, oldDay), false);

  const older = await runtime.GuestOpsService.loadRange(oldDay, oldDay);
  assert.deepEqual(older.map(guest => guest.id), ['guest-old']);
  assert.equal(runtime.GuestOpsService.covers(oldDay, oldDay), true);

  // The 30 s refresh only re-reads the window; fetched history must survive it.
  await runtime.GuestOpsService.load({ merge: true });
  assert.equal(runtime.GuestOpsService.covers(oldDay, oldDay), true);
  older[0].name = 'Nama Lama Diubah';
  state.guests.push(older[0]);
  await runtime.GuestOpsService.persist(state);

  const guestUpserts = calls.filter(call => call.table === 'guests' && call.operation === 'upsert');
  assert.deepEqual(guestUpserts.at(-1).values.map(row => row.id), ['guest-old']);
});

test('Guest Operations blocks initialization when auth context points to another workspace', async () => {
  const { runtime, client } = createRuntime();
  await assert.rejects(runtime.GuestOpsService.initialize(client, 'workspace-2'), /Identitas akun dan workspace tidak cocok/);
  assert.equal(runtime.GuestOpsService.isReady(), false);
});
