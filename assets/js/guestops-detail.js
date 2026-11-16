/* =========================================================
    7. GUEST DETAIL, EDITING, AND EXPORT
    ========================================================= */
async function setGuestStatus(id,status,tableLabel=''){
  const guest=state.guests.find(item=>item.id===id);
  if(!guest||['done','cancelled'].includes(guest.status))return;
  const normalizedTable=String(tableLabel||'').trim();
  if(status==='seated'&&!normalizedTable){toast('Nomor meja wajib diisi sebelum mendudukkan tamu');return;}
  const now=Date.now();
  const previous={status:guest.status,resolved:guest.resolved,seatedAt:guest.seatedAt,tableLabel:guest.tableLabel,audit:guest.audit.slice()};
  guest.status=status;
  if(status==='seated'){guest.resolved=guest.resolved||now;guest.seatedAt=now;guest.tableLabel=normalizedTable}else if(status==='cancelled')guest.resolved=guest.resolved||now;
  const labels={called:'Dipanggil',seated:'Duduk',done:'Selesai',cancelled:'Dibatalkan'};
  guest.audit.push({at:now,label:labels[status]||status,detail:status==='seated'?'Meja '+normalizedTable:''});
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
  : 'Hallo kak '+guest.name+', saat ini nomor antrian '+guest.ticket+' tinggal menunggu 1 antrian lagi.\nMohon kesediannya untuk menunggu di area greeter kami agar mempermudah ketika kami panggil nama kakanya. Terima kasih.';
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

  const tableLabel = guest.tableLabel || (isReservation ? reservation.table : '');
  const tableCell = tableLabel
    ? '<div class="detail-cell"><small>Meja</small><b>' + esc(tableLabel) + '</b></div>'
    : '';
  const smokingLabel = guest.smoking === true ? 'Smoking' : guest.smoking === false ? 'Non Smoking' : 'Belum diisi';
  const smokingCell = '<div class="detail-cell"><small>Area merokok</small><b>' + smokingLabel + '</b></div>';

  const whatsappButton = guest.phone
    ? '<button class="primary" data-app-action="callGuestWhatsApp" data-app-id="' + esc(guest.id) + '">Kirim WhatsApp</button>'
    : '';

  const cancelActions = canCancel
    ? '<div class="sheet-actions"><button class="secondary" data-app-action="setGuestStatus" data-app-id="' + esc(guest.id) + '" data-app-value="cancelled">Batalkan</button>' +
      '<button class="primary" data-app-action="confirmGuestStatus" data-app-id="' + esc(guest.id) + '" data-app-value="seated">Dudukkan tamu</button></div>'
    : '';

  const finishAction = canFinish
    ? '<div class="sheet-actions"><button class="primary" data-app-action="confirmGuestStatus" data-app-id="' + esc(guest.id) + '" data-app-value="done">Selesaikan kunjungan</button></div>'
    : '';

  const timeline = renderGuestAuditTimeline(guest.audit || []);

  openSheet(
    '<div class="sheet-head"><h2>Detail tamu</h2><button class="close" data-app-action="closeSheet" aria-label="Tutup detail tamu">✕</button></div>' +
    ticketPanel +
    '<div class="detail-name">' + esc(guest.name) + '</div>' +
    '<div class="detail-grid">' +
      '<div class="detail-cell"><small>Jumlah pack</small><b>' + guest.pack + ' orang</b></div>' +
      '<div class="detail-cell"><small>Status</small><b>' + statusLabel(guest.status) + '</b></div>' +
      smokingCell +
      '<div class="detail-cell"><small>Waktu daftar</small><b>' + fmtTime(guest.created) + '</b></div>' +
      '<div class="detail-cell"><small>' + (guest.status === 'seated' ? 'Seating time' : 'Waiting time') + '</small><b>' +
      (guest.status === 'seated' ? '<span data-seating-countdown="' + esc(guest.id) + '">' + seatingCountdownText(guest) + '</span>' : duration(guest)) +
      '</b></div>' + tableCell +
      '<div class="detail-cell"><small>WhatsApp</small><b>' +
      esc(guest.phone || 'Tidak diisi') + '</b></div>' +
      (canFinish ? '<button type="button" class="primary detail-move-table" data-app-action="moveGuestTable" data-app-id="' + esc(guest.id) + '">Pindah Meja</button>' : '') +
    '</div>' +
    '<div class="sheet-actions"><button class="secondary" data-app-action="editGuest" data-app-id="' + esc(guest.id) + '">Koreksi data</button>' +
      whatsappButton + '</div>' + cancelActions + finishAction +
    '<div class="detail-history-heading">Riwayat perubahan</div>' +
    '<div class="timeline" id="guestDetailTimeline">' + (timeline || '<div class="timeline-loading">Memuat riwayat...</div>') + '</div>'
  );

  if (window.GuestOpsService?.loadGuestAudit) {
    window.GuestOpsService.loadGuestAudit(id).then(audit => {
      if (sheetGuest !== id || !$('sheet').classList.contains('show')) return;
      guest.audit = audit;
      const timelineElement = $('guestDetailTimeline');
      if (timelineElement) timelineElement.innerHTML = renderGuestAuditTimeline(audit);
    }).catch(error => {
      console.error('Guest audit history failed to load:', error);
      if (sheetGuest !== id || !$('sheet').classList.contains('show')) return;
      const timelineElement = $('guestDetailTimeline');
      if (timelineElement) timelineElement.textContent = 'Riwayat belum dapat dimuat.';
    });
  }
}


async function moveGuestTable(id) {
  const guest = state.guests.find(item => item.id === id);
  if (!guest || guest.status !== 'seated') return;

  const existing = document.getElementById('guestMoveTableDialog');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'guestMoveTableDialog';
  backdrop.className = 'guest-confirm-backdrop';
  backdrop.innerHTML =
    '<section class="guest-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="guestMoveTableTitle">' +
      '<h2 id="guestMoveTableTitle">Pindah Meja</h2>' +
      '<p>Meja saat ini: ' + esc(guest.tableLabel || 'Belum ditentukan') + '</p>' +
      '<div class="guest-confirm-field"><label for="guestNewTableLabel">Nomor meja baru *</label>' +
      '<input id="guestNewTableLabel" type="text" maxlength="30" autocomplete="off" placeholder="Masukkan nomor meja baru" required></div>' +
      '<div class="guest-confirm-actions"><button type="button" class="guest-confirm-cancel">Kembali</button>' +
      '<button type="button" class="guest-confirm-accept" disabled>Simpan pindah meja</button></div>' +
    '</section>';

  document.body.appendChild(backdrop);
  const input = backdrop.querySelector('#guestNewTableLabel');
  const accept = backdrop.querySelector('.guest-confirm-accept');
  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    backdrop.remove();
  };
  const onKeydown = event => {
    if (event.key === 'Escape') close();
  };
  backdrop.querySelector('.guest-confirm-cancel').addEventListener('click', close);
  input.addEventListener('input', () => {
    accept.disabled = !input.value.trim() || input.value.trim() === String(guest.tableLabel || '').trim();
  });
  accept.addEventListener('click', async () => {
    const nextTable = input.value.trim();
    if (!nextTable || nextTable === String(guest.tableLabel || '').trim()) {
      input.focus();
      return;
    }
    const previousTable = guest.tableLabel;
    guest.tableLabel = nextTable;
    accept.disabled = true;
    try {
      if (await save() === false) {
        guest.tableLabel = previousTable;
        renderAll();
        return;
      }
      close();
      renderAll();
      openDetail(id);
      toast('Meja berhasil dipindahkan');
    } catch (error) {
      guest.tableLabel = previousTable;
      renderAll();
      console.error(error);
      toast('Pindah meja belum berhasil disimpan');
    }
  });
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKeydown);
  input.focus();
}
window.moveGuestTable = moveGuestTable;

function renderGuestAuditTimeline(audit) {
  return (audit || []).slice().reverse().map(item =>
    '<div class="timeline-item"><b>' + esc(item.label) + '</b><small>' +
    new Date(item.at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) +
    (item.detail ? ' · ' + esc(item.detail) : '') +
    (item.reason ? ' · Alasan: ' + esc(item.reason) : '') + '</small></div>'
  ).join('') || '<div class="timeline-empty">Belum ada riwayat perubahan.</div>';
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
  guest.name = $('editName').value.trim();
  guest.pack = Number($('editPack').value);
  guest.phone = $('editPhone').value.trim();

  try {
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
      .filter(guest => guest.day === todayKey() && guest.status !== 'missed')
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

/* =========================================================
   GUEST STATUS CONFIRMATION
   Confirm seated/done actions before changing guest status.
   ========================================================= */
function confirmGuestStatus(id, status) {
  const guest = state.guests.find(item => item.id === id);
  if (!guest) return;

  const isSeated = status === 'seated';
  const title = isSeated ? 'Dudukkan tamu?' : 'Selesaikan kunjungan?';
  const message = isSeated
    ? 'Isi nomor meja secara manual untuk melanjutkan.'
    : 'Yakin ingin menyelesaikan kunjungan ' + guest.name + '?';
  const confirmLabel = isSeated ? 'Ya, dudukkan' : 'Ya, selesaikan';

  const existing = document.getElementById('guestStatusConfirm');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'guestStatusConfirm';
  backdrop.className = 'guest-confirm-backdrop';
  backdrop.innerHTML =
    '<section class="guest-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="guestConfirmTitle" aria-describedby="guestConfirmMessage">' +
      '<h2 id="guestConfirmTitle"></h2>' +
      '<p id="guestConfirmMessage"></p>' +
      (isSeated ? '<div class="guest-confirm-field"><label for="guestTableLabel">Nomor meja *</label><input id="guestTableLabel" type="text" maxlength="30" autocomplete="off" placeholder="Masukkan nomor meja" required></div>' : '') +
      '<div class="guest-confirm-actions">' +
        '<button type="button" class="guest-confirm-cancel">Kembali</button>' +
        '<button type="button" class="guest-confirm-accept"></button>' +
      '</div>' +
    '</section>';

  document.body.appendChild(backdrop);
  backdrop.querySelector('#guestConfirmTitle').textContent = title;
  backdrop.querySelector('#guestConfirmMessage').textContent = message;
  const acceptButton = backdrop.querySelector('.guest-confirm-accept');
  acceptButton.textContent = confirmLabel;
  const tableInput = backdrop.querySelector('#guestTableLabel');
  if (tableInput) acceptButton.disabled = true;

  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    backdrop.remove();
  };
  const onKeydown = event => {
    if (event.key === 'Escape') close();
  };

  backdrop.querySelector('.guest-confirm-cancel').addEventListener('click', close);
  if (tableInput) tableInput.addEventListener('input', () => {
    acceptButton.disabled = !tableInput.value.trim();
  });
  acceptButton.addEventListener('click', async () => {
    const tableLabel = tableInput ? tableInput.value.trim() : '';
    if (isSeated && !tableLabel) { tableInput?.focus(); return; }
    close();
    await setGuestStatus(id, status, tableLabel);
  });
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKeydown);
  if (window.lucide?.createIcons) window.lucide.createIcons();
  (tableInput || backdrop.querySelector('.guest-confirm-cancel')).focus();
}
