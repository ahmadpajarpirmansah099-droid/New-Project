/* =========================================================
    8. APP STARTUP: LOAD OPERATIONAL DATA FROM SUPABASE
    ========================================================= */
$('historyDate').value = selectedOperationalDate;
updateHistoryDateLabel();
updateOperationalDateLabels();

let appDataReady = false;
let appInitializing = false;
let appSessionGeneration = 0;
let appInitializationGeneration = 0;
let guestRefreshInterval = null;
let seatingCountdownInterval = null;
let guestRefreshBusy = false;
let guestRefreshToken = 0;
let workspaceReturnPage = null;

function clearSessionIntervals() {
  if (guestRefreshInterval !== null) {
    window.clearInterval(guestRefreshInterval);
    guestRefreshInterval = null;
  }
  if (seatingCountdownInterval !== null) {
    window.clearInterval(seatingCountdownInterval);
    seatingCountdownInterval = null;
  }
  guestRefreshToken += 1;
  guestRefreshBusy = false;
}

function isGuestOperationalPageActive() {
  const activePage = document.querySelector('.page.active')?.id || '';
  return GUEST_OPERATION_PAGES.includes(activePage.replace(/^page-/, ''));
}

async function refreshGuestOperationalData() {
  if (!appDataReady || guestRefreshBusy || document.visibilityState !== 'visible' ||
      !isGuestOperationalPageActive() || !canAccessGuestOperations() ||
      !window.GuestOpsService?.isReady()) return;

  guestRefreshBusy = true;
  const refreshToken = ++guestRefreshToken;
  const sessionGeneration = appSessionGeneration;

  try {
    const refreshed = await window.GuestOpsService.load();
    if (refreshToken !== guestRefreshToken || sessionGeneration !== appSessionGeneration ||
        !appDataReady || document.visibilityState !== 'visible' ||
        !isGuestOperationalPageActive() || !canAccessGuestOperations()) return;

    const currentSnapshot = JSON.stringify({
      guests: state.guests || [],
      reservations: state.reservations || [],
      settings: state.settings || {}
    });
    const refreshedSnapshot = JSON.stringify({
      guests: refreshed.guests || [],
      reservations: refreshed.reservations || [],
      settings: refreshed.settings || {}
    });

    state.guests = refreshed.guests;
    state.reservations = refreshed.reservations;
    state.counters = refreshed.counters;
    state.reservationCounters = refreshed.reservationCounters;
    state.settings = refreshed.settings;

    if (currentSnapshot !== refreshedSnapshot) renderAll();
  } catch (error) {
    if (refreshToken === guestRefreshToken && sessionGeneration === appSessionGeneration) {
      console.error('Guest Operations refresh failed:', error);
    }
  } finally {
    if (refreshToken === guestRefreshToken) guestRefreshBusy = false;
  }
}

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') refreshGuestOperationalData();
});
window.addEventListener('app:guestops-resume', refreshGuestOperationalData);

window.addEventListener('app:auth-signed-out', function () {
  appSessionGeneration += 1;
  appInitializationGeneration += 1;
  appDataReady = false;
  appInitializing = false;
  clearSessionIntervals();
  state = {
    schemaVersion: 3,
    guests: [],
    counters: {},
    reservations: [],
    reservationCounters: {},
    settings: { seatingDurationMinutes: 90 }
  };
  remoteSaveQueue = Promise.resolve();
  window.GuestOpsService?.reset();
  window.MasterDataStore?.reset(); window.StockOpnameUI?.reset();
  closeQuickMenu();
  closeMenu();
  closeSheet();
});

async function initializeWorkspace(event, switchingContext) {
  if (switchingContext) {
    workspaceReturnPage = document.querySelector('.page.active')?.id.replace(/^page-/, '') || null;
    appSessionGeneration += 1; appInitializationGeneration += 1; appDataReady = false; appInitializing = false;
    clearSessionIntervals();
    state = {schemaVersion:3,guests:[],counters:{},reservations:[],reservationCounters:{},settings:{seatingDurationMinutes:90}};
    remoteSaveQueue = Promise.resolve();
    window.GuestOpsService?.reset(); window.MasterDataStore?.reset(); window.StockOpnameUI?.reset();
    closeQuickMenu(); closeMenu(); closeSheet();
  }
  if (appDataReady || appInitializing) return;
  appInitializing = true;
  const sessionGeneration=appSessionGeneration, initializationGeneration=++appInitializationGeneration;
  const isCurrent=()=>sessionGeneration===appSessionGeneration && initializationGeneration===appInitializationGeneration;
  try {
    const authContext=event.detail, supabaseClient=window.AppAuth.getClient();
    await window.MasterDataStore.initialize(supabaseClient,authContext.workspaceId,authContext.activeDivisionId);
    if(!isCurrent()) return;
    await window.MasterDataStore.assertSession();
    if(!isCurrent()) return;
    try { await window.StockOpnameUI?.initialize(supabaseClient,authContext); } catch(error) { console.warn("Stock Opname unavailable:",error.message); }
    if(!isCurrent()) return;
    applyRoleNavigation();
    if(canAccessGuestOperations()) {
      const remoteState=await window.GuestOpsService.initialize(supabaseClient,authContext.workspaceId);
      if(!isCurrent()) return;
      state=remoteState; syncSeatingSettingInput();
      const requestedPage = workspaceReturnPage;
      workspaceReturnPage = null;
      const requestedPageExists = requestedPage && $('page-' + requestedPage) && (requestedPage !== 'stock-opname' || window.StockOpnameService?.available()) && (requestedPage !== 'stock-dashboard' || window.StockOpnameService?.dashboardAvailable());
      const guestPageUnavailable = GUEST_OPERATION_PAGES.includes(requestedPage) && !canAccessGuestOperations();
      const divisionsOverviewUnavailable = requestedPage === 'all-divisions' && authContext.divisionMode !== 'all';
      const targetPage = requestedPageExists && !guestPageUnavailable && !divisionsOverviewUnavailable
        ? requestedPage
        : 'dashboard';
      go(targetPage);
      guestRefreshInterval=window.setInterval(refreshGuestOperationalData,30000);
      seatingCountdownInterval=window.setInterval(()=>{if(isCurrent()) updateSeatingCountdowns();},1000);
    } else {
      if(!isCurrent()) return;
      const requestedPage = workspaceReturnPage;
      workspaceReturnPage = null;
      const requestedPageExists = requestedPage && $('page-' + requestedPage) && (requestedPage !== 'stock-opname' || window.StockOpnameService?.available()) && (requestedPage !== 'stock-dashboard' || window.StockOpnameService?.dashboardAvailable());
      const guestPageUnavailable = GUEST_OPERATION_PAGES.includes(requestedPage);
      const divisionsOverviewUnavailable = requestedPage === 'all-divisions' && authContext.divisionMode !== 'all';
      const targetPage = requestedPageExists && !guestPageUnavailable && !divisionsOverviewUnavailable
        ? requestedPage
        : 'master-items';
      go(targetPage);
    }
    if(!isCurrent()) return;
    const revealed=await window.AppAuth.markReady(authContext.userId,authContext.workspaceId);
    if(!isCurrent()) return;
    if(!revealed) throw new Error('Sesi akun berubah sebelum workspace selesai dimuat.');
    appDataReady=true; appInitializing=false;
  } catch(error) {
    if(!isCurrent()) return;
    console.error('Workspace initialization failed:',error); appInitializing=false; clearSessionIntervals();
    const detail = String(error?.message || '').trim().slice(0, 180);
    const message = detail
      ? 'Workspace gagal dimuat: ' + detail + '. Silakan masuk kembali.'
      : 'Data workspace gagal dimuat. Silakan masuk kembali.';
    await window.AppAuth.failActivation(message);
  }
}

async function loadAllDivisionsOverview() {
  const context=window.AppAuth?.getContext(), host=$('allDivisionsRoot'), subtitle=$('allDivisionsSubtitle');
  if(!host || !context?.isGlobalDeveloper || context.divisionMode!=='all') return;
  if(subtitle) subtitle.textContent='Ringkasan data per divisi · '+context.workspaceName;
  host.innerHTML='<div class="division-overview-loading">Memuat ringkasan divisi...</div>';
  try {
    const client=window.AppAuth.getClient(), ids=context.divisions.map((division)=>division.id);
    const moduleResult=await client.from('workspace_module_state').select('division_id,payload').eq('workspace_id',context.workspaceId).in('division_id',ids);
    if(moduleResult.error) throw moduleResult.error;
    const latest=window.AppAuth.getContext();
    if(!latest || latest.workspaceId!==context.workspaceId || latest.divisionMode!=='all') return;
    const summaries=context.divisions.map((division)=>{
      const rows=(moduleResult.data||[]).filter((row)=>row.division_id===division.id);
      const payload=rows.reduce((combined,row)=>Object.assign(combined,row.payload||{}),{});
      return {name:division.name,items:Array.isArray(payload.masterItems)?payload.masterItems.length:0,
        wips:Array.isArray(payload.wips)?payload.wips.length:0,menus:Array.isArray(payload.menus)?payload.menus.length:0};
    });
    const totals=summaries.reduce((sum,item)=>({items:sum.items+item.items,wips:sum.wips+item.wips,menus:sum.menus+item.menus}),{items:0,wips:0,menus:0});
    host.innerHTML='<article class="division-overview-card"><h2>Total outlet</h2><div class="division-overview-metrics">'+
      '<div><span>Master Barang</span><strong>'+totals.items+'</strong></div><div><span>Resep WIP</span><strong>'+totals.wips+'</strong></div>'+
      '<div><span>Menu</span><strong>'+totals.menus+'</strong></div></div></article>'+
      summaries.map((item)=>'<article class="division-overview-card"><h2>'+escapeHtmlText(item.name)+'</h2><div class="division-overview-metrics">'+
      '<div><span>Master Barang</span><strong>'+item.items+'</strong></div><div><span>Resep WIP</span><strong>'+item.wips+'</strong></div>'+
      '<div><span>Menu</span><strong>'+item.menus+'</strong></div></div></article>').join('');
  } catch(error) {
    console.error('All divisions overview failed:',error);
    host.innerHTML='<div class="division-overview-error">Ringkasan belum dapat dimuat. Periksa koneksi lalu tekan Muat ulang.</div>';
  }
}
function escapeHtmlText(value) {
  return String(value==null?'':value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
window.addEventListener('app:auth-ready',(event)=>initializeWorkspace(event,false));
window.addEventListener('app:workspace-context-changed',(event)=>initializeWorkspace(event,true));


/* Delegasi interaksi untuk elemen statis di index.html. */
document.addEventListener('click', function (event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const handler = window[action];
  if (typeof handler !== 'function') return;
  let args = [];
  try {
    args = JSON.parse(target.dataset.actionArgs || '[]');
  } catch (error) {
    console.error('Argumen aksi tidak valid:', action, error);
    return;
  }
  handler.apply(target, args);
});

document.addEventListener('input', function (event) {
  const target = event.target.closest('[data-input-action]');
  if (!target) return;
  const handler = window[target.dataset.inputAction];
  if (typeof handler === 'function') handler.call(target);
});

document.addEventListener('keydown', function (event) {
  const target = event.target.closest('[data-keydown-action]');
  if (!target || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  const handler = window[target.dataset.keydownAction];
  if (typeof handler === 'function') handler.call(target);
});


/* Delegasi interaksi untuk markup yang dibuat oleh app.js. */
document.addEventListener('click', function (event) {
  const target = event.target.closest('[data-app-action]');
  if (!target) return;
  const action = target.dataset.appAction;
  if (action === 'closeSheetThenGoWaiting') {
    closeSheet();
    go('waiting');
    return;
  }
  if (action === 'closeSheetThenOpenDetail') {
    closeSheet();
    openDetail(target.dataset.appId);
    return;
  }
  const handler = window[action];
  if (typeof handler !== 'function') return;
  const args = [];
  if (target.dataset.appId !== undefined) args.push(target.dataset.appId);
  if (target.dataset.appValue !== undefined) {
    const value = target.dataset.appValue;
    args.push(value !== '' && Number.isFinite(Number(value)) ? Number(value) : value);
  }
  if (target.dataset.appDate !== undefined) args.push(target.dataset.appDate);
  handler.apply(target, args);
});

document.addEventListener('input', function (event) {
  const target = event.target.closest('[data-app-input-action]');
  if (!target) return;
  const handler = window[target.dataset.appInputAction];
  if (typeof handler === 'function') handler.call(target);
});

document.addEventListener('submit', function (event) {
  const form = event.target.closest('[data-app-submit]');
  if (!form) return;
  const handlerName = form.dataset.appSubmit;
  const handler = window[handlerName];
  if (typeof handler !== 'function') {
    event.preventDefault();
    console.error('Submit handler tidak ditemukan:', handlerName);
    if (typeof toast === 'function') {
      toast('Form belum siap. Muat ulang halaman lalu coba lagi.');
    }
    return;
  }
  if (form.dataset.appId !== undefined) handler(event, form.dataset.appId);
  else handler(event);
});
