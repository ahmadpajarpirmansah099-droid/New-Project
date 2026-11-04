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
  const label = $('historyDateLabel');
  if (label && $('historyDate').value) label.textContent = historyDateLabel($('historyDate').value);
}
function openHistoryDatePicker() {
  const current = selectedOperationalDate || todayKey();
  historyCalendarDraft = current;
  const date = parseHistoryDate(current);
  historyCalendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  renderHistoryCalendar();
  $('calendarBackdrop').classList.add('show');
  $('historyCalendarDialog').classList.add('show');
  document.body.style.overflow = 'hidden';
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
  $('historyDate').value = selectedOperationalDate;
  updateHistoryDateLabel();
  updateOperationalDateLabels();
  renderAll();
  closeHistoryDatePicker();
}

function updateOperationalDateLabels() {
  const label = historyDateLabel(selectedOperationalDate, { day: 'numeric', month: 'long', year: 'numeric' });
  const dashboard = $('dashboardDateLabel');
  const queue = $('queueDateLabel');
  const history = $('historyDateLabel');
  if (dashboard) dashboard.textContent = label;
  if (queue) queue.textContent = label;
  if (history) history.textContent = label;
  const hidden = $('historyDate');
  if (hidden) hidden.value = selectedOperationalDate;
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

  const selectedDay = selectedOperationalDate;
  const query = ($('historySearch')?.value || '').toLowerCase();
  const guests = state.guests
    .filter(guest => guest.day === selectedDay && guest.name.toLowerCase().includes(query))
    .sort((a, b) => b.created - a.created);

  $('historyList').innerHTML = guests.length
    ? guests.map((guest, index) => guestCard(guest, index, true)).join('')
    : `<div class="empty"><div class="empty-icon">◷</div><h3>Belum ada riwayat</h3><p>Tidak ada tamu pada tanggal yang dipilih.</p></div>`;
}

