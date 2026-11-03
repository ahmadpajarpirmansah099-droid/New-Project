(function () {
  'use strict';
  const SUPABASE_URL = 'https://niwapjafzaizlnenuyui.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dDLvjwmNBaFMqOWASxwQpw_Uf408kX4';
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id);
  let activeUserId = null;
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
    if (activeUserId === userId && document.body.classList.contains('auth-ready')) return;
    document.body.classList.remove('auth-ready');
    document.body.classList.add('auth-locked');
    setLoading(true);
    setMessage('Memverifikasi izin akun...', 'success');

    const { data: profile, error } = await supabaseClient.from('profiles')
      .select('id, display_name, role').eq('id', userId).single();

    if (error || !profile || !['developer', 'admin'].includes(profile.role)) {
      await supabaseClient.auth.signOut();
      showLogin('Akun belum memiliki izin akses. Hubungi Developer untuk pengaturan role.');
      return;
    }

    activeUserId = userId;
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
  }

  // Sign in with Supabase Auth; the role is read from the protected profiles table.
  async function handleLogin(event) {
    event.preventDefault();
    if (isSubmitting) return;
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
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      setMessage('Layanan autentikasi belum termuat. Periksa koneksi internet lalu muat ulang halaman.');
      return;
    }
    $('authLoginForm').addEventListener('submit', handleLogin);
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

  window.AppAuth = { signOut: handleLogout, getClient: function () { return supabaseClient; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
