/* =========================================================
    7. GUEST DETAIL, EDITING, AND EXPORT
    ========================================================= */
async function setGuestStatus(id,status){
  const guest=state.guests.find(item=>item.id===id);
  if(!guest||['done','cancelled'].includes(guest.status))return;
  const now=Date.now();
  const previous={status:guest.status,resolved:guest.resolved,seatedAt:guest.seatedAt,audit:guest.audit.slice()};
  guest.status=status;
  if(status==='seated'){guest.resolved=guest.resolved||now;guest.seatedAt=now}else if(status==='cancelled')guest.resolved=guest.resolved||now;
  const labels={called:'Dipanggil',seated:'Duduk',done:'Selesai',cancelled:'Dibatalkan'};
  guest.audit.push({at:now,label:labels[status]||status});
  if (await save() === false) {
    Object.assign(guest, previous);
    renderAll();
    return;
  }
  renderAll();
  if($('sheet').classList.contains('show'))openDetail(id);
  const messages={called:'Tamu dipanggil',seated:'Tamu sudah duduk',done:'Kunjungan ditandai selesai',cancelled:'Antrean dibatalkan'};
  toast(messages[status]||'Status tamu diperbarui');
}
async function callGuestWhatsApp(id){
  const guest=state.guests.find(item=>item.id===id);
  if(!guest)return;
  const digits=String(guest.phone||'').replace(/[^0-9]/g,'');
  let phone=digits;
  if(phone.startsWith('0'))phone='62'+phone.slice(1);
  else if(phone.startsWith('8'))phone='62'+phone;
  if(!/^[0-9]{8,15}$/.test(phone)){
  toast('Nomor WhatsApp belum diisi atau formatnya belum valid');
  return;
  }
  const isSeated = guest.status === 'seated';
  const message = isSeated
  ? 'Halo Kak '+guest.name+', reservasi '+(guest.reservationCode || '')+' sudah kami tempatkan. Terima kasih.'
  : 'Halo Kak '+guest.name+', nomor antrean '+guest.ticket+' sudah dipanggil. Mohon menuju area greeter kami. Terima kasih.';
  const waUrl='https://wa.me/'+phone+'?text='+encodeURIComponent(message);
  window.open(waUrl,'_blank','noopener,noreferrer');
  // Mengirim WhatsApp tidak boleh mengubah status tamu yang sudah duduk.
  if (guest.status === 'waiting') await setGuestStatus(id,'called');
}

function openDetail(id) {
  const guest = state.guests.find(item => item.id === id);
  if (!guest) return;

  sheetGuest = id;
  const canCancel = ['waiting', 'called'].includes(guest.status);
  const canFinish = guest.status === 'seated';
  const reservation = reservationIdentity(guest);
  const isReservation = Boolean(reservation);

  const ticketPanel = isReservation
    ? '<div class="detail-ticket reservation-detail-ticket"><small>KODE RESERVASI</small><strong>' +
      esc(reservation.code) + '</strong><small>' + fmtDate(guest.day) +
      '</small><span class="reservation-operational-number">Nomor operasional · ' +
      esc(guest.ticket) + '</span></div>'
    : '<div class="detail-ticket"><small>NOMOR ANTREAN</small><strong>' +
      esc(guest.ticket) + '</strong><small>' + fmtDate(guest.day) + '</small></div>';

  const tableCell = isReservation && reservation.table
    ? '<div class="detail-cell"><small>Meja</small><b>' + esc(reservation.table) + '</b></div>'
    : '';

  const whatsappButton = guest.phone
    ? '<button class="primary" data-app-action="callGuestWhatsApp" data-app-id="' + esc(guest.id) + '">Kirim WhatsApp</button>'
    : '';

  const cancelActions = canCancel
    ? '<div class="sheet-actions"><button class="secondary" data-app-action="setGuestStatus" data-app-id="' + esc(guest.id) + '" data-app-value="cancelled">Batalkan</button>' +
      '<button class="primary" data-app-action="setGuestStatus" data-app-id="' + esc(guest.id) + '" data-app-value="seated">Dudukkan tamu</button></div>'
    : '';

  const finishAction = canFinish
    ? '<div class="sheet-actions"><button class="primary" data-app-action="setGuestStatus" data-app-id="' + esc(guest.id) + '" data-app-value="done">Selesaikan kunjungan</button></div>'
    : '';

  const timeline = guest.audit.slice().reverse().map(item =>
    '<div class="timeline-item"><b>' + esc(item.label) + '</b><small>' +
    new Date(item.at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) +
    (item.detail ? ' · ' + esc(item.detail) : '') +
    (item.reason ? ' · Alasan: ' + esc(item.reason) : '') + '</small></div>'
  ).join('');

  openSheet(
    '<div class="sheet-head"><h2>Detail tamu</h2><button class="close" data-app-action="closeSheet">✕</button></div>' +
    ticketPanel +
    '<div class="detail-name">' + esc(guest.name) + '</div>' +
    '<div class="detail-grid">' +
      '<div class="detail-cell"><small>Jumlah pack</small><b>' + guest.pack + ' orang</b></div>' +
      '<div class="detail-cell"><small>Status</small><b>' + statusLabel(guest.status) + '</b></div>' +
      '<div class="detail-cell"><small>Waktu daftar</small><b>' + fmtTime(guest.created) + '</b></div>' +
      '<div class="detail-cell"><small>' + (guest.status === 'seated' ? 'Seating time' : 'Waiting time') + '</small><b>' +
      (guest.status === 'seated' ? '<span data-seating-countdown="' + esc(guest.id) + '">' + seatingCountdownText(guest) + '</span>' : duration(guest)) +
      '</b></div>' + tableCell +
      '<div class="detail-cell detail-cell-full"><small>WhatsApp</small><b>' +
      esc(guest.phone || 'Tidak diisi') + '</b></div></div>' +
    '<div class="sheet-actions"><button class="secondary" data-app-action="editGuest" data-app-id="' + esc(guest.id) + '">Koreksi data</button>' +
      whatsappButton + '</div>' + cancelActions + finishAction +
    '<div class="detail-history-heading">Riwayat perubahan</div>' +
    '<div class="timeline">' + timeline + '</div>'
  );
}
function editGuest(id) {
  const guest = state.guests.find(item => item.id === id);
  if (!guest) return;

  sheetGuest = id;
  openSheet(`<div class="sheet-head"><h2>Koreksi data tamu</h2><button class="close" data-app-action="openDetail" data-app-id="${id}">✕</button></div><form data-app-submit="saveEdit" data-app-id="${id}"><div class="field"><label>Nama tamu *</label><input id="editName" required value="${esc(guest.name)}"></div><div class="field"><label>Jumlah pack *</label><input id="editPack" type="number" min="1" max="30" required value="${guest.pack}"></div><div class="field"><label>WhatsApp</label><input id="editPhone" value="${esc(guest.phone)}"></div><div class="field"><label>Alasan koreksi *</label><textarea id="editReason" required placeholder="Tuliskan alasan perubahan data..."></textarea></div><div class="sheet-actions"><button type="button" class="secondary" data-app-action="openDetail" data-app-id="${id}">Kembali</button><button class="primary">Simpan koreksi</button></div></form>`);
}

async function saveEdit(event, id) {
  event.preventDefault();

  const guest = state.guests.find(item => item.id === id);
  const now = Date.now();

  guest.audit.push({
    at: now,
    label: 'Dikoreksi',
    detail: `Nama: ${guest.name} → ${$('editName').value}; Pack: ${guest.pack} → ${$('editPack').value}`,
    reason: $('editReason').value.trim(),
    status: guest.status
  });

  guest.name = $('editName').value.trim();
  guest.pack = Number($('editPack').value);
  guest.phone = $('editPhone').value.trim();

  try {
    await window.GuestOpsService.appendGuestAudit(id, guest.audit[guest.audit.length - 1]);
    if (await save() === false) throw new Error('Database menolak penyimpanan');
    renderAll();
    openDetail(id);
    toast('Koreksi berhasil disimpan');
  } catch (error) {
    console.error(error);
    toast('Koreksi belum berhasil disimpan ke database');
  }
}

// Protect text cells from spreadsheet formula interpretation during export only.
function sanitizeCSVText(value) {
  const text = String(value ?? '');
  const normalized = text.normalize('NFKC');
  const startsWithFormula = /^[\s\u0000-\u001F\u007F-\u009F]*[=+\-@]/u.test(normalized);
  const startsWithControl = /^[\s]*[\u0000-\u001F\u007F-\u009F]/u.test(text);

  return startsWithFormula || startsWithControl ? "'" + text : text;
}

function serializeCSVRows(rows, textColumns = []) {
  return rows
    .map((row, rowIndex) => row.map((value, columnIndex) => {
      let safeValue = typeof value === 'string' ? sanitizeCSVText(value) : String(value ?? '');
      if (rowIndex > 0 && textColumns.includes(columnIndex) && safeValue !== '' && !safeValue.startsWith("'")) {
        safeValue = "'" + safeValue;
      }
      return '"' + safeValue.replace(/"/g, '""') + '"';
    }).join(','))
    .join('\n');
}

function exportCSV() {
  const rows = [
    ['Tanggal', 'Nomor antrean', 'Nama', 'Pack', 'WhatsApp', 'Status', 'Waktu daftar', 'Waiting time'],
    ...state.guests
      .filter(guest => guest.day === todayKey())
      .map(guest => [
        guest.day,
        guest.ticket,
        guest.name,
        guest.pack,
        guest.phone,
        statusLabel(guest.status),
        fmtTime(guest.created),
        duration(guest)
      ])
  ];

  const csv = serializeCSVRows(rows, [4]);

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'waiting-list-' + todayKey() + '.csv';
  link.click();
  URL.revokeObjectURL(link.href);

  toast('File CSV berhasil dibuat');
}

