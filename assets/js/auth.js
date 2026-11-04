(function () {
  'use strict';
  const SUPABASE_URL = 'https://niwapjafzaizlnenuyui.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dDLvjwmNBaFMqOWASxwQpw_Uf408kX4';
  let supabaseClient = null;
  const $ = (id) => document.getElementById(id);
  let activeUserId = null;
  let authContext = null;
  let isSubmitting = false;

  function setMessage(message, type) {
    const element = $('authMessage');
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-success', type === 'success');
  }

  function setLoading(loading) {
    const button = $('authSubmitButton');
    if (!button) return;
    button.disabled = loading;
    button.querySelector('span').textContent = loading ? 'Memeriksa akun...' : 'Masuk workspace';
  }

  function showLogin(message) {
    activeUserId = null;
    authContext = null;
    window.dispatchEvent(new CustomEvent('app:auth-signed-out'));
    document.body.classList.remove('auth-ready');
    document.body.classList.add('auth-locked');
    setLoading(false);
    setMessage(message || '');
  }

  // Verify the signed-in user's own database profile before revealing the app.
  async function activateSession(session) {
    if (!session || !session.user) {
      showLogin('');
      return;
    }
    const userId = session.user.id;
    if (activeUserId && activeUserId !== userId) showLogin('');
    if (activeUserId === userId && document.body.classList.contains('auth-ready')) return;
    document.body.classList.remove('auth-ready');
    document.body.classList.add('auth-locked');
    setLoading(true);
    setMessage('Memverifikasi izin akun...', 'success');

    const { data: profile, error } = await supabaseClient.from('profiles')
      .select('id, display_name, role').eq('id', userId).single();

    if (error || !profile || !['developer', 'admin', 'service'].includes(profile.role)) {
      await supabaseClient.auth.signOut();
      showLogin('Akun belum memiliki izin akses. Hubungi Developer untuk pengaturan role.');
      return;
    }

    const { data: membership, error: membershipError } = await supabaseClient
      .from('workspace_memberships')
      .select('workspace_id, role')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      await supabaseClient.auth.signOut();
      showLogin('Akun belum terhubung ke workspace. Hubungi Developer.');
      return;
    }

    const { data: workspaceDivisions, error: divisionsError } = await supabaseClient
      .from('divisions')
      .select('id, name')
      .eq('workspace_id', membership.workspace_id)
      .eq('is_active', true)
      .order('name');
    if (divisionsError) {
      await supabaseClient.auth.signOut();
      showLogin('Daftar divisi belum dapat dimuat. Hubungi Developer.');
      return;
    }

    let assignedDivisions = workspaceDivisions || [];
    if (profile.role !== 'developer' && membership.role !== 'admin') {
      const { data: divisionLinks, error: divisionError } = await supabaseClient
        .from('workspace_division_memberships')
        .select('division_id')
        .eq('workspace_id', membership.workspace_id)
        .eq('user_id', userId);
      if (divisionError || !divisionLinks || !divisionLinks.length) {
        await supabaseClient.auth.signOut();
        showLogin('Akun belum ditugaskan ke divisi. Hubungi Developer.');
        return;
      }
      const allowedIds = new Set(divisionLinks.map((link) => link.division_id));
      assignedDivisions = assignedDivisions.filter((division) => allowedIds.has(division.id));
    }

    if (!assignedDivisions.length) {
      await supabaseClient.auth.signOut();
      showLogin('Akun belum memiliki divisi aktif. Hubungi Developer.');
      return;
    }

    const activeDivision = assignedDivisions.find((division) => division.name.toLowerCase() === 'bar') || assignedDivisions[0];
    activeUserId = userId;
    authContext = {
      userId,
      email: session.user.email || '',
      role: profile.role,
      workspaceId: membership.workspace_id,
      workspaceRole: membership.role,
      divisions: assignedDivisions,
      activeDivisionId: activeDivision.id,
      activeDivisionName: activeDivision.name,
      isGlobalDeveloper: profile.role === 'developer'
    };
    const displayName = profile.display_name || session.user.email || 'User';
    const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    const profileButton = $('authProfileButton');
    if (profileButton) {
      profileButton.textContent = initials || 'US';
      profileButton.title = displayName + ' · ' + profile.role + ' · Klik untuk keluar';
      profileButton.setAttribute('aria-label', 'Keluar dari akun ' + displayName);
    }
    const logoutButton = $('authLogoutButton');
    if (logoutButton) logoutButton.title = 'Keluar dari akun ' + displayName;
    document.body.classList.remove('auth-locked');
    document.body.classList.add('auth-ready');
    setLoading(false);
    setMessage('');
    window.dispatchEvent(new CustomEvent('app:auth-ready', { detail: authContext }));
  }

  // Sign in with Supabase Auth; the role is read from the protected profiles table.
  async function handleLogin(event) {
    event.preventDefault();
    if (isSubmitting) return;
    if (!supabaseClient) {
      setMessage('Layanan autentikasi belum termuat. Periksa koneksi internet lalu muat ulang halaman.');
      return;
    }
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    if (!email || !password) {
      setMessage('Email dan password wajib diisi.');
      return;
    }
    isSubmitting = true;
    setLoading(true);
    setMessage('');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      setMessage('Email atau password tidak sesuai, atau akun belum dapat digunakan.');
      setLoading(false);
      isSubmitting = false;
      return;
    }
    await activateSession(data.session);
    isSubmitting = false;
    if (!document.body.classList.contains('auth-ready')) setLoading(false);
  }

  async function handleLogout() {
    if (!window.confirm('Keluar dari akun sekarang?')) return;
    showLogin('Anda sudah keluar dari workspace.');
    await supabaseClient.auth.signOut();
    $('authPassword').value = '';
  }

  function init() {
    $('authLoginForm').addEventListener('submit', handleLogin);
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      setMessage('Layanan autentikasi belum termuat. Periksa koneksi internet lalu muat ulang halaman.');
      return;
    }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    $('authPasswordToggle').addEventListener('click', function () {
      const password = $('authPassword');
      const visible = password.type === 'password';
      password.type = visible ? 'text' : 'password';
      this.setAttribute('aria-label', visible ? 'Sembunyikan password' : 'Tampilkan password');
    });
    $('authLogoutButton').addEventListener('click', handleLogout);
    $('authProfileButton').addEventListener('click', handleLogout);

    supabaseClient.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_OUT') {
        showLogin('');
        return;
      }
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        window.setTimeout(function () { activateSession(session); }, 0);
      }
    });
    supabaseClient.auth.getSession().then(function (result) {
      activateSession(result.data && result.data.session);
    }).catch(function () {
      showLogin('Sesi tidak dapat diperiksa. Periksa koneksi lalu coba lagi.');
    });
  }

  window.AppAuth = {
    signOut: handleLogout,
    getClient: function () { return supabaseClient; },
    getContext: function () { return authContext; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
