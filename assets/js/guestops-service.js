(function (root) {
  'use strict';

  let client = null;
  let workspaceId = null;
  let ready = false;
  let writeQueue = Promise.resolve();

  const toIso = value => new Date(Number(value) || Date.now()).toISOString();
  const toMs = value => value ? new Date(value).getTime() : null;

  function requireReady() {
    if (!ready || !client || !workspaceId) {
      throw new Error('Koneksi database belum siap. Muat ulang halaman dan masuk kembali.');
    }
  }

  function mapGuest(row) {
    const history = Array.isArray(row.guest_status_history) ? row.guest_status_history : [];
    return {
      id: row.id,
      ticket: row.ticket,
      day: row.service_date,
      name: row.guest_name,
      pack: row.pack,
      phone: row.phone || '',
      status: row.status,
      created: toMs(row.created_at),
      resolved: toMs(row.resolved_at),
      seatedAt: toMs(row.seated_at),
      reservationId: row.reservation_id || null,
      reservationCode: null,
      reservationTable: null,
      audit: history
        .slice()
        .sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))
        .map(item => ({
          at: toMs(item.changed_at),
          label: item.label,
          detail: item.detail || '',
          reason: item.reason || ''
        }))
    };
  }

  function mapReservation(row) {
    return {
      id: row.id,
      code: row.code,
      date: row.reservation_date,
      time: String(row.reservation_time).slice(0, 5),
      name: row.guest_name,
      pack: row.pack,
      phone: row.phone || '',
      smoking: row.smoking || '',
      note: row.note || '',
      table: row.table_label || '',
      status: row.status,
      created: toMs(row.created_at),
      guestId: null,
      seatedAt: toMs(row.seated_at)
    };
  }

  async function initialize(supabaseClient, selectedWorkspaceId) {
    if (!supabaseClient || !selectedWorkspaceId) {
      throw new Error('Workspace akun tidak ditemukan. Hubungi Developer.');
    }
    client = supabaseClient;
    workspaceId = selectedWorkspaceId;
    ready = true;
    return load();
  }

  async function load() {
    requireReady();
    const [guestResult, reservationResult, settingResult] = await Promise.all([
      client.from('guests')
        .select('*, guest_status_history(*)')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }),
      client.from('reservations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('reservation_date', { ascending: true })
        .order('reservation_time', { ascending: true }),
      client.from('workspace_settings')
        .select('setting_value')
        .eq('workspace_id', workspaceId)
        .eq('setting_key', 'guest_operations')
        .maybeSingle()
    ]);

    if (guestResult.error) throw guestResult.error;
    if (reservationResult.error) throw reservationResult.error;
    if (settingResult.error) throw settingResult.error;

    const guests = (guestResult.data || []).map(mapGuest);
    const reservations = (reservationResult.data || []).map(mapReservation);

    guests.forEach(guest => {
      if (guest.reservationId) {
        const reservation = reservations.find(item => item.id === guest.reservationId);
        if (reservation) {
          guest.reservationCode = reservation.code;
          guest.reservationTable = reservation.table;
          reservation.guestId = guest.id;
        }
      }
    });

    const counters = {};
    guests.forEach(guest => {
      const number = Number(String(guest.ticket).split('-').pop()) || 0;
      counters[guest.day] = Math.max(counters[guest.day] || 0, number);
    });
    const reservationCounters = {};
    reservations.forEach(reservation => {
      const number = Number(String(reservation.code).split('-').pop()) || 0;
      reservationCounters[reservation.date] = Math.max(reservationCounters[reservation.date] || 0, number);
    });

    const settings = settingResult.data?.setting_value || {};
    return {
      guests,
      reservations,
      counters,
      reservationCounters,
      settings: {
        seatingDurationMinutes: Number(settings.seatingDurationMinutes) || 90
      }
    };
  }

  async function nextTicket(day) {
    requireReady();
    const { data, error } = await client.rpc('next_guest_ticket', {
      p_workspace_id: workspaceId,
      p_service_date: day
    });
    if (error) throw error;
    return data;
  }

  async function nextReservationCode(day) {
    requireReady();
    const { data, error } = await client.rpc('next_reservation_code', {
      p_workspace_id: workspaceId,
      p_service_date: day
    });
    if (error) throw error;
    return data;
  }

  function persist(state) {
    requireReady();
    const run = async () => {
      const reservations = (state.reservations || []).map(item => ({
        id: item.id,
        workspace_id: workspaceId,
        code: item.code,
        reservation_date: item.date,
        reservation_time: item.time,
        guest_name: item.name,
        pack: item.pack,
        phone: item.phone || null,
        smoking: item.smoking || null,
        note: item.note || null,
        table_label: item.table || null,
        status: item.status,
        seated_at: item.seatedAt ? toIso(item.seatedAt) : null
      }));
      const guests = (state.guests || []).map(item => ({
        id: item.id,
        workspace_id: workspaceId,
        reservation_id: item.reservationId || null,
        ticket: item.ticket,
        service_date: item.day,
        guest_name: item.name,
        pack: item.pack,
        phone: item.phone || null,
        status: item.status,
        created_at: toIso(item.created),
        seated_at: item.seatedAt ? toIso(item.seatedAt) : null,
        resolved_at: item.resolved ? toIso(item.resolved) : null,
        updated_at: new Date().toISOString()
      }));

      if (reservations.length) {
        const result = await client.from('reservations').upsert(reservations, { onConflict: 'id' });
        if (result.error) throw result.error;
      }
      if (guests.length) {
        const result = await client.from('guests').upsert(guests, { onConflict: 'id' });
        if (result.error) throw result.error;
      }
      const setting = await client.from('workspace_settings').upsert({
        workspace_id: workspaceId,
        setting_key: 'guest_operations',
        setting_value: {
          seatingDurationMinutes: Number(state.settings?.seatingDurationMinutes) || 90
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'workspace_id,setting_key' });
      if (setting.error) throw setting.error;
    };

    writeQueue = writeQueue.then(run);
    return writeQueue;
  }

  async function appendGuestAudit(guestId, entry) {
    requireReady();
    const guest = await client.from('guests').select('workspace_id').eq('id', guestId).single();
    if (guest.error) throw guest.error;
    const { error } = await client.from('guest_status_history').insert({
      workspace_id: workspaceId,
      guest_id: guestId,
      status: 'waiting',
      label: entry.label || 'Dikoreksi',
      detail: entry.detail || null,
      reason: entry.reason || null,
      changed_at: toIso(entry.at)
    });
    if (error) throw error;
  }

  root.GuestOpsService = {
    initialize,
    load,
    persist,
    nextTicket,
    nextReservationCode,
    appendGuestAudit,
    isReady: () => ready,
    workspaceId: () => workspaceId
  };
})(window);
