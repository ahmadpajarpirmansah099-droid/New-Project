/* =========================================================
    3. WAITING LIST: ADD GUEST AND QUEUE NUMBER
    ========================================================= */
function openAdd(){sheetGuest=null;openSheet(`<div class="sheet-head"><h2>Tambah tamu</h2><button class="close" data-app-action="closeSheet">✕</button></div><form data-app-submit="saveGuest"><div class="field"><label>Nama tamu *</label><input id="guestName" required maxlength="70" placeholder="Masukkan nama tamu" autocomplete="name"></div><div class="field"><label>Jumlah pack *</label><div class="pack-control"><button type="button" data-app-action="changePack" data-app-value="-1">−</button><strong id="packValue">2</strong><button type="button" data-app-action="changePack" data-app-value="1">+</button></div><input type="hidden" id="guestPack" value="2"></div><div class="field"><label>Nomor WhatsApp <span class="text-muted-note">(opsional)</span></label><input id="guestPhone" inputmode="tel" placeholder="08xxxxxxxxxx"></div><div class="field"><label>Status awal</label><div class="seg" data-selected="waiting"><button type="button" class="selected" id="segWait" data-app-action="chooseInitial" data-app-value="waiting">Menunggu</button><button type="button" id="segSeated" data-app-action="chooseInitial" data-app-value="seated">Langsung duduk</button></div><input type="hidden" id="initialStatus" value="waiting"></div><div class="sheet-actions"><button type="button" class="secondary" data-app-action="closeSheet">Batal</button><button type="submit" class="primary">Simpan tamu</button></div></form>`)}
function changePack(d){
  let v=Math.max(1,Math.min(30,Number($('guestPack').value)+d));
  $('guestPack').value=v;
  const value=$('packValue');
  value.textContent=v;
  value.classList.remove('pack-number-animate');
  void value.offsetWidth;
  value.classList.add('pack-number-animate');
}
/* BAGIAN: Pilihan status awal tamu dan pemicu animasi liquid toggle */
function chooseInitial(status) {
  const group = $('segWait').parentElement;
  const currentStatus = $('initialStatus').value;

  if (currentStatus === status) return;

  group.classList.remove('is-switching');
  void group.offsetWidth;

  $('initialStatus').value = status;
  group.dataset.selected = status;
  $('segWait').classList.toggle('selected', status === 'waiting');
  $('segSeated').classList.toggle('selected', status === 'seated');

  group.classList.add('is-switching');
  window.clearTimeout(group._liquidTimer);
  group._liquidTimer = window.setTimeout(
    () => group.classList.remove('is-switching'),
    200
  );
}
let guestSaveInFlight = false;
async function saveGuest(e){
  e.preventDefault();
  const form = e.target;
  if (guestSaveInFlight || !form || form.tagName !== 'FORM') return;

  guestSaveInFlight = true;
  try {
    const day=todayKey(),now=Date.now(),status=$('initialStatus').value;
    const g={
      id:uid(),ticket:'',day,
      name:$('guestName').value.trim(),
      pack:Number($('guestPack').value),
      phone:$('guestPhone').value.trim(),
      status,created:now,
      resolved:status==='seated'?now:null,
      audit:[{at:now,label:'Terdaftar',detail:$('guestPack').value+' pack'}]
    };
    if(status==='seated')g.audit.push({at:now,label:'Langsung Duduk'});
    g.ticket = await window.GuestOpsService.nextTicket(day);
    state.guests.push(g);
    if (await save() === false) {
      state.guests = state.guests.filter(item => item.id !== g.id);
      return;
    }
    closeSheet();
    renderAll();
    toast('Tamu berhasil ditambahkan · '+g.ticket);
  } catch (error) {
    console.error(error);
    toast('Tamu belum berhasil disimpan. Coba lagi.');
  } finally {
    guestSaveInFlight = false;
  }
}
// Expose handler explicitly for the delegated submit listener.
window.saveGuest = saveGuest;
/* =========================================================
    4. WAITING LIST: STATUS, CARDS, AND DASHBOARD RENDERING
    ========================================================= */
function statusLabel(s) {
  return { waiting: 'Menunggu', called: 'Dipanggil', seated: 'Duduk', done: 'Selesai', missed: 'Lupa diselesaikan', cancelled: 'Dibatalkan' }[s] || s;
}

function statusClass(s) {
  return 's-' + s;
}

function duration(g) {
  return fmtElapsed((g.resolved || Date.now()) - g.created);
}

// Resolve reservation identity for both new and previously saved seated guests.
function reservationIdentity(guest) {
  const reservations = Array.isArray(state.reservations) ? state.reservations : [];
  const linkedReservation = reservations.find(reservation =>
    reservation.guestId === guest.id || reservation.id === guest.reservationId
  );
  const auditEntry = (Array.isArray(guest.audit) ? guest.audit.slice().reverse() : [])
    .find(entry => /^Reservasi\s+RSV-\d+/.test(String(entry.label || '')));
  const auditCode = String(auditEntry?.label || '').match(/RSV-\d+/)?.[0];
  const code = guest.reservationCode || linkedReservation?.code || auditCode;
  if (!code || !/^RSV-\d+$/.test(code)) return null;
  const auditTable = String(auditEntry?.detail || '').replace(/^Meja\s*/i, '');
  const table = guest.reservationTable || linkedReservation?.table || auditTable;
  return { code, table };
}

function guestCard(g, i, history = false) {
  const reservation = reservationIdentity(g);
  const isReservation = Boolean(reservation);
  let act = '';

  if (!history && g.status === 'waiting') {
    act = '<button class="mini blue" data-app-action="callGuestWhatsApp" data-app-id="' + esc(g.id) + '"><svg class="wa-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.52 3.48A11.8 11.8 0 0 0 12.1 0C5.55 0 .23 5.32.22 11.87c0 2.1.55 4.15 1.6 5.95L.12 24l6.34-1.66a11.8 11.8 0 0 0 5.63 1.43h.01c6.55 0 11.87-5.33 11.88-11.88a11.8 11.8 0 0 0-3.46-8.41ZM12.1 21.75h-.01a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.76.98 1-3.67-.23-.38a9.82 9.82 0 1 1 8.36 4.65Zm5.39-7.36c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.23-.65.08-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.38-.03-.53-.08-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.51h-.57c-.2 0-.52.08-.79.38-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.21 5.1 4.5.71.3 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.3.18-1.42-.08-.13-.27-.2-.57-.35Z"/></svg><span>Panggil</span></button>' +
      '<button class="mini green" data-app-action="confirmGuestStatus" data-app-id="' + esc(g.id) + '" data-app-value="seated">Duduk</button>';
  } else if (!history && g.status === 'called') {
    act = '<button class="mini green" data-app-action="confirmGuestStatus" data-app-id="' + esc(g.id) + '" data-app-value="seated">Duduk</button>';
  } else if (!history && g.status === 'seated') {
    act = '<button class="mini green" data-app-action="confirmGuestStatus" data-app-id="' + esc(g.id) + '" data-app-value="done">Selesaikan</button>';
  }

  const ticketMarkup = isReservation
    ? '<div class="ticket reservation-ticket"><strong>' + esc(reservation.code) + '</strong><small>' + esc(g.ticket) + '</small></div>'
    : '<div class="ticket">' + esc(g.ticket) + '</div>';

  return '<article class="guest' + (isReservation ? ' guest-reservation' : '') + '" data-stagger-index="' + Math.min(i, 7) + '">' +
    '<div class="guest-row" data-app-action="openDetail" data-app-id="' + esc(g.id) + '">' + ticketMarkup +
      '<div class="guest-main"><div class="guest-name">' + esc(g.name) + '</div>' +
      '<div class="guest-meta"><span>' + g.pack + ' pack</span><span>·</span><span>' + fmtTime(g.created) + '</span></div></div>' +
      '<span class="status ' + statusClass(g.status) + '">' + statusLabel(g.status) + '</span></div>' +
    '<div class="guest-bottom"><span class="waittime">' + (g.status === 'seated' ? 'Seating time' : 'Waiting time') +
      ' <b' + (g.status === 'seated' ? ' data-seating-countdown="' + esc(g.id) + '"' : '') + '>' +
      (g.status === 'seated' ? seatingCountdownText(g) : duration(g)) + '</b></span>' +
      '<div class="actions">' + act + '<button class="mini" data-app-action="openDetail" data-app-id="' + esc(g.id) + '">Detail</button></div></div></article>';
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function setDashboardCounter(id,targetValue,animate=false){
  const element=$(id);
  if(!element)return;
  const target=Math.max(0,Math.round(Number(targetValue)||0));
  const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!animate||target===0||reduceMotion||typeof requestAnimationFrame!=='function'){
  element.textContent=String(target);
  return;
  }
  const duration=640;
  let startTime=null;
  const step=now=>{
  if(startTime===null)startTime=now;
  const progress=Math.min((now-startTime)/duration,1);
  const eased=1-Math.pow(1-progress,3);
  element.textContent=String(Math.min(target,Math.round(target*eased)));
  if(progress<1)requestAnimationFrame(step);
  else element.textContent=String(target);
  };
  element.textContent='0';
  requestAnimationFrame(step);
}
function dashboardDateLimit(start) {
  const [year, month, day] = start.split('-').map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const limit = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), Math.min(day, lastDay)));
  return [limit.toISOString().slice(0, 10), todayKey()].sort()[0];
}
function dashboardDateText(value) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(value + 'T00:00:00Z'));
}
function renderDashboardDateControls() {
  document.querySelector('[data-dashboard-date-label="start"]')?.replaceChildren(dashboardDateText(selectedDashboardStartDate));
  document.querySelector('[data-dashboard-date-label="end"]')?.replaceChildren(dashboardDateText(selectedDashboardEndDate));
}
function openDashboardRangePicker(trigger) {
  let start = selectedDashboardStartDate;
  let end = selectedDashboardEndDate;
  let cursor = new Date(start + 'T00:00:00Z');
  cursor.setUTCDate(1);
  const dialog = document.createElement('dialog');
  dialog.className = 'dashboard-date-dialog';
  dialog.setAttribute('aria-label', 'Pilih rentang tanggal');
  dialog.innerHTML = '<header><div><small>TANGGAL RESERVASI</small><h2>Pilih rentang tanggal</h2></div><button type="button" class="dashboard-date-close" aria-label="Tutup">×</button></header>' +
    '<div class="dashboard-range-summary"><div><small>Dari</small><strong data-range-start></strong></div><span aria-hidden="true">→</span><div><small>Sampai</small><strong data-range-end></strong></div></div>' +
    '<div class="dashboard-calendar-panel"><div class="dashboard-calendar-nav"><strong></strong><div><button type="button" data-dashboard-month="-1" aria-label="Bulan sebelumnya">‹</button><button type="button" data-dashboard-month="1" aria-label="Bulan berikutnya">›</button></div></div><div class="dashboard-calendar-grid"></div></div>' +
    '<p class="dashboard-calendar-limit" role="status">Pilih tanggal awal, lalu tanggal akhir. Maksimal 1 bulan.</p>' +
    '<footer><button type="button" class="dashboard-range-clear">Hapus</button><button type="button" class="dashboard-range-apply">Terapkan rentang</button></footer>';
  document.body.appendChild(dialog);
  const note = dialog.querySelector('.dashboard-calendar-limit');
  const draw = () => {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const offset = (cursor.getUTCDay() + 6) % 7;
    const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const max = start && !end ? dashboardDateLimit(start) : todayKey();
    dialog.querySelector('[data-range-start]').textContent = start ? dashboardDateText(start) : 'Pilih tanggal';
    dialog.querySelector('[data-range-end]').textContent = end ? dashboardDateText(end) : 'Pilih tanggal';
    dialog.querySelector('.dashboard-range-apply').disabled = !start || !end;
    dialog.querySelector('.dashboard-calendar-nav strong').textContent = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(cursor);
    dialog.querySelector('[data-dashboard-month="1"]').disabled = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10) > todayKey();
    let cells = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(day => '<span class="dashboard-calendar-weekday">' + day + '</span>').join('');
    for (let i = 0; i < offset; i++) cells += '<span class="dashboard-calendar-empty" aria-hidden="true"></span>';
    for (let day = 1; day <= dayCount; day++) {
      const value = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const disabled = value > todayKey() || Boolean(start && !end && value > max);
      const classes = ['dashboard-calendar-day', value === start ? 'is-range-start' : '', value === end ? 'is-range-end' : '', start && end && value > start && value < end ? 'is-in-range' : '', value === todayKey() ? 'is-today' : ''].filter(Boolean).join(' ');
      cells += '<button type="button" class="' + classes + '" aria-label="' + dashboardDateText(value) + '" data-dashboard-day="' + value + '"' + (disabled ? ' disabled' : '') + (value === start || value === end ? ' aria-pressed="true"' : ' aria-pressed="false"') + (value === todayKey() ? ' aria-current="date"' : '') + '>' + day + '</button>';
    }
    dialog.querySelector('.dashboard-calendar-grid').innerHTML = cells;
  };
  draw();
  dialog.showModal();
  dialog.querySelector('.dashboard-date-close').addEventListener('click', () => dialog.close());
  dialog.querySelectorAll('[data-dashboard-month]').forEach(button => button.addEventListener('click', () => {
    cursor.setUTCMonth(cursor.getUTCMonth() + Number(button.dataset.dashboardMonth));
    draw();
  }));
  dialog.querySelector('.dashboard-calendar-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-dashboard-day]');
    if (!button || button.disabled) return;
    const value = button.dataset.dashboardDay;
    if (!start || end || value < start) {
      start = value;
      end = '';
      note.textContent = 'Pilih tanggal akhir, maksimal 1 bulan dari tanggal awal.';
    } else {
      end = value;
      note.textContent = 'Rentang siap diterapkan.';
    }
    draw();
  });
  dialog.querySelector('.dashboard-range-clear').addEventListener('click', () => {
    start = '';
    end = '';
    note.textContent = 'Pilih tanggal awal, lalu tanggal akhir. Maksimal 1 bulan.';
    draw();
  });
  dialog.querySelector('.dashboard-range-apply').addEventListener('click', () => {
    if (!start || !end) return;
    selectedDashboardStartDate = start;
    selectedDashboardEndDate = end;
    renderDashboardDateControls();
    renderAll();
    dialog.close();
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { dialog.remove(); trigger.focus(); }, { once: true });
}
document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-dashboard-date]');
  if (trigger) openDashboardRangePicker(trigger);
});
function renderAll() {
  const dashboardDateText = historyDateLabel(selectedOperationalDate, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  const desktopQueueDate = document.getElementById('desktopQueueDate');
  if (desktopQueueDate) desktopQueueDate.textContent = dashboardDateText;
  updateOperationalDateLabels();

  if ($('page-dashboard')?.classList.contains('active')) {
    renderDashboardDateControls();
    const todayGuests = state.guests.filter(guest => guest.day >= selectedDashboardStartDate && guest.day <= selectedDashboardEndDate && guest.status !== 'missed');
    const waitingGuests = todayGuests.filter(guest => ['waiting', 'called'].includes(guest.status));
    const doneGuests = todayGuests.filter(guest => guest.status === 'done');
    const cancelledGuests = todayGuests.filter(guest => guest.status === 'cancelled');
    const animateCounts = dashboardCountUpPending;
    dashboardCountUpPending = false;

    setDashboardCounter('totalCount', todayGuests.length, animateCounts);
    setDashboardCounter(
      'packCount',
      todayGuests.reduce((total, guest) => total + guest.pack, 0),
      animateCounts
    );
    setDashboardCounter('waitingCount', waitingGuests.length, animateCounts);
    setDashboardCounter('doneCount', doneGuests.length, animateCounts);
    setDashboardCounter('cancelCount', cancelledGuests.length, animateCounts);

    const resolvedGuests = todayGuests.filter(guest => guest.resolved);
    $('avgWait').textContent = resolvedGuests.length
      ? fmtElapsed(
          resolvedGuests.reduce((total, guest) => total + guest.resolved - guest.created, 0) /
            resolvedGuests.length
        )
      : '—';

    const pendingGuests = state.guests.filter(
      guest => guest.day < selectedDashboardStartDate && ['waiting', 'called'].includes(guest.status)
    );

    $('pendingWrap').innerHTML = pendingGuests.length
      ? `<div class="pending"><h3>⚠ ${pendingGuests.length} tugas tertunda dari hari sebelumnya</h3><p>Periksa tamu yang belum diselesaikan. Data tidak dihapus otomatis.</p>${pendingGuests.map(guest => `<div class="pending-guest-row"><span><b>${guest.ticket}</b> · ${esc(guest.name)}</span><button class="mini green" data-app-action="openDetail" data-app-id="${guest.id}">Periksa</button></div>`).join('')}</div>`
      : '';

    renderDashboardReservations();

    $('dashboardList').innerHTML = waitingGuests.length
      ? waitingGuests
          .sort((a, b) => a.created - b.created)
          .map(guestCard)
          .join('')
      : `<div class="empty"><div class="empty-icon">✓</div><h3>Belum ada antrean aktif</h3><p>Tambahkan tamu baru untuk mulai mengelola antrean.</p></div>`;
  }

  if ($('page-waiting')?.classList.contains('active')) renderQueue();
  if ($('page-history')?.classList.contains('active')) renderHistory();
  if ($('page-reservations')?.classList.contains('active')) renderReservations();
}
function setFilter(f){activeFilter=f;document.querySelectorAll('#queueFilters .filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));renderQueue()}
function renderQueue(){
  if(!$('queueList'))return;
  const q=($('queueSearch')?.value||'').toLowerCase(),day=selectedOperationalDate;
  const matchesFilter=g=>activeFilter==='waiting'
  ? ['waiting','called'].includes(g.status)
  : g.status===activeFilter;
  const list=state.guests
  .filter(g=>{
    const reservation=reservationIdentity(g);
    const searchText=(g.name+' '+g.ticket+' '+(reservation?.code||'')).toLowerCase();
    return g.day===day&&matchesFilter(g)&&searchText.includes(q);
  })
  .sort((a,b)=>a.created-b.created);
  $('queueList').innerHTML=list.length
  ? list.map((g,i)=>guestCard(g,i)).join('')
  : `<div class="empty"><div class="empty-icon">⌕</div><h3>Tidak ada antrean</h3><p>Coba ubah filter atau kata pencarian.</p></div>`;
}

