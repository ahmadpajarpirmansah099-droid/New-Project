(function (root) {
  'use strict';

  const MODULE_KEY = 'master_data';
  const SCHEMA_VERSION = 1;
  const ARRAY_FIELDS = ['masterItems', 'wips', 'wipRecipeLines', 'menus', 'menuRecipeLines'];
  let client = null;
  let workspaceId = null;
  let cache = createEmpty();
  let ready = false;
  let writeQueue = Promise.resolve();

  function createEmpty() {
    return {
      schema_version: SCHEMA_VERSION,
      active_scope_id: 'scope-default',
      masterItems: [],
      wips: [],
      wipRecipeLines: [],
      menus: [],
      menuRecipeLines: [],
      updated_at: new Date().toISOString()
    };
  }

  function normalizeData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Format penyimpanan Master Data tidak valid.');
    }
    const version = Number(value.schema_version || SCHEMA_VERSION);
    if (!Number.isFinite(version) || version > SCHEMA_VERSION) {
      throw new Error('Versi data Master Data lebih baru dan belum didukung.');
    }
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

  async function initialize(supabaseClient, selectedWorkspaceId) {
    if (!supabaseClient || !selectedWorkspaceId) throw new Error('Koneksi Master Data belum siap.');
    client = supabaseClient;
    workspaceId = selectedWorkspaceId;
    const result = await client.from('workspace_module_state')
      .select('payload')
      .eq('workspace_id', workspaceId)
      .eq('module_key', MODULE_KEY)
      .maybeSingle();
    if (result.error) throw result.error;
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
    cache = normalized;

    if (!ready || !client || !workspaceId) {
      throw new Error('Master Data belum tersambung ke database. Muat ulang halaman.');
    }
    if (root.AppAuth?.getContext()?.role === 'service') {
      throw new Error('Role Service hanya dapat melihat Master Data.');
    }

    writeQueue = writeQueue.then(async function () {
      const result = await client.from('workspace_module_state').upsert({
        workspace_id: workspaceId,
        module_key: MODULE_KEY,
        payload: normalized,
        updated_at: normalized.updated_at
      }, { onConflict: 'workspace_id,module_key' });
      if (result.error) throw result.error;
      return normalized;
    }).catch(function (error) {
      console.error('Master Data database save failed:', error);
      if (typeof root.toast === 'function') root.toast('Master Data belum tersimpan ke database.');
      return false;
    });
    return normalized;
  }

  function flush() {
    return writeQueue;
  }

  function createId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return 'md-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  root.MasterDataStore = {
    key: MODULE_KEY,
    schemaVersion: SCHEMA_VERSION,
    createEmpty,
    initialize,
    load,
    save,
    flush,
    createId,
    isReady: () => ready
  };
})(window);
