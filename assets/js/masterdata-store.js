(function (root) {
  'use strict';

  const KEY = 'guestops_masterdata_demo_v1';
  const SCHEMA_VERSION = 1;
  const ARRAY_FIELDS = ['masterItems', 'wips', 'wipRecipeLines', 'menus', 'menuRecipeLines'];

  function createEmpty() {
    return {
      schema_version: SCHEMA_VERSION,
      active_scope_id: 'scope-demo-default',
      masterItems: [],
      wips: [],
      wipRecipeLines: [],
      menus: [],
      menuRecipeLines: [],
      updated_at: new Date().toISOString()
    };
  }

  // Validate the stored envelope without silently discarding malformed data.
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
      if (value[field] === undefined) {
        normalized[field] = [];
        return;
      }
      if (!Array.isArray(value[field])) {
        throw new Error('Struktur ' + field + ' pada penyimpanan Master Data tidak valid.');
      }
      normalized[field] = value[field];
    });

    normalized.updated_at = value.updated_at || normalized.updated_at;
    return normalized;
  }

  function load() {
    let raw;
    try {
      raw = root.localStorage.getItem(KEY);
    } catch (error) {
      throw new Error('Penyimpanan browser tidak dapat diakses.');
    }

    if (raw === null) {
      return save(createEmpty());
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error('Data Master Data tidak bisa dibaca. Data lama tidak dihapus.');
    }

    return normalizeData(parsed);
  }

  function save(value) {
    const normalized = normalizeData(value);
    normalized.updated_at = new Date().toISOString();

    try {
      root.localStorage.setItem(KEY, JSON.stringify(normalized));
    } catch (error) {
      throw new Error('Data tidak berhasil disimpan. Periksa ruang penyimpanan browser.');
    }

    return normalized;
  }

  function createId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') {
      return root.crypto.randomUUID();
    }
    return 'md-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  root.MasterDataStore = {
    key: KEY,
    schemaVersion: SCHEMA_VERSION,
    createEmpty: createEmpty,
    load: load,
    save: save,
    createId: createId
  };
})(window);
