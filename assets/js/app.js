/* =========================================================
    1. UTILITIES, DATE/TIME, AND APP STATE
    ========================================================= */
const $=id=>document.getElementById(id);
const todayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fmtTime=t=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}).format(new Date(t));
const fmtDate=d=>new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(d+'T00:00:00Z'));
const fmtElapsed=ms=>{let m=Math.max(0,Math.floor(ms/60000));return m<60?m+' menit':Math.floor(m/60)+'j '+m%60+'m'};
const uid=()=>window.crypto?.randomUUID ? window.crypto.randomUUID() : 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
// Legacy browser key retained only to clear the old prototype data once.
const legacyStorageKey='waitlist_frontend_demo_v1';
let state=loadState(),activeFilter='waiting',sheetGuest=null,toastTimer;
let selectedOperationalDate = todayKey();
let remoteSaveQueue = Promise.resolve();
save();
let dashboardCountUpPending = true;
function loadState() {
  try {
    localStorage.removeItem(legacyStorageKey);
  } catch (error) {
    console.warn('Legacy browser data could not be cleared:', error);
  }
  return {
    schemaVersion: 3,
    guests: [],
    counters: {},
    reservations: [],
    reservationCounters: {},
    settings: { seatingDurationMinutes: 90 }
  };
}

function save() {
  if (!window.GuestOpsService || !window.GuestOpsService.isReady()) return;
  remoteSaveQueue = remoteSaveQueue
    .then(() => window.GuestOpsService.persist(state))
    .catch(error => {
      console.error('Guest Operations database save failed:', error);
      toast('Data belum tersimpan ke database. Periksa koneksi lalu coba lagi.');
      return false;
    });
  return remoteSaveQueue;
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

async function saveSeatingDuration() {
  const input = $('seatingDurationInput');
  const value = Number(input?.value);

  if (!Number.isInteger(value) || value < 1 || value > 1440) {
    toast('Masukkan durasi 1 sampai 1440 menit');
    syncSeatingSettingInput();
    return;
  }

  const previous = seatingDurationMinutes();
  state.settings = state.settings || {};
  state.settings.seatingDurationMinutes = value;
  if (await save() === false) {
    state.settings.seatingDurationMinutes = previous;
    syncSeatingSettingInput();
    return;
  }
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

function setWorkspaceHeader(page) {
  const isMasterWorkspace = ['master-items', 'wips', 'menus', 'all-divisions', 'daily-stock'].includes(page);
  const mark = $('workspaceBrandmark');
  const name = $('workspaceBrandname');
  const meta = $('workspaceBrandmeta');
  if (!mark || !name || !meta) return;

  if (isMasterWorkspace) {
    mark.classList.add('is-master');
    mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"/><path d="M4 7.5 12 12l8-4.5M12 12v9M8 5.3l8 4.5"/></svg>';
    name.textContent = page === 'all-divisions' ? 'RINGKASAN DIVISI' : 'MASTER BARANG';
    const context = window.AppAuth?.getContext();
    meta.textContent = context?.isGlobalDeveloper ? (context.workspaceName || 'OUTLET') + (context.divisionMode === 'all' ? ' · SEMUA DIVISI' : ' · ' + (context.activeDivisionName || '')) : 'MASTER DATA WORKSPACE';
    return;
  }

  mark.classList.remove('is-master');
  mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  name.textContent = 'GUEST OPERATIONS';
  const context = window.AppAuth?.getContext();
  meta.textContent = context?.isGlobalDeveloper ? (context.workspaceName || 'OUTLET') + (context.divisionMode === 'all' ? ' · SEMUA DIVISI' : ' · ' + (context.activeDivisionName || '')) : 'ADMIN WORKSPACE';
}

const GUEST_OPERATION_PAGES = ['dashboard', 'waiting', 'history', 'reservations', 'settings'];

function canAccessGuestOperations() {
  const context = window.AppAuth?.getContext();
  if (!context) return false;

  // Developer follows the selected division, with an all-divisions overview allowed.
  const activeDivision = (context.divisions || []).find(item => item.id === context.activeDivisionId);
  const isServiceDivision =
    String(activeDivision?.name || context.activeDivisionName || '').trim().toLowerCase() === 'service';

  if (context.isGlobalDeveloper) return context.divisionMode === 'all' || isServiceDivision;
  return context.workspaceRole === 'service' && isServiceDivision;
}

function applyRoleNavigation() {
  const canUseGuestOps = canAccessGuestOperations();
  document.querySelectorAll('.drawer-item[data-page]').forEach(item => {
    if (GUEST_OPERATION_PAGES.includes(item.dataset.page)) item.style.display = canUseGuestOps ? '' : 'none';
  });
  document.querySelectorAll('.quick-menu-item[data-quick-context="guest"]').forEach(item => {
    item.style.display = canUseGuestOps ? '' : 'none';
  });
}

function go(page) {
  const currentContext = window.AppAuth?.getContext();
  const isDeveloperGuestPage = Boolean(currentContext?.isGlobalDeveloper && GUEST_OPERATION_PAGES.includes(page));
  if (currentContext?.isGlobalDeveloper && currentContext.divisionMode === 'all' && page !== 'all-divisions' && !isDeveloperGuestPage) {
    page = 'all-divisions';
    toast('Pilih satu divisi untuk membuka dan mengubah data modul.');
  }
  document.body.dataset.divisionMode = currentContext?.divisionMode || 'single';
  if (!canAccessGuestOperations() && GUEST_OPERATION_PAGES.includes(page)) {
    toast('Guest Operational hanya tersedia untuk akun Service.');
    page = 'master-items';
  }
  setWorkspaceHeader(page);
  closeQuickMenu();
  document.querySelectorAll('.page').forEach(element => element.classList.remove('active'));
  $('page-' + page).classList.add('active');

  document.querySelectorAll('.drawer-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  $('fab').style.display = ['settings', 'all-divisions'].includes(page) ? 'none' : 'grid';

  if (page === 'settings') syncSeatingSettingInput();
  if (page === 'dashboard') dashboardCountUpPending = true;
  if (page === 'all-divisions') loadAllDivisionsOverview();

  renderAll();
  if (window.MasterDataUI && page === 'master-items') window.MasterDataUI.renderPage(page);
  if (window.WipUI && page === 'wips') window.WipUI.renderPage(page);
  if (window.MenuUI && page === 'menus') window.MenuUI.renderPage(page);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function toggleQuickMenu() {
  const menu = $('quickMenu');
  const open = !menu.classList.contains('show');
  const context = window.AppAuth?.getContext()?.divisionMode === 'all' ? 'guest' : (['master-items','wips','menus'].some(page => $('page-' + page).classList.contains('active')) ? 'master' : 'guest');

  if (open && $('menuDrawer').classList.contains('show')) {
    closeMenu();
  }

  menu.querySelectorAll('.quick-menu-item[data-quick-context]').forEach(item => {
    item.style.display = item.dataset.quickContext === context ? 'flex' : 'none';
  });
  menu.setAttribute('aria-label', context === 'master' ? 'Master Barang' : 'Guest Operational');

  menu.classList.toggle('show', open);
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

  if (['waiting', 'reservations', 'history', 'wips', 'menus'].includes(action)) {
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

let sheetSelectObserver = null;

function closeAppSelectMenus(except) {
  document.querySelectorAll('.app-select-wrap.is-open').forEach(function (wrap) {
    if (wrap === except) return;
    wrap.classList.remove('is-open', 'opens-up');
    const trigger = wrap.querySelector('.app-select-trigger');
    const menu = wrap.querySelector('.app-select-menu');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (menu) menu.hidden = true;
  });
  document.querySelectorAll('.app-select-dim').forEach(function (layer) {
    layer.remove();
  });
}

function syncAppSelect(select) {
  const wrap = select && select._appSelectWrap;
  if (!wrap) return;

  const trigger = wrap.querySelector('.app-select-trigger');
  const label = wrap.querySelector('.app-select-value');
  const menu = wrap.querySelector('.app-select-menu');
  if (!trigger || !label || !menu) return;

  const selected = select.options[select.selectedIndex];
  label.textContent = selected ? selected.textContent.trim() : 'Pilih...';
  trigger.disabled = select.disabled;
  trigger.setAttribute('aria-label', select.getAttribute('aria-label') || label.textContent);
  menu.replaceChildren();

  Array.from(select.options).forEach(function (option) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'app-select-option';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(option.value === select.value));
    item.disabled = option.disabled;
    item.dataset.value = option.value;
    item.textContent = option.textContent.trim();
    if (option.value === select.value) item.classList.add('is-selected');
    menu.appendChild(item);
  });
}

function enhanceAppSelect(select) {
  if (!select || select.tagName !== 'SELECT' || select.dataset.appSelectReady === 'true') return;
  // Hidden backing selects are state holders for searchable recipe inputs, not visible controls.
  if (select.hidden || select.hasAttribute('hidden') || select.getAttribute('aria-hidden') === 'true' || select.style.display === 'none') return;

  const wrap = document.createElement('div');
  wrap.className = 'app-select-wrap';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'app-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const value = document.createElement('span');
  value.className = 'app-select-value';

  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.classList.add('app-select-arrow');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm6 9 6 6 6-6');
  arrow.appendChild(path);
  trigger.append(value, arrow);

  const menu = document.createElement('div');
  menu.className = 'app-select-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');

  wrap.append(trigger, menu);
  select.parentNode.insertBefore(wrap, select);
  select.classList.add('app-select-native');
  select.dataset.appSelectReady = 'true';
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;
  select._appSelectWrap = wrap;

  trigger.addEventListener('click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    const shouldOpen = !wrap.classList.contains('is-open');
    closeAppSelectMenus(wrap);
    wrap.classList.toggle('is-open', shouldOpen);
    trigger.setAttribute('aria-expanded', String(shouldOpen));
    menu.hidden = !shouldOpen;
    if (shouldOpen) {
      const sheet = wrap.closest('.sheet');
      if (sheet) {
        const dim = document.createElement('div');
        dim.className = 'app-select-dim';
        dim.setAttribute('aria-hidden', 'true');
        sheet.appendChild(dim);
      }
    }

    if (shouldOpen) {
      const rect = wrap.getBoundingClientRect();
      const estimatedHeight = Math.min(240, Math.max(48, select.options.length * 46));
      const roomBelow = window.innerHeight - rect.bottom;
      const roomAbove = rect.top;
      wrap.classList.toggle('opens-up', roomBelow < estimatedHeight + 16 && roomAbove > roomBelow);
    } else {
      wrap.classList.remove('opens-up');
    }
  });

  menu.addEventListener('click', function (event) {
    const optionButton = event.target.closest('.app-select-option');
    if (!optionButton || optionButton.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    select.value = optionButton.dataset.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncAppSelect(select);
    closeAppSelectMenus();
    trigger.focus({ preventScroll: true });
  });

  const optionObserver = new MutationObserver(function () {
    syncAppSelect(select);
  });
  optionObserver.observe(select, { childList: true, subtree: true, characterData: true, attributes: true });
  select._appSelectObserver = optionObserver;
  syncAppSelect(select);
}

function enhanceAppSelects(container) {
  if (!container) return;
  if (container.matches && container.matches('select')) enhanceAppSelect(container);
  container.querySelectorAll('select').forEach(enhanceAppSelect);
}

function initAppSelectObserver() {
  const container = $('sheetContent');
  if (!container || sheetSelectObserver) return;
  sheetSelectObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) enhanceAppSelects(node);
      });
    });
  });
  sheetSelectObserver.observe(container, { childList: true, subtree: true });
  document.addEventListener('pointerdown', function (event) {
    if (!event.target.closest('.app-select-wrap')) closeAppSelectMenus();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeAppSelectMenus();
  });
}

function openSheet(content) {
  $('sheetContent').innerHTML = content;
  initAppSelectObserver();
  enhanceAppSelects($('sheetContent'));
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

