(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TOPIC = 'user-monitoring:global';
  const OFFLINE_AFTER_MS = 120000;
  const HEARTBEAT_MS = 25000;
  const REFRESH_MS = 30000;

  let client = null;
  let context = null;
  let channel = null;
  let heartbeatTimer = null;
  let refreshTimer = null;
  let currentTab = 'live';
  let selectedWorkspace = 'all';
  let workspaces = [];
  let refreshBusy = false;

  function isDeveloper() {
    return Boolean(context?.isGlobalDeveloper);
  }

  function activePage() {
    return document.querySelector('.page.active')?.id === 'page-user-monitoring';
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function formatDuration(start, end) {
    const from = new Date(start).getTime();
    const to = end ? new Date(end).getTime() : Date.now();
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return '—';
    const minutes = Math.floor((to - from) / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const rest = minutes % 60;
    if (days) return days + ' hari ' + hours + ' jam';
    if (hours) return hours + ' jam ' + rest + ' mnt';
    return rest + ' menit';
  }

  function sessionStatus(session) {
    if (session.status === 'logged_out') return 'logged_out';
    const lastSeen = new Date(session.last_seen_at).getTime();
    if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > OFFLINE_AFTER_MS) return 'offline';
    return 'online';
  }

  function statusLabel(status) {
    if (status === 'logged_out') return 'Logout';
    return status === 'online' ? 'Online' : 'Offline';
  }

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderMessage(target, message) {
    if (!target) return;
    target.replaceChildren(create('div', 'monitor-empty', message));
  }

  async function getSessionId() {
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session?.access_token) return null;
    try {
      const encoded = data.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
      const payload = JSON.parse(atob(padded));
      return payload.session_id || null;
    } catch {
      return null;
    }
  }

  function getDeviceInfo() {
    const ua = navigator.userAgent || '';
    const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
      (/Android/i.test(ua) && !/Mobile/i.test(ua));
    const isMobile = !isTablet && /Android|iPhone|iPod|Mobile/i.test(ua);
    let browser = 'Browser lain';
    if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
    else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
    else if (/CriOS|Chrome\//i.test(ua)) browser = 'Google Chrome';
    else if (/Safari\//i.test(ua)) browser = 'Safari';

    let operatingSystem = 'OS lain';
    if (/Android/i.test(ua)) operatingSystem = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) operatingSystem = 'iOS';
    else if (/Windows/i.test(ua)) operatingSystem = 'Windows';
    else if (/Mac OS X|Macintosh/i.test(ua)) operatingSystem = 'macOS';
    else if (/Linux/i.test(ua)) operatingSystem = 'Linux';

    return {
      device_type: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
      browser,
      operating_system: operatingSystem
    };
  }

  async function registerSession() {
    const device = getDeviceInfo();
    const { data, error } = await client.rpc('register_user_monitoring_session', {
      p_device_type: device.device_type,
      p_browser: device.browser,
      p_operating_system: device.operating_system,
      p_workspace_id: context?.workspaceId || null
    });
    if (error) throw error;
    return data;
  }

  async function sendHeartbeat() {
    if (!client) return;
    const { error } = await client.rpc('touch_user_monitoring_session');
    if (error) console.warn('User Monitoring heartbeat failed:', error.message);
  }

  async function startPresence() {
    const sessionId = await getSessionId();
    if (!sessionId) return;

    channel = client.channel(TOPIC, {
      config: {
        private: true,
        presence: { key: sessionId }
      }
    });

    if (isDeveloper()) {
      channel.on('presence', { event: 'sync' }, () => {
        if (activePage()) refresh();
      });
      channel.on('presence', { event: 'join' }, () => {
        if (activePage()) refresh();
      });
      channel.on('presence', { event: 'leave' }, () => {
        if (activePage()) refresh();
      });
    }

    channel.subscribe(async (status, error) => {
      if (status === 'SUBSCRIBED') {
        const device = getDeviceInfo();
        const { error: trackError } = await channel.track({
          auth_session_id: sessionId,
          user_id: context.userId,
          device_type: device.device_type,
          joined_at: new Date().toISOString()
        });
        if (trackError) console.warn('User Monitoring Presence track failed:', trackError.message);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('User Monitoring Realtime unavailable:', error?.message || status);
      }
    });
  }

  async function start(supabaseClient, authContext) {
    await stop();
    client = supabaseClient;
    context = authContext;
    if (!client || !context?.userId) return;

    try {
      await registerSession();
    } catch (error) {
      console.error('User Monitoring session registration failed:', error);
    }

    await startPresence();
    await sendHeartbeat();

    heartbeatTimer = window.setInterval(sendHeartbeat, HEARTBEAT_MS);
    refreshTimer = window.setInterval(() => {
      if (activePage() && document.visibilityState === 'visible') refresh();
    }, REFRESH_MS);
  }

  async function stop() {
    if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
    if (refreshTimer !== null) window.clearInterval(refreshTimer);
    heartbeatTimer = null;
    refreshTimer = null;

    if (channel && client) {
      try { await channel.untrack(); } catch (_) {}
      try { await client.removeChannel(channel); } catch (_) {}
    }
    channel = null;
    client = null;
    context = null;
    workspaces = [];
    refreshBusy = false;
  }

  async function loadWorkspaces() {
    const { data, error } = await client.from('workspaces').select('id,name').order('name');
    if (error) throw error;
    workspaces = data || [];
    renderWorkspaceFilter();
  }

  let workspaceDropdown = null;

  function renderWorkspaceFilter() {
    const select = $('monitorActivityWorkspace');
    if (!select) return;
    const previous = selectedWorkspace;
    select.replaceChildren();
    select.appendChild(new Option('Semua outlet', 'all'));
    select.appendChild(new Option('Tidak teridentifikasi', 'unknown'));
    workspaces.forEach((workspace) => select.appendChild(new Option(workspace.name, workspace.id)));
    select.value = Array.from(select.options).some((option) => option.value === previous) ? previous : 'all';
    selectedWorkspace = select.value;
    setupWorkspaceDropdown(select);
    syncWorkspaceDropdown();
  }

  function setupWorkspaceDropdown(select) {
    if (workspaceDropdown) return;

    const control = create('div', 'monitor-select-control');
    const trigger = create('button', 'monitor-select-trigger');
    trigger.type = 'button';
    trigger.id = 'monitorActivityWorkspaceTrigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'monitorActivityWorkspaceMenu');

    const label = create('span', 'monitor-select-value', 'Semua outlet');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('width', '18');
    arrow.setAttribute('height', '18');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('stroke-width', '2');
    arrow.setAttribute('stroke-linecap', 'round');
    arrow.setAttribute('stroke-linejoin', 'round');
    arrow.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm6 9 6 6 6-6');
    arrow.appendChild(path);
    trigger.append(label, arrow);

    const menu = create('div', 'monitor-select-menu');
    menu.id = 'monitorActivityWorkspaceMenu';
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'Pilihan outlet aktivitas');

    control.append(trigger, menu);
    select.insertAdjacentElement('afterend', control);
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    const filterLabel = select.closest('.monitor-filter')?.querySelector('label');
    if (filterLabel) filterLabel.htmlFor = trigger.id;

    workspaceDropdown = { control, trigger, label, menu, select };

    trigger.addEventListener('click', () => {
      const shouldOpen = menu.hidden;
      if (shouldOpen) openWorkspaceDropdown();
      else closeWorkspaceDropdown();
    });

    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openWorkspaceDropdown(true);
      } else if (event.key === 'Escape') {
        closeWorkspaceDropdown();
      }
    });

    menu.addEventListener('click', (event) => {
      const option = event.target.closest('[data-workspace-option]');
      if (!option) return;
      select.value = option.dataset.workspaceOption;
      selectedWorkspace = select.value;
      syncWorkspaceDropdown();
      closeWorkspaceDropdown(true);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    menu.addEventListener('keydown', (event) => {
      const options = Array.from(menu.querySelectorAll('[data-workspace-option]'));
      const currentIndex = options.indexOf(document.activeElement);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowDown') nextIndex = Math.min(options.length - 1, currentIndex + 1);
      else if (event.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = options.length - 1;
      else if (event.key === 'Escape') {
        event.preventDefault();
        closeWorkspaceDropdown(true);
        return;
      } else return;
      event.preventDefault();
      options[nextIndex]?.focus();
    });

    document.addEventListener('pointerdown', (event) => {
      if (workspaceDropdown && !workspaceDropdown.control.contains(event.target)) {
        closeWorkspaceDropdown();
      }
    });
  }

  function syncWorkspaceDropdown() {
    if (!workspaceDropdown) return;
    const { select, label, menu } = workspaceDropdown;
    const selectedOption = select.options[select.selectedIndex];
    label.textContent = selectedOption ? selectedOption.textContent.trim() : 'Pilih outlet';
    menu.replaceChildren();

    Array.from(select.options).forEach((option) => {
      const item = create('button', 'monitor-select-option');
      item.type = 'button';
      item.dataset.workspaceOption = option.value;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.value === select.value));
      const text = create('span', 'monitor-select-option-label', option.textContent.trim());
      const indicator = create('span', 'monitor-select-radio');
      indicator.setAttribute('aria-hidden', 'true');
      item.append(text, indicator);
      menu.appendChild(item);
    });
  }

  function openWorkspaceDropdown(focusSelected = false) {
    if (!workspaceDropdown) return;
    const { control, trigger, menu, select } = workspaceDropdown;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    control.classList.add('is-open');
    control.closest('.monitor-filter')?.classList.add('has-open-menu');
    if (focusSelected) {
      menu.querySelector('[aria-selected="true"]')?.focus();
    }
  }

  function closeWorkspaceDropdown(returnFocus = false) {
    if (!workspaceDropdown) return;
    const { control, trigger, menu } = workspaceDropdown;
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    control.classList.remove('is-open');
    control.closest('.monitor-filter')?.classList.remove('has-open-menu');
    if (returnFocus) trigger.focus();
  }

  function renderTabs() {
    document.querySelectorAll('[data-monitor-tab]').forEach((button) => {
      const selected = button.dataset.monitorTab === currentTab;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    const live = $('monitorLivePanel');
    const activity = $('monitorActivityPanel');
    if (live) live.hidden = currentTab !== 'live';
    if (activity) activity.hidden = currentTab !== 'activity';
  }

  function renderSummary(sessions, activities) {
    const onlineUsers = new Set();
    let onlineDevices = 0;
    sessions.forEach((session) => {
      if (sessionStatus(session) === 'online') {
        onlineDevices += 1;
        onlineUsers.add(session.user_id || session.user_email);
      }
    });
    $('monitorOnlineUsers').textContent = String(onlineUsers.size);
    $('monitorOnlineDevices').textContent = String(onlineDevices);
    $('monitorActivityCount').textContent = String(activities.length);
  }

  function renderLiveUsers(sessions) {
    const root = $('monitorLiveUsers');
    if (!root) return;
    root.replaceChildren();

    if (!sessions.length) {
      renderMessage(root, 'Belum ada sesi perangkat yang tercatat.');
      return;
    }

    const groups = new Map();
    sessions.forEach((session) => {
      const key = session.user_id || session.user_email;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(session);
    });

    const accounts = Array.from(groups.values()).sort((a, b) => {
      const aOnline = a.some((item) => sessionStatus(item) === 'online');
      const bOnline = b.some((item) => sessionStatus(item) === 'online');
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      return new Date(b[0].last_seen_at) - new Date(a[0].last_seen_at);
    });

    accounts.forEach((devices) => {
      devices.sort((a, b) => {
        const aStatus = sessionStatus(a) === 'online';
        const bStatus = sessionStatus(b) === 'online';
        if (aStatus !== bStatus) return aStatus ? -1 : 1;
        return new Date(b.last_seen_at) - new Date(a.last_seen_at);
      });

      const first = devices[0];
      const account = create('article', 'monitor-account');
      const head = create('div', 'monitor-account-head');
      const identity = create('div', 'monitor-account-identity');
      identity.append(
        create('strong', 'monitor-account-name', first.display_name || 'Tanpa nama'),
        create('span', 'monitor-account-email', first.user_email || 'Email tidak tersedia')
      );
      const count = create('span', 'monitor-device-count', devices.length + ' perangkat');
      head.append(identity, count);

      const meta = create('div', 'monitor-account-meta');
      meta.append(
        create('span', 'monitor-role', first.role || '—'),
        create('span', 'monitor-outlet', first.workspace_name || 'Outlet belum dipilih')
      );
      account.append(head, meta);

      const accountStatus = devices.some((device) => sessionStatus(device) === 'online')
        ? 'online'
        : devices.some((device) => sessionStatus(device) === 'offline') ? 'offline' : 'logged_out';
      const statusLine = create('div', 'monitor-account-status');
      const lamp = create('span', 'monitor-status-lamp is-' + accountStatus);
      lamp.setAttribute('aria-hidden', 'true');
      statusLine.append(lamp, create('strong', 'monitor-account-status-label', statusLabel(accountStatus)));
      const detailButton = create('button', 'monitor-detail-button', 'Lihat detail');
      detailButton.type = 'button';
      detailButton.addEventListener('click', () => openAccountDetails(first, devices));
      account.append(statusLine, detailButton);

      root.appendChild(account);
    });
  }

  function closeAccountDetails() {
    const modal = $('monitorAccountModal');
    if (!modal) return;
    modal.remove();
    document.removeEventListener('keydown', onAccountModalKeydown);
  }

  function onAccountModalKeydown(event) {
    if (event.key === 'Escape') closeAccountDetails();
  }

  function openAccountDetails(account, devices) {
    closeAccountDetails();
    const overlay = create('div', 'monitor-modal-overlay');
    overlay.id = 'monitorAccountModal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeAccountDetails();
    });

    const dialog = create('section', 'monitor-account-modal');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Detail akun ' + (account.display_name || account.user_email || ''));

    const header = create('div', 'monitor-modal-header');
    const titleWrap = create('div', 'monitor-modal-title-wrap');
    titleWrap.append(
      create('strong', 'monitor-modal-title', account.display_name || 'Tanpa nama'),
      create('span', 'monitor-modal-subtitle', account.user_email || 'Email tidak tersedia')
    );
    const closeButton = create('button', 'monitor-modal-close', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Tutup detail');
    closeButton.addEventListener('click', closeAccountDetails);
    header.append(titleWrap, closeButton);

    const meta = create('div', 'monitor-modal-meta');
    meta.append(
      create('span', 'monitor-role', account.role || '—'),
      create('span', 'monitor-outlet', account.workspace_name || 'Outlet belum dipilih'),
      create('span', 'monitor-device-count', devices.length + ' perangkat')
    );
    dialog.append(header, meta, create('h3', 'monitor-modal-section-title', 'Aktivitas perangkat'));

    devices.forEach((device) => {
      const status = sessionStatus(device);
      const row = create('article', 'monitor-modal-device');
      const icon = create('div', 'monitor-device-icon', device.device_type === 'mobile'
        ? 'HP' : device.device_type === 'tablet' ? 'TAB' : 'PC');
      const info = create('div', 'monitor-device-info');
      info.append(
        create('strong', 'monitor-device-title', device.browser + ' · ' + device.operating_system),
        create('span', 'monitor-device-detail', 'Login ' + formatDate(device.logged_in_at)),
        create('span', 'monitor-device-detail', 'Aktif terakhir ' + formatDate(device.last_seen_at)),
        create('span', 'monitor-device-detail', 'Durasi ' + formatDuration(device.logged_in_at, device.ended_at))
      );
      const badge = create('span', 'monitor-status is-' + status, statusLabel(status));
      row.append(icon, info, badge);
      dialog.appendChild(row);
    });

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onAccountModalKeydown);
    closeButton.focus();
  }

  function renderActivity(activities) {
    const root = $('monitorActivityList');
    if (!root) return;
    root.replaceChildren();
    if (!activities.length) {
      renderMessage(root, 'Belum ada aktivitas pada filter outlet ini.');
      return;
    }

    const labels = {
      login_success: ['Login berhasil', 'is-success'],
      login_failed: ['Login gagal', 'is-failed'],
      login_error: ['Gangguan login', 'is-error'],
      logout: ['Logout', 'is-logout']
    };

    activities.forEach((activity) => {
      const item = create('article', 'monitor-activity-item');
      const label = labels[activity.event_type] || ['Aktivitas', ''];
      const top = create('div', 'monitor-activity-top');
      top.append(
        create('strong', 'monitor-activity-title', label[0]),
        create('span', 'monitor-activity-time', formatDate(activity.occurred_at))
      );
      const identity = activity.actor_name || activity.actor_email ||
        activity.attempted_email_hint || 'Pengguna tidak teridentifikasi';
      const detail = create('div', 'monitor-activity-detail');
      detail.textContent = identity + ' · ' + (activity.workspace_name || 'Tidak teridentifikasi');
      const reason = activity.reason_code ? create('small', 'monitor-activity-reason', activity.reason_code.replaceAll('_', ' ')) : null;
      const badge = create('span', 'monitor-event-badge ' + label[1], label[0]);
      item.append(top, detail, badge);
      if (reason) item.appendChild(reason);
      root.appendChild(item);
    });
  }

  async function refresh() {
    if (!client || !isDeveloper() || refreshBusy) return;
    refreshBusy = true;
    const liveRoot = $('monitorLiveUsers');
    const activityRoot = $('monitorActivityList');
    try {
      const [sessionResult, activityResult] = await Promise.all([
        client.from('user_monitoring_sessions')
          .select('id,user_id,user_email,display_name,role,workspace_id,workspace_name,device_type,browser,operating_system,status,logged_in_at,last_seen_at,last_active_at,ended_at')
          .order('last_seen_at', { ascending: false })
          .limit(300),
        loadActivity()
      ]);

      if (sessionResult.error) throw sessionResult.error;
      renderLiveUsers(sessionResult.data || []);
      renderActivity(activityResult || []);
      renderSummary(sessionResult.data || [], activityResult || []);
      const updated = $('monitorLastUpdated');
      if (updated) updated.textContent = 'Diperbarui ' + new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).format(new Date());
    } catch (error) {
      console.error('User Monitoring refresh failed:', error);
      if (liveRoot && !liveRoot.childElementCount) renderMessage(liveRoot, 'Data monitoring belum dapat dimuat.');
      if (activityRoot && !activityRoot.childElementCount) renderMessage(activityRoot, 'Log aktivitas belum dapat dimuat.');
    } finally {
      refreshBusy = false;
    }
  }

  async function loadActivity() {
    let query = client.from('user_monitoring_activity')
      .select('id,event_type,user_id,actor_email,actor_name,actor_role,auth_session_id,workspace_id,workspace_name,attempted_email_hint,source,reason_code,occurred_at')
      .order('occurred_at', { ascending: false })
      .limit(150);

    if (selectedWorkspace === 'unknown') query = query.is('workspace_id', null);
    else if (selectedWorkspace !== 'all') query = query.eq('workspace_id', selectedWorkspace);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function onPageShown() {
    if (!isDeveloper()) return;
    currentTab = 'live';
    renderTabs();
    try {
      if (!workspaces.length) await loadWorkspaces();
    } catch (error) {
      console.error('Monitoring outlet list failed:', error);
    }
    await refresh();
  }

  function bindUI() {
    document.querySelectorAll('[data-monitor-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        currentTab = button.dataset.monitorTab;
        renderTabs();
      });
    });

    $('monitorRefreshButton')?.addEventListener('click', refresh);
    $('monitorActivityWorkspace')?.addEventListener('change', (event) => {
      selectedWorkspace = event.target.value;
      syncWorkspaceDropdown();
      if (currentTab === 'activity') refresh();
      else loadActivity().then((data) => renderActivity(data)).catch((error) => console.error(error));
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
        if (activePage()) refresh();
      }
    });
  }

  bindUI();

  window.UserMonitoring = {
    start,
    stop,
    refresh,
    onPageShown
  };
}());