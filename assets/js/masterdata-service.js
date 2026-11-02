(function (root) {
  'use strict';

  const store = root.MasterDataStore;
  const ACTIVE = 'active';
  const INACTIVE = 'inactive';

  function cleanText(value) {
    return String(value == null ? '' : value).trim();
  }

  function unitKey(value) {
    return cleanText(value).toLocaleUpperCase('id-ID');
  }

  function numberValue(value) {
    if (value === '' || value === null || value === undefined) return NaN;
    return Number(value);
  }

  function getConversionFactor(item, unit) {
    if (!item) return 0;
    const wanted = unitKey(unit);
    const conversions = Array.isArray(item.konversi_satuan) ? item.konversi_satuan : [];
    const found = conversions.find(function (row) {
      return unitKey(row.unit) === wanted;
    });
    return found ? Number(found.factor) : 0;
  }

  function normalizeConversions(baseUnit, rows) {
    const base = unitKey(baseUnit);
    if (!base) throw new Error('Satuan dasar wajib diisi.');

    const source = Array.isArray(rows) ? rows.slice() : [];
    const hasBase = source.some(function (row) {
      return unitKey(row && row.unit) === base;
    });
    if (!hasBase) source.unshift({ unit: base, factor: 1 });

    const result = [];
    const seen = new Set();

    source.forEach(function (row) {
      const unit = unitKey(row && row.unit);
      const factor = numberValue(row && row.factor);
      if (!unit) throw new Error('Nama satuan konversi wajib diisi.');
      if (seen.has(unit)) throw new Error('Nama satuan tidak boleh duplikat: ' + unit + '.');
      if (!Number.isFinite(factor) || factor <= 0) {
        throw new Error('Faktor konversi untuk ' + unit + ' harus lebih besar dari 0.');
      }
      seen.add(unit);
      result.push({ unit: unit, factor: factor });
    });

    const baseRows = result.filter(function (row) {
      return row.unit === base;
    });
    if (baseRows.length !== 1 || baseRows[0].factor !== 1) {
      throw new Error('Satuan dasar harus ada tepat satu kali dengan faktor 1.');
    }

    return result;
  }

  function findItemInData(data, id) {
    return data.masterItems.find(function (item) {
      return String(item.id) === String(id);
    }) || null;
  }

  function buildItem(input, data, existing) {
    const name = cleanText(input.nama_barang);
    const baseUnit = unitKey(input.satuan_dasar);
    const priceText = cleanText(input.harga_referensi);
    const referencePrice = numberValue(input.harga_referensi);
    const priceUnit = unitKey(input.satuan_harga);

    if (!name) throw new Error('Nama barang wajib diisi.');
    if (name.length > 120) throw new Error('Nama barang maksimal 120 karakter.');
    if (!baseUnit) throw new Error('Satuan dasar wajib diisi.');
    if (!priceText || !Number.isFinite(referencePrice) || referencePrice < 0) {
      throw new Error('Harga referensi wajib diisi dan tidak boleh negatif.');
    }
    if (!priceUnit) throw new Error('Satuan harga wajib diisi.');

    const conversions = normalizeConversions(baseUnit, input.konversi_satuan);
    const priceFactor = getConversionFactor({ konversi_satuan: conversions }, priceUnit);
    if (!(priceFactor > 0)) {
      throw new Error('Satuan harga harus tersedia dalam daftar konversi.');
    }

    const scopeId = existing ? existing.scope_id : data.active_scope_id;
    const duplicate = data.masterItems.find(function (item) {
      return String(item.scope_id) === String(scopeId) &&
        String(item.id) !== String(existing ? existing.id : input.id || '') &&
        cleanText(item.nama_barang).toLocaleLowerCase('id-ID') === name.toLocaleLowerCase('id-ID');
    });
    if (duplicate) {
      throw new Error('Nama barang sudah terdaftar pada scope ini. Nama tidak membedakan huruf besar/kecil.');
    }

    const now = new Date().toISOString();
    return {
      id: existing ? existing.id : (input.id || store.createId()),
      scope_id: scopeId,
      nama_barang: name,
      satuan_dasar: baseUnit,
      konversi_satuan: conversions,
      harga_referensi: referencePrice,
      satuan_harga: priceUnit,
      harga_per_satuan_dasar: referencePrice / priceFactor,
      harga_beli_terakhir_per_satuan_dasar: existing
        ? existing.harga_beli_terakhir_per_satuan_dasar
        : null,
      status: input.status === INACTIVE || (existing && existing.status === INACTIVE && input.status == null)
        ? INACTIVE
        : ACTIVE,
      is_supply: existing ? Boolean(existing.is_supply) : false,
      created_at: existing ? existing.created_at : now,
      updated_at: now
    };
  }

  function canonicalConversions(item) {
    return (Array.isArray(item && item.konversi_satuan) ? item.konversi_satuan : [])
      .map(function (row) {
        return [unitKey(row.unit), Number(row.factor)];
      })
      .sort(function (a, b) {
        return a[0].localeCompare(b[0]);
      });
  }

  function hasUnitStructureChanged(oldItem, nextItem) {
    if (!oldItem || !nextItem) return false;
    return unitKey(oldItem.satuan_dasar) !== unitKey(nextItem.satuan_dasar) ||
      JSON.stringify(canonicalConversions(oldItem)) !== JSON.stringify(canonicalConversions(nextItem));
  }

  function linkedMaterialLines(data, itemId) {
    const wipLines = data.wipRecipeLines.filter(function (line) {
      return line.component_type === 'material' && String(line.item_id) === String(itemId);
    }).map(function (line) {
      return { line: line, location: 'Resep WIP' };
    });
    const menuLines = data.menuRecipeLines.filter(function (line) {
      return line.component_type === 'material' && String(line.item_id) === String(itemId);
    }).map(function (line) {
      return { line: line, location: 'Menu' };
    });
    return wipLines.concat(menuLines);
  }

  function refreshLinkedQuantities(data, itemId, nextItem) {
    const links = linkedMaterialLines(data, itemId);
    const changes = [];

    links.forEach(function (entry) {
      const line = entry.line;
      const factor = getConversionFactor(nextItem, line.unit_input);
      if (!(factor > 0)) {
        changes.push({
          missing: true,
          unit: line.unit_input,
          location: entry.location
        });
        return;
      }

      const quantity = numberValue(line.qty_input);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        changes.push({
          missing: true,
          unit: line.unit_input,
          location: entry.location
        });
        return;
      }

      changes.push({
        line: line,
        qty_base: quantity * factor
      });
    });

    const invalid = changes.find(function (change) {
      return change.missing;
    });
    if (invalid) {
      throw new Error(
        'Satuan ' + invalid.unit + ' masih digunakan pada ' + invalid.location +
        '. Ubah satuan komponen resep terlebih dahulu; konversi lama tidak dihapus otomatis.'
      );
    }

    changes.forEach(function (change) {
      change.line.qty_base = change.qty_base;
    });
  }

  function listItems(options) {
    const settings = options || {};
    const data = store.load();
    const query = cleanText(settings.query).toLocaleLowerCase('id-ID');
    const status = settings.status || ACTIVE;

    return data.masterItems
      .filter(function (item) {
        return String(item.scope_id) === String(data.active_scope_id);
      })
      .filter(function (item) {
        return status === 'all' || item.status === status;
      })
      .filter(function (item) {
        return !query || cleanText(item.nama_barang).toLocaleLowerCase('id-ID').includes(query);
      })
      .sort(function (a, b) {
        return cleanText(a.nama_barang).localeCompare(cleanText(b.nama_barang), 'id', {
          sensitivity: 'base',
          numeric: true
        });
      });
  }

  function prepareItem(input) {
    const data = store.load();
    const existing = input.id ? findItemInData(data, input.id) : null;
    if (input.id && !existing) throw new Error('Barang yang akan diedit tidak ditemukan.');
    return buildItem(input, data, existing);
  }

  // Save a master item after validation and optional confirmation for unit changes.
  function saveItem(input, confirmUnitChange) {
    const data = store.load();
    const existing = input.id ? findItemInData(data, input.id) : null;
    if (input.id && !existing) throw new Error('Barang yang akan diedit tidak ditemukan.');

    const nextItem = buildItem(input, data, existing);
    const structureChanged = hasUnitStructureChanged(existing, nextItem);

    if (structureChanged && typeof confirmUnitChange !== 'function') {
      throw new Error('Perubahan struktur satuan membutuhkan konfirmasi.');
    }
    if (structureChanged && confirmUnitChange({
      oldItem: existing,
      nextItem: nextItem,
      linkedCount: linkedMaterialLines(data, nextItem.id).length
    }) !== true) {
      return null;
    }

    if (structureChanged) {
      refreshLinkedQuantities(data, nextItem.id, nextItem);
    }

    if (existing) {
      const index = data.masterItems.findIndex(function (item) {
        return String(item.id) === String(existing.id);
      });
      data.masterItems[index] = nextItem;
    } else {
      data.masterItems.push(nextItem);
    }

    store.save(data);
    return nextItem;
  }

  function setItemStatus(id, status) {
    if (status !== ACTIVE && status !== INACTIVE) {
      throw new Error('Status barang tidak dikenal.');
    }

    const data = store.load();
    const item = findItemInData(data, id);
    if (!item) throw new Error('Barang tidak ditemukan.');

    item.status = status;
    item.updated_at = new Date().toISOString();
    store.save(data);
    return item;
  }

  function previewPrice(input) {
    const amount = numberValue(input.harga_referensi);
    const unit = unitKey(input.satuan_harga);
    const conversions = normalizeConversions(input.satuan_dasar, input.konversi_satuan);
    const factor = getConversionFactor({ konversi_satuan: conversions }, unit);

    if (!cleanText(input.harga_referensi) || !Number.isFinite(amount) || amount < 0 || !(factor > 0)) {
      return { valid: false, reason: 'Lengkapi harga dan pilih satuan harga yang tersedia.' };
    }

    return {
      valid: true,
      factor: factor,
      value: amount / factor,
      baseUnit: unitKey(input.satuan_dasar),
      priceUnit: unit
    };
  }

  function getPriceSource(item) {
    const lastPrice = Number(item && item.harga_beli_terakhir_per_satuan_dasar);
    if (Number.isFinite(lastPrice) && lastPrice > 0) {
      return { value: lastPrice, source: 'last_purchase' };
    }

    const referencePrice = Number(item && item.harga_per_satuan_dasar);
    if (Number.isFinite(referencePrice) && referencePrice > 0) {
      return { value: referencePrice, source: 'reference' };
    }

    return null;
  }

  function getCounts() {
    const items = listItems({ status: 'all' });
    return {
      total: items.length,
      active: items.filter(function (item) { return item.status === ACTIVE; }).length,
      inactive: items.filter(function (item) { return item.status === INACTIVE; }).length
    };
  }

  root.MasterDataService = {
    ACTIVE: ACTIVE,
    INACTIVE: INACTIVE,
    listItems: listItems,
    findItem: function (id) {
      return findItemInData(store.load(), id);
    },
    getCounts: getCounts,
    getConversionFactor: getConversionFactor,
    normalizeConversions: normalizeConversions,
    prepareItem: prepareItem,
    hasUnitStructureChanged: function (id, nextItem) {
      return hasUnitStructureChanged(findItemInData(store.load(), id), nextItem);
    },
    saveItem: saveItem,
    setItemStatus: setItemStatus,
    previewPrice: previewPrice,
    getPriceSource: getPriceSource
  };
})(window);
