/* =========================================================
    5. OPERATIONAL DETAIL MODAL — DASHBOARD DRILL-DOWN
    ========================================================= */
let operationalChartMode = 'hour';
let operationalStatusFilter = 'all';

function shiftDateKey(value, offset) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
}
function operationalAverageWait(guests) {
  const resolved = guests.filter(guest => guest.resolved);
  if (!resolved.length) return '—';
  const average = resolved.reduce((total, guest) => total + guest.resolved - guest.created, 0) / resolved.length;
  return fmtElapsed(average);
}
function openOperationalDetail() {
  operationalChartMode = 'hour';
  operationalStatusFilter = 'all';
  $('sheet').classList.add('operational-modal');
  renderOperationalDetail();
  $('sheet').style.transform = '';
  $('backdrop').classList.add('show');
  $('sheet').classList.add('show');
  document.body.style.overflow = 'hidden';
  initSheetDrag();
}
function renderOperationalDetail() {
  const day = selectedOperationalDate;
  const guests = state.guests.filter(guest => guest.day === day && guest.status !== 'missed').sort((a, b) => b.created - a.created);
  const yesterday = state.guests.filter(guest => guest.day === shiftDateKey(day, -1) && guest.status !== 'missed');
  const total = guests.length;
  const difference = total - yesterday.length;
  const trend = yesterday.length ? (difference > 0 ? '+' : '') + Math.round((difference / yesterday.length) * 100) + '%' : (total ? 'Data awal' : '0%');
  const trendCopy = yesterday.length ? 'vs kemarin (' + yesterday.length + ')' : 'belum ada data kemarin';
  const packTotal = guests.reduce((sum, guest) => sum + Number(guest.pack || 0), 0);
  const averageWait = operationalAverageWait(guests);
  const seatedTotal = guests.filter(guest => ['seated', 'done'].includes(guest.status)).length;
  const dateLabel = fmtDate(day);
  const html = [
    '<div class="operational-head"><div><h2>Detail Operasional</h2><p>Hari ini · ' + esc(dateLabel) + '</p></div><button class="close operational-close" type="button" data-app-action="closeSheet" aria-label="Tutup detail">×</button></div>',
    '<section class="operational-summary"><div class="operational-summary-main"><span>Total tamu</span><strong>' + total + '</strong><small class="' + (difference >= 0 ? 'trend-up' : 'trend-down') + '">' + (difference > 0 ? '↑ ' : difference < 0 ? '↓ ' : '') + esc(trend) + '<span>' + esc(trendCopy) + '</span></small></div>',
    '<div class="operational-summary-meta"><div><span class="summary-icon">♧</span><span>Total pack</span><b>' + packTotal + '</b></div><div><span class="summary-icon">◷</span><span>Rata-rata tunggu</span><b>' + esc(averageWait) + '</b></div><div><span class="summary-icon">✓</span><span>Tamu sudah duduk</span><b>' + seatedTotal + '</b></div></div></section>',
    '<section class="operational-chart-card"><div class="operational-section-head"><h3>Tren kunjungan</h3><div class="chart-toggle" role="group" aria-label="Mode grafik"><button type="button" class="' + (operationalChartMode === 'hour' ? 'active' : '') + '" data-app-action="setOperationalChartMode" data-app-value="hour">Jam</button><button type="button" class="' + (operationalChartMode === 'pack' ? 'active' : '') + '" data-app-action="setOperationalChartMode" data-app-value="pack">Pack</button></div></div><div id="operationalChart" class="operational-chart"></div></section>',
    '<section class="operational-guests"><div class="operational-section-head operational-list-head"><div><h3>Daftar tamu hari ini</h3><small>' + total + ' tamu terdaftar</small></div><span class="operational-list-total">' + total + '</span></div>',
    '<div class="operational-list-tools"><label class="operational-search"><span>⌕</span><input id="operationalSearch" type="search" placeholder="Cari nama atau nomor antrean..." data-app-input-action="renderOperationalGuestList"></label><div class="operational-filter-wrap"><button type="button" id="operationalFilterTrigger" class="operational-filter-trigger" aria-haspopup="listbox" aria-expanded="false" data-app-action="toggleOperationalFilterMenu"><span id="operationalFilterLabel">Semua</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button><div id="operationalFilterMenu" class="operational-filter-menu" role="listbox" aria-label="Filter status tamu" hidden><button type="button" role="option" aria-selected="true" data-filter="all" data-app-action="setOperationalStatusFilter" data-app-value="all">Semua</button><button type="button" role="option" aria-selected="false" data-filter="waiting" data-app-action="setOperationalStatusFilter" data-app-value="waiting">Menunggu</button><button type="button" role="option" aria-selected="false" data-filter="called" data-app-action="setOperationalStatusFilter" data-app-value="called">Dipanggil</button><button type="button" role="option" aria-selected="false" data-filter="seated" data-app-action="setOperationalStatusFilter" data-app-value="seated">Duduk</button><button type="button" role="option" aria-selected="false" data-filter="done" data-app-action="setOperationalStatusFilter" data-app-value="done">Selesai</button><button type="button" role="option" aria-selected="false" data-filter="cancelled" data-app-action="setOperationalStatusFilter" data-app-value="cancelled">Batal</button></div></div></div>',
    '<div id="operationalGuestList" class="operational-guest-list"></div></section>',
    '<button class="operational-all-button" type="button" data-app-action="closeSheetThenGoWaiting">Lihat semua tamu (' + total + ') <span>→</span></button>'
  ].join('');
  $('sheetContent').innerHTML = html;
  renderOperationalChart(guests);
  renderOperationalGuestList();
}
function setOperationalChartMode(mode) {
  operationalChartMode = mode;
  const guests = state.guests.filter(guest => guest.day === todayKey() && guest.status !== 'missed');
  document.querySelectorAll('.chart-toggle button').forEach(button => button.classList.toggle('active', button.textContent.trim().toLowerCase() === (mode === 'hour' ? 'jam' : 'pack')));
  renderOperationalChart(guests);
}
function renderOperationalChart(guests) {
  const chart = $('operationalChart');
  if (!chart) return;
  const latestHour = guests.length ? new Date(Math.max(...guests.map(guest => guest.created))).getHours() : Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const firstHour = Math.max(0, latestHour - 5);
  const slots = Array.from({ length: 6 }, (_, index) => {
    const hour = firstHour + index;
    const inSlot = guests.filter(guest => new Date(guest.created).getHours() === hour);
    return { hour, value: operationalChartMode === 'pack' ? inSlot.reduce((sum, guest) => sum + Number(guest.pack || 0), 0) : inSlot.length };
  });
  const max = Math.max(1, ...slots.map(slot => slot.value));
  chart.innerHTML = slots.map(slot => {
    const height = slot.value ? Math.max(9, Math.round((slot.value / max) * 100)) : 3;
    return '<div class="operational-bar-column"><b>' + slot.value + '</b><div class="operational-bar-track"><i data-bar-height="' + height + '"></i></div><small>' + String(slot.hour).padStart(2, '0') + '.00</small></div>';
  }).join('');
  chart.querySelectorAll('[data-bar-height]').forEach(bar => {
    bar.style.height = Number(bar.dataset.barHeight) + '%';
  });
}
function operationalGuestRow(guest) {
  const status = statusLabel(guest.status);
  const time = ['waiting', 'called'].includes(guest.status)
    ? duration(guest)
    : fmtTime(guest.resolved || guest.created);
  const reservation = reservationIdentity(guest);
  const ticket = reservation
    ? '<span class="operational-ticket reservation-operational-ticket"><strong>' + esc(reservation.code) + '</strong><small>' + esc(guest.ticket) + '</small></span>'
    : '<span class="operational-ticket">' + esc(guest.ticket) + '</span>';

  return '<button type="button" class="operational-guest-row" data-app-action="closeSheetThenOpenDetail" data-app-id="' + esc(guest.id) + '">' +
    ticket + '<span class="operational-guest-copy"><b>' + esc(guest.name) + '</b><small>' +
    guest.pack + ' orang · ' + fmtTime(guest.created) + '</small></span>' +
    '<span class="operational-guest-state"><i class="status ' + statusClass(guest.status) + '">' +
    esc(status) + '</i><small>' + esc(time) + '</small></span><span class="operational-chevron">›</span></button>';
}
function toggleOperationalFilterMenu() {
  const menu = $('operationalFilterMenu');
  const trigger = $('operationalFilterTrigger');
  if (!menu || !trigger) return;
  const open = menu.hidden;
  menu.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
}
function closeOperationalFilterMenu() {
  const menu = $('operationalFilterMenu');
  const trigger = $('operationalFilterTrigger');
  if (menu) menu.hidden = true;
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}
function setOperationalStatusFilter(value) {
  operationalStatusFilter = value;
  const labels = { all: 'Semua', waiting: 'Menunggu', called: 'Dipanggil', seated: 'Duduk', done: 'Selesai', cancelled: 'Batal' };
  const label = $('operationalFilterLabel');
  if (label) label.textContent = labels[value] || 'Semua';
  document.querySelectorAll('#operationalFilterMenu [data-filter]').forEach(option => {
    const selected = option.dataset.filter === value;
    option.setAttribute('aria-selected', String(selected));
  });
  closeOperationalFilterMenu();
  renderOperationalGuestList();
}
function renderOperationalGuestList() {
  const element = $('operationalGuestList');
  if (!element) return;
  const query = ($('operationalSearch')?.value || '').trim().toLowerCase();
  const guests = state.guests.filter(guest => guest.day === todayKey() && guest.status !== 'missed')
    .filter(guest => operationalStatusFilter === 'all' || guest.status === operationalStatusFilter)
    .filter(guest => {
      const reservation = reservationIdentity(guest);
      return (guest.name + ' ' + guest.ticket + ' ' + (reservation?.code || '')).toLowerCase().includes(query);
    })
    .sort((a, b) => b.created - a.created);
  element.innerHTML = guests.length ? guests.map(operationalGuestRow).join('') : '<div class="operational-empty">Tidak ada tamu yang cocok dengan pencarian atau filter ini.</div>';
}



/* Monthly guest trend on the desktop dashboard. */
let dashboardTrendMode = 'pack';

function setDashboardTrendMode(mode) {
  if (!['pack', 'names'].includes(mode)) return;
  dashboardTrendMode = mode;
  document.querySelectorAll('.dashboard-trend-toggle button').forEach(button => {
    const active = button.dataset.appValue === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderDashboardTrend();
}

function renderDashboardTrend() {
  const chart = $('dashboardTrendChart');
  if (!chart) return;

  const monthKey = typeof reservationMonth === 'string' ? reservationMonth : todayKey().slice(0, 7);
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const guests = state.guests.filter(guest =>
    typeof guest.day === 'string' &&
    guest.day.startsWith(monthKey) &&
    guest.status !== 'missed'
  );
  const totals = Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    const dailyGuests = guests.filter(guest => guest.day === monthKey + '-' + day);
    return {
      day: index + 1,
      value: dashboardTrendMode === 'pack'
        ? dailyGuests.reduce((sum, guest) => sum + Number(guest.pack || 0), 0)
        : dailyGuests.length
    };
  });
  const max = Math.max(1, ...totals.map(item => item.value));
  const label = $('dashboardTrendMonthLabel');
  if (label) {
    label.textContent = new Intl.DateTimeFormat('id-ID', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }

  chart.innerHTML = totals.map(item => {
    const height = item.value ? Math.max(2, Math.round((item.value / max) * 100)) : 0;
    const dateLabel = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(Date.UTC(year, month - 1, item.day)));
    const metricLabel = dashboardTrendMode === 'pack' ? 'pack' : 'nama';
    const detailLabel = dateLabel + ' · ' + item.value + ' ' + metricLabel;
    return '<div class="dashboard-trend-column" tabindex="0" role="img" aria-label="' + detailLabel + '" title="' + detailLabel + '">' +
      '<b class="dashboard-trend-value">' + item.value + '</b>' +
      '<div class="dashboard-trend-track"><i class="dashboard-trend-bar" style="height:' + height + '%"></i></div>' +
      '<small class="dashboard-trend-day">' + item.day + '</small>' +
    '</div>';
  }).join('');
}
