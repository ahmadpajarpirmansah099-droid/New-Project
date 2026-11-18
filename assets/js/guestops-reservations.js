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
            '<small>' + esc(reservation.pack) + ' pack' +
              (reservation.table ? ' · Meja ' + esc(reservation.table) : '') + '</small>' +
            '<span class="reservation-status ' + esc(reservation.status) + '">' +
              reservationStatusLabel(reservation.status) + '</span>' +
          '</div>' +
          '<div class="dashboard-reservation-item-side">' +
            '<span class="dashboard-reservation-time"><small>JAM</small><strong>' + esc(reservation.time) + '</strong></span>' +
            '<div class="dashboard-reservation-actions">' +
              (reservation.phone
                ? '<button type="button" class="dashboard-reservation-wa" data-app-action="callReservationWhatsApp" data-app-id="' + esc(reservation.id) + '">Panggil WA</button>'
                : '') +
              (reservation.status === 'pending'
                ? '<button type="button" class="dashboard-reservation-seat" data-app-action="seatReservation" data-app-id="' + esc(reservation.id) + '">Dudukkan</button>'
                : '') +
              '<button type="button" data-app-action="openReservationDetail" data-app-id="' +
                esc(reservation.id) + '">Detail</button>' +
            '</div>' +
          '</div>' +
        '</article>'
      ).join('')
    : '<div class="reservation-empty"><strong>Belum ada reservasi</strong>Tidak ada reservasi pada tanggal ini.</div>';

  if (typeof renderDashboardTrend === 'function') renderDashboardTrend();
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

function isEditingExistingReservation() {
  const id = $('rEditId')?.value;
  return Boolean(id && state.reservations.some(reservation => reservation.id === id));
}

function openReservationForm(id) {
 const r=id?state.reservations.find(x=>x.id===id):null;
 if(id&&!r){toast('Reservasi tidak ditemukan');return;}
 const date=r?.date||(reservationDate<todayKey()?todayKey():reservationDate),time=r?.time||'19:00',smoking=r?.smoking||'Non Smoking',v=x=>esc(x==null?'':x);
 openSheet('<div class="sheet-head"><h2>'+(r?'Edit reservasi':'Reservasi baru')+'</h2><button class="close" data-app-action="closeSheet">✕</button></div>'+
 '<form data-app-submit="saveReservation"><input id="rEditId" type="hidden" value="'+v(r?.id||'')+'">'+
 '<div class="field"><label>Nama tamu *</label><input id="rName" required maxlength="120" value="'+v(r?.name||'')+'"></div>'+
 '<div class="field"><label>Jumlah pack *</label><input id="rPack" type="number" min="1" max="500" value="'+v(r?.pack||2)+'" required></div>'+
 '<div class="field"><label>Tanggal reservasi *</label><input id="rDate" type="hidden" value="'+date+'"><button class="reservation-picker-trigger" id="rDateTrigger" type="button" data-app-action="openReservationDatePicker"><span id="rDateLabel">'+historyDateLabel(date)+'</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg></button></div>'+
 '<div class="field"><label>Jam reservasi *</label><input id="rTime" type="hidden" value="'+time+'"><button class="reservation-picker-trigger" id="rTimeTrigger" type="button" data-app-action="openReservationTimePicker"><span id="rTimeLabel">'+time.replace(':','.')+' WIB</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></button></div>'+
 '<div class="field"><label>WhatsApp (opsional)</label><input id="rPhone" inputmode="tel" maxlength="24" value="'+v(r?.phone||'')+'"></div>'+
 '<div class="field"><label>Preferensi smoking</label><input id="rSmoking" type="hidden" value="'+v(smoking)+'"><div class="reservation-select"><button class="reservation-select-trigger" id="rSmokingTrigger" type="button" data-app-action="toggleReservationSmokingOptions" aria-expanded="false" aria-controls="rSmokingOptions"><span id="rSmokingLabel">'+v(smoking)+'</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button><div class="reservation-select-options" id="rSmokingOptions" hidden>'+
 ['Non Smoking','Smoking'].map(x=>'<button class="reservation-select-option'+(x===smoking?' selected':'')+'" type="button" data-app-action="selectReservationSmoking" data-app-value="'+x+'"><span>'+x+'</span></button>').join('')+
 '</div></div></div><div class="field"><label>Catatan (opsional)</label><textarea id="rNote" rows="2" maxlength="1000">'+v(r?.note||'')+'</textarea></div>'+
 '<div class="sheet-actions"><button type="button" class="secondary" data-app-action="closeSheet">Batal</button><button class="primary" type="submit">'+(r?'Simpan perubahan':'Simpan reservasi')+'</button></div></form>');
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
  if (!isEditingExistingReservation() && value < todayKey()) return;
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
  if (!reservationDatePickerDraft || (!isEditingExistingReservation() && reservationDatePickerDraft < todayKey())) {
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
  const previousMonth = !isEditingExistingReservation() && (year < todayDate.getFullYear() ||
    (year === todayDate.getFullYear() && month <= todayDate.getMonth()));

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
    const disabled = outside || (!isEditingExistingReservation() && key < today);
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
 const id=$('rEditId')?.value||'',existing=id?state.reservations.find(x=>x.id===id):null;
 if(id&&!existing){toast('Reservasi tidak ditemukan');return;}
 const name=$('rName').value.trim(),pack=Number($('rPack').value),date=$('rDate').value,time=$('rTime').value,phone=$('rPhone').value.trim(),smoking=$('rSmoking').value,note=$('rNote').value.trim();
 if(!name||!Number.isInteger(pack)||pack<1||pack>500||!date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){toast('Lengkapi data reservasi terlebih dahulu');return;}
 if(!existing&&(date<todayKey()||(date===todayKey()&&time<new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date())))){toast('Tanggal dan jam tidak boleh di masa lalu');return;}
 if(phone&&!/^(\+?62|0)\d{8,13}$/.test(phone.replace(/[\s-]/g,''))){toast('Format WhatsApp belum sesuai');return;}
 const previous=existing?{...existing}:null,reservation=existing||{id:uid(),code:'',status:'pending',created:Date.now(),guestId:null};
 Object.assign(reservation,{name,pack,date,time,phone,smoking,note});reservationMonth=date.slice(0,7);reservationDate=date;closeSheet();
 try{
  if(!existing)reservation.code=await window.GuestOpsService.nextReservationCode(date);
  if(!existing)state.reservations.push(reservation);renderAll();
  if(await save()===false){if(existing)Object.assign(existing,previous);else state.reservations=state.reservations.filter(x=>x.id!==reservation.id);renderAll();toast('Perubahan reservasi belum tersimpan. Coba lagi.');return;}
 }catch(error){if(existing)Object.assign(existing,previous);else state.reservations=state.reservations.filter(x=>x.id!==reservation.id);renderAll();console.error(error);toast('Reservasi belum berhasil disimpan. Coba lagi.');return;}
 toast(existing?'Perubahan reservasi tersimpan':'Reservasi tersimpan · '+reservation.code);
}

function callReservationWhatsApp(id) {
  const reservation = state.reservations.find(item => item.id === id);
  if (!reservation) return;

  const digits = String(reservation.phone || '').replace(/[^0-9]/g, '');
  let phone = digits;
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  else if (phone.startsWith('8')) phone = '62' + phone;

  if (!/^[0-9]{8,15}$/.test(phone)) {
    toast('Nomor WhatsApp belum diisi atau formatnya belum valid');
    return;
  }

  const message = 'Halo Kak ' + reservation.name + ', kami mengingatkan reservasi ' +
    reservation.code + ' pada ' + reservationDateText(reservation.date) + ' pukul ' +
    reservation.time + ' WIB. Sampai bertemu, terima kasih.';
  const waUrl = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
  window.open(waUrl, '_blank', 'noopener,noreferrer');
}

function openReservationDetail(id) {
 const r=state.reservations.find(x=>x.id===id);if(!r)return;
 openSheet('<div class="sheet-head"><h2>Detail reservasi</h2><button class="close" data-app-action="closeSheet">✕</button></div>'+
 '<div class="detail-ticket"><small>KODE RESERVASI</small><strong>'+esc(r.code)+'</strong><small>'+esc(reservationDateText(r.date))+'</small></div><div class="detail-name">'+esc(r.name)+'</div>'+
 '<div class="detail-grid"><div class="detail-cell"><small>Jam reservasi</small><b>'+esc(r.time)+' WIB</b></div><div class="detail-cell"><small>Jumlah pack</small><b>'+r.pack+' pack</b></div><div class="detail-cell"><small>Status</small><b>'+reservationStatusLabel(r.status)+'</b></div><div class="detail-cell"><small>Smoking</small><b>'+esc(r.smoking)+'</b></div><div class="detail-cell detail-cell-full"><small>WhatsApp</small><b>'+esc(r.phone||'—')+'</b></div><div class="detail-cell detail-cell-full"><small>Catatan</small><b>'+esc(r.note||'—')+'</b></div></div>'+
 '<div class="detail-cell detail-cell-full"><small>Riwayat perubahan</small><div id="reservationEditHistory">Memuat riwayat...</div></div><div class="sheet-actions"><button class="primary" data-app-action="openReservationForm" data-app-id="'+esc(r.id)+'">Edit Reservasi</button><button class="secondary" data-app-action="closeSheet">Tutup</button></div>');
 const host=$('reservationEditHistory');
 window.GuestOpsService.loadReservationAudit(id).then(items=>{if(!host||!host.isConnected)return;host.innerHTML=items.length?items.map(x=>'<div><b>'+esc(new Date(x.at).toLocaleString('id-ID'))+'</b><p>'+esc(x.summary)+'</p></div>').join(''):'<small>Belum ada perubahan data.</small>';}).catch(error=>{console.error(error);if(host&&host.isConnected)host.textContent='Riwayat belum dapat dimuat.';});
}

async function cancelReservation(id) {
  const reservation = state.reservations.find(item => item.id === id);
  if (!reservation || reservation.status !== 'pending' || reservationSeatInFlight.has(id)) return;
  if (!confirm('Batalkan reservasi ' + reservation.code + '?')) return;

  reservationSeatInFlight.add(id);
  const actionButton = typeof HTMLButtonElement !== 'undefined' && this instanceof HTMLButtonElement ? this : null;
  const restoreButton = beginReservationSeatLoading(actionButton);
  const previousStatus = reservation.status;
  reservation.status = 'cancelled';
  reservation.cancelledAt = Date.now();
  try {
    if (await save() === false) {
      reservation.status = previousStatus;
      delete reservation.cancelledAt;
      renderAll();
      return false;
    }
    renderAll();
    toast('Reservasi dibatalkan');
    return true;
  } catch (error) {
    reservation.status = previousStatus;
    delete reservation.cancelledAt;
    renderAll();
    console.error(error);
    toast('Reservasi belum berhasil dibatalkan. Coba lagi.');
    return false;
  } finally {
    reservationSeatInFlight.delete(id);
    restoreButton();
  }
}

const reservationSeatInFlight = new Set();

function beginReservationSeatLoading(button) {
  if (!button || !(button instanceof HTMLButtonElement)) return () => {};
  const previousHtml = button.innerHTML;
  const wasDisabled = button.disabled;
  button.disabled = true;
  button.classList.add('guest-action-loading');
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = '<span class="guest-action-spinner" aria-hidden="true"></span><span>Menyimpan...</span>';
  return () => {
    if (!button.isConnected) return;
    button.disabled = wasDisabled;
    button.classList.remove('guest-action-loading');
    button.removeAttribute('aria-busy');
    button.innerHTML = previousHtml;
  };
}

function seatReservation(id) {
  const reservation = state.reservations.find(item => item.id === id);
  if (!reservation || reservation.status !== 'pending' || reservationSeatInFlight.has(id)) return;

  if (reservation.date !== todayKey()) {
    toast('Tamu hanya bisa didudukkan pada tanggal reservasinya');
    return;
  }

  openSheet(
    '<div class="sheet-head"><h2>Dudukkan tamu</h2><button class="close" data-app-action="closeSheet">✕</button></div>' +
    '<p class="page-sub">' + esc(reservation.code) + ' · ' + esc(reservation.name) + '</p>' +
    '<form data-app-submit="confirmSeatReservation" data-app-id="' + esc(id) + '">' +
      '<div class="field"><label>Nomor / nama meja *</label><input id="rTable" required maxlength="80" placeholder="Contoh: Meja 05, VIP 2"></div>' +
      '<div class="sheet-actions"><button type="button" class="secondary" data-app-action="closeSheet">Batal</button><button type="submit" class="primary">Konfirmasi duduk</button></div>' +
    '</form>'
  );
}

async function confirmSeatReservation(event, id) {
  event.preventDefault();

  const reservation = state.reservations.find(item => item.id === id);
  const table = $('rTable')?.value.trim();
  if (!reservation || reservation.status !== 'pending' || !table || reservationSeatInFlight.has(id)) return;

  reservationSeatInFlight.add(id);
  const form = event.target;
  const submitButton = event.submitter || form.querySelector('button[type="submit"]');
  const restoreButton = beginReservationSeatLoading(submitButton);
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
      return false;
    }

    if (form.isConnected && $('sheet')?.contains(form)) closeSheet();
    toast('Tamu masuk ke catatan operasional · ' + guest.ticket);
    return true;
  } catch (error) {
    state.guests = state.guests.filter(item => item.id !== guest.id);
    Object.assign(reservation, previousReservation);
    renderAll();
    console.error(error);
    toast('Tamu belum berhasil didudukkan. Coba lagi.');
    return false;
  } finally {
    reservationSeatInFlight.delete(id);
    restoreButton();
  }
}

