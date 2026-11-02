(function (root) {
  'use strict';

  const store = root.MasterDataStore;
  const master = root.MasterDataService;
  const ACTIVE = 'active';
  const INACTIVE = 'inactive';

  function textValue(value) {
    return String(value == null ? '' : value).trim();
  }

  function unitKey(value) {
    return textValue(value).toLocaleUpperCase('id-ID');
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function findWip(data, id) {
    return data.wips.find(function (item) {
      return String(item.id) === String(id);
    }) || null;
  }

  function getWipLines(data, id) {
    return data.wipRecipeLines.filter(function (line) {
      return String(line.wip_id) === String(id);
    });
  }

  function listWips(options) {
    const settings = options || {};
    const data = store.load();
    const query = textValue(settings.query).toLocaleLowerCase('id-ID');
    const status = settings.status || ACTIVE;

    return data.wips
      .filter(function (wip) {
        return String(wip.scope_id) === String(data.active_scope_id);
      })
      .filter(function (wip) {
        return status === 'all' || wip.status === status;
      })
      .filter(function (wip) {
        return !query || textValue(wip.nama_wip).toLocaleLowerCase('id-ID').includes(query);
      })
      .sort(function (a, b) {
        return textValue(a.nama_wip).localeCompare(textValue(b.nama_wip), 'id', {
          sensitivity: 'base',
          numeric: true
        });
      });
  }

  function normalizeLines(data, wipId, sourceLines) {
    if (!Array.isArray(sourceLines) || sourceLines.length === 0) {
      throw new Error('Resep WIP minimal harus memiliki satu komponen.');
    }

    return sourceLines.map(function (source, index) {
      const type = source.component_type === 'wip' ? 'wip' : 'material';
      const quantity = positiveNumber(source.qty_input);
      if (!quantity) throw new Error('Jumlah komponen baris ' + (index + 1) + ' harus lebih besar dari 0.');

      if (type === 'material') {
        const item = data.masterItems.find(function (entry) {
          return String(entry.id) === String(source.item_id) &&
            String(entry.scope_id) === String(data.active_scope_id);
        });
        if (!item) throw new Error('Bahan pada baris ' + (index + 1) + ' tidak ditemukan dalam scope aktif.');
        if (item.status !== ACTIVE) {
          throw new Error('Bahan ' + item.nama_barang + ' nonaktif dan tidak dapat dipilih untuk resep baru.');
        }

        const unit = unitKey(source.unit_input);
        const factor = master.getConversionFactor(item, unit);
        if (!(factor > 0)) {
          throw new Error('Satuan ' + unit + ' tidak tersedia pada Master Barang ' + item.nama_barang + '.');
        }

        return {
          id: source.id || store.createId(),
          wip_id: wipId,
          component_type: 'material',
          item_id: item.id,
          component_wip_id: null,
          qty_input: quantity,
          unit_input: unit,
          qty_base: quantity * factor
        };
      }

      const child = findWip(data, source.component_wip_id);
      if (!child || String(child.scope_id) !== String(data.active_scope_id)) {
        throw new Error('WIP turunan pada baris ' + (index + 1) + ' tidak ditemukan dalam scope aktif.');
      }
      if (child.status !== ACTIVE) {
        throw new Error('WIP ' + child.nama_wip + ' nonaktif dan tidak dapat dipilih untuk resep baru.');
      }
      const unit = unitKey(source.unit_input);
      if (unit !== unitKey(child.satuan_hasil)) {
        throw new Error('Satuan komponen WIP harus sama dengan satuan hasil ' + child.nama_wip + ' (' + child.satuan_hasil + ').');
      }

      return {
        id: source.id || store.createId(),
        wip_id: wipId,
        component_type: 'wip',
        item_id: null,
        component_wip_id: child.id,
        qty_input: quantity,
        unit_input: unit,
        qty_base: quantity
      };
    });
  }

  function reachesWip(data, startId, targetId, replacementId, replacementLines, visited) {
    if (String(startId) === String(targetId)) return true;
    const key = String(startId);
    if (visited.has(key)) return false;
    visited.add(key);

    const lines = key === String(replacementId)
      ? replacementLines
      : getWipLines(data, startId);

    return lines.some(function (line) {
      return line.component_type === 'wip' &&
        reachesWip(data, line.component_wip_id, targetId, replacementId, replacementLines, visited);
    });
  }

  function assertNoCycle(data, wipId, lines) {
    const cyclic = lines.some(function (line) {
      return line.component_type === 'wip' &&
        reachesWip(data, line.component_wip_id, wipId, wipId, lines, new Set());
    });
    if (cyclic) throw new Error('Resep tidak dapat disimpan karena membentuk siklus WIP.');
  }

  function calculateHpp(data, wipId, stack) {
    const wip = findWip(data, wipId);
    if (!wip) return { valid: false, reason: 'Data WIP tidak ditemukan.' };
    if (wip.status !== ACTIVE) return { valid: false, reason: 'WIP ' + wip.nama_wip + ' berstatus nonaktif.' };
    if (!(positiveNumber(wip.hasil_per_batch))) {
      return { valid: false, reason: 'Jumlah hasil per batch belum valid.' };
    }

    const path = stack || [];
    if (path.includes(String(wip.id))) {
      return { valid: false, reason: 'Siklus resep WIP terdeteksi pada ' + wip.nama_wip + '.' };
    }

    const lines = getWipLines(data, wip.id);
    if (!lines.length) return { valid: false, reason: 'Resep WIP belum memiliki komponen.' };

    const nextPath = path.concat(String(wip.id));
    let total = 0;
    let estimated = false;
    const details = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const quantity = positiveNumber(line.qty_input);
      if (!quantity) {
        return { valid: false, reason: 'Jumlah komponen resep baris ' + (index + 1) + ' tidak valid.' };
      }

      if (line.component_type === 'material') {
        const item = data.masterItems.find(function (entry) {
          return String(entry.id) === String(line.item_id);
        });
        if (!item) return { valid: false, reason: 'Bahan pada baris ' + (index + 1) + ' sudah tidak tersedia.' };
        if (item.status !== ACTIVE) {
          return { valid: false, reason: 'Bahan ' + item.nama_barang + ' sudah nonaktif.' };
        }
        if (String(item.scope_id) !== String(wip.scope_id)) {
          return { valid: false, reason: 'Bahan ' + item.nama_barang + ' berada di scope berbeda.' };
        }

        const factor = master.getConversionFactor(item, line.unit_input);
        if (!(factor > 0)) {
          return { valid: false, reason: 'Satuan ' + line.unit_input + ' pada bahan ' + item.nama_barang + ' tidak ditemukan.' };
        }
        const price = master.getPriceSource(item);
        if (!price) {
          return { valid: false, reason: 'Harga bahan ' + item.nama_barang + ' belum tersedia.' };
        }

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

      const child = findWip(data, line.component_wip_id);
      if (!child) return { valid: false, reason: 'WIP turunan pada baris ' + (index + 1) + ' tidak ditemukan.' };
      if (unitKey(line.unit_input) !== unitKey(child.satuan_hasil)) {
        return { valid: false, reason: 'Satuan WIP turunan ' + child.nama_wip + ' tidak sesuai dengan satuan hasilnya.' };
      }
      const childHpp = calculateHpp(data, child.id, nextPath);
      if (!childHpp.valid) {
        return { valid: false, reason: 'HPP WIP ' + child.nama_wip + ' belum valid: ' + childHpp.reason };
      }

      const cost = quantity * childHpp.hpp_per_yield;
      total += cost;
      if (childHpp.is_estimated) estimated = true;
      details.push({
        line_id: line.id,
        component_type: 'wip',
        component_name: child.nama_wip,
        qty_base: quantity,
        unit_base: child.satuan_hasil,
        cost: cost,
        price_source: childHpp.is_estimated ? 'estimated' : 'calculated'
      });
    }

    return {
      valid: true,
      wip_id: wip.id,
      batch_cost: total,
      yield_quantity: Number(wip.hasil_per_batch),
      yield_unit: wip.satuan_hasil,
      hpp_per_yield: total / Number(wip.hasil_per_batch),
      is_estimated: estimated,
      details: details
    };
  }

  function saveWip(input, sourceLines) {
    const data = store.load();
    const existing = input.id ? findWip(data, input.id) : null;
    if (input.id && !existing) throw new Error('WIP yang akan diedit tidak ditemukan.');

    const name = textValue(input.nama_wip);
    const yieldUnit = unitKey(input.satuan_hasil);
    const yieldQuantity = positiveNumber(input.hasil_per_batch);
    if (!name) throw new Error('Nama WIP wajib diisi.');
    if (name.length > 120) throw new Error('Nama WIP maksimal 120 karakter.');
    if (!yieldUnit) throw new Error('Satuan hasil wajib diisi.');
    if (!yieldQuantity) throw new Error('Jumlah hasil per batch harus lebih besar dari 0.');

    const scopeId = existing ? existing.scope_id : data.active_scope_id;
    const duplicate = data.wips.find(function (wip) {
      return String(wip.scope_id) === String(scopeId) &&
        String(wip.id) !== String(existing ? existing.id : '') &&
        textValue(wip.nama_wip).toLocaleLowerCase('id-ID') === name.toLocaleLowerCase('id-ID');
    });
    if (duplicate) throw new Error('Nama WIP sudah digunakan dalam scope ini.');

    if (existing && unitKey(existing.satuan_hasil) !== yieldUnit) {
      const incompatibleParent = data.wipRecipeLines.find(function (line) {
        return line.component_type === 'wip' &&
          String(line.component_wip_id) === String(existing.id) &&
          unitKey(line.unit_input) !== yieldUnit;
      });
      if (incompatibleParent) {
        throw new Error('Satuan hasil WIP ini masih digunakan oleh resep WIP lain. Perbarui satuan pada resep induk terlebih dahulu.');
      }
    }

    const id = existing ? existing.id : store.createId();
    const lines = normalizeLines(data, id, sourceLines);
    assertNoCycle(data, id, lines);

    const now = new Date().toISOString();
    const wip = {
      id: id,
      scope_id: scopeId,
      nama_wip: name,
      satuan_hasil: yieldUnit,
      hasil_per_batch: yieldQuantity,
      status: input.status === INACTIVE ? INACTIVE : (existing ? existing.status : ACTIVE),
      created_at: existing ? existing.created_at : now,
      updated_at: now
    };

    data.wips = existing
      ? data.wips.map(function (item) { return String(item.id) === String(id) ? wip : item; })
      : data.wips.concat(wip);
    data.wipRecipeLines = data.wipRecipeLines
      .filter(function (line) { return String(line.wip_id) !== String(id); })
      .concat(lines);

    store.save(data);
    return wip;
  }

  function setWipStatus(id, status) {
    if (status !== ACTIVE && status !== INACTIVE) throw new Error('Status WIP tidak dikenal.');
    const data = store.load();
    const wip = findWip(data, id);
    if (!wip) throw new Error('WIP tidak ditemukan.');
    wip.status = status;
    wip.updated_at = new Date().toISOString();
    store.save(data);
    return wip;
  }

  function getCounts() {
    const items = listWips({ status: 'all' });
    return {
      total: items.length,
      active: items.filter(function (item) { return item.status === ACTIVE; }).length,
      inactive: items.filter(function (item) { return item.status === INACTIVE; }).length
    };
  }

  root.WipService = {
    ACTIVE: ACTIVE,
    INACTIVE: INACTIVE,
    listWips: listWips,
    findWip: function (id) { return findWip(store.load(), id); },
    getLines: function (id) { return getWipLines(store.load(), id); },
    getCounts: getCounts,
    calculateHpp: function (id) { return calculateHpp(store.load(), id, []); },
    saveWip: saveWip,
    setWipStatus: setWipStatus
  };
})(window);
