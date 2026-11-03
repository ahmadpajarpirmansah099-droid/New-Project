(function (root) {
  'use strict';

  const store = root.MasterDataStore;
  const master = root.MasterDataService;
  const ACTIVE = 'active';
  const INACTIVE = 'inactive';

  function clean(value) { return String(value == null ? '' : value).trim(); }
  function unitKey(value) { return clean(value).toLocaleUpperCase('id-ID'); }
  function positive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }
  function findMenu(data, id) {
    return data.menus.find(function (menu) { return String(menu.id) === String(id); }) || null;
  }
  function getLines(data, id) {
    return data.menuRecipeLines.filter(function (line) { return String(line.menu_id) === String(id); });
  }

  function listMenus(options) {
    const settings = options || {};
    const data = store.load();
    const query = clean(settings.query).toLocaleLowerCase('id-ID');
    const status = settings.status || ACTIVE;
    return data.menus
      .filter(function (menu) { return String(menu.scope_id) === String(data.active_scope_id); })
      .filter(function (menu) { return status === 'all' || menu.status === status; })
      .filter(function (menu) { return !query || clean(menu.nama_menu).toLocaleLowerCase('id-ID').includes(query); })
      .sort(function (a, b) {
        return clean(a.nama_menu).localeCompare(clean(b.nama_menu), 'id', { sensitivity: 'base', numeric: true });
      });
  }

  function normalizeLines(data, menuId, sourceLines) {
    if (!Array.isArray(sourceLines) || sourceLines.length === 0) {
      throw new Error('Komposisi menu minimal harus memiliki satu komponen.');
    }
    return sourceLines.map(function (source, index) {
      const type = source.component_type === 'wip' ? 'wip' : 'material';
      const quantity = positive(source.qty_input);
      if (!quantity) throw new Error('Jumlah komponen baris ' + (index + 1) + ' harus lebih besar dari 0.');

      if (type === 'material') {
        const item = data.masterItems.find(function (entry) {
          return String(entry.id) === String(source.item_id) &&
            String(entry.scope_id) === String(data.active_scope_id);
        });
        if (!item) throw new Error('Bahan menu pada baris ' + (index + 1) + ' tidak ditemukan.');
        if (item.status !== ACTIVE) throw new Error('Bahan ' + item.nama_barang + ' nonaktif dan tidak dapat dipilih.');
        const unit = unitKey(source.unit_input);
        const factor = master.getConversionFactor(item, unit);
        if (!(factor > 0)) throw new Error('Satuan ' + unit + ' tidak tersedia pada ' + item.nama_barang + '.');
        return {
          id: source.id || store.createId(),
          menu_id: menuId,
          component_type: 'material',
          item_id: item.id,
          component_wip_id: null,
          qty_input: quantity,
          unit_input: unit,
          qty_base: quantity * factor
        };
      }

      const wip = root.WipService.findWip(source.component_wip_id);
      if (!wip || String(wip.scope_id) !== String(data.active_scope_id)) {
        throw new Error('WIP pada baris ' + (index + 1) + ' tidak ditemukan dalam scope aktif.');
      }
      if (wip.status !== ACTIVE) throw new Error('WIP ' + wip.nama_wip + ' nonaktif dan tidak dapat dipilih.');
      const unit = unitKey(source.unit_input);
      if (unit !== unitKey(wip.satuan_hasil)) {
        throw new Error('Satuan komponen WIP harus sama dengan satuan hasil ' + wip.nama_wip + ' (' + wip.satuan_hasil + ').');
      }
      return {
        id: source.id || store.createId(),
        menu_id: menuId,
        component_type: 'wip',
        item_id: null,
        component_wip_id: wip.id,
        qty_input: quantity,
        unit_input: unit,
        qty_base: quantity
      };
    });
  }

  function calculateHpp(data, menuId) {
    const menu = findMenu(data, menuId);
    if (!menu) return { valid: false, reason: 'Data menu tidak ditemukan.' };
    if (menu.status !== ACTIVE) return { valid: false, reason: 'Menu ' + menu.nama_menu + ' berstatus nonaktif.' };
    const sellingPrice = Number(menu.harga_jual);
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
      return { valid: false, reason: 'Harga jual menu harus lebih besar dari 0.' };
    }

    const lines = getLines(data, menu.id);
    if (!lines.length) return { valid: false, reason: 'Komposisi menu belum diisi.' };

    let total = 0;
    let estimated = false;
    const details = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const quantity = positive(line.qty_input);
      if (!quantity) return { valid: false, reason: 'Jumlah komponen baris ' + (index + 1) + ' tidak valid.' };

      if (line.component_type === 'material') {
        const item = data.masterItems.find(function (entry) { return String(entry.id) === String(line.item_id); });
        if (!item) return { valid: false, reason: 'Bahan pada baris ' + (index + 1) + ' sudah tidak tersedia.' };
        if (item.status !== ACTIVE) return { valid: false, reason: 'Bahan ' + item.nama_barang + ' sudah nonaktif.' };
        if (String(item.scope_id) !== String(menu.scope_id)) return { valid: false, reason: 'Bahan ' + item.nama_barang + ' berada di scope berbeda.' };
        const factor = master.getConversionFactor(item, line.unit_input);
        if (!(factor > 0)) return { valid: false, reason: 'Satuan ' + line.unit_input + ' pada bahan ' + item.nama_barang + ' tidak ditemukan.' };
        const price = master.getPriceSource(item);
        if (!price) return { valid: false, reason: 'Harga bahan ' + item.nama_barang + ' belum tersedia.' };
        const qtyBase = quantity * factor;
        const cost = qtyBase * price.value;
        total += cost;
        if (price.source === 'reference') estimated = true;
        details.push({
          line_id: line.id,
          component_type: 'material',
          component_name: item.nama_barang,
          qty_base: qtyBase,
          unit_base: item.satuan_dasar,
          cost: cost,
          price_source: price.source
        });
        continue;
      }

      const wip = root.WipService.findWip(line.component_wip_id);
      if (!wip) return { valid: false, reason: 'WIP pada baris ' + (index + 1) + ' sudah tidak tersedia.' };
      if (wip.status !== ACTIVE) return { valid: false, reason: 'WIP ' + wip.nama_wip + ' sudah nonaktif.' };
      if (String(wip.scope_id) !== String(menu.scope_id)) return { valid: false, reason: 'WIP ' + wip.nama_wip + ' berada di scope berbeda.' };
      if (unitKey(line.unit_input) !== unitKey(wip.satuan_hasil)) {
        return { valid: false, reason: 'Satuan WIP ' + wip.nama_wip + ' tidak sesuai dengan satuan hasilnya.' };
      }
      const wipHpp = root.WipService.calculateHpp(wip.id);
      if (!wipHpp.valid) return { valid: false, reason: 'HPP WIP ' + wip.nama_wip + ' belum valid: ' + wipHpp.reason };
      const cost = quantity * wipHpp.hpp_per_yield;
      total += cost;
      if (wipHpp.is_estimated) estimated = true;
      details.push({
        line_id: line.id,
        component_type: 'wip',
        component_name: wip.nama_wip,
        qty_base: quantity,
        unit_base: wip.satuan_hasil,
        cost: cost,
        price_source: wipHpp.is_estimated ? 'estimated' : 'calculated'
      });
    }

    return {
      valid: true,
      menu_id: menu.id,
      hpp_per_serving: total,
      selling_price: sellingPrice,
      margin_amount: sellingPrice - total,
      margin_pct: ((sellingPrice - total) / sellingPrice) * 100,
      is_estimated: estimated,
      details: details
    };
  }

  function saveMenu(input, sourceLines) {
    const data = store.load();
    const existing = input.id ? findMenu(data, input.id) : null;
    if (input.id && !existing) throw new Error('Menu yang akan diedit tidak ditemukan.');
    const name = clean(input.nama_menu);
    const sellingPrice = Number(input.harga_jual);
    if (!name) throw new Error('Nama menu wajib diisi.');
    if (clean(input.harga_jual) === '') throw new Error('Harga jual menu wajib diisi.');
    if (name.length > 120) throw new Error('Nama menu maksimal 120 karakter.');
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      throw new Error('Harga jual harus diisi dan tidak boleh negatif.');
    }

    const scopeId = existing ? existing.scope_id : data.active_scope_id;
    const duplicate = data.menus.find(function (menu) {
      return String(menu.scope_id) === String(scopeId) &&
        String(menu.id) !== String(existing ? existing.id : '') &&
        clean(menu.nama_menu).toLocaleLowerCase('id-ID') === name.toLocaleLowerCase('id-ID');
    });
    if (duplicate) throw new Error('Nama menu sudah digunakan dalam scope ini.');

    const id = existing ? existing.id : store.createId();
    const lines = normalizeLines(data, id, sourceLines);
    const now = new Date().toISOString();
    const menu = {
      id: id,
      scope_id: scopeId,
      nama_menu: name,
      harga_jual: sellingPrice,
      status: input.status === INACTIVE ? INACTIVE : (existing ? existing.status : ACTIVE),
      created_at: existing ? existing.created_at : now,
      updated_at: now
    };
    data.menus = existing
      ? data.menus.map(function (item) { return String(item.id) === String(id) ? menu : item; })
      : data.menus.concat(menu);
    data.menuRecipeLines = data.menuRecipeLines
      .filter(function (line) { return String(line.menu_id) !== String(id); })
      .concat(lines);
    store.save(data);
    return menu;
  }

  function setMenuStatus(id, status) {
    if (status !== ACTIVE && status !== INACTIVE) throw new Error('Status menu tidak dikenal.');
    const data = store.load();
    const menu = findMenu(data, id);
    if (!menu) throw new Error('Menu tidak ditemukan.');
    menu.status = status;
    menu.updated_at = new Date().toISOString();
    store.save(data);
    return menu;
  }

  function getCounts() {
    const items = listMenus({ status: 'all' });
    return {
      total: items.length,
      active: items.filter(function (item) { return item.status === ACTIVE; }).length,
      inactive: items.filter(function (item) { return item.status === INACTIVE; }).length
    };
  }

  root.MenuService = {
    ACTIVE: ACTIVE,
    INACTIVE: INACTIVE,
    listMenus: listMenus,
    findMenu: function (id) { return findMenu(store.load(), id); },
    getLines: function (id) { return getLines(store.load(), id); },
    getCounts: getCounts,
    calculateHpp: function (id) { return calculateHpp(store.load(), id); },
    saveMenu: saveMenu,
    setMenuStatus: setMenuStatus
  };
})(window);
