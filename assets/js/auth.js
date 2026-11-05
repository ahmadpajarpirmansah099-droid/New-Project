(function () {
  'use strict';
  const SUPABASE_URL = 'https://niwapjafzaizlnenuyui.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dDLvjwmNBaFMqOWASxwQpw_Uf408kX4';
  let supabaseClient = null;
  const $ = (id) => document.getElementById(id);
  let activeUserId = null;
  let authContext = null;
  let isSubmitting = false;
  let activationGeneration = 0;
  let activeProfile = null;
  let workspaceSwitchBusy = false;
  // Keep activation errors visible even if a delayed SIGNED_OUT event arrives.
  let persistentLoginMessage = '';

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
    if (message) persistentLoginMessage = message;
    const visibleMessage = persistentLoginMessage || message || '';
    const emailInput = $('authEmail');
    if (emailInput) emailInput.value = '';
    activationGeneration += 1;
    activeUserId = null;
    activeProfile = null;
    authContext = null;
    window.dispatchEvent(new CustomEvent('app:auth-signed-out'));
    document.body.classList.remove('auth-ready', 'workspace-switching');
    document.body.classList.add('auth-locked');
    setLoading(false);
    setMessage(visibleMessage);
  }

  async function buildWorkspaceContext(userId, email, profile, workspaces, selectedWorkspaceId, divisionSelection, isCurrent) {
    const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);
    if (!workspace) throw new Error('Outlet yang dipilih tidak ditemukan.');
    const { data: membership, error: membershipError } = await supabaseClient.from('workspace_memberships')
      .select('workspace_id, role').eq('user_id', userId).eq('workspace_id', selectedWorkspaceId).maybeSingle();
    if (isCurrent && !isCurrent()) return null;
    if (profile.role !== 'developer' && (membershipError || !membership)) throw new Error('Akses ke outlet ini tidak tersedia.');
    const { data: divisions, error: divisionsError } = await supabaseClient.from('divisions')
      .select('id, name, is_active').eq('workspace_id', selectedWorkspaceId).eq('is_active', true).order('name');
    if (isCurrent && !isCurrent()) return null;
    if (divisionsError || !divisions?.length) throw new Error('Daftar divisi outlet belum dapat dimuat.');
    let assignedDivisions = divisions;
    if (profile.role !== 'developer' && membership.role !== 'admin') {
      const { data: links, error } = await supabaseClient.from('workspace_division_memberships')
        .select('division_id').eq('workspace_id', selectedWorkspaceId).eq('user_id', userId);
      if (isCurrent && !isCurrent()) return null;
      if (error || !links?.length) throw new Error('Akun belum ditugaskan ke divisi.');
      const allowed = new Set(links.map((item) => item.division_id));
      assignedDivisions = divisions.filter((item) => allowed.has(item.id));
    }
    if (!assignedDivisions.length) throw new Error('Akun belum memiliki divisi aktif.');
    const selected = assignedDivisions.find((item) => item.id === divisionSelection) ||
      assignedDivisions.find((item) => item.name.trim().toLowerCase() === 'service') || assignedDivisions[0];
    return { userId, email, role:profile.role, workspaceId:selectedWorkspaceId, workspaceName:workspace.name,
      workspaceRole:profile.role === 'developer' ? 'developer' : membership.role, workspaces, divisions:assignedDivisions,
      activeDivisionId:selected.id, activeDivisionName:selected.name,
      divisionMode:'single', isGlobalDeveloper:profile.role === 'developer' };
  }
  function closeScopeDropdowns() {
    ['Outlet','Division'].forEach((name) => {
      const menu=$('workspace'+name+'Menu');
      const trigger=$('workspace'+name+'Trigger');
      if(menu)menu.hidden=true;
      if(trigger)trigger.setAttribute('aria-expanded','false');
    });
  }
  function renderScopeMenu(type, items, selectedId) {
    const menu=$(type==='outlet'?'workspaceOutletMenu':'workspaceDivisionMenu');
    if(!menu)return;
    menu.replaceChildren();
    items.forEach((item) => {
      const option=document.createElement('button');
      option.type='button';
      option.className='scope-dropdown-option'+(item.id===selectedId?' is-selected':'');
      option.setAttribute('role','option');
      option.setAttribute('aria-selected',String(item.id===selectedId));
      option.dataset.scopeOption=item.id;
      const label=document.createElement('span');
      label.textContent=item.name;
      const check=document.createElement('span');
      check.className='scope-dropdown-check';
      check.setAttribute('aria-hidden','true');
      check.textContent=item.id===selectedId?'✓':'';
      option.append(label,check);
      menu.appendChild(option);
    });
  }
  function renderScopeSelectors() {
    const wrap=$('workspaceScopeSwitcher');
    const outletTrigger=$('workspaceOutletTrigger');
    const divisionTrigger=$('workspaceDivisionTrigger');
    if(!wrap || !outletTrigger || !divisionTrigger || !authContext?.isGlobalDeveloper){
      if(wrap)wrap.hidden=true;
      closeScopeDropdowns();
      return;
    }
    wrap.hidden=false;
    $('workspaceOutletValue').textContent=authContext.workspaceName||'Pilih outlet';
    $('workspaceDivisionValue').textContent=authContext.activeDivisionName||'Pilih divisi';
    renderScopeMenu('outlet',authContext.workspaces,authContext.workspaceId);
    renderScopeMenu('division',authContext.divisions,authContext.activeDivisionId);
    outletTrigger.disabled=workspaceSwitchBusy;
    divisionTrigger.disabled=workspaceSwitchBusy;
  }
  function toggleScopeDropdown(type) {
    if(workspaceSwitchBusy || !authContext?.isGlobalDeveloper)return;
    const menu=$(type==='outlet'?'workspaceOutletMenu':'workspaceDivisionMenu');
    const trigger=$(type==='outlet'?'workspaceOutletTrigger':'workspaceDivisionTrigger');
    if(!menu || !trigger)return;
    const shouldOpen=menu.hidden;
    closeScopeDropdowns();
    if(shouldOpen){
      menu.hidden=false;
      trigger.setAttribute('aria-expanded','true');
    }
  }
  async function switchWorkspaceContext(workspaceId, divisionSelection) {
    if(workspaceSwitchBusy || !authContext?.isGlobalDeveloper)return;
    workspaceSwitchBusy=true;renderScopeSelectors();
    const generation=++activationGeneration,userId=activeUserId,current=authContext;
    try{
      const {data,error}=await supabaseClient.auth.getUser();
      if(error || data?.user?.id!==userId || generation!==activationGeneration)throw new Error('Sesi akun berubah. Silakan masuk kembali.');
      const next=await buildWorkspaceContext(userId,current.email,activeProfile,current.workspaces,workspaceId,divisionSelection,()=>generation===activationGeneration);
      if(!next || generation!==activationGeneration)return;
      authContext=next;document.body.classList.add('workspace-switching');
      renderScopeSelectors();window.dispatchEvent(new CustomEvent('app:workspace-context-changed',{detail:next}));
    }catch(error){
      console.error('Workspace switch failed:',error);setMessage(error.message||'Outlet atau divisi gagal diganti.');
      renderScopeSelectors();
    }finally{workspaceSwitchBusy=false;renderScopeSelectors();}
  }

  // Verify the signed-in user's own database profile before revealing the app.
  async function activateSession(session) {
    if (!session || !session.user) {
      showLogin('');
      return;
    }
    const userId = session.user.id;
    if (activeUserId === userId && authContext) return;
    if (activeUserId && activeUserId !== userId) showLogin('');
    const generation = ++activationGeneration;
    const isCurrent = () => generation === activationGeneration;
    const verifyLiveUser = async () => {
      const { data, error: authError } = await supabaseClient.auth.getUser();
      return !authError && data?.user?.id === userId && isCurrent();
    };
    if (!(await verifyLiveUser())) return;
    if (activeUserId === userId && document.body.classList.contains('auth-ready')) return;
    document.body.classList.remove('auth-ready');
    document.body.classList.add('auth-locked');
    setLoading(true);
    setMessage('Memverifikasi izin akun...', 'success');

    const { data: profile, error } = await supabaseClient.from('profiles')
      .select('id, display_name, role').eq('id', userId).single();

    if (!isCurrent()) return;
    if (error || !profile || !['developer', 'admin', 'service'].includes(profile.role)) {
      await supabaseClient.auth.signOut();
      showLogin('Akun belum memiliki izin akses. Hubungi Developer untuk pengaturan role.');
      return;
    }

    const { data: memberships, error: membershipError } = await supabaseClient.from('workspace_memberships')
      .select('workspace_id, role').eq('user_id', userId);
    if (!isCurrent()) return;
    if (membershipError || (profile.role !== 'developer' && !memberships?.length)) {
      await supabaseClient.auth.signOut(); showLogin('Akun belum terhubung ke workspace. Hubungi Developer.'); return;
    }
    let workspaces=[];
    if(profile.role==='developer'){
      const {data,error:workspaceError}=await supabaseClient.from('workspaces').select('id,name').order('name');
      if(!isCurrent())return;
      if(workspaceError||!data?.length){await supabaseClient.auth.signOut();showLogin('Daftar outlet belum dapat dimuat. Hubungi Developer.');return;}
      workspaces=data;
    }else{
      const selectedMembership=memberships[0];
      const {data,error:workspaceError}=await supabaseClient.from('workspaces').select('id,name').eq('id',selectedMembership.workspace_id).single();
      if(!isCurrent())return;
      if(workspaceError||!data){await supabaseClient.auth.signOut();showLogin('Outlet akun belum dapat dimuat. Hubungi Developer.');return;}
      workspaces=[data];
    }
    const selectedWorkspaceId=memberships?.[0]?.workspace_id||workspaces[0].id;
    let nextContext;
    try{nextContext=await buildWorkspaceContext(userId,session.user.email||'',profile,workspaces,selectedWorkspaceId,null,isCurrent);}
    catch(contextError){await supabaseClient.auth.signOut();showLogin(contextError.message||'Workspace akun belum dapat dimuat.');return;}
    if(!nextContext||!isCurrent())return;
    activeProfile=profile;activeUserId=userId;authContext=nextContext;renderScopeSelectors();
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
    document.body.classList.remove('auth-ready');
    document.body.classList.add('auth-locked');
    setMessage('Memuat data workspace...', 'success');
    window.dispatchEvent(new CustomEvent('app:auth-ready', { detail: authContext }));
  }

  async function markReady(expectedUserId, expectedWorkspaceId) {
    const generation = activationGeneration;
    if (!supabaseClient || !authContext || activeUserId !== expectedUserId ||
        authContext.userId !== expectedUserId || authContext.workspaceId !== expectedWorkspaceId) return false;
    const { data, error } = await supabaseClient.auth.getUser();
    if (error || data?.user?.id !== expectedUserId || generation !== activationGeneration ||
        activeUserId !== expectedUserId || authContext?.workspaceId !== expectedWorkspaceId) return false;
    document.body.classList.remove('auth-locked', 'workspace-switching');
    document.body.classList.add('auth-ready');
    setLoading(false);
    setMessage('');
    return true;
  }

  async function failActivation(message) {
    // Let Supabase finish signing out before showing the reason; SIGNED_OUT
    // also calls showLogin('') and would otherwise erase the error immediately.
    if (supabaseClient) {
      try { await supabaseClient.auth.signOut(); }
      catch (error) { console.error('Failed to close invalid session:', error); }
    }
    showLogin(message || 'Workspace gagal dimuat. Silakan masuk kembali.');
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
    persistentLoginMessage = '';
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
  }

  async function handleLogout() {
    if (!window.confirm('Keluar dari akun sekarang?')) return;
    showLogin('Anda sudah keluar dari workspace.');
    await supabaseClient.auth.signOut();
    $('authPassword').value = '';
  }

  function init() {
    const emailInput = $('authEmail');
    if (emailInput) emailInput.value = '';
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
    $('workspaceOutletTrigger')?.addEventListener('click',()=>toggleScopeDropdown('outlet'));
    $('workspaceDivisionTrigger')?.addEventListener('click',()=>toggleScopeDropdown('division'));
    $('workspaceOutletMenu')?.addEventListener('click',(event)=>{
      const option=event.target.closest('[data-scope-option]');
      if(!option || !authContext?.isGlobalDeveloper)return;
      const value=option.dataset.scopeOption;
      closeScopeDropdowns();
      if(value!==authContext.workspaceId)switchWorkspaceContext(value,null);
    });
    $('workspaceDivisionMenu')?.addEventListener('click',(event)=>{
      const option=event.target.closest('[data-scope-option]');
      if(!option || !authContext?.isGlobalDeveloper)return;
      const value=option.dataset.scopeOption;
      closeScopeDropdowns();
      if(value!==authContext.activeDivisionId)switchWorkspaceContext(authContext.workspaceId,value);
    });
    document.addEventListener('pointerdown',(event)=>{
      if(!$('workspaceScopeSwitcher')?.contains(event.target))closeScopeDropdowns();
    });
    document.addEventListener('keydown',(event)=>{
      if(event.key==='Escape')closeScopeDropdowns();
    });
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
    getContext: function () { return authContext; },
    markReady,
    failActivation
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
