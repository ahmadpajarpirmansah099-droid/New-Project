(function (root) {
  'use strict';

  let client = null;
  let workspaceId = null;
  let ready = false;
  let writeQueue = Promise.resolve();
  let serviceGeneration = 0;
  let persistedGuestRows = new Map();
  let persistedReservationRows = new Map();
  let persistedSettingsFingerprint = null;

  const toIso = value => new Date(Number(value) || Date.now()).toISOString();
  const toMs = value => value ? new Date(value).getTime() : null;

  function requireReady() {
    if (!ready || !client || !workspaceId) {
      throw new Error('Koneksi database belum siap. Muat ulang halaman dan masuk kembali.');
    }
  }

  function mapGuest(row) {
    return {
      id: row.id,
      ticket: row.ticket,
      day: row.service_date,
      name: row.guest_name,
      pack: row.pack,
      phone: row.phone || '',
      smoking: typeof row.smoking === 'boolean' ? row.smoking : null,
      status: row.status,
      created: toMs(row.created_at),
      resolved: toMs(row.resolved_at),
      seatedAt: toMs(row.seated_at),
      tableLabel: row.table_label || '',
      reservationId: row.reservation_id || null,
      reservationCode: null,
      reservationTable: null,
      audit: []
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

  function guestRecord(item) {
    return {
      id: item.id,
      workspace_id: workspaceId,
      reservation_id: item.reservationId || null,
      ticket: item.ticket,
      service_date: item.day,
      guest_name: item.name,
      pack: item.pack,
      phone: item.phone || null,
      smoking: typeof item.smoking === 'boolean' ? item.smoking : null,
      status: item.status,
      created_at: toIso(item.created),
      seated_at: item.seatedAt ? toIso(item.seatedAt) : null,
      table_label: item.tableLabel || null,
      resolved_at: item.resolved ? toIso(item.resolved) : null
    };
  }

  function reservationRecord(item) {
    return {
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
      status: item.status
    };
  }

  function recordFingerprint(record) {
    return JSON.stringify(Object.keys(record).filter(key => key !== 'workspace_id').map(key => record[key]));
  }

  async function assertWorkspaceSession(expectedGeneration = serviceGeneration) {
    if (!client || !workspaceId || expectedGeneration !== serviceGeneration) throw new Error('Sesi workspace berubah. Operasi dibatalkan.');
    const currentClient = client;
    const currentWorkspaceId = workspaceId;
    const { data: authData, error: authError } = await currentClient.auth.getUser();
    if (expectedGeneration !== serviceGeneration || currentClient !== client || currentWorkspaceId !== workspaceId) throw new Error('Sesi workspace berubah. Operasi dibatalkan.');
    if (authError || !authData?.user?.id) throw new Error('Sesi akun tidak valid. Silakan masuk kembali.');
    const context = root.AppAuth?.getContext?.();
    if (!context || context.userId !== authData.user.id || context.workspaceId !== currentWorkspaceId) throw new Error('Identitas akun dan workspace tidak cocok. Operasi diblokir.');
    if (context.role !== 'developer') {
      const { data: membership, error: membershipError } = await currentClient.from('workspace_memberships')
        .select('workspace_id').eq('user_id', authData.user.id).eq('workspace_id', currentWorkspaceId).maybeSingle();
      if (expectedGeneration !== serviceGeneration || currentClient !== client || currentWorkspaceId !== workspaceId) throw new Error('Sesi workspace berubah. Operasi dibatalkan.');
      if (membershipError || !membership) throw new Error('Akses ditolak: akun bukan anggota workspace aktif.');
    }
    return { workspaceId: currentWorkspaceId, generation: expectedGeneration };
  }

  async function initialize(supabaseClient, selectedWorkspaceId) {
    if (!supabaseClient || !selectedWorkspaceId) {
      throw new Error('Workspace akun tidak ditemukan. Hubungi Developer.');
    }
    serviceGeneration += 1;
    client = supabaseClient;
    workspaceId = selectedWorkspaceId;
    ready = false;
    await assertWorkspaceSession(serviceGeneration);
    ready = true;
    return load();
  }

  async function load() {
    requireReady();
    const guard = await assertWorkspaceSession();
    const [guestResult, reservationResult, settingResult] = await Promise.all([
      client.from('guests')
        .select('id,ticket,service_date,guest_name,pack,phone,smoking,status,created_at,resolved_at,seated_at,table_label,reservation_id')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }),
      client.from('reservations')
        .select('id,code,reservation_date,reservation_time,guest_name,pack,phone,smoking,note,table_label,status,created_at')
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
    await assertWorkspaceSession(guard.generation);

    const guests = (guestResult.data || []).map(mapGuest);
    const reservations = (reservationResult.data || []).map(mapReservation);
    const reservationsById = new Map(reservations.map(reservation => [reservation.id, reservation]));

    guests.forEach(guest => {
      if (!guest.reservationId) return;
      const reservation = reservationsById.get(guest.reservationId);
      if (!reservation) return;
      guest.reservationCode = reservation.code;
      guest.reservationTable = reservation.table;
      reservation.guestId = guest.id;
    });

    persistedGuestRows = new Map(guests.map(guest => {
      const record = guestRecord(guest);
      return [guest.id, recordFingerprint(record)];
    }));
    persistedReservationRows = new Map(reservations.map(reservation => {
      const record = reservationRecord(reservation);
      return [reservation.id, recordFingerprint(record)];
    }));
    const loadedSettings = settingResult.data?.setting_value;
    persistedSettingsFingerprint = settingResult.data
      ? JSON.stringify({ seatingDurationMinutes: Number(loadedSettings?.seatingDurationMinutes) || 90 })
      : null;

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

  async function loadGuestAudit(guestId) {
    requireReady();
    const guard = await assertWorkspaceSession();
    const { data, error } = await client.from('guest_status_history')
      .select('changed_at,label,detail,reason')
      .eq('workspace_id', workspaceId)
      .eq('guest_id', guestId)
      .order('changed_at', { ascending: true });
    if (error) throw error;
    await assertWorkspaceSession(guard.generation);
    return (data || []).map(item => ({
      at: toMs(item.changed_at),
      label: item.label,
      detail: item.detail || '',
      reason: item.reason || ''
    }));
  }

  async function nextTicket(day) {
    requireReady();
    const guard = await assertWorkspaceSession();
    const { data, error } = await client.rpc('next_guest_ticket', {
      p_workspace_id: workspaceId,
      p_service_date: day
    });
    if (error) throw error;
    await assertWorkspaceSession(guard.generation);
    return data;
  }

  async function nextReservationCode(day) {
    requireReady();
    const guard = await assertWorkspaceSession();
    const { data, error } = await client.rpc('next_reservation_code', {
      p_workspace_id: workspaceId,
      p_service_date: day
    });
    if (error) throw error;
    await assertWorkspaceSession(guard.generation);
    return data;
  }

  function persist(state) {
    requireReady();
    const requestedGeneration = serviceGeneration;
    const run = async () => {
      const guard = await assertWorkspaceSession(requestedGeneration);
      const reservations = (state.reservations || []).map(reservationRecord);
      const guests = (state.guests || []).map(guestRecord);
      const changedReservations = reservations.filter(record =>
        persistedReservationRows.get(record.id) !== recordFingerprint(record)
      );
      const changedGuests = guests.filter(record =>
        persistedGuestRows.get(record.id) !== recordFingerprint(record)
      );

      await assertWorkspaceSession(guard.generation);
      if (changedReservations.length) {
        const result = await client.from('reservations').upsert(changedReservations, { onConflict: 'id' });
        if (result.error) throw result.error;
        changedReservations.forEach(record => persistedReservationRows.set(record.id, recordFingerprint(record)));
      }
      await assertWorkspaceSession(guard.generation);
      if (changedGuests.length) {
        const rows = changedGuests.map(record => ({ ...record, updated_at: new Date().toISOString() }));
        const result = await client.from('guests').upsert(rows, { onConflict: 'id' });
        if (result.error) throw result.error;
        changedGuests.forEach(record => persistedGuestRows.set(record.id, recordFingerprint(record)));
      }
      await assertWorkspaceSession(guard.generation);
      if (root.AppAuth?.getContext()?.role !== 'service') {
        const settingValue = {
          seatingDurationMinutes: Number(state.settings?.seatingDurationMinutes) || 90
        };
        const settingFingerprint = JSON.stringify(settingValue);
        if (settingFingerprint !== persistedSettingsFingerprint) {
          const setting = await client.from('workspace_settings').upsert({
            workspace_id: workspaceId,
            setting_key: 'guest_operations',
            setting_value: settingValue,
            updated_at: new Date().toISOString()
          }, { onConflict: 'workspace_id,setting_key' });
          if (setting.error) throw setting.error;
          persistedSettingsFingerprint = settingFingerprint;
        }
      }
    };

    const operation = writeQueue.catch(() => undefined).then(run);
    writeQueue = operation;
    return operation;
  }

  async function seatReservation(reservationId, tableLabel) {
    requireReady();

    const normalizedTable = String(tableLabel || '').trim();
    if (!reservationId || !normalizedTable || normalizedTable.length > 80) {
      throw new Error('Nomor atau nama meja belum sesuai.');
    }

    const requestedGeneration = serviceGeneration;
    const run = async () => {
      const guard = await assertWorkspaceSession(requestedGeneration);
      const { data, error } = await client.rpc('seat_guest_reservation', {
        p_reservation_id: reservationId,
        p_table_label: normalizedTable
      });
      if (error) throw error;
      await assertWorkspaceSession(guard.generation);

      if (!data?.guest || !data?.reservation ||
          data.guest.workspace_id !== guard.workspaceId ||
          data.reservation.workspace_id !== guard.workspaceId ||
          data.guest.reservation_id !== reservationId ||
          data.reservation.id !== reservationId) {
        throw new Error('Respons dudukkan reservasi tidak cocok dengan workspace aktif.');
      }

      const guest = mapGuest(data.guest);
      const reservation = mapReservation(data.reservation);
      guest.reservationCode = reservation.code;
      guest.reservationTable = reservation.table || guest.tableLabel;
      reservation.guestId = guest.id;

      persistedGuestRows.set(guest.id, recordFingerprint(guestRecord(guest)));
      persistedReservationRows.set(reservation.id, recordFingerprint(reservationRecord(reservation)));

      return {
        guest,
        reservation,
        created: data.created === true
      };
    };

    const operation = writeQueue.catch(() => undefined).then(run);
    writeQueue = operation;
    return operation;
  }

  async function loadReservationAudit(reservationId) {
    requireReady();
    const guard = await assertWorkspaceSession();
    const { data, error } = await client.from('reservation_edit_history')
      .select('before_data,after_data,edited_by,edited_at')
      .eq('workspace_id', workspaceId).eq('reservation_id', reservationId)
      .order('edited_at', { ascending: false });
    if (error) throw error;
    await assertWorkspaceSession(guard.generation);
    return (data || []).map(item => {
      const before=item.before_data||{},after=item.after_data||{};
      const labels={guest_name:'Nama',pack:'Pack',reservation_date:'Tanggal',reservation_time:'Jam',phone:'WhatsApp',smoking:'Smoking',note:'Catatan'};
      const changes=Object.keys(labels).filter(key=>before[key]!==after[key]).map(key=>labels[key]+': '+(before[key]??'—')+' → '+(after[key]??'—'));
      return {at:toMs(item.edited_at),summary:changes.join(' · ')};
    });
  }

  async function correctGuest(guest, reason) {
    requireReady();
    if (!guest?.id) throw new Error('Data tamu tidak valid.');
    const normalizedReason = String(reason || '').trim();
    if (!normalizedReason || normalizedReason.length > 500) {
      throw new Error('Alasan koreksi wajib diisi (maksimal 500 karakter).');
    }

    const guard = await assertWorkspaceSession();
    const record = guestRecord(guest);
    const { error } = await client.rpc('correct_guest_with_reason', {
      p_guest_id: record.id,
      p_guest_name: record.guest_name,
      p_pack: record.pack,
      p_phone: record.phone,
      p_reason: normalizedReason
    });
    if (error) throw error;
    await assertWorkspaceSession(guard.generation);
    persistedGuestRows.set(record.id, recordFingerprint(record));
  }

  function reset() {
    serviceGeneration += 1;
    client = null;
    workspaceId = null;
    ready = false;
    writeQueue = Promise.resolve();
    persistedGuestRows = new Map();
    persistedReservationRows = new Map();
    persistedSettingsFingerprint = null;
  }

  root.GuestOpsService = {
    initialize,
    reset,
    load,
    loadGuestAudit,
    loadReservationAudit,
    persist,
    correctGuest,
    nextTicket,
    nextReservationCode,
    seatReservation,
    isReady: () => ready,
    workspaceId: () => workspaceId
  };
})(window);
