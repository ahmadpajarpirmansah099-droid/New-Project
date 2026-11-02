/* =========================================================
   1. UTILITIES, DATE/TIME, AND LOCAL DEMO STORAGE
   ========================================================= */
const $=id=>document.getElementById(id);
const todayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fmtTime=t=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}).format(new Date(t));
const fmtDate=d=>new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(d+'T00:00:00Z'));
const fmtElapsed=ms=>{let m=Math.max(0,Math.floor(ms/60000));return m<60?m+' menit':Math.floor(m/60)+'j '+m%60+'m'};
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
// Keep this key stable so existing demo data in the browser is preserved.
const key='waitlist_frontend_demo_v1';
let state=loadState(),activeFilter='waiting',sheetGuest=null,toastTimer;
let dashboardCountUpPending = true;
function loadState() {
  try {
    const savedState = JSON.parse(localStorage.getItem(key));

    if (savedState && Array.isArray(savedState.guests) && savedState.counters) {
      if (!Array.isArray(savedState.reservations)) {
        savedState.reservations = [];
      }

      if (!savedState.reservationCounters) {
        savedState.reservationCounters = {};
      }

      if (!savedState.settings || typeof savedState.settings !== 'object') {
        savedState.settings = {};
      }

      const savedDuration = Number(savedState.settings.seatingDurationMinutes);
      savedState.settings.seatingDurationMinutes =
        Number.isFinite(savedDuration) && savedDuration >= 1 && savedDuration <= 1440
          ? Math.round(savedDuration)
          : 90;

      // Upgrade the previous default while preserving customized durations.
      if (savedState.settings.seatingDurationMinutes === 30) {
        savedState.settings.seatingDurationMinutes = 90;
      }

      savedState.guests.forEach(guest => {
        if (guest.status === 'seated' && !Number(guest.seatedAt)) {
          const seatingAudit = Array.isArray(guest.audit)
            ? guest.audit.slice().reverse().find(item => item.label === 'Duduk')
            : null;

          guest.seatedAt =
            Number(guest.resolved) ||
            Number(seatingAudit?.at) ||
            Number(guest.created) ||
            Date.now();
        }
      });

      return savedState;
    }
  } catch (error) {
    // Invalid local demo data falls back to the initial demo state.
  }

  return seed();
}


function seed(){let d=todayKey(),y=new Date(Date.now()-86400000);let yd=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(y),now=Date.now();let gs=[
['WL-001','Rina Kusuma',2,'0812-xxxx-1043','done',142,118],['WL-002','Budi Santoso',4,'0813-xxxx-7720','done',128,96],['WL-003','Dewi Lestari',3,'','cancelled',110,90],['WL-004','Andika Pratama',2,'0857-xxxx-3381','done',92,70],['WL-005','Sari Wulandari',6,'0821-xxxx-5590','waiting',48],['WL-006','Fajar Nugroho',2,'0878-xxxx-2214','called',36],['WL-007','Maya Anggraini',5,'','waiting',27],['WL-009','Hendra Wijaya',3,'0812-xxxx-9907','cancelled',22,15],['WL-010','Putri Ramadhani',2,'0896-xxxx-4412','waiting',14],['WL-011','Yoga Saputra',8,'0815-xxxx-6630','waiting',6]
].map(([ticket,name,pack,phone,status,ago,res])=>({id:uid(),ticket,day:d,name,pack,phone,status,created:now-ago*60000,resolved:res?now-res*60000:null,audit:[{at:now-ago*60000,label:'Terdaftar',detail:pack+' pack'}]}));
gs.forEach(g=>{if(g.status!=='waiting'&&g.status!=='called')g.audit.push({at:g.resolved,label:g.status==='done'?'Selesai / Sudah Duduk':'Dibatalkan'})});
let prev=[['WL-001','Agus Salim',2,'done'],['WL-002','Lina Marlina',4,'done'],['WL-003','Rizky Firmansyah',3,'waiting'],['WL-004','Nadia Paramitha',2,'cancelled'],['WL-005','Teguh Prakoso',5,'waiting']].map(([ticket,name,pack,status],i)=>({id:uid(),ticket,day:yd,name,pack,phone:'',status,created:now-(24*60+300-i*40)*60000,resolved:status==='waiting'?null:now-(24*60+275-i*40)*60000,audit:[{at:now-86400000,label:'Terdaftar'}]}));
return{guests:[...prev,...gs],counters:{[d]:11,[yd]:5},reservations:[],reservationCounters:{},settings:{seatingDurationMinutes:90}}}
function save() {
  localStorage.setItem(key, JSON.stringify(state));
}



function seatingDurationMinutes() {
  const value = Number(state.settings?.seatingDurationMinutes);
  return Number.isFinite(value) && value >= 1 ? value : 90;
}

function seatingRemainingMs(guest, now = Date.now()) {
  const seatedAt = Number(guest.seatedAt || guest.resolved || guest.created || now);
  return Math.max(0, seatingDurationMinutes() * 60000 - (now - seatedAt));
}

function seatingCountdownText(guest, now = Date.now()) {
  const totalSeconds = Math.ceil(seatingRemainingMs(guest, now) / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return minutes + ':' + seconds;
}

function updateSeatingCountdowns() {
  const now = Date.now();

  document.querySelectorAll('[data-seating-countdown]').forEach(element => {
    const guest = state.guests.find(item => item.id === element.dataset.seatingCountdown);

    if (!guest || guest.status !== 'seated') return;

    element.textContent = seatingCountdownText(guest, now);
    element.classList.toggle('is-expired', seatingRemainingMs(guest, now) <= 0);
  });
}

function syncSeatingSettingInput() {
  const input = $('seatingDurationInput');
  if (input) input.value = String(seatingDurationMinutes());
}

function adjustSeatingDuration(change) {
  const input = $('seatingDurationInput');
  if (!input) return;

  const current = Number(input.value) || seatingDurationMinutes();
  input.value = String(Math.min(1440, Math.max(1, current + change)));
}

function saveSeatingDuration() {
  const input = $('seatingDurationInput');
  const value = Number(input?.value);

  if (!Number.isInteger(value) || value < 1 || value > 1440) {
    toast('Masukkan durasi 1 sampai 1440 menit');
    syncSeatingSettingInput();
    return;
  }

  state.settings = state.settings || {};
  state.settings.seatingDurationMinutes = value;
  save();
  updateSeatingCountdowns();
  toast('Durasi Seating Time disimpan');
}



function nextTicket(day) {
  const number = (state.counters[day] || 0) + 1;
  state.counters[day] = number;

  return 'WL-' + String(number).padStart(3, '0');
}

function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2300);
}


/* =========================================================
   2. APP NAVIGATION AND SHARED POPUP / SHEET CONTROLS
   ========================================================= */
function returnToGuestOperational() {
  go('dashboard');
}

function go(page) {
  closeQuickMenu();
  document.querySelectorAll('.page').forEach(element => element.classList.remove('active'));
  $('page-' + page).classList.add('active');

  document.querySelectorAll('.drawer-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  $('fab').style.display = page === 'settings' ? 'none' : 'grid';

  if (page === 'settings') syncSeatingSettingInput();
  if (page === 'dashboard') dashboardCountUpPending = true;

  renderAll();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function toggleQuickMenu() {
  const open = !$('quickMenu').classList.contains('show');

  if (open && $('menuDrawer').classList.contains('show')) {
    closeMenu();
  }

  $('quickMenu').classList.toggle('show', open);
  $('quickMenuBackdrop').classList.toggle('show', open);
  $('quickMenu').setAttribute('aria-hidden', String(!open));
  $('quickMenuBackdrop').setAttribute('aria-hidden', String(!open));
  $('fab').classList.toggle('is-open', open);
  $('fab').setAttribute('aria-expanded', String(open));
  $('fab').setAttribute('aria-label', open ? 'Tutup menu cepat' : 'Buka menu cepat');
}

function closeQuickMenu() {
  const menu = $('quickMenu');
  const backdrop = $('quickMenuBackdrop');
  const fab = $('fab');

  if (!menu || !backdrop || !fab) return;

  menu.classList.remove('show');
  backdrop.classList.remove('show');
  menu.setAttribute('aria-hidden', 'true');
  backdrop.setAttribute('aria-hidden', 'true');
  fab.classList.remove('is-open');
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-label', 'Buka menu cepat');
}

function runQuickAction(action) {
  closeQuickMenu();

  if (action === 'add') {
    openAdd();
    return;
  }

  if (['waiting', 'reservations', 'history'].includes(action)) {
    go(action);
  }
}

function toggleMenu() {
  const open = !$('menuDrawer').classList.contains('show');

  if (open) closeQuickMenu();

  $('menuDrawer').classList.toggle('show', open);
  $('menuBackdrop').classList.toggle('show', open);
  $('menuDrawer').setAttribute('aria-hidden', String(!open));
  $('menuToggle').setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
}

function closeMenu() {
  $('menuDrawer').classList.remove('show');
  $('menuBackdrop').classList.remove('show');
  $('menuDrawer').setAttribute('aria-hidden', 'true');
  $('menuToggle').setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

function navigateFromMenu(page) {
  closeMenu();
  go(page);
}

function openSheet(content) {
  $('sheetContent').innerHTML = content;
  $('sheet').style.transform = '';
  $('backdrop').classList.add('show');
  $('sheet').classList.add('show');
  document.body.style.overflow = 'hidden';
  initSheetDrag();
  initSheetBodySwipe();
}

function closeSheet() {
  $('backdrop').classList.remove('show');
  $('sheet').classList.remove('show');
  $('sheet').classList.remove('operational-modal');
  $('sheet').style.transform = '';
  document.body.style.overflow = '';
  sheetGuest = null;
}


let sheetDragStartY=0,sheetDragCurrentY=0,sheetDragging=false,sheetDragPointerId=null;
function initSheetDrag(){
 const handle=$('sheetHandle'),sheet=$('sheet');
 if(!handle||handle.dataset.dragReady)return;
 handle.dataset.dragReady='1';
 const move=y=>{
  if(!sheetDragging)return;
  sheetDragCurrentY=Math.max(0,y-sheetDragStartY);
  sheet.style.transform='translate3d(-50%, '+sheetDragCurrentY+'px, 0)';
 };
 const finish=()=>{
  if(!sheetDragging)return;
  const shouldClose=sheetDragCurrentY>90;
  sheetDragging=false;sheetDragPointerId=null;
  sheet.style.transition='';
  sheet.style.transform='';
  if(shouldClose)closeSheet();
  sheetDragStartY=0;sheetDragCurrentY=0;
 };
 handle.addEventListener('pointerdown',e=>{
  if(!sheet.classList.contains('show')||e.button!==0)return;
  sheetDragging=true;sheetDragPointerId=e.pointerId;
  sheetDragStartY=e.clientY;sheetDragCurrentY=0;
  sheet.style.transition='none';
  try{handle.setPointerCapture(e.pointerId)}catch(err){}
  e.preventDefault();
 });
 window.addEventListener('pointermove',e=>{
  if(!sheetDragging||e.pointerId!==sheetDragPointerId)return;
  e.preventDefault();move(e.clientY);
 },{passive:false});
 window.addEventListener('pointerup',e=>{
  if(sheetDragging&&e.pointerId===sheetDragPointerId)finish();
 });
 window.addEventListener('pointercancel',e=>{
  if(sheetDragging&&e.pointerId===sheetDragPointerId)finish();
 });


}

function initSheetBodySwipe(){
 const sheet=$('sheet');
 if(!sheet||sheet.dataset.bodySwipeReady)return;
 sheet.dataset.bodySwipeReady='1';
 let startY=0,dragDistance=0,dragActive=false;
 sheet.addEventListener('touchstart',e=>{
  if(!sheet.classList.contains('show')||!sheet.querySelector('.detail-ticket')||e.touches.length!==1){dragActive=false;return;}
  const target=e.target;
  if(target.closest('button,input,select,textarea,a,[contenteditable="true"],#sheetHandle')){dragActive=false;return;}
  startY=e.touches[0].clientY;
  dragDistance=0;
  dragActive=sheet.scrollTop<=1;
 },{passive:true});
 sheet.addEventListener('touchmove',e=>{
  if(!dragActive||e.touches.length!==1)return;
  const delta=e.touches[0].clientY-startY;
  if(delta<8){if(delta<-8)dragActive=false;return;}
  if(sheet.scrollTop>1){dragActive=false;return;}
  e.preventDefault();
  dragDistance=delta;
  sheet.style.transition='none';
  sheet.style.transform='translate3d(-50%, '+delta+'px, 0)';
 },{passive:false});
 const finishBodySwipe=()=>{
  if(!dragActive)return;
  const shouldClose=dragDistance>90;
  dragActive=false;
  dragDistance=0;
  sheet.style.transition='';
  sheet.style.transform='';
  if(shouldClose)closeSheet();
 };
 sheet.addEventListener('touchend',finishBodySwipe,{passive:true});
 sheet.addEventListener('touchcancel',finishBodySwipe,{passive:true});
}


/* =========================================================
   3. WAITING LIST: ADD GUEST AND QUEUE NUMBER
   ========================================================= */
function openAdd(){sheetGuest=null;openSheet(`<div class="sheet-head"><h2>Tambah tamu</h2><button class="close" onclick="closeSheet()">✕</button></div><form onsubmit="saveGuest(event)"><div class="field"><label>Nama tamu *</label><input id="guestName" required maxlength="70" placeholder="Masukkan nama tamu" autocomplete="name"></div><div class="field"><label>Jumlah pack *</label><div class="pack-control"><button type="button" onclick="changePack(-1)">−</button><strong id="packValue">2</strong><button type="button" onclick="changePack(1)">+</button></div><input type="hidden" id="guestPack" value="2"></div><div class="field"><label>Nomor WhatsApp <span style="color:#9aa5b8;font-weight:500">(opsional)</span></label><input id="guestPhone" inputmode="tel" placeholder="08xxxxxxxxxx"></div><div class="field"><label>Status awal</label><div class="seg" data-selected="waiting"><button type="button" class="selected" id="segWait" onclick="chooseInitial('waiting')">Menunggu</button><button type="button" id="segSeated" onclick="chooseInitial('seated')">Langsung duduk</button></div><input type="hidden" id="initialStatus" value="waiting"></div><div class="sheet-actions"><button type="button" class="secondary" onclick="closeSheet()">Batal</button><button type="submit" class="primary">Simpan tamu</button></div></form>`)}
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
    280
  );
}
function saveGuest(e){
 e.preventDefault();
 const day=todayKey(),now=Date.now(),status=$('initialStatus').value;
 const g={
  id:uid(),ticket:nextTicket(day),day,
  name:$('guestName').value.trim(),
  pack:Number($('guestPack').value),
  phone:$('guestPhone').value.trim(),
  status,created:now,
  resolved:status==='seated'?now:null,
  audit:[{at:now,label:'Terdaftar',detail:$('guestPack').value+' pack'}]
 };
 if(status==='seated')g.audit.push({at:now,label:'Langsung Duduk'});
 state.guests.push(g);
 save();closeSheet();renderAll();
 toast('Tamu berhasil ditambahkan · '+g.ticket);
}
/* =========================================================
   4. WAITING LIST: STATUS, CARDS, AND DASHBOARD RENDERING
   ========================================================= */
function statusLabel(s) {
  return { waiting: 'Menunggu', called: 'Dipanggil', seated: 'Duduk', done: 'Selesai', cancelled: 'Dibatalkan' }[s] || s;
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
    act = '<button class="mini blue" onclick="callGuestWhatsApp(\'' + g.id + '\')"><svg class="wa-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.52 3.48A11.8 11.8 0 0 0 12.1 0C5.55 0 .23 5.32.22 11.87c0 2.1.55 4.15 1.6 5.95L.12 24l6.34-1.66a11.8 11.8 0 0 0 5.63 1.43h.01c6.55 0 11.87-5.33 11.88-11.88a11.8 11.8 0 0 0-3.46-8.41ZM12.1 21.75h-.01a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.76.98 1-3.67-.23-.38a9.82 9.82 0 1 1 8.36 4.65Zm5.39-7.36c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.23-.65.08-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.38-.03-.53-.08-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.51h-.57c-.2 0-.52.08-.79.38-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.21 5.1 4.5.71.3 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.3.18-1.42-.08-.13-.27-.2-.57-.35Z"/></svg><span>Panggil</span></button>' +
      '<button class="mini green" onclick="setGuestStatus(\'' + g.id + '\',\'seated\')">Duduk</button>';
  } else if (!history && g.status === 'called') {
    act = '<button class="mini green" onclick="setGuestStatus(\'' + g.id + '\',\'seated\')">Duduk</button>';
  } else if (!history && g.status === 'seated') {
    act = '<button class="mini green" onclick="setGuestStatus(\'' + g.id + '\',\'done\')">Selesaikan</button>';
  }

  const ticketMarkup = isReservation
    ? '<div class="ticket reservation-ticket"><strong>' + esc(reservation.code) + '</strong><small>' + esc(g.ticket) + '</small></div>'
    : '<div class="ticket">' + esc(g.ticket) + '</div>';

  return '<article class="guest' + (isReservation ? ' guest-reservation' : '') + '" style="animation-delay:' + Math.min(i, 7) * .035 + 's">' +
    '<div class="guest-row" onclick="openDetail(\'' + g.id + '\')">' + ticketMarkup +
      '<div class="guest-main"><div class="guest-name">' + esc(g.name) + '</div>' +
      '<div class="guest-meta"><span>' + g.pack + ' pack</span><span>·</span><span>' + fmtTime(g.created) + '</span></div></div>' +
      '<span class="status ' + statusClass(g.status) + '">' + statusLabel(g.status) + '</span></div>' +
    '<div class="guest-bottom"><span class="waittime">' + (g.status === 'seated' ? 'Seating time' : 'Waiting time') +
      ' <b' + (g.status === 'seated' ? ' data-seating-countdown="' + esc(g.id) + '"' : '') + '>' +
      (g.status === 'seated' ? seatingCountdownText(g) : duration(g)) + '</b></span>' +
      '<div class="actions">' + act + '<button class="mini" onclick="openDetail(\'' + g.id + '\')">Detail</button></div></div></article>';
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
function renderAll() {
  const day = todayKey();
  const todayGuests = state.guests.filter(guest => guest.day === day);
  const waitingGuests = todayGuests.filter(guest => ['waiting', 'called'].includes(guest.status));
  const doneGuests = todayGuests.filter(guest => guest.status === 'done');
  const cancelledGuests = todayGuests.filter(guest => guest.status === 'cancelled');

  $('dateLabel').textContent = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short'
  }).format(new Date());

  const animateCounts =
    dashboardCountUpPending && $('page-dashboard')?.classList.contains('active');
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
    guest => guest.day !== day && ['waiting', 'called'].includes(guest.status)
  );

  $('pendingWrap').innerHTML = pendingGuests.length
    ? `<div class="pending"><h3>⚠ ${pendingGuests.length} tugas tertunda dari hari sebelumnya</h3><p>Periksa tamu yang belum diselesaikan. Data tidak dihapus otomatis.</p>${pendingGuests.map(guest => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-top:1px solid #f3e5d0;font-size:11px"><span><b>${guest.ticket}</b> · ${esc(guest.name)}</span><button class="mini green" onclick="openDetail('${guest.id}')">Periksa</button></div>`).join('')}</div>`
    : '';

  $('dashboardList').innerHTML = waitingGuests.length
    ? waitingGuests
        .sort((a, b) => a.created - b.created)
        .map(guestCard)
        .join('')
    : `<div class="empty"><div class="empty-icon">✓</div><h3>Belum ada antrean aktif</h3><p>Tambahkan tamu baru untuk mulai mengelola antrean.</p></div>`;

  renderQueue();
  renderHistory();
  renderReservations();
}
function setFilter(f){activeFilter=f;document.querySelectorAll('#queueFilters .filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));renderQueue()}
function renderQueue(){
 if(!$('queueList'))return;
 const q=($('queueSearch')?.value||'').toLowerCase(),day=todayKey();
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
  const day = todayKey();
  const guests = state.guests.filter(guest => guest.day === day).sort((a, b) => b.created - a.created);
  const yesterday = state.guests.filter(guest => guest.day === shiftDateKey(day, -1));
  const total = guests.length;
  const difference = total - yesterday.length;
  const trend = yesterday.length ? (difference > 0 ? '+' : '') + Math.round((difference / yesterday.length) * 100) + '%' : (total ? 'Data awal' : '0%');
  const trendCopy = yesterday.length ? 'vs kemarin (' + yesterday.length + ')' : 'belum ada data kemarin';
  const packTotal = guests.reduce((sum, guest) => sum + Number(guest.pack || 0), 0);
  const averageWait = operationalAverageWait(guests);
  const seatedTotal = guests.filter(guest => ['seated', 'done'].includes(guest.status)).length;
  const dateLabel = fmtDate(day);
  const html = [
    '<div class="operational-head"><div><h2>Detail Operasional</h2><p>Hari ini · ' + esc(dateLabel) + '</p></div><button class="close operational-close" type="button" onclick="closeSheet()" aria-label="Tutup detail">×</button></div>',
    '<section class="operational-summary"><div class="operational-summary-main"><span>Total tamu</span><strong>' + total + '</strong><small class="' + (difference >= 0 ? 'trend-up' : 'trend-down') + '">' + (difference > 0 ? '↑ ' : difference < 0 ? '↓ ' : '') + esc(trend) + '<span>' + esc(trendCopy) + '</span></small></div>',
    '<div class="operational-summary-meta"><div><span class="summary-icon">♧</span><span>Total pack</span><b>' + packTotal + '</b></div><div><span class="summary-icon">◷</span><span>Rata-rata tunggu</span><b>' + esc(averageWait) + '</b></div><div><span class="summary-icon">✓</span><span>Tamu sudah duduk</span><b>' + seatedTotal + '</b></div></div><span class="operational-live"><i></i> LIVE DEMO</span></section>',
    '<section class="operational-chart-card"><div class="operational-section-head"><h3>Tren kunjungan</h3><div class="chart-toggle" role="group" aria-label="Mode grafik"><button type="button" class="' + (operationalChartMode === 'hour' ? 'active' : '') + '" onclick="setOperationalChartMode(\'hour\')">Jam</button><button type="button" class="' + (operationalChartMode === 'pack' ? 'active' : '') + '" onclick="setOperationalChartMode(\'pack\')">Pack</button></div></div><div id="operationalChart" class="operational-chart"></div></section>',
    '<section class="operational-guests"><div class="operational-section-head operational-list-head"><div><h3>Daftar tamu hari ini</h3><small>' + total + ' tamu terdaftar</small></div><span class="operational-list-total">' + total + '</span></div>',
    '<div class="operational-list-tools"><label class="operational-search"><span>⌕</span><input id="operationalSearch" type="search" placeholder="Cari nama atau nomor antrean..." oninput="renderOperationalGuestList()"></label><div class="operational-filter-wrap"><button type="button" id="operationalFilterTrigger" class="operational-filter-trigger" aria-haspopup="listbox" aria-expanded="false" onclick="toggleOperationalFilterMenu()"><span id="operationalFilterLabel">Semua</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button><div id="operationalFilterMenu" class="operational-filter-menu" role="listbox" aria-label="Filter status tamu" hidden><button type="button" role="option" aria-selected="true" data-filter="all" onclick="setOperationalStatusFilter(\'all\')">Semua</button><button type="button" role="option" aria-selected="false" data-filter="waiting" onclick="setOperationalStatusFilter(\'waiting\')">Menunggu</button><button type="button" role="option" aria-selected="false" data-filter="called" onclick="setOperationalStatusFilter(\'called\')">Dipanggil</button><button type="button" role="option" aria-selected="false" data-filter="seated" onclick="setOperationalStatusFilter(\'seated\')">Duduk</button><button type="button" role="option" aria-selected="false" data-filter="done" onclick="setOperationalStatusFilter(\'done\')">Selesai</button><button type="button" role="option" aria-selected="false" data-filter="cancelled" onclick="setOperationalStatusFilter(\'cancelled\')">Batal</button></div></div></div>',
    '<div id="operationalGuestList" class="operational-guest-list"></div></section>',
    '<button class="operational-all-button" type="button" onclick="closeSheet();go(\'waiting\')">Lihat semua tamu (' + total + ') <span>→</span></button>'
  ].join('');
  $('sheetContent').innerHTML = html;
  renderOperationalChart(guests);
  renderOperationalGuestList();
}
function setOperationalChartMode(mode) {
  operationalChartMode = mode;
  const guests = state.guests.filter(guest => guest.day === todayKey());
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
    return '<div class="operational-bar-column"><b>' + slot.value + '</b><div class="operational-bar-track"><i style="height:' + height + '%"></i></div><small>' + String(slot.hour).padStart(2, '0') + '.00</small></div>';
  }).join('');
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

  return '<button type="button" class="operational-guest-row" onclick="closeSheet();openDetail(\'' + guest.id + '\')">' +
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
  const guests = state.guests.filter(guest => guest.day === todayKey())
    .filter(guest => operationalStatusFilter === 'all' || guest.status === operationalStatusFilter)
    .filter(guest => {
      const reservation = reservationIdentity(guest);
      return (guest.name + ' ' + guest.ticket + ' ' + (reservation?.code || '')).toLowerCase().includes(query);
    })
    .sort((a, b) => b.created - a.created);
  element.innerHTML = guests.length ? guests.map(operationalGuestRow).join('') : '<div class="operational-empty">Tidak ada tamu yang cocok dengan pencarian atau filter ini.</div>';
}

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
  const current = $('historyDate').value || todayKey();
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
  $('historyDate').value = historyCalendarDraft;
  updateHistoryDateLabel();
  renderHistory();
  closeHistoryDatePicker();
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
    days += '<button type="button" class="' + classes.join(' ') + '" onclick="selectHistoryCalendarDate(\'' + key + '\')" aria-label="' + historyDateLabel(key) + '" aria-pressed="' + (key === historyCalendarDraft) + '">' + date.getDate() + '</button>';
  }
  $('historyCalendarDays').innerHTML = days;
}

function renderHistory() {
  if (!$('historyList')) return;

  const selectedDay = $('historyDate').value || todayKey();
  const query = ($('historySearch')?.value || '').toLowerCase();
  const guests = state.guests
    .filter(guest => guest.day === selectedDay && guest.name.toLowerCase().includes(query))
    .sort((a, b) => b.created - a.created);

  $('historyList').innerHTML = guests.length
    ? guests.map((guest, index) => guestCard(guest, index, true)).join('')
    : `<div class="empty"><div class="empty-icon">◷</div><h3>Belum ada riwayat</h3><p>Tidak ada tamu pada tanggal yang dipilih.</p></div>`;
}



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
      '" onclick="selectReservationDate(\'' + date + '\')"><span>' +
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
          ? '<button class="seat-action" onclick="seatReservation(\'' + reservation.id + '\')">Dudukkan tamu</button>' +
            '<button class="cancel-action" onclick="cancelReservation(\'' + reservation.id + '\')">Batalkan</button>'
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
            '<button onclick="openReservationDetail(\'' + reservation.id + '\')">Detail</button>' +
            actions +
          '</div>' +
        '</article>';
      }).join('')
    : '<div class="reservation-empty"><strong>Belum ada reservasi</strong>Tidak ada reservasi pada tanggal ini.</div>';

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
    '<div class="sheet-head"><h2>Reservasi baru</h2><button class="close" onclick="closeSheet()">✕</button></div>' +
    '<form onsubmit="saveReservation(event)">' +
      '<div class="field"><label>Nama tamu *</label><input id="rName" required maxlength="120" placeholder="Nama tamu"></div>' +
      '<div class="field"><label>Jumlah pack *</label><input id="rPack" type="number" min="1" max="500" value="2" required></div>' +
      '<div class="field"><label>Tanggal reservasi *</label>' +
        '<input id="rDate" type="hidden" value="' + initialDate + '">' +
        '<button class="reservation-picker-trigger" id="rDateTrigger" type="button" onclick="openReservationDatePicker()">' +
          '<span id="rDateLabel">' + historyDateLabel(initialDate) + '</span>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="field"><label>Jam reservasi *</label>' +
        '<input id="rTime" type="hidden" value="19:00">' +
        '<button class="reservation-picker-trigger" id="rTimeTrigger" type="button" onclick="openReservationTimePicker()">' +
          '<span id="rTimeLabel">19.00 WIB</span>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="field"><label>WhatsApp (opsional)</label><input id="rPhone" inputmode="tel" maxlength="24" placeholder="08xxxxxxxxxx"></div>' +
      '<div class="field"><label>Preferensi smoking</label>' +
        '<input id="rSmoking" type="hidden" value="Non Smoking">' +
        '<div class="reservation-select">' +
          '<button class="reservation-select-trigger" id="rSmokingTrigger" type="button" onclick="toggleReservationSmokingOptions()" aria-expanded="false" aria-controls="rSmokingOptions">' +
            '<span id="rSmokingLabel">Non Smoking</span>' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>' +
          '</button>' +
          '<div class="reservation-select-options" id="rSmokingOptions" hidden>' +
            '<button class="reservation-select-option selected" type="button" onclick="selectReservationSmoking(\'Non Smoking\')"><span>Non Smoking</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button>' +
            '<button class="reservation-select-option" type="button" onclick="selectReservationSmoking(\'Smoking\')"><span>Smoking</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="field"><label>Catatan (opsional)</label><textarea id="rNote" rows="2" maxlength="1000" placeholder="Catatan untuk staf"></textarea></div>' +
      '<div class="sheet-actions"><button type="button" class="secondary" onclick="closeSheet()">Batal</button><button class="primary" type="submit">Simpan reservasi</button></div>' +
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
      ' onclick="selectReservationDateDraft(\'' + key + '\')"' +
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

function saveReservation(e) {
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
    code: reservationCode(date),
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

  state.reservations.push(reservation);
  save();
  reservationMonth = date.slice(0, 7);
  reservationDate = date;
  closeSheet();
  renderAll();
  toast('Reservasi tersimpan · ' + reservation.code);
}

function openReservationDetail(id){const r=state.reservations.find(x=>x.id===id);if(!r)return;openSheet('<div class="sheet-head"><h2>Detail reservasi</h2><button class="close" onclick="closeSheet()">✕</button></div><div class="detail-ticket"><small>KODE RESERVASI</small><strong>'+esc(r.code)+'</strong><small>'+esc(reservationDateText(r.date))+'</small></div><div style="font:800 18px Manrope">'+esc(r.name)+'</div><div class="detail-grid"><div class="detail-cell"><small>Jam reservasi</small><b>'+esc(r.time)+' WIB</b></div><div class="detail-cell"><small>Jumlah pack</small><b>'+r.pack+' pack</b></div><div class="detail-cell"><small>Status</small><b>'+reservationStatusLabel(r.status)+'</b></div><div class="detail-cell"><small>Smoking</small><b>'+esc(r.smoking)+'</b></div><div class="detail-cell" style="grid-column:1/-1"><small>WhatsApp</small><b>'+esc(r.phone||'—')+'</b></div><div class="detail-cell" style="grid-column:1/-1"><small>Catatan</small><b>'+esc(r.note||'—')+'</b></div></div><div class="sheet-actions"><button class="secondary" onclick="closeSheet()">Tutup</button></div>')}
function cancelReservation(id) {
  const reservation = state.reservations.find(item => item.id === id);
  if (!reservation || reservation.status !== 'pending') return;
  if (!confirm('Batalkan reservasi ' + reservation.code + '?')) return;

  reservation.status = 'cancelled';
  reservation.cancelledAt = Date.now();
  save();
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
    '<div class="sheet-head"><h2>Dudukkan tamu</h2><button class="close" onclick="closeSheet()">✕</button></div>' +
    '<p class="page-sub">' + esc(reservation.code) + ' · ' + esc(reservation.name) + '</p>' +
    '<form onsubmit="confirmSeatReservation(event,\'' + id + '\')">' +
      '<div class="field"><label>Nomor / nama meja *</label><input id="rTable" required maxlength="80" placeholder="Contoh: Meja 05, VIP 2"></div>' +
      '<div class="sheet-actions"><button type="button" class="secondary" onclick="closeSheet()">Batal</button><button class="primary">Konfirmasi duduk</button></div>' +
    '</form>'
  );
}

function confirmSeatReservation(event, id) {
  event.preventDefault();

  const reservation = state.reservations.find(item => item.id === id);
  const table = $('rTable').value.trim();
  if (!reservation || !table) return;

  const now = Date.now();
  const guest = {
    id: uid(),
    ticket: nextTicket(todayKey()),
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

  state.guests.push(guest);
  reservation.status = 'seated';
  reservation.guestId = guest.id;
  reservation.table = table;
  reservation.seatedAt = now;

  save();
  closeSheet();
  renderAll();
  toast('Tamu masuk ke catatan operasional · ' + guest.ticket);
}

/* =========================================================
   7. GUEST DETAIL, EDITING, EXPORT, AND DEMO RESET
   ========================================================= */
function setGuestStatus(id,status){
 const guest=state.guests.find(item=>item.id===id);
 if(!guest||['done','cancelled'].includes(guest.status))return;
 const now=Date.now();
 guest.status=status;
 if(status==='seated'){guest.resolved=guest.resolved||now;guest.seatedAt=now}else if(status==='cancelled')guest.resolved=guest.resolved||now;
 const labels={called:'Dipanggil',seated:'Duduk',done:'Selesai',cancelled:'Dibatalkan'};
 guest.audit.push({at:now,label:labels[status]||status});
 save();renderAll();
 if($('sheet').classList.contains('show'))openDetail(id);
 const messages={called:'Tamu dipanggil',seated:'Tamu sudah duduk',done:'Kunjungan ditandai selesai',cancelled:'Antrean dibatalkan'};
 toast(messages[status]||'Status tamu diperbarui');
}
function callGuestWhatsApp(id){
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
 const message='Halo Kak '+guest.name+', nomor antrean '+guest.ticket+' sudah dipanggil. Mohon menuju area greeter kami. Terima kasih.';
 const waUrl='https://wa.me/'+phone+'?text='+encodeURIComponent(message);
 window.open(waUrl,'_blank','noopener,noreferrer');
 setGuestStatus(id,'called');
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
    ? '<button class="primary" onclick="toast(\'Aksi WhatsApp demo\')">WhatsApp</button>'
    : '';

  const cancelActions = canCancel
    ? '<div class="sheet-actions"><button class="secondary" onclick="setGuestStatus(\'' + guest.id + '\',\'cancelled\')">Batalkan</button>' +
      '<button class="primary" onclick="setGuestStatus(\'' + guest.id + '\',\'seated\')">Dudukkan tamu</button></div>'
    : '';

  const finishAction = canFinish
    ? '<div class="sheet-actions"><button class="primary" onclick="setGuestStatus(\'' + guest.id + '\',\'done\')">Selesaikan kunjungan</button></div>'
    : '';

  const timeline = guest.audit.slice().reverse().map(item =>
    '<div class="timeline-item"><b>' + esc(item.label) + '</b><small>' +
    new Date(item.at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) +
    (item.detail ? ' · ' + esc(item.detail) : '') +
    (item.reason ? ' · Alasan: ' + esc(item.reason) : '') + '</small></div>'
  ).join('');

  openSheet(
    '<div class="sheet-head"><h2>Detail tamu</h2><button class="close" onclick="closeSheet()">✕</button></div>' +
    ticketPanel +
    '<div style="font:800 18px Manrope">' + esc(guest.name) + '</div>' +
    '<div class="detail-grid">' +
      '<div class="detail-cell"><small>Jumlah pack</small><b>' + guest.pack + ' orang</b></div>' +
      '<div class="detail-cell"><small>Status</small><b>' + statusLabel(guest.status) + '</b></div>' +
      '<div class="detail-cell"><small>Waktu daftar</small><b>' + fmtTime(guest.created) + '</b></div>' +
      '<div class="detail-cell"><small>' + (guest.status === 'seated' ? 'Seating time' : 'Waiting time') + '</small><b>' +
      (guest.status === 'seated' ? '<span data-seating-countdown="' + esc(guest.id) + '">' + seatingCountdownText(guest) + '</span>' : duration(guest)) +
      '</b></div>' + tableCell +
      '<div class="detail-cell" style="grid-column:1/-1"><small>WhatsApp</small><b>' +
      esc(guest.phone || 'Tidak diisi') + '</b></div></div>' +
    '<div class="sheet-actions"><button class="secondary" onclick="editGuest(\'' + guest.id + '\')">Koreksi data</button>' +
      whatsappButton + '</div>' + cancelActions + finishAction +
    '<div style="margin-top:20px;font:800 13px Manrope">Riwayat perubahan</div>' +
    '<div class="timeline">' + timeline + '</div>'
  );
}
function editGuest(id) {
  const guest = state.guests.find(item => item.id === id);
  if (!guest) return;

  sheetGuest = id;
  openSheet(`<div class="sheet-head"><h2>Koreksi data tamu</h2><button class="close" onclick="openDetail('${id}')">✕</button></div><form onsubmit="saveEdit(event,'${id}')"><div class="field"><label>Nama tamu *</label><input id="editName" required value="${esc(guest.name)}"></div><div class="field"><label>Jumlah pack *</label><input id="editPack" type="number" min="1" max="30" required value="${guest.pack}"></div><div class="field"><label>WhatsApp</label><input id="editPhone" value="${esc(guest.phone)}"></div><div class="field"><label>Alasan koreksi *</label><textarea id="editReason" required placeholder="Tuliskan alasan perubahan data..."></textarea></div><div class="sheet-actions"><button type="button" class="secondary" onclick="openDetail('${id}')">Kembali</button><button class="primary">Simpan koreksi</button></div></form>`);
}

function saveEdit(event, id) {
  event.preventDefault();

  const guest = state.guests.find(item => item.id === id);
  const now = Date.now();

  guest.audit.push({
    at: now,
    label: 'Dikoreksi',
    detail: `Nama: ${guest.name} → ${$('editName').value}; Pack: ${guest.pack} → ${$('editPack').value}`,
    reason: $('editReason').value.trim()
  });

  guest.name = $('editName').value.trim();
  guest.pack = Number($('editPack').value);
  guest.phone = $('editPhone').value.trim();

  save();
  renderAll();
  openDetail(id);
  toast('Koreksi berhasil disimpan');
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

  const csv = rows
    .map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(','))
    .join('\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'waiting-list-' + todayKey() + '.csv';
  link.click();
  URL.revokeObjectURL(link.href);

  toast('File CSV berhasil dibuat');
}

function resetDemo() {
  if (!confirm('Reset seluruh data demo di browser ini?')) return;

  state = seed();
  save();
  renderAll();
  toast('Data demo dikembalikan');
}

/* =========================================================
   8. APP STARTUP AND LIGHTWEIGHT LIVE UPDATES
   ========================================================= */
$('historyDate').value = todayKey();
updateHistoryDateLabel();
syncSeatingSettingInput();
renderAll();

setInterval(() => {
  renderAll();
}, 30000);

setInterval(updateSeatingCountdowns, 1000);
