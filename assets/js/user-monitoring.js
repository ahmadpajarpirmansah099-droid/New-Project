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
      const payload = JSON.parse(atob(encoded));
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
    if (!client || document.visibilityState === 'hidden') return;
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

      devices.forEach((device) => {
        const status = sessionStatus(device);
        const row = create('div', 'monitor-device');
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
        account.appendChild(row);
      });

      root.appendChild(account);
    });
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