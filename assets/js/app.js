const $=id=>document.getElementById(id);
const todayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fmtTime=t=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}).format(new Date(t));
const fmtDate=d=>new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(d+'T00:00:00Z'));
const fmtElapsed=ms=>{let m=Math.max(0,Math.floor(ms/60000));return m<60?m+' menit':Math.floor(m/60)+'j '+m%60+'m'};
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const key='waitlist_frontend_demo_v1';
let state = loadState();
let activeFilter = 'all';
let sheetGuest = null;
let toastTimer;
let pageTimer = null;
let pageMotionToken = 0;
const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
function loadState(){try{let s=JSON.parse(localStorage.getItem(key));if(s&&Array.isArray(s.guests)&&s.counters)return s}catch(e){}return seed()}
function seed(){let d=todayKey(),y=new Date(Date.now()-86400000);let yd=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(y),now=Date.now();let gs=[
['WL-001','Rina Kusuma',2,'0812-xxxx-1043','done',142,118],['WL-002','Budi Santoso',4,'0813-xxxx-7720','done',128,96],['WL-003','Dewi Lestari',3,'','cancelled',110,90],['WL-004','Andika Pratama',2,'0857-xxxx-3381','done',92,70],['WL-005','Sari Wulandari',6,'0821-xxxx-5590','waiting',48],['WL-006','Fajar Nugroho',2,'0878-xxxx-2214','called',36],['WL-007','Maya Anggraini',5,'','waiting',27],['WL-009','Hendra Wijaya',3,'0812-xxxx-9907','cancelled',22,15],['WL-010','Putri Ramadhani',2,'0896-xxxx-4412','waiting',14],['WL-011','Yoga Saputra',8,'0815-xxxx-6630','waiting',6]
].map(([ticket,name,pack,phone,status,ago,res])=>({id:uid(),ticket,day:d,name,pack,phone,status,created:now-ago*60000,resolved:res?now-res*60000:null,audit:[{at:now-ago*60000,label:'Terdaftar',detail:pack+' pack'}]}));
gs.forEach(g=>{if(g.status!=='waiting'&&g.status!=='called')g.audit.push({at:g.resolved,label:g.status==='done'?'Selesai / Sudah Duduk':'Dibatalkan'})});
let prev=[['WL-001','Agus Salim',2,'done'],['WL-002','Lina Marlina',4,'done'],['WL-003','Rizky Firmansyah',3,'waiting'],['WL-004','Nadia Paramitha',2,'cancelled'],['WL-005','Teguh Prakoso',5,'waiting']].map(([ticket,name,pack,status],i)=>({id:uid(),ticket,day:yd,name,pack,phone:'',status,created:now-(24*60+300-i*40)*60000,resolved:status==='waiting'?null:now-(24*60+275-i*40)*60000,audit:[{at:now-86400000,label:'Terdaftar'}]}));
return{guests:[...prev,...gs],counters:{[d]:11,[yd]:5}}}
function save(){localStorage.setItem(key,JSON.stringify(state))}
function nextTicket(day){let n=(state.counters[day]||0)+1;state.counters[day]=n;return'WL-'+String(n).padStart(3,'0')}
function toast(msg){let t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2300)}
function go(page) {
  const nextPage = $('page-' + page);
  const currentPage = document.querySelector('.page.active');

  if (!nextPage || currentPage === nextPage) return;

  pageMotionToken += 1;
  const token = pageMotionToken;
  clearTimeout(pageTimer);

  document.querySelectorAll('.page.is-leaving').forEach(item => {
    item.classList.remove('is-leaving');
  });

  document.querySelectorAll('.navitem').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  $('fab').style.display = page === 'settings' ? 'none' : 'grid';

  if (prefersReducedMotion() || !currentPage) {
    document.querySelectorAll('.page').forEach(item => {
      item.classList.remove('active', 'is-leaving');
    });
    nextPage.classList.add('active');
    renderAll();
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }

  currentPage.classList.remove('active');
  currentPage.classList.add('is-leaving');
  nextPage.classList.add('active');

  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  pageTimer = window.setTimeout(() => {
    if (token !== pageMotionToken) return;
    currentPage.classList.remove('is-leaving');
  }, 320);
}
function openSheet(content) {
  $('sheetContent').innerHTML = content;
  $('backdrop').classList.add('show');
  document.body.style.overflow = 'hidden';

  if (prefersReducedMotion()) {
    $('sheet').classList.add('show');
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => $('sheet').classList.add('show'));
  });
}
function closeSheet() {
  $('backdrop').classList.remove('show');
  $('sheet').classList.remove('show');
  document.body.style.overflow = '';
  sheetGuest = null;
}
function openAdd() {
  sheetGuest = null;
  openSheet(`<div class="sheet-head"><h2>Tambah tamu</h2><button class="close" onclick="closeSheet()">✕</button></div>
  <form id="addGuestForm" onsubmit="saveGuest(event)">
    <div class="field"><label for="guestName">Nama tamu *</label><input id="guestName" required maxlength="70" placeholder="Masukkan nama tamu" autocomplete="name"></div>
    <div class="field"><label>Jumlah pack *</label><div class="pack-control"><button type="button" aria-label="Kurangi pack" onclick="changePack(-1)">−</button><strong id="packValue" aria-live="polite">2</strong><button type="button" aria-label="Tambah pack" onclick="changePack(1)">+</button></div><input type="hidden" id="guestPack" value="2"></div>
    <div class="field"><label for="guestPhone">Nomor WhatsApp <span style="color:#9aa5b8;font-weight:500">(opsional)</span></label><input id="guestPhone" inputmode="tel" placeholder="08xxxxxxxxxx"></div>
    <div class="field"><label>Status awal</label><div class="seg"><button type="button" class="selected" id="segWait" onclick="chooseInitial('waiting')">Menunggu</button><button type="button" id="segDone" onclick="chooseInitial('done')">Langsung duduk</button></div><input type="hidden" id="initialStatus" value="waiting"></div>
    <div class="sheet-actions"><button type="button" class="secondary" onclick="closeSheet()">Batal</button><button type="submit" id="saveGuestButton" class="primary">Simpan tamu</button></div>
  </form>`);
  window.setTimeout(() => $('guestName')?.focus({ preventScroll: true }), prefersReducedMotion() ? 0 : 420);
}
function changePack(delta) {
  const value = Math.max(1, Math.min(30, Number($('guestPack').value) + delta));
  $('guestPack').value = value;
  const display = $('packValue');
  display.textContent = value;
  display.classList.remove('pack-bump');
  if (!prefersReducedMotion()) {
    void display.offsetWidth;
    display.classList.add('pack-bump');
  }
}
function chooseInitial(value) {
  $('initialStatus').value = value;
  $('segWait').classList.toggle('selected', value === 'waiting');
  $('segDone').classList.toggle('selected', value === 'done');
}
function saveGuest(event) {
  event.preventDefault();

  const form = $('addGuestForm');
  if (!form || form.dataset.saving === 'true') return;

  const button = $('saveGuestButton');
  const originalLabel = button.textContent;
  form.dataset.saving = 'true';
  button.disabled = true;
  button.classList.add('is-saving');
  button.textContent = 'Menyimpan...';

  const finishSave = () => {
    const day = todayKey();
    const now = Date.now();
    const status = $('initialStatus').value;
    const pack = Number($('guestPack').value);

    const guest = {
      id: uid(),
      ticket: nextTicket(day),
      day,
      name: $('guestName').value.trim(),
      pack,
      phone: $('guestPhone').value.trim(),
      status,
      created: now,
      resolved: status === 'done' ? now : null,
      audit: [{ at: now, label: 'Terdaftar', detail: pack + ' pack' }]
    };

    if (status === 'done') {
      guest.audit.push({ at: now, label: 'Langsung Duduk' });
    }

    state.guests.push(guest);
    save();
    closeSheet();
    renderAll();
    showTicketReveal(guest);
  };

  // Save immediately; do not make the user wait for a decorative animation.
  finishSave();
}
function statusLabel(s){return{waiting:'Menunggu',called:'Dipanggil',done:'Selesai',cancelled:'Dibatalkan'}[s]||s}
function statusClass(s){return's-'+s}
function duration(g){return fmtElapsed((g.resolved||Date.now())-g.created)}
function guestCard(g,i,history=false){let act='';if(!history&&g.status==='waiting')act=`<button class="mini blue" onclick="setGuestStatus('${g.id}','called')">Panggil</button><button class="mini green" onclick="setGuestStatus('${g.id}','done')">Duduk</button>`;else if(!history&&g.status==='called')act=`<button class="mini green" onclick="setGuestStatus('${g.id}','done')">Duduk</button>`;return`<article class="guest" style="animation-delay:${Math.min(i,7)*.035}s"><div class="guest-row" onclick="openDetail('${g.id}')"><div class="ticket">${g.ticket}</div><div class="guest-main"><div class="guest-name">${esc(g.name)}</div><div class="guest-meta"><span>${g.pack} pack</span><span>·</span><span>${fmtTime(g.created)}</span></div></div><span class="status ${statusClass(g.status)}">${statusLabel(g.status)}</span></div><div class="guest-bottom"><span class="waittime">Waiting time <b>${duration(g)}</b></span><div class="actions">${act}<button class="mini" onclick="openDetail('${g.id}')">Detail</button></div></div></article>`}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function showTicketReveal(guest) {
  const existing = $('ticketReveal');
  if (existing) existing.remove();

  const reveal = document.createElement('div');
  reveal.id = 'ticketReveal';
  reveal.className = 'ticket-reveal';
  reveal.setAttribute('role', 'dialog');
  reveal.setAttribute('aria-modal', 'true');
  reveal.setAttribute('aria-label', 'Nomor antrean berhasil dibuat');

  reveal.innerHTML = `
    <div class="ticket-reveal-card">
      <div class="ticket-reveal-kicker">Nomor antrean berhasil dibuat</div>
      <div class="ticket-reveal-number">${esc(guest.ticket)}</div>
      <h2 class="ticket-reveal-name">${esc(guest.name)}</h2>
      <div class="ticket-reveal-meta">${guest.pack} pack · ${fmtTime(guest.created)}</div>
      <div class="ticket-reveal-divider"></div>
      <div class="ticket-reveal-note">
        ${guest.status === 'done'
          ? 'Tamu sudah ditandai langsung duduk.'
          : 'Tamu berhasil masuk ke Waiting List.'}
      </div>
      <button class="primary" type="button" onclick="closeTicketReveal()">Selesai</button>
    </div>
  `;

  document.body.appendChild(reveal);

  if (prefersReducedMotion()) {
    reveal.classList.add('show');
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => reveal.classList.add('show')));
  }

  reveal.addEventListener('click', event => {
    if (event.target === reveal) closeTicketReveal();
  });
}

function closeTicketReveal() {
  const reveal = $('ticketReveal');
  if (!reveal) return;

  reveal.classList.add('closing');

  if (prefersReducedMotion()) {
    reveal.remove();
    return;
  }

  window.setTimeout(() => reveal.remove(), 300);
}

function setCount(elementId, value) {
  const element = $(elementId);
  if (!element) return;

  const target = Number(value) || 0;
  const previous = Number(element.dataset.value ?? element.textContent) || 0;

  if (previous === target || prefersReducedMotion() || window.matchMedia('(max-width: 600px)').matches) {
    element.textContent = String(target);
    element.dataset.value = String(target);
    return;
  }

  const startTime = performance.now();
  const duration = 680;
  element.dataset.value = String(target);

  const animate = now => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 4);
    const current = Math.round(previous + (target - previous) * eased);

    element.textContent = String(current);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      element.textContent = String(target);
    }
  };

  requestAnimationFrame(animate);
}

function renderAll(){let d=todayKey(),today=state.guests.filter(g=>g.day===d),waiting=today.filter(g=>g.status==='waiting'||g.status==='called'),done=today.filter(g=>g.status==='done'),cancel=today.filter(g=>g.status==='cancelled');$('dateLabel').textContent=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short'}).format(new Date());setCount('totalCount', today.length);
setCount('packCount', today.reduce((total, guest) => total + guest.pack, 0));
setCount('waitingCount', waiting.length);
setCount('doneCount', done.length);
setCount('cancelCount', cancel.length);let resolved=today.filter(g=>g.resolved);$('avgWait').textContent=resolved.length?fmtElapsed(resolved.reduce((a,g)=>a+g.resolved-g.created,0)/resolved.length):'—';let pending=state.guests.filter(g=>g.day!==d&&(g.status==='waiting'||g.status==='called'));$('pendingWrap').innerHTML=pending.length?`<div class="pending"><h3>⚠ ${pending.length} tugas tertunda dari hari sebelumnya</h3><p>Periksa tamu yang belum diselesaikan. Data tidak dihapus otomatis.</p>${pending.map(g=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-top:1px solid #f3e5d0;font-size:11px"><span><b>${g.ticket}</b> · ${esc(g.name)}</span><button class="mini green" onclick="openDetail('${g.id}')">Periksa</button></div>`).join('')}</div>`:'';$('dashboardList').innerHTML=waiting.length?waiting.sort((a,b)=>a.created-b.created).map(guestCard).join(''):`<div class="empty"><div class="empty-icon">✓</div><h3>Belum ada antrean aktif</h3><p>Tambahkan tamu baru untuk mulai mengelola antrean.</p></div>`;renderQueue();renderHistory()}
function setFilter(f){activeFilter=f;document.querySelectorAll('#queueFilters .filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));renderQueue()}
function renderQueue(){if(!$('queueList'))return;let q=($('queueSearch')?.value||'').toLowerCase(),d=todayKey();let list=state.guests.filter(g=>g.day===d&&(activeFilter==='all'||g.status===activeFilter)&&(g.name+' '+g.ticket).toLowerCase().includes(q)).sort((a,b)=>a.created-b.created);$('queueList').innerHTML=list.length?list.map((g,i)=>guestCard(g,i)).join(''):`<div class="empty"><div class="empty-icon">⌕</div><h3>Tidak ada antrean</h3><p>Coba ubah filter atau kata pencarian.</p></div>`}
function renderHistory(){if(!$('historyList'))return;let d=$('historyDate').value||todayKey(),q=($('historySearch')?.value||'').toLowerCase(),list=state.guests.filter(g=>g.day===d&&g.name.toLowerCase().includes(q)).sort((a,b)=>b.created-a.created);$('historyList').innerHTML=list.length?list.map((g,i)=>guestCard(g,i,true)).join(''):`<div class="empty"><div class="empty-icon">◷</div><h3>Belum ada riwayat</h3><p>Tidak ada tamu pada tanggal yang dipilih.</p></div>`}
function setGuestStatus(id,status){let g=state.guests.find(x=>x.id===id);if(!g||['done','cancelled'].includes(g.status))return;let now=Date.now();g.status=status;if(status==='done'||status==='cancelled')g.resolved=now;g.audit.push({at:now,label:status==='called'?'Dipanggil':status==='done'?'Selesai / Sudah Duduk':'Dibatalkan'});save();renderAll();if($('sheet').classList.contains('show'))openDetail(id);toast(status==='called'?'Tamu dipanggil':status==='done'?'Tamu ditandai sudah duduk':'Antrean dibatalkan')}
function openDetail(id){let g=state.guests.find(x=>x.id===id);if(!g)return;sheetGuest=id;let canChange=!['done','cancelled'].includes(g.status);openSheet(`<div class="sheet-head"><h2>Detail tamu</h2><button class="close" onclick="closeSheet()">✕</button></div><div class="detail-ticket"><small>NOMOR ANTREAN</small><strong>${g.ticket}</strong><small>${fmtDate(g.day)}</small></div><div style="font:800 18px Manrope">${esc(g.name)}</div><div class="detail-grid"><div class="detail-cell"><small>Jumlah pack</small><b>${g.pack} orang</b></div><div class="detail-cell"><small>Status</small><b>${statusLabel(g.status)}</b></div><div class="detail-cell"><small>Waktu daftar</small><b>${fmtTime(g.created)}</b></div><div class="detail-cell"><small>Waiting time</small><b>${duration(g)}</b></div><div class="detail-cell" style="grid-column:1/-1"><small>WhatsApp</small><b>${esc(g.phone||'Tidak diisi')}</b></div></div><div class="sheet-actions"><button class="secondary" onclick="editGuest('${g.id}')">Koreksi data</button>${g.phone?`<button class="primary" onclick="toast('Aksi WhatsApp demo')">WhatsApp</button>`:''}</div>${canChange?`<div class="sheet-actions"><button class="secondary" onclick="setGuestStatus('${g.id}','cancelled')">Batalkan</button><button class="primary" onclick="setGuestStatus('${g.id}','done')">Sudah duduk</button></div>`:''}<div style="margin-top:20px;font:800 13px Manrope">Riwayat perubahan</div><div class="timeline">${g.audit.slice().reverse().map(a=>`<div class="timeline-item"><b>${esc(a.label)}</b><small>${new Date(a.at).toLocaleString('id-ID',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}${a.detail?' · '+esc(a.detail):''}${a.reason?' · Alasan: '+esc(a.reason):''}</small></div>`).join('')}</div>`)}
function editGuest(id){let g=state.guests.find(x=>x.id===id);if(!g)return;sheetGuest=id;openSheet(`<div class="sheet-head"><h2>Koreksi data tamu</h2><button class="close" onclick="openDetail('${id}')">✕</button></div><form onsubmit="saveEdit(event,'${id}')"><div class="field"><label>Nama tamu *</label><input id="editName" required value="${esc(g.name)}"></div><div class="field"><label>Jumlah pack *</label><input id="editPack" type="number" min="1" max="30" required value="${g.pack}"></div><div class="field"><label>WhatsApp</label><input id="editPhone" value="${esc(g.phone)}"></div><div class="field"><label>Alasan koreksi *</label><textarea id="editReason" required placeholder="Tuliskan alasan perubahan data..."></textarea></div><div class="sheet-actions"><button type="button" class="secondary" onclick="openDetail('${id}')">Kembali</button><button class="primary">Simpan koreksi</button></div></form>`)}
function saveEdit(e,id){e.preventDefault();let g=state.guests.find(x=>x.id===id),now=Date.now();g.audit.push({at:now,label:'Dikoreksi',detail:`Nama: ${g.name} → ${$('editName').value}; Pack: ${g.pack} → ${$('editPack').value}`,reason:$('editReason').value.trim()});g.name=$('editName').value.trim();g.pack=Number($('editPack').value);g.phone=$('editPhone').value.trim();save();renderAll();openDetail(id);toast('Koreksi berhasil disimpan')}
function exportCSV(){let rows=[['Tanggal','Nomor antrean','Nama','Pack','WhatsApp','Status','Waktu daftar','Waiting time'],...state.guests.filter(g=>g.day===todayKey()).map(g=>[g.day,g.ticket,g.name,g.pack,g.phone,statusLabel(g.status),fmtTime(g.created),duration(g)])];let csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');let blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='waiting-list-'+todayKey()+'.csv';a.click();URL.revokeObjectURL(a.href);toast('File CSV berhasil dibuat')}
function resetDemo(){if(!confirm('Reset seluruh data demo di browser ini?'))return;state=seed();save();renderAll();toast('Data demo dikembalikan')}
$('historyDate').value=todayKey();renderAll();setInterval(()=>{renderAll()},30000);
