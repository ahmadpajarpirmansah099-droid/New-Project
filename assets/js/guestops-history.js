/* =========================================================
    6. HISTORY DATE FILTER AND HISTORY LIST
    ========================================================= */
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

