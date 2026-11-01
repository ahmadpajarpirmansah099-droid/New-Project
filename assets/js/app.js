const $=id=>document.getElementById(id);
const todayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fmtTime=t=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}).format(new Date(t));
const fmtDate=d=>new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(d+'T00:00:00Z'));
const fmtElapsed=ms=>{let m=Math.max(0,Math.floor(ms/60000));return m<60?m+' menit':Math.floor(m/60)+'j '+m%60+'m'};
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const key='waitlist_frontend_demo_v1';
let state=loadState(),activeFilter='all',sheetGuest=null,toastTimer;
function loadState(){try{let s=JSON.parse(localStorage.getItem(key));if(s&&Array.isArray(s.guests)&&s.counters){if(!Array.isArray(s.reservations))s.reservations=[];if(!s.reservationCounters)s.reservationCounters={};return s}}catch(e){}return seed()}
function seed(){let d=todayKey(),y=new Date(Date.now()-86400000);let yd=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(y),now=Date.now();let gs=[
['WL-001','Rina Kusuma',2,'0812-xxxx-1043','done',142,118],['WL-002','Budi Santoso',4,'0813-xxxx-7720','done',128,96],['WL-003','Dewi Lestari',3,'','cancelled',110,90],['WL-004','Andika Pratama',2,'0857-xxxx-3381','done',92,70],['WL-005','Sari Wulandari',6,'0821-xxxx-5590','waiting',48],['WL-006','Fajar Nugroho',2,'0878-xxxx-2214','called',36],['WL-007','Maya Anggraini',5,'','waiting',27],['WL-009','Hendra Wijaya',3,'0812-xxxx-9907','cancelled',22,15],['WL-010','Putri Ramadhani',2,'0896-xxxx-4412','waiting',14],['WL-011','Yoga Saputra',8,'0815-xxxx-6630','waiting',6]
].map(([ticket,name,pack,phone,status,ago,res])=>({id:uid(),ticket,day:d,name,pack,phone,status,created:now-ago*60000,resolved:res?now-res*60000:null,audit:[{at:now-ago*60000,label:'Terdaftar',detail:pack+' pack'}]}));
gs.forEach(g=>{if(g.status!=='waiting'&&g.status!=='called')g.audit.push({at:g.resolved,label:g.status==='done'?'Selesai / Sudah Duduk':'Dibatalkan'})});
let prev=[['WL-001','Agus Salim',2,'done'],['WL-002','Lina Marlina',4,'done'],['WL-003','Rizky Firmansyah',3,'waiting'],['WL-004','Nadia Paramitha',2,'cancelled'],['WL-005','Teguh Prakoso',5,'waiting']].map(([ticket,name,pack,status],i)=>({id:uid(),ticket,day:yd,name,pack,phone:'',status,created:now-(24*60+300-i*40)*60000,resolved:status==='waiting'?null:now-(24*60+275-i*40)*60000,audit:[{at:now-86400000,label:'Terdaftar'}]}));
return{guests:[...prev,...gs],counters:{[d]:11,[yd]:5},reservations:[],reservationCounters:{}}}
function save(){localStorage.setItem(key,JSON.stringify(state))}
function nextTicket(day){let n=(state.counters[day]||0)+1;state.counters[day]=n;return'WL-'+String(n).padStart(3,'0')}
function toast(msg){let t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2300)}
function go(page){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));$('page-'+page).classList.add('active');document.querySelectorAll('.drawer-item').forEach(n=>n.classList.toggle('active',n.dataset.page===page));$('fab').style.display=['settings','reservations'].includes(page)?'none':'grid';renderAll();window.scrollTo({top:0,behavior:'auto'})}
function toggleMenu(){const open=!$('menuDrawer').classList.contains('show');$('menuDrawer').classList.toggle('show',open);$('menuBackdrop').classList.toggle('show',open);$('menuDrawer').setAttribute('aria-hidden',String(!open));$('menuToggle').setAttribute('aria-expanded',String(open));document.body.style.overflow=open?'hidden':''}
function closeMenu(){$('menuDrawer').classList.remove('show');$('menuBackdrop').classList.remove('show');$('menuDrawer').setAttribute('aria-hidden','true');$('menuToggle').setAttribute('aria-expanded','false');document.body.style.overflow=''}
function navigateFromMenu(page){closeMenu();go(page)}
function openSheet(content){$('sheetContent').innerHTML=content;$('sheet').style.transform='';$('backdrop').classList.add('show');$('sheet').classList.add('show');document.body.style.overflow='hidden';initSheetDrag()}
function closeSheet(){$('backdrop').classList.remove('show');$('sheet').classList.remove('show');document.body.style.overflow='';sheetGuest=null}
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

function openAdd(){sheetGuest=null;openSheet(`<div class="sheet-head"><h2>Tambah tamu</h2><button class="close" onclick="closeSheet()">✕</button></div><form onsubmit="saveGuest(event)"><div class="field"><label>Nama tamu *</label><input id="guestName" required maxlength="70" placeholder="Masukkan nama tamu" autocomplete="name"></div><div class="field"><label>Jumlah pack *</label><div class="pack-control"><button type="button" onclick="changePack(-1)">−</button><strong id="packValue">2</strong><button type="button" onclick="changePack(1)">+</button></div><input type="hidden" id="guestPack" value="2"></div><div class="field"><label>Nomor WhatsApp <span style="color:#9aa5b8;font-weight:500">(opsional)</span></label><input id="guestPhone" inputmode="tel" placeholder="08xxxxxxxxxx"></div><div class="field"><label>Status awal</label><div class="seg"><button type="button" class="selected" id="segWait" onclick="chooseInitial('waiting')">Menunggu</button><button type="button" id="segDone" onclick="chooseInitial('done')">Langsung duduk</button></div><input type="hidden" id="initialStatus" value="waiting"></div><div class="sheet-actions"><button type="button" class="secondary" onclick="closeSheet()">Batal</button><button type="submit" class="primary">Simpan tamu</button></div></form>`);setTimeout(()=>$('guestName')?.focus(),250)}
function changePack(d){let v=Math.max(1,Math.min(30,Number($('guestPack').value)+d));$('guestPack').value=v;$('packValue').textContent=v}
function chooseInitial(v){$('initialStatus').value=v;$('segWait').classList.toggle('selected',v==='waiting');$('segDone').classList.toggle('selected',v==='done')}
function saveGuest(e){e.preventDefault();let day=todayKey(),now=Date.now(),status=$('initialStatus').value;let g={id:uid(),ticket:nextTicket(day),day,name:$('guestName').value.trim(),pack:Number($('guestPack').value),phone:$('guestPhone').value.trim(),status,created:now,resolved:status==='done'?now:null,audit:[{at:now,label:'Terdaftar',detail:$('guestPack').value+' pack'}]};if(status==='done')g.audit.push({at:now,label:'Langsung Duduk'});state.guests.push(g);save();closeSheet();renderAll();toast('Tamu berhasil ditambahkan · '+g.ticket)}
function statusLabel(s){return{waiting:'Menunggu',called:'Dipanggil',done:'Selesai',cancelled:'Dibatalkan'}[s]||s}
function statusClass(s){return's-'+s}
function duration(g){return fmtElapsed((g.resolved||Date.now())-g.created)}
function guestCard(g,i,history=false){let act='';if(!history&&g.status==='waiting')act=`<button class="mini blue" onclick="setGuestStatus('${g.id}','called')">Panggil</button><button class="mini green" onclick="setGuestStatus('${g.id}','done')">Duduk</button>`;else if(!history&&g.status==='called')act=`<button class="mini green" onclick="setGuestStatus('${g.id}','done')">Duduk</button>`;return`<article class="guest" style="animation-delay:${Math.min(i,7)*.035}s"><div class="guest-row" onclick="openDetail('${g.id}')"><div class="ticket">${g.ticket}</div><div class="guest-main"><div class="guest-name">${esc(g.name)}</div><div class="guest-meta"><span>${g.pack} pack</span><span>·</span><span>${fmtTime(g.created)}</span></div></div><span class="status ${statusClass(g.status)}">${statusLabel(g.status)}</span></div><div class="guest-bottom"><span class="waittime">Waiting time <b>${duration(g)}</b></span><div class="actions">${act}<button class="mini" onclick="openDetail('${g.id}')">Detail</button></div></div></article>`}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderAll(){let d=todayKey(),today=state.guests.filter(g=>g.day===d),waiting=today.filter(g=>g.status==='waiting'||g.status==='called'),done=today.filter(g=>g.status==='done'),cancel=today.filter(g=>g.status==='cancelled');$('dateLabel').textContent=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short'}).format(new Date());$('totalCount').textContent=today.length;$('packCount').textContent=today.reduce((a,g)=>a+g.pack,0);$('waitingCount').textContent=waiting.length;$('doneCount').textContent=done.length;$('cancelCount').textContent=cancel.length;let resolved=today.filter(g=>g.resolved);$('avgWait').textContent=resolved.length?fmtElapsed(resolved.reduce((a,g)=>a+g.resolved-g.created,0)/resolved.length):'—';let pending=state.guests.filter(g=>g.day!==d&&(g.status==='waiting'||g.status==='called'));$('pendingWrap').innerHTML=pending.length?`<div class="pending"><h3>⚠ ${pending.length} tugas tertunda dari hari sebelumnya</h3><p>Periksa tamu yang belum diselesaikan. Data tidak dihapus otomatis.</p>${pending.map(g=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-top:1px solid #f3e5d0;font-size:11px"><span><b>${g.ticket}</b> · ${esc(g.name)}</span><button class="mini green" onclick="openDetail('${g.id}')">Periksa</button></div>`).join('')}</div>`:'';$('dashboardList').innerHTML=waiting.length?waiting.sort((a,b)=>a.created-b.created).map(guestCard).join(''):`<div class="empty"><div class="empty-icon">✓</div><h3>Belum ada antrean aktif</h3><p>Tambahkan tamu baru untuk mulai mengelola antrean.</p></div>`;renderQueue();renderHistory();renderReservations()}
function setFilter(f){activeFilter=f;document.querySelectorAll('#queueFilters .filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));renderQueue()}
function renderQueue(){if(!$('queueList'))return;let q=($('queueSearch')?.value||'').toLowerCase(),d=todayKey();let list=state.guests.filter(g=>g.day===d&&(activeFilter==='all'||g.status===activeFilter)&&(g.name+' '+g.ticket).toLowerCase().includes(q)).sort((a,b)=>a.created-b.created);$('queueList').innerHTML=list.length?list.map((g,i)=>guestCard(g,i)).join(''):`<div class="empty"><div class="empty-icon">⌕</div><h3>Tidak ada antrean</h3><p>Coba ubah filter atau kata pencarian.</p></div>`}

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

function renderHistory(){if(!$('historyList'))return;let d=$('historyDate').value||todayKey(),q=($('historySearch')?.value||'').toLowerCase(),list=state.guests.filter(g=>g.day===d&&g.name.toLowerCase().includes(q)).sort((a,b)=>b.created-a.created);$('historyList').innerHTML=list.length?list.map((g,i)=>guestCard(g,i,true)).join(''):`<div class="empty"><div class="empty-icon">◷</div><h3>Belum ada riwayat</h3><p>Tidak ada tamu pada tanggal yang dipilih.</p></div>`}

let reservationMonth=todayKey().slice(0,7),reservationDate=todayKey();
const reservationStatusLabel=s=>({pending:'Menunggu Reservasi',seated:'Duduk',cancelled:'Dibatalkan'}[s]||s);
function reservationDateKey(y,m,d){return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')}
function reservationDateText(value,opts={weekday:'long',day:'numeric',month:'long',year:'numeric'}){return new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',...opts}).format(new Date(value+'T12:00:00Z'))}
function reservationCode(date){let n=(state.reservationCounters[date]||0)+1;state.reservationCounters[date]=n;return'RSV-'+String(n).padStart(3,'0')}
function changeReservationMonth(delta){let [y,m]=reservationMonth.split('-').map(Number);let d=new Date(Date.UTC(y,m-1+delta,1));reservationMonth=d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');reservationDate=reservationMonth+'-01';renderReservations()}
function goReservationToday(){reservationMonth=todayKey().slice(0,7);reservationDate=todayKey();renderReservations()}
function selectReservationDate(date){reservationDate=date;renderReservations()}
function renderReservations(){
 if(!$('reservationCalendar'))return;
 const [year,month]=reservationMonth.split('-').map(Number),firstOffset=new Date(Date.UTC(year,month-1,1)).getUTCDay(),days=new Date(Date.UTC(year,month,0)).getUTCDate();
 $('reservationMonthLabel').textContent=reservationDateText(reservationMonth+'-01',{month:'long',year:'numeric'});
 const weekday=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];let cells=weekday.map(d=>'<div class="reservation-weekday">'+d+'</div>').join('');
 for(let i=0;i<firstOffset;i++)cells+='<div class="reservation-day outside"></div>';
 for(let day=1;day<=days;day++){const date=reservationDateKey(year,month,day),items=state.reservations.filter(r=>r.date===date),has=items.length>0;
 const dots=(items.some(r=>r.status==='pending')?'<i></i>':'')+(items.some(r=>r.status==='seated')?'<i class="seated"></i>':'')+(items.some(r=>r.status==='cancelled')?'<i class="cancelled"></i>':'');
 cells+='<button type="button" class="reservation-day'+(date===todayKey()?' today':'')+(date===reservationDate?' selected':'')+(has?' has-items':'')+'" onclick="selectReservationDate(\''+date+'\')"><span>'+day+'</span><span class="reservation-day-dots">'+dots+'</span></button>'}
 $('reservationCalendar').innerHTML=cells;
 const list=state.reservations.filter(r=>r.date===reservationDate).sort((a,b)=>a.time.localeCompare(b.time));
 $('reservationDateLabel').textContent=reservationDateText(reservationDate);
 $('reservationCount').textContent=list.length+' reservasi';
 $('reservationList').innerHTML=list.length?list.map(r=>'<article class="reservation-card"><div><div class="reservation-code">'+esc(r.code)+'</div><div class="reservation-name">'+esc(r.name)+'</div><div class="reservation-meta"><span>'+r.pack+' pack</span><span>·</span><span>'+esc(r.phone||'Tanpa WhatsApp')+'</span><span>·</span><span>'+esc(r.smoking)+'</span></div><span class="reservation-status '+r.status+'">'+reservationStatusLabel(r.status)+'</span></div><div class="reservation-time"><small>JAM</small><strong>'+esc(r.time)+'</strong></div><div class="reservation-actions"><button onclick="openReservationDetail(\''+r.id+'\')">Detail</button>'+(r.status==='pending'?'<button class="seat-action" onclick="seatReservation(\''+r.id+'\')">Dudukkan tamu</button><button class="cancel-action" onclick="cancelReservation(\''+r.id+'\')">Batalkan</button>':'')+'</div></article>').join(''):'<div class="reservation-empty"><strong>Belum ada reservasi</strong>Tidak ada reservasi pada tanggal ini.</div>';
}
function openReservationForm(){
 const min=todayKey();
 openSheet('<div class="sheet-head"><h2>Reservasi baru</h2><button class="close" onclick="closeSheet()">✕</button></div><form onsubmit="saveReservation(event)"><div class="field"><label>Nama tamu *</label><input id="rName" required maxlength="120" placeholder="Nama tamu"></div><div class="field"><label>Jumlah pack *</label><input id="rPack" type="number" min="1" max="500" value="2" required></div><div class="field"><label>Tanggal reservasi *</label><input id="rDate" type="date" min="'+min+'" value="'+(reservationDate<min?min:reservationDate)+'" required></div><div class="field"><label>Jam reservasi *</label><input id="rTime" type="time" value="19:00" required></div><div class="field"><label>WhatsApp (opsional)</label><input id="rPhone" inputmode="tel" maxlength="24" placeholder="08xxxxxxxxxx"></div><div class="field"><label>Preferensi smoking</label><select id="rSmoking"><option>Non Smoking</option><option>Smoking</option></select></div><div class="field"><label>Catatan (opsional)</label><textarea id="rNote" rows="2" maxlength="1000" placeholder="Catatan untuk staf"></textarea></div><div class="sheet-actions"><button type="button" class="secondary" onclick="closeSheet()">Batal</button><button class="primary" type="submit">Simpan reservasi</button></div></form>');
}
function saveReservation(e){e.preventDefault();const name=$('rName').value.trim(),pack=Number($('rPack').value),date=$('rDate').value,time=$('rTime').value,phone=$('rPhone').value.trim();
 if(!name||!Number.isInteger(pack)||pack<1||pack>500||!date||!time){toast('Lengkapi data reservasi terlebih dahulu');return}
 if(date<todayKey()||(date===todayKey()&&time<new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()))){toast('Tanggal dan jam tidak boleh di masa lalu');return}
 if(phone&&!/^(\+?62|0)\d{8,13}$/.test(phone.replace(/[\s-]/g,''))){toast('Format WhatsApp belum sesuai');return}
 const r={id:uid(),code:reservationCode(date),name,pack,date,time,phone,smoking:$('rSmoking').value,note:$('rNote').value.trim(),status:'pending',created:Date.now(),guestId:null};
 state.reservations.push(r);save();reservationMonth=date.slice(0,7);reservationDate=date;closeSheet();renderAll();toast('Reservasi tersimpan · '+r.code);
}
function openReservationDetail(id){const r=state.reservations.find(x=>x.id===id);if(!r)return;openSheet('<div class="sheet-head"><h2>Detail reservasi</h2><button class="close" onclick="closeSheet()">✕</button></div><div class="detail-ticket"><small>KODE RESERVASI</small><strong>'+esc(r.code)+'</strong><small>'+esc(reservationDateText(r.date))+'</small></div><div style="font:800 18px Manrope">'+esc(r.name)+'</div><div class="detail-grid"><div class="detail-cell"><small>Jam reservasi</small><b>'+esc(r.time)+' WIB</b></div><div class="detail-cell"><small>Jumlah pack</small><b>'+r.pack+' pack</b></div><div class="detail-cell"><small>Status</small><b>'+reservationStatusLabel(r.status)+'</b></div><div class="detail-cell"><small>Smoking</small><b>'+esc(r.smoking)+'</b></div><div class="detail-cell" style="grid-column:1/-1"><small>WhatsApp</small><b>'+esc(r.phone||'—')+'</b></div><div class="detail-cell" style="grid-column:1/-1"><small>Catatan</small><b>'+esc(r.note||'—')+'</b></div></div><div class="sheet-actions"><button class="secondary" onclick="closeSheet()">Tutup</button></div>')}
function cancelReservation(id){const r=state.reservations.find(x=>x.id===id);if(!r||r.status!=='pending')return;if(!confirm('Batalkan reservasi '+r.code+'?'))return;r.status='cancelled';r.cancelledAt=Date.now();save();renderAll();toast('Reservasi dibatalkan')}
function seatReservation(id){const r=state.reservations.find(x=>x.id===id);if(!r||r.status!=='pending')return;if(r.date!==todayKey()){toast('Tamu hanya bisa didudukkan pada tanggal reservasinya');return}openSheet('<div class="sheet-head"><h2>Dudukkan tamu</h2><button class="close" onclick="closeSheet()">✕</button></div><p class="page-sub">'+esc(r.code)+' · '+esc(r.name)+'</p><form onsubmit="confirmSeatReservation(event,\''+id+'\')"><div class="field"><label>Nomor / nama meja *</label><input id="rTable" required maxlength="80" placeholder="Contoh: Meja 05, VIP 2"></div><div class="sheet-actions"><button type="button" class="secondary" onclick="closeSheet()">Batal</button><button class="primary">Konfirmasi duduk</button></div></form>')}
function confirmSeatReservation(e,id){e.preventDefault();const r=state.reservations.find(x=>x.id===id),table=$('rTable').value.trim();if(!r||!table)return;const now=Date.now(),g={id:uid(),ticket:nextTicket(todayKey()),day:todayKey(),name:r.name,pack:r.pack,phone:r.phone,status:'done',created:now,resolved:now,audit:[{at:now,label:'Reservasi '+r.code+' · Duduk',detail:'Meja '+table}]};state.guests.push(g);r.status='seated';r.guestId=g.id;r.table=table;r.seatedAt=now;save();closeSheet();renderAll();toast('Tamu masuk ke catatan operasional · '+g.ticket)}

function setGuestStatus(id,status){let g=state.guests.find(x=>x.id===id);if(!g||['done','cancelled'].includes(g.status))return;let now=Date.now();g.status=status;if(status==='done'||status==='cancelled')g.resolved=now;g.audit.push({at:now,label:status==='called'?'Dipanggil':status==='done'?'Selesai / Sudah Duduk':'Dibatalkan'});save();renderAll();if($('sheet').classList.contains('show'))openDetail(id);toast(status==='called'?'Tamu dipanggil':status==='done'?'Tamu ditandai sudah duduk':'Antrean dibatalkan')}
function openDetail(id){let g=state.guests.find(x=>x.id===id);if(!g)return;sheetGuest=id;let canChange=!['done','cancelled'].includes(g.status);openSheet(`<div class="sheet-head"><h2>Detail tamu</h2><button class="close" onclick="closeSheet()">✕</button></div><div class="detail-ticket"><small>NOMOR ANTREAN</small><strong>${g.ticket}</strong><small>${fmtDate(g.day)}</small></div><div style="font:800 18px Manrope">${esc(g.name)}</div><div class="detail-grid"><div class="detail-cell"><small>Jumlah pack</small><b>${g.pack} orang</b></div><div class="detail-cell"><small>Status</small><b>${statusLabel(g.status)}</b></div><div class="detail-cell"><small>Waktu daftar</small><b>${fmtTime(g.created)}</b></div><div class="detail-cell"><small>Waiting time</small><b>${duration(g)}</b></div><div class="detail-cell" style="grid-column:1/-1"><small>WhatsApp</small><b>${esc(g.phone||'Tidak diisi')}</b></div></div><div class="sheet-actions"><button class="secondary" onclick="editGuest('${g.id}')">Koreksi data</button>${g.phone?`<button class="primary" onclick="toast('Aksi WhatsApp demo')">WhatsApp</button>`:''}</div>${canChange?`<div class="sheet-actions"><button class="secondary" onclick="setGuestStatus('${g.id}','cancelled')">Batalkan</button><button class="primary" onclick="setGuestStatus('${g.id}','done')">Sudah duduk</button></div>`:''}<div style="margin-top:20px;font:800 13px Manrope">Riwayat perubahan</div><div class="timeline">${g.audit.slice().reverse().map(a=>`<div class="timeline-item"><b>${esc(a.label)}</b><small>${new Date(a.at).toLocaleString('id-ID',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}${a.detail?' · '+esc(a.detail):''}${a.reason?' · Alasan: '+esc(a.reason):''}</small></div>`).join('')}</div>`)}
function editGuest(id){let g=state.guests.find(x=>x.id===id);if(!g)return;sheetGuest=id;openSheet(`<div class="sheet-head"><h2>Koreksi data tamu</h2><button class="close" onclick="openDetail('${id}')">✕</button></div><form onsubmit="saveEdit(event,'${id}')"><div class="field"><label>Nama tamu *</label><input id="editName" required value="${esc(g.name)}"></div><div class="field"><label>Jumlah pack *</label><input id="editPack" type="number" min="1" max="30" required value="${g.pack}"></div><div class="field"><label>WhatsApp</label><input id="editPhone" value="${esc(g.phone)}"></div><div class="field"><label>Alasan koreksi *</label><textarea id="editReason" required placeholder="Tuliskan alasan perubahan data..."></textarea></div><div class="sheet-actions"><button type="button" class="secondary" onclick="openDetail('${id}')">Kembali</button><button class="primary">Simpan koreksi</button></div></form>`)}
function saveEdit(e,id){e.preventDefault();let g=state.guests.find(x=>x.id===id),now=Date.now();g.audit.push({at:now,label:'Dikoreksi',detail:`Nama: ${g.name} → ${$('editName').value}; Pack: ${g.pack} → ${$('editPack').value}`,reason:$('editReason').value.trim()});g.name=$('editName').value.trim();g.pack=Number($('editPack').value);g.phone=$('editPhone').value.trim();save();renderAll();openDetail(id);toast('Koreksi berhasil disimpan')}
function exportCSV(){let rows=[['Tanggal','Nomor antrean','Nama','Pack','WhatsApp','Status','Waktu daftar','Waiting time'],...state.guests.filter(g=>g.day===todayKey()).map(g=>[g.day,g.ticket,g.name,g.pack,g.phone,statusLabel(g.status),fmtTime(g.created),duration(g)])];let csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');let blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='waiting-list-'+todayKey()+'.csv';a.click();URL.revokeObjectURL(a.href);toast('File CSV berhasil dibuat')}
function resetDemo(){if(!confirm('Reset seluruh data demo di browser ini?'))return;state=seed();save();renderAll();toast('Data demo dikembalikan')}
$('historyDate').value=todayKey();updateHistoryDateLabel();renderAll();setInterval(()=>{renderAll()},30000);
