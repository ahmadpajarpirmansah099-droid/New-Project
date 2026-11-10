(function (root) {
  'use strict';
  const MODULE_KEY_PREFIX = 'master_data:';
  const LEGACY_TEST_KEY = 'guestops_masterdata_demo_v1';
  const SCHEMA_VERSION = 1;
  const ARRAY_FIELDS = ['masterItems', 'wips', 'wipRecipeLines', 'menus', 'menuRecipeLines'];
  let client = null, workspaceId = null, divisionId = null, moduleKey = null;
  let cache = createEmpty(), ready = false, writeQueue = Promise.resolve();
  let sessionGeneration = 0, sessionAbortController = null, persistedAt = null;

  function createEmpty() {
    return {
      schema_version: SCHEMA_VERSION, active_scope_id: 'scope-demo-default',
      masterItems: [], wips: [], wipRecipeLines: [], menus: [], menuRecipeLines: [],
      updated_at: new Date().toISOString()
    };
  }

  function normalizeData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Format penyimpanan Master Data tidak valid.');
    const version = Number(value.schema_version || SCHEMA_VERSION);
    if (!Number.isFinite(version) || version > SCHEMA_VERSION) throw new Error('Versi data Master Data lebih baru dan belum didukung.');
    const normalized = createEmpty();
    normalized.active_scope_id = String(value.active_scope_id || normalized.active_scope_id);
    ARRAY_FIELDS.forEach(function (field) {
      if (value[field] === undefined) normalized[field] = [];
      else if (!Array.isArray(value[field])) throw new Error('Struktur ' + field + ' tidak valid.');
      else normalized[field] = value[field];
    });
    normalized.updated_at = value.updated_at || normalized.updated_at;
    return normalized;
  }

  function assertCurrent(expectedGeneration, expectedClient, expectedWorkspaceId, expectedDivisionId) {
    if (expectedGeneration !== sessionGeneration || expectedClient !== client ||
        expectedWorkspaceId !== workspaceId || expectedDivisionId !== divisionId) {
      throw new Error('Sesi workspace berubah. Operasi Master Data dibatalkan.');
    }
  }

  function withSessionSignal(query, expectedGeneration) {
    assertCurrent(expectedGeneration, client, workspaceId, divisionId);
    if (sessionAbortController && typeof query?.abortSignal === 'function') return query.abortSignal(sessionAbortController.signal);
    return query;
  }

  async function assertSession(expectedGeneration) {
    const capturedClient = client, capturedWorkspaceId = workspaceId, capturedDivisionId = divisionId;
    assertCurrent(expectedGeneration, capturedClient, capturedWorkspaceId, capturedDivisionId);
    if (!capturedClient?.auth || typeof capturedClient.auth.getUser !== 'function') {
      throw new Error('Sesi akun tidak dapat diverifikasi. Silakan masuk kembali.');
    }

    const authResult = await capturedClient.auth.getUser();
    assertCurrent(expectedGeneration, capturedClient, capturedWorkspaceId, capturedDivisionId);
    if (authResult.error || !authResult.data?.user?.id) throw new Error('Sesi akun tidak valid. Silakan masuk kembali.');

    const authContext = root.AppAuth?.getContext?.();
    if (!authContext || authContext.userId !== authResult.data.user.id ||
        authContext.workspaceId !== capturedWorkspaceId || authContext.activeDivisionId !== capturedDivisionId) {
      throw new Error('Identitas akun, workspace, atau divisi tidak cocok. Operasi Master Data diblokir.');
    }

    if (authContext.role !== 'developer') {
      const membershipQuery = withSessionSignal(
        capturedClient.from('workspace_memberships').select('workspace_id')
          .eq('user_id', authResult.data.user.id).eq('workspace_id', capturedWorkspaceId),
        expectedGeneration
      );
      const membershipResult = await membershipQuery.maybeSingle();
      assertCurrent(expectedGeneration, capturedClient, capturedWorkspaceId, capturedDivisionId);
      if (membershipResult.error || !membershipResult.data || membershipResult.data.workspace_id !== capturedWorkspaceId) {
        throw new Error('Akses ditolak: akun bukan anggota workspace aktif.');
      }
    }

    const latestContext = root.AppAuth?.getContext?.();
    if (!latestContext || latestContext.userId !== authResult.data.user.id ||
        latestContext.workspaceId !== capturedWorkspaceId || latestContext.activeDivisionId !== capturedDivisionId) {
      throw new Error('Identitas akun atau workspace berubah. Operasi Master Data dibatalkan.');
    }

    return {
      generation: expectedGeneration, client: capturedClient, userId: authResult.data.user.id,
      workspaceId: capturedWorkspaceId, divisionId: capturedDivisionId
    };
  }

  async function initialize(supabaseClient, selectedWorkspaceId, selectedDivisionId) {
    if (!supabaseClient || !selectedWorkspaceId || !selectedDivisionId) throw new Error('Workspace atau divisi Master Data belum siap.');
    if (sessionAbortController) sessionAbortController.abort();
    sessionGeneration += 1;
    const generation = sessionGeneration;
    client = supabaseClient;
    workspaceId = selectedWorkspaceId;
    divisionId = selectedDivisionId;
    moduleKey = MODULE_KEY_PREFIX + divisionId;
    sessionAbortController = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    ready = false;
    cache = createEmpty();

    try {
      if (root.document && root.localStorage) root.localStorage.removeItem(LEGACY_TEST_KEY);
    } catch (error) {
      console.warn('Legacy Master Data browser data could not be cleared:', error);
    }

    await assertSession(generation);
    const query = withSessionSignal(
      client.from('workspace_module_state').select('payload,updated_at')
        .eq('workspace_id', workspaceId).eq('module_key', moduleKey).eq('division_id', divisionId),
      generation
    );
    const result = await query.maybeSingle();
    assertCurrent(generation, client, workspaceId, divisionId);
    if (result.error) throw result.error;
    await assertSession(generation);
    assertCurrent(generation, client, workspaceId, divisionId);
    persistedAt = result.data?.updated_at || null;
    cache = result.data ? normalizeData(result.data.payload) : createEmpty();
    ready = true;
    return cache;
  }

  function load() {
    return cache;
  }

  function save(value) {
    const normalized = normalizeData(value);
    normalized.updated_at = new Date().toISOString();
    // Non-browser runtime is used only by isolated unit tests; keep its state in memory.
    if (!ready && !root.document) return cache = normalized;
    if (!ready || !client || !workspaceId || !divisionId || !moduleKey) {
      throw new Error('Master Data belum tersambung ke database. Muat ulang halaman.');
    }

    const generation = sessionGeneration;
    const capturedClient = client, capturedWorkspaceId = workspaceId;
    const capturedDivisionId = divisionId, capturedModuleKey = moduleKey;
    const authContext = root.AppAuth?.getContext?.();
    if (!authContext || authContext.workspaceId !== capturedWorkspaceId || authContext.activeDivisionId !== capturedDivisionId) {
      throw new Error('Identitas akun, workspace, atau divisi tidak cocok. Penyimpanan diblokir.');
    }

    cache = normalized;
    writeQueue = writeQueue.catch(function () { return undefined; }).then(async function () {
      await assertSession(generation);
      assertCurrent(generation, capturedClient, capturedWorkspaceId, capturedDivisionId);
      const row = {
        workspace_id: capturedWorkspaceId, module_key: capturedModuleKey, division_id: capturedDivisionId,
        payload: normalized, updated_at: normalized.updated_at
      };
      // An invoice can update prices from another tab. Never overwrite that catalog
      // with an editor opened before the invoice was posted.
      const table = capturedClient.from('workspace_module_state');
      const mutation = persistedAt
        ? table.update(row).eq('workspace_id', capturedWorkspaceId).eq('module_key', capturedModuleKey)
          .eq('division_id', capturedDivisionId).eq('updated_at', persistedAt)
        : table.insert(row);
      const result = await withSessionSignal(mutation.select('updated_at'), generation).maybeSingle();
      assertCurrent(generation, capturedClient, capturedWorkspaceId, capturedDivisionId);
      if (result.error) throw result.error;
      if (!result.data?.updated_at) throw new Error('Master Data berubah, mungkin karena invoice terbaru. Muat ulang sebelum menyimpan kembali.');
      persistedAt = result.data.updated_at;
      await assertSession(generation);
      return normalized;
    }).catch(function (error) {
      if (generation === sessionGeneration) {
        console.error('Master Data database save failed:', error);
        if (typeof root.toast === 'function') root.toast(error.message || 'Master Data belum tersimpan ke database.');
      }
      return false;
    });
    return normalized;
  }

  function flush() { return writeQueue; }
  function createId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return 'md-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function reset() {
    sessionGeneration += 1;
    if (sessionAbortController) sessionAbortController.abort();
    sessionAbortController = null;
    client = null; workspaceId = null; divisionId = null; moduleKey = null;
    cache = createEmpty(); ready = false; persistedAt = null; writeQueue = Promise.resolve();
  }

  root.MasterDataStore = {
    key: () => moduleKey, reset, schemaVersion: SCHEMA_VERSION, createEmpty, initialize, load, save, flush,
    assertSession: () => assertSession(sessionGeneration),
    createId, isReady: () => ready, divisionId: () => divisionId, workspaceId: () => workspaceId
  };
})(window);
