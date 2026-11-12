/* =========================================================
    6. HISTORY DATE FILTER AND HISTORY LIST
    ========================================================= */
let historyCalendarMonth = null;
let historyCalendarDraft = '';

function parseHistoryDate(value) {
  const parts = String(value || todayKey()).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
function historyDateKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function historyDateLabel(value, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Intl.DateTimeFormat('id-ID', options).format(parseHistoryDate(value));
}
function updateHistoryDateLabel() {
  updateOperationalDateLabels();
}
function openHistoryDatePicker() {
  const trigger = document.activeElement?.closest('[data-dashboard-date="operational"]') ||
    document.querySelector('#page-waiting [data-dashboard-date="operational"], #page-history [data-dashboard-date="operational"]');
  if (trigger) openDashboardRangePicker(trigger);
}
function closeHistoryDatePicker() {
  $('calendarBackdrop').classList.remove('show');
  $('historyCalendarDialog').classList.remove('show');
  document.body.style.overflow = '';
}
function changeHistoryCalendarMonth(delta) {
  historyCalendarMonth = new Date(historyCalendarMonth.getFullYear(), historyCalendarMonth.getMonth() + delta, 1);
  renderHistoryCalendar();
}
function selectHistoryCalendarDate(value) {
  historyCalendarDraft = value;
  renderHistoryCalendar();
}
function selectTodayInHistoryCalendar() {
  historyCalendarDraft = todayKey();
  const date = parseHistoryDate(historyCalendarDraft);
  historyCalendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  renderHistoryCalendar();
}
function applyHistoryCalendarDate() {
  selectedOperationalDate = historyCalendarDraft;
  selectedOperationalStartDate = historyCalendarDraft;
  selectedOperationalEndDate = historyCalendarDraft;
  $('historyDate').value = selectedOperationalDate;
  updateHistoryDateLabel();
  updateOperationalDateLabels();
  renderAll();
  closeHistoryDatePicker();
}

function updateOperationalDateLabels() {
  const start = selectedOperationalStartDate || selectedOperationalDate || todayKey();
  const end = selectedOperationalEndDate || selectedOperationalDate || todayKey();
  const label = start === end ? dashboardDateText(start) : dashboardDateText(start) + ' – ' + dashboardDateText(end);
  const dashboard = $('dashboardDateLabel');
  const queue = $('queueDateLabel');
  const history = $('historyDateLabel');
  if (dashboard) dashboard.textContent = label;
  if (queue) queue.textContent = label;
  if (history) history.textContent = label;
  const hidden = $('historyDate');
  if (hidden) hidden.value = end;
}
function renderHistoryCalendar() {
  const year = historyCalendarMonth.getFullYear();
  const month = historyCalendarMonth.getMonth();
  $('calendarMonthLabel').textContent = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(historyCalendarMonth);
  $('calendarSelectedLabel').textContent = historyDateLabel(historyCalendarDraft);
  const firstDayOffset = new Date(year, month, 1).getDay();
  const today = todayKey();
  let days = '';
  for (let i = 0; i < 42; i++) {
    const date = new Date(year, month, 1 - firstDayOffset + i);
    const key = historyDateKey(date);
    const classes = ['calendar-day'];
    if (date.getMonth() !== month) classes.push('outside');
    if (key === today) classes.push('today');
    if (key === historyCalendarDraft) classes.push('selected');
    days += '<button type="button" class="' + classes.join(' ') + '" data-app-action="selectHistoryCalendarDate" data-app-date="' + key + '" aria-label="' + historyDateLabel(key) + '" aria-pressed="' + (key === historyCalendarDraft) + '">' + date.getDate() + '</button>';
  }
  $('historyCalendarDays').innerHTML = days;
}

function renderHistory() {
  if (!$('historyList')) return;

  const start = selectedOperationalStartDate;
  const end = selectedOperationalEndDate;
  const query = ($('historySearch')?.value || '').toLowerCase();
  const guests = state.guests
    .filter(guest => guest.day >= start && guest.day <= end && guest.name.toLowerCase().includes(query))
    .sort((a, b) => b.created - a.created);

  $('historyList').innerHTML = guests.length
    ? guests.map((guest, index) => guestCard(guest, index, true)).join('')
    : `<div class="empty"><div class="empty-icon">◷</div><h3>Belum ada riwayat</h3><p>Tidak ada tamu pada rentang tanggal yang dipilih.</p></div>`;
}

