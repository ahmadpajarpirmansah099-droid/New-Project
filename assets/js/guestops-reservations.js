/* =========================================================
    6. RESERVATIONS: CALENDAR, FORM, AND GUEST SEATING
    ========================================================= */
let reservationMonth = todayKey().slice(0, 7);
let reservationDate = todayKey();

const reservationStatusLabel = status => ({
  pending: 'Menunggu Reservasi',
  seated: 'Duduk',
  cancelled: 'Dibatalkan'
}[status] || status);

function reservationDateKey(year, month, day) {
  return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function reservationDateText(value, options = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    ...options
  }).format(new Date(value + 'T12:00:00Z'));
}

function reservationCode(date) {
  const number = (state.reservationCounters[date] || 0) + 1;
  state.reservationCounters[date] = number;

  return 'RSV-' + String(number).padStart(3, '0');
}


function renderDashboardReservations() {
  const calendar = $('dashboardReservationCalendar');
  if (!calendar) return;

  const [year, month] = reservationMonth.split('-').map(Number);
  const firstOffset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  $('dashboardReservationMonthLabel').textContent = reservationDateText(
    reservationMonth + '-01',
    { month: 'long', year: 'numeric' }
  );

  const weekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  let cells = weekdays.map(day => '<div class="reservation-weekday">' + day + '</div>').join('');
  for (let index = 0; index < firstOffset; index++) {
    cells += '<div class="reservation-day outside" aria-hidden="true"></div>';
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = reservationDateKey(year, month, day);
    const items = state.reservations.filter(reservation => reservation.date === date);
    const dots =
      (items.some(item => item.status === 'pending') ? '<i></i>' : '') +
      (items.some(item => item.status === 'seated') ? '<i class="seated"></i>' : '') +
      (items.some(item => item.status === 'cancelled') ? '<i class="cancelled"></i>' : '');
    cells += '<button type="button" class="reservation-day' +
      (date === todayKey() ? ' today' : '') +
      (date === reservationDate ? ' selected' : '') +
      (items.length ? ' has-items' : '') +
      '" data-app-action="selectReservationDate" data-app-date="' + date + '" aria-label="' +
      esc(reservationDateText(date)) + (items.length ? ', ' + items.length + ' reservasi' : '') +
      '"><span>' + day + '</span><span class="reservation-day-dots">' + dots + '</span></button>';
  }
  calendar.innerHTML = cells;

  const reservations = state.reservations
    .filter(reservation => reservation.date === reservationDate)
    .sort((a, b) => a.time.localeCompare(b.time));
  $('dashboardReservationDateLabel').textContent = reservationDateText(reservationDate);
  $('dashboardReservationCount').textContent = reservations.length + ' reservasi';

  $('dashboardReservationList').innerHTML = reservations.length
    ? reservations.map(reservation =>
        '<article class="dashboard-reservation-item">' +
          '<div class="dashboard-reservation-item-main">' +
            '<span class="reservation-code">' + esc(reservation.code) + '</span>' +
            '<strong>' + esc(reservation.name) + '</strong>' +
            '<span class="dashboard-reservation-time">' + esc(reservation.time) + ' WIB</span>' +
            '<small>' + esc(reservation.pack) + ' pack' +
              (reservation.table ? ' · Meja ' + esc(reservation.table) : '') + '</small>' +
          '</div>' +
          '<div class="dashboard-reservation-item-side">' +
            '<span class="reservation-status ' + esc(reservation.status) + '">' +
              reservationStatusLabel(reservation.status) + '</span>' +
            '<button type="button" data-app-action="openReservationDetail" data-app-id="' +
              esc(reservation.id) + '">Detail</button>' +
          '</div>' +
        '</article>'
      ).join('')
    : '<div class="reservation-empty"><strong>Belum ada reservasi</strong>Tidak ada reservasi pada tanggal ini.</div>';
}

function changeReservationMonth(delta) {
  const [year, month] = reservationMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));

  reservationMonth =
    date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
  reservationDate = reservationMonth + '-01';

  renderReservations();
}

function goReservationToday() {
  reservationMonth = todayKey().slice(0, 7);
  reservationDate = todayKey();
  renderReservations();
}

function selectReservationDate(date) {
  if (date === reservationDate) return;

  reservationDate = date;
  renderReservations(true);
}

function renderReservations(animateDateChange = false) {
  if (!$('reservationCalendar')) return;

  const [year, month] = reservationMonth.split('-').map(Number);
  const firstOffset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  $('reservationMonthLabel').textContent = reservationDateText(
    reservationMonth + '-01',
    { month: 'long', year: 'numeric' }
  );

  const weekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  let cells = weekdays
    .map(day => '<div class="reservation-weekday">' + day + '</div>')
    .join('');

  for (let index = 0; index < firstOffset; index++) {
    cells += '<div class="reservation-day outside"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = reservationDateKey(year, month, day);
    const items = state.reservations.filter(reservation => reservation.date === date);
    const hasItems = items.length > 0;

    const dots =
      (items.some(item => item.status === 'pending') ? '<i></i>' : '') +
      (items.some(item => item.status === 'seated') ? '<i class="seated"></i>' : '') +
      (items.some(item => item.status === 'cancelled') ? '<i class="cancelled"></i>' : '');

    cells +=
      '<button type="button" class="reservation-day' +
      (date === todayKey() ? ' today' : '') +
      (date === reservationDate ? ' selected' : '') +
      (hasItems ? ' has-items' : '') +
      '" data-app-action="selectReservationDate" data-app-date="' + date + '"><span>' +
      day +
      '</span><span class="reservation-day-dots">' +
      dots +
      '</span></button>';
  }

  $('reservationCalendar').innerHTML = cells;

  const reservations = state.reservations
    .filter(reservation => reservation.date === reservationDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  $('reservationDateLabel').textContent = reservationDateText(reservationDate);
  $('reservationCount').textContent = reservations.length + ' reservasi';

  const reservationList = $('reservationList');
  reservationList.innerHTML = reservations.length
    ? reservations.map(reservation => {
        const actions = reservation.status === 'pending'
          ? '<button class="seat-action" data-app-action="seatReservation" data-app-id="' + esc(reservation.id) + '">Dudukkan tamu</button>' +
            '<button class="cancel-action" data-app-action="cancelReservation" data-app-id="' + esc(reservation.id) + '">Batalkan</button>'
          : '';

        return '<article class="reservation-card">' +
          '<div>' +
            '<div class="reservation-code">' + esc(reservation.code) + '</div>' +
            '<div class="reservation-name">' + esc(reservation.name) + '</div>' +
            '<div class="reservation-meta">' +
              '<span>' + reservation.pack + ' pack</span>' +
              '<span>·</span>' +
              '<span>' + esc(reservation.phone || 'Tanpa WhatsApp') + '</span>' +
              '<span>·</span>' +
              '<span>' + esc(reservation.smoking) + '</span>' +
            '</div>' +
            '<span class="reservation-status ' + reservation.status + '">' +
              reservationStatusLabel(reservation.status) +
            '</span>' +
          '</div>' +
          '<div class="reservation-time"><small>JAM</small><strong>' + esc(reservation.time) + '</strong></div>' +
          '<div class="reservation-actions">' +
            '<button data-app-action="openReservationDetail" data-app-id="' + esc(reservation.id) + '">Detail</button>' +
            actions +
          '</div>' +
        '</article>';
      }).join('')
    : '<div class="reservation-empty"><strong>Belum ada reservasi</strong>Tidak ada reservasi pada tanggal ini.</div>';

  renderDashboardReservations();

  if (animateDateChange) {
    reservationList.classList.remove('is-changing');
    requestAnimationFrame(() => reservationList.classList.add('is-changing'));
  }
}
let reservationDatePickerMonth = new Date();
let reservationDatePickerDraft = '';

function openReservationForm() {
  const minDate = todayKey();
  const initialDate = reservationDate < minDate ? minDate : reservationDate;

  openSheet(
    '<div class="sheet-head"><h2>Reservasi baru</h2><button class="close" data-app-action="closeSheet">✕</button></div>' +
    '<form data-app-submit="saveReservation">' +
      '<div class="field"><label>Nama tamu *</label><input id="rName" required maxlength="120" placeholder="Nama tamu"></div>' +
      '<div class="field"><label>Jumlah pack *</label><input id="rPack" type="number" min="1" max="500" value="2" required></div>' +
      '<div class="field"><label>Tanggal reservasi *</label>' +
        '<input id="rDate" type="hidden" value="' + initialDate + '">' +
        '<button class="reservation-picker-trigger" id="rDateTrigger" type="button" data-app-action="openReservationDatePicker">' +
          '<span id="rDateLabel">' + historyDateLabel(initialDate) + '</span>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="field"><label>Jam reservasi *</label>' +
        '<input id="rTime" type="hidden" value="19:00">' +
        '<button class="reservation-picker-trigger" id="rTimeTrigger" type="button" data-app-action="openReservationTimePicker">' +
          '<span id="rTimeLabel">19.00 WIB</span>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="field"><label>WhatsApp (opsional)</label><input id="rPhone" inputmode="tel" maxlength="24" placeholder="08xxxxxxxxxx"></div>' +
      '<div class="field"><label>Preferensi smoking</label>' +
        '<input id="rSmoking" type="hidden" value="Non Smoking">' +
        '<div class="reservation-select">' +
          '<button class="reservation-select-trigger" id="rSmokingTrigger" type="button" data-app-action="toggleReservationSmokingOptions" aria-expanded="false" aria-controls="rSmokingOptions">' +
            '<span id="rSmokingLabel">Non Smoking</span>' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>' +
          '</button>' +
          '<div class="reservation-select-options" id="rSmokingOptions" hidden>' +
            '<button class="reservation-select-option selected" type="button" data-app-action="selectReservationSmoking" data-app-value="Non Smoking"><span>Non Smoking</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button>' +
            '<button class="reservation-select-option" type="button" data-app-action="selectReservationSmoking" data-app-value="Smoking"><span>Smoking</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="field"><label>Catatan (opsional)</label><textarea id="rNote" rows="2" maxlength="1000" placeholder="Catatan untuk staf"></textarea></div>' +
      '<div class="sheet-actions"><button type="button" class="secondary" data-app-action="closeSheet">Batal</button><button class="primary" type="submit">Simpan reservasi</button></div>' +
    '</form>'
  );
}

function toggleReservationSmokingOptions() {
  const options = $('rSmokingOptions');
  const trigger = $('rSmokingTrigger');
  if (!options || !trigger) return;

  options.hidden = !options.hidden;
  trigger.setAttribute('aria-expanded', String(!options.hidden));
}

function selectReservationSmoking(value) {
  $('rSmoking').value = value;
  $('rSmokingLabel').textContent = value;

  $('rSmokingOptions').querySelectorAll('.reservation-select-option').forEach(option => {
    const selected = option.textContent.trim() === value;
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-pressed', String(selected));
  });

  $('rSmokingOptions').hidden = true;
  $('rSmokingTrigger').setAttribute('aria-expanded', 'false');
}

function openReservationDatePicker() {
  const current = $('rDate').value || todayKey();
  reservationDatePickerDraft = current;

  const date = parseHistoryDate(current);
  reservationDatePickerMonth = new Date(date.getFullYear(), date.getMonth(), 1);

  renderReservationDatePicker();
  $('reservationDateBackdrop').classList.add('show');
  $('reservationDateDialog').classList.add('show');
}

function closeReservationDatePicker() {
  $('reservationDateBackdrop').classList.remove('show');
  $('reservationDateDialog').classList.remove('show');
}

function changeReservationDatePickerMonth(delta) {
  reservationDatePickerMonth = new Date(
    reservationDatePickerMonth.getFullYear(),
    reservationDatePickerMonth.getMonth() + delta,
    1
  );
  renderReservationDatePicker();
}

function selectReservationDateDraft(value) {
  if (value < todayKey()) return;
  reservationDatePickerDraft = value;
  renderReservationDatePicker();
}

function selectTodayForReservation() {
  reservationDatePickerDraft = todayKey();
  const date = parseHistoryDate(reservationDatePickerDraft);
  reservationDatePickerMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  renderReservationDatePicker();
}

function applyReservationDate() {
  if (!reservationDatePickerDraft || reservationDatePickerDraft < todayKey()) {
    toast('Tanggal reservasi tidak boleh di masa lalu');
    return;
  }

  $('rDate').value = reservationDatePickerDraft;
  $('rDateLabel').textContent = historyDateLabel(reservationDatePickerDraft);
  closeReservationDatePicker();
}

function renderReservationDatePicker() {
  const year = reservationDatePickerMonth.getFullYear();
  const month = reservationDatePickerMonth.getMonth();
  const today = todayKey();
  const todayDate = parseHistoryDate(today);
  const previousMonth = year < todayDate.getFullYear() ||
    (year === todayDate.getFullYear() && month <= todayDate.getMonth());

  $('reservationDateMonthLabel').textContent = new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric'
  }).format(reservationDatePickerMonth);

  $('reservationDateSelectedLabel').textContent = historyDateLabel(reservationDatePickerDraft);
  $('reservationDatePrev').disabled = previousMonth;

  const firstDayOffset = new Date(year, month, 1).getDay();
  let days = '';

  for (let index = 0; index < 42; index++) {
    const date = new Date(year, month, 1 - firstDayOffset + index);
    const key = historyDateKey(date);
    const outside = date.getMonth() !== month;
    const disabled = outside || key < today;
    const classes = ['calendar-day'];

    if (outside) classes.push('outside');
    if (key === today) classes.push('today');
    if (key === reservationDatePickerDraft) classes.push('selected');

    days +=
      '<button type="button" class="' + classes.join(' ') + '"' +
      (disabled ? ' disabled' : '') +
      ' data-app-action="selectReservationDateDraft" data-app-date="' + key + '"' +
      ' aria-label="' + historyDateLabel(key) + '"' +
      ' aria-pressed="' + (key === reservationDatePickerDraft) + '">' +
      date.getDate() +
      '</button>';
  }

  $('reservationDatePickerDays').innerHTML = days;
}

function openReservationTimePicker() {
  const value = $('rTime').value || '19:00';
  const [hour, minute] = value.split(':').map(Number);

  $('reservationTimeHour').value = String(hour).padStart(2, '0');
  $('reservationTimeMinute').value = String(minute).padStart(2, '0');
  syncReservationTimePreview();

  $('reservationTimeBackdrop').classList.add('show');
  $('reservationTimeDialog').classList.add('show');
}

function closeReservationTimePicker() {
  $('reservationTimeBackdrop').classList.remove('show');
  $('reservationTimeDialog').classList.remove('show');
}

function syncReservationTimePreview() {
  const hour = $('reservationTimeHour').value.trim();
  const minute = $('reservationTimeMinute').value.trim();
  const validHour = /^\d{1,2}$/.test(hour) && Number(hour) >= 0 && Number(hour) <= 23;
  const validMinute = /^\d{1,2}$/.test(minute) && Number(minute) >= 0 && Number(minute) <= 59;

  $('reservationTimePreview').textContent = validHour && validMinute
    ? String(Number(hour)).padStart(2, '0') + '.' + String(Number(minute)).padStart(2, '0')
    : '--.--';
}

function adjustReservationTime(part, amount) {
  const input = part === 'hour' ? $('reservationTimeHour') : $('reservationTimeMinute');
  const fallback = part === 'hour' ? 19 : 0;
  const parsed = Number(input.value);
  const maximum = part === 'hour' ? 23 : 59;
  const current = Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum
    ? parsed
    : fallback;
  const next = part === 'hour'
    ? (current + amount + 24) % 24
    : (current + amount * 5 + 60) % 60;

  input.value = String(next).padStart(2, '0');
  syncReservationTimePreview();
}

function applyReservationTime() {
  const hourText = $('reservationTimeHour').value.trim();
  const minuteText = $('reservationTimeMinute').value.trim();
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!/^\d{1,2}$/.test(hourText) || !/^\d{1,2}$/.test(minuteText) ||
      hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    toast('Format jam belum sesuai');
    return;
  }

  const value = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  $('rTime').value = value;
  $('rTimeLabel').textContent = value.replace(':', '.') + ' WIB';
  closeReservationTimePicker();
}

async function saveReservation(e) {
  e.preventDefault();

  const name = $('rName').value.trim();
  const pack = Number($('rPack').value);
  const date = $('rDate').value;
  const time = $('rTime').value;
  const phone = $('rPhone').value.trim();

  if (!name || !Number.isInteger(pack) || pack < 1 || pack > 500 || !date || !time) {
    toast('Lengkapi data reservasi terlebih dahulu');
    return;
  }

  if (date < todayKey() || (date === todayKey() &&
      time < new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).format(new Date()))) {
    toast('Tanggal dan jam tidak boleh di masa lalu');
    return;
  }

  if (phone && !/^(\+?62|0)\d{8,13}$/.test(phone.replace(/[\s-]/g, ''))) {
    toast('Format WhatsApp belum sesuai');
    return;
  }

  const reservation = {
    id: uid(),
    code: '',
    name,
    pack,
    date,
    time,
    phone,
    smoking: $('rSmoking').value,
    note: $('rNote').value.trim(),
    status: 'pending',
    created: Date.now(),
    guestId: null
  };

  reservationMonth = date.slice(0, 7);
  reservationDate = date;
  closeSheet();

  try {
    reservation.code = await window.GuestOpsService.nextReservationCode(date);
    state.reservations.push(reservation);
    renderAll();
    if (await save() === false) {
      state.reservations = state.reservations.filter(item => item.id !== reservation.id);
      renderAll();
      toast('Reservasi belum tersimpan. Coba lagi.');
      return;
    }
  } catch (error) {
    console.error(error);
    toast('Reservasi belum berhasil disimpan. Coba lagi.');
    return;
  }
  toast('Reservasi tersimpan · ' + reservation.code);
}

function openReservationDetail(id){const r=state.reservations.find(x=>x.id===id);if(!r)return;openSheet('<div class="sheet-head"><h2>Detail reservasi</h2><button class="close" data-app-action="closeSheet">✕</button></div><div class="detail-ticket"><small>KODE RESERVASI</small><strong>'+esc(r.code)+'</strong><small>'+esc(reservationDateText(r.date))+'</small></div><div class="detail-name">'+esc(r.name)+'</div><div class="detail-grid"><div class="detail-cell"><small>Jam reservasi</small><b>'+esc(r.time)+' WIB</b></div><div class="detail-cell"><small>Jumlah pack</small><b>'+r.pack+' pack</b></div><div class="detail-cell"><small>Status</small><b>'+reservationStatusLabel(r.status)+'</b></div><div class="detail-cell"><small>Smoking</small><b>'+esc(r.smoking)+'</b></div><div class="detail-cell detail-cell-full"><small>WhatsApp</small><b>'+esc(r.phone||'—')+'</b></div><div class="detail-cell detail-cell-full"><small>Catatan</small><b>'+esc(r.note||'—')+'</b></div></div><div class="sheet-actions"><button class="secondary" data-app-action="closeSheet">Tutup</button></div>')}
async function cancelReservation(id) {
  const reservation = state.reservations.find(item => item.id === id);
  if (!reservation || reservation.status !== 'pending') return;
  if (!confirm('Batalkan reservasi ' + reservation.code + '?')) return;

  const previousStatus = reservation.status;
  reservation.status = 'cancelled';
  reservation.cancelledAt = Date.now();
  if (await save() === false) {
    reservation.status = previousStatus;
    delete reservation.cancelledAt;
    renderAll();
    return;
  }
  renderAll();
  toast('Reservasi dibatalkan');
}

function seatReservation(id) {
  const reservation = state.reservations.find(item => item.id === id);
  if (!reservation || reservation.status !== 'pending') return;

  if (reservation.date !== todayKey()) {
    toast('Tamu hanya bisa didudukkan pada tanggal reservasinya');
    return;
  }

  openSheet(
    '<div class="sheet-head"><h2>Dudukkan tamu</h2><button class="close" data-app-action="closeSheet">✕</button></div>' +
    '<p class="page-sub">' + esc(reservation.code) + ' · ' + esc(reservation.name) + '</p>' +
    '<form data-app-submit="confirmSeatReservation" data-app-id="' + esc(id) + '">' +
      '<div class="field"><label>Nomor / nama meja *</label><input id="rTable" required maxlength="80" placeholder="Contoh: Meja 05, VIP 2"></div>' +
      '<div class="sheet-actions"><button type="button" class="secondary" data-app-action="closeSheet">Batal</button><button class="primary">Konfirmasi duduk</button></div>' +
    '</form>'
  );
}

async function confirmSeatReservation(event, id) {
  event.preventDefault();

  const reservation = state.reservations.find(item => item.id === id);
  const table = $('rTable').value.trim();
  if (!reservation || !table) return;

  const now = Date.now();
  const guest = {
    id: uid(),
    ticket: '',
    day: todayKey(),
    name: reservation.name,
    pack: reservation.pack,
    phone: reservation.phone,
    status: 'seated',
    source: 'reservation',
    reservationId: reservation.id,
    reservationCode: reservation.code,
    reservationTable: table,
    created: now,
    resolved: now,
    seatedAt: now,
    audit: [{
      at: now,
      label: 'Reservasi ' + reservation.code + ' · Duduk',
      detail: 'Meja ' + table
    }]
  };

  const previousReservation = {
    status: reservation.status,
    guestId: reservation.guestId,
    table: reservation.table,
    seatedAt: reservation.seatedAt
  };
  closeSheet();

  try {
    guest.ticket = await window.GuestOpsService.nextTicket(todayKey());
    state.guests.push(guest);
    reservation.status = 'seated';
    reservation.guestId = guest.id;
    reservation.table = table;
    reservation.seatedAt = now;
    renderAll();

    if (await save() === false) {
      state.guests = state.guests.filter(item => item.id !== guest.id);
      Object.assign(reservation, previousReservation);
      renderAll();
      toast('Tamu belum berhasil didudukkan. Coba lagi.');
      return;
    }
  } catch (error) {
    state.guests = state.guests.filter(item => item.id !== guest.id);
    Object.assign(reservation, previousReservation);
    renderAll();
    console.error(error);
    toast('Tamu belum berhasil didudukkan. Coba lagi.');
    return;
  }
  toast('Tamu masuk ke catatan operasional · ' + guest.ticket);
}

