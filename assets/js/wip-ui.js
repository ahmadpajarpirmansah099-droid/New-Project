(function (root) {
  'use strict';

  let currentTab = 'active';
  let searchQuery = '';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function number(value) {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(Number(value) || 0);
  }

  function money(value) {
    return 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function notify(message) {
    if (typeof root.toast === 'function') root.toast(message);
  }

  function getRoot() {
    return root.document.getElementById('wipDataRoot');
  }

  function getAvailableMaterials() {
    return root.MasterDataService.listItems({ status: 'active' });
  }

  function getAvailableWips(excludeId) {
    return root.WipService.listWips({ status: 'active' }).filter(function (wip) {
      return String(wip.id) !== String(excludeId || '');
    });
  }

  function componentOptions(type, selectedId, excludeId) {
    const entries = type === 'wip' ? getAvailableWips(excludeId) : getAvailableMaterials();
    return '<option value="">Pilih ' + (type === 'wip' ? 'WIP' : 'bahan') + '</option>' +
      entries.map(function (entry) {
        const id = type === 'wip' ? entry.id : entry.id;
        const name = type === 'wip' ? entry.nama_wip : entry.nama_barang;
        return '<option value="' + escapeHtml(id) + '" ' + (String(id) === String(selectedId || '') ? 'selected' : '') + '>' +
          escapeHtml(name) + '</option>';
      }).join('');
  }

  function getComponentUnit(type, selectedId) {
    if (type === 'wip') {
      const wip = root.WipService.findWip(selectedId);
      return wip ? (wip.satuan_hasil || '') : '';
    }
    const item = root.MasterDataService.findItem(selectedId);
    return item ? (item.satuan_dasar || '') : '';
  }

  function findComponent(type, id, excludeId) {
    const entries = type === 'wip' ? getAvailableWips(excludeId) : getAvailableMaterials();
    return entries.find(function (entry) { return String(entry.id) === String(id || ''); }) || null;
  }

  function renderComponentOptions(row, query) {
    const currentWipId = root.document.querySelector('[name="wipId"]')?.value;
    const q = String(query || '').trim().toLocaleLowerCase('id-ID');
    const materials = getAvailableMaterials().filter(function (item) { return String(item.nama_barang || '').toLocaleLowerCase('id-ID').includes(q); }).map(function (item) { return { id:item.id, type:'material', name:item.nama_barang, label:'Barang' }; });
    const wips = getAvailableWips(currentWipId).filter(function (item) { return String(item.nama_wip || '').toLocaleLowerCase('id-ID').includes(q); }).map(function (item) { return { id:item.id, type:'wip', name:item.nama_wip, label:'WIP' }; });
    row.querySelector('[data-wip-component-options]').innerHTML = materials.concat(wips).map(function (entry) {
      return '<button type="button" class="wip-component-option" data-wip-component-option="' + escapeHtml(entry.id) + '" data-type="' + entry.type + '" data-name="' + escapeHtml(entry.name) + '"><span>' + escapeHtml(entry.name) + '</span><small>' + entry.label + '</small></button>';
    }).join('') || '<div class="wip-component-empty">Tidak ditemukan</div>';
    row.querySelector('[data-wip-component-options]').hidden = !q;
  }

  function recipeRowHtml(line, excludeId) {
    const type = line && line.component_type === 'wip' ? 'wip' : 'material';
    const selectedId = type === 'wip' ? line && line.component_wip_id : line && line.item_id;
    const selected = findComponent(type, selectedId, excludeId);
    const selectedName = selected ? (type === 'wip' ? selected.nama_wip : selected.nama_barang) : '';
    return '<div class="wip-recipe-row" data-wip-recipe-row>' +
      '<input type="hidden" data-wip-type value="' + type + '">' + '<div class="wip-recipe-type" data-wip-recipe-type>' + (type === 'wip' ? 'WIP' : 'Barang') + '</div>' +
      '<div class="wip-field wip-component-search"><input type="search" data-wip-component-search autocomplete="off" placeholder="Cari item" value="' + escapeHtml(selectedName) + '" aria-label="Cari item"><select data-wip-component hidden aria-hidden="true" tabindex="-1">' + componentOptions(type, selectedId, excludeId) + '</select><div class="wip-component-options" data-wip-component-options hidden></div></div>' +
      '<label class="wip-field"><input data-wip-qty type="number" min="0.000001" step="any" inputmode="decimal" placeholder="Jumlah" aria-label="Jumlah" value="' + escapeHtml(line && line.qty_input != null ? line.qty_input : '') + '"></label>' +
      '<input type="hidden" data-wip-unit value="' + escapeHtml(getComponentUnit(type, selectedId)) + '">' + '<div class="wip-unit-display" data-wip-unit-display>' + escapeHtml(getComponentUnit(type, selectedId) || '—') + '</div></div>';
  }

  function initialRecipeRows(lines, excludeId) {
    const rows = Array.isArray(lines) ? lines.slice() : [];
    while (rows.length < 25) rows.push(null);
    return rows.map(function (line) { return recipeRowHtml(line, excludeId); }).join('');
  }

  function getRecipeRows() {
    return Array.from(root.document.querySelectorAll('[data-wip-recipe-row]')).map(function (row) {
      const type = row.querySelector('[data-wip-type]').value;
      const componentId = row.querySelector('[data-wip-component]').value;
      return {
        component_type: type,
        item_id: type === 'material' ? componentId : null,
        component_wip_id: type === 'wip' ? componentId : null,
        qty_input: row.querySelector('[data-wip-qty]').value,
        unit_input: row.querySelector('[data-wip-unit]').value
      };
    }).filter(function (line) {
      return Boolean(line.item_id || line.component_wip_id || String(line.qty_input || '').trim());
    });
  }

  function refreshRowUnits(row) {
    const type = row.querySelector('[data-wip-type]').value;
    const componentId = row.querySelector('[data-wip-component]').value;
    const unit = getComponentUnit(type, componentId);
    const unitInput = row.querySelector('[data-wip-unit]');
    const unitDisplay = row.querySelector('[data-wip-unit-display]');
    if (unitInput) unitInput.value = unit;
    if (unitDisplay) unitDisplay.textContent = unit || '—';
  }

  function openWipForm(id) {
    const existing = id ? root.WipService.findWip(id) : null;
    if (id && !existing) return notify('WIP tidak ditemukan. Muat ulang daftar.');

    const lines = existing ? root.WipService.getLines(id) : [];
    const html = '<div class="wip-sheet">' +
      '<div class="wip-sheet-heading"><div><span class="wip-eyebrow">RESEP WIP</span><h2>' + (existing ? 'Edit WIP' : 'Tambah WIP') + '</h2></div>' +
      '<button type="button" class="wip-close" data-wip-action="close" aria-label="Tutup">×</button></div>' +
      '<form id="wipForm" novalidate>' +
      '<input type="hidden" name="wipId" value="' + escapeHtml(existing ? existing.id : '') + '">' +
      '<label class="wip-field flt"><span class="flt-label">Nama WIP *</span><input name="wipName" aria-label="Nama WIP" type="text" maxlength="120" required placeholder=" " value="' + escapeHtml(existing ? existing.nama_wip : '') + '"></label>' +
      '<div class="wip-form-grid"><label class="wip-field flt"><span class="flt-label">Hasil per batch *</span><input name="wipYield" aria-label="Hasil per batch" type="number" min="0.000001" step="any" inputmode="decimal" required placeholder=" " value="' + escapeHtml(existing ? existing.hasil_per_batch : '') + '"></label>' +
      '<label class="wip-field flt"><span class="flt-label">Satuan hasil *</span><input name="wipYieldUnit" aria-label="Satuan hasil" type="text" maxlength="20" required placeholder=" " value="' + escapeHtml(existing ? existing.satuan_hasil : '') + '"></label></div>' +
      '<section class="wip-recipe-section"><div class="wip-recipe-heading"><div><b>Komposisi resep</b><small>Isi jenis item, nama item, jumlah, dan satuannya.</small></div></div>' +
      '<div class="wip-recipe-labels"><span>JENIS ITEM</span><span>ITEM</span><span>JUMLAH</span><span>SATUAN</span><span></span></div>' +
      '<div id="wipRecipeRows">' + initialRecipeRows(lines, id) + '</div>' +
      '</section>' +
      '<div class="wip-form-note">HPP dihitung dari biaya seluruh komponen dibagi hasil per batch. Harga referensi akan ditandai sebagai estimasi.</div>' +
      '<div class="wip-sheet-actions wip-recipe-actions"><button type="button" class="wip-add-row" data-wip-action="add-row">Tambah baris</button><button type="submit" class="wip-save">Simpan</button><button type="button" class="wip-cancel" data-wip-action="close">Batal</button></div>' +
      '</form></div>';

    if (typeof root.openSheet !== 'function') return notify('Komponen popup belum tersedia.');
    root.openSheet(html);
  }

  function renderHppDetails(details, scale, depth, sourceLines) {
    if (!Array.isArray(details) || !details.length) return '<p class="wip-breakdown-empty">Tidak ada rincian komponen.</p>';
    return '<div class="recipe-breakdown-level" style="--recipe-depth:' + depth + '">' +
      details.map(function (line) {
        const quantity = Number(line.qty_base) * scale;
        const cost = Number(line.cost) * scale;
        const isWip = line.component_type === 'wip';
        const sourceLine = (sourceLines || []).find(function (entry) { return String(entry.id) === String(line.line_id); });
        const child = isWip && sourceLine ? root.WipService.findWip(sourceLine.component_wip_id) : null;
        const childHpp = child ? root.WipService.calculateHpp(child.id) : null;
        const childScale = child && childHpp && childHpp.valid && Number(child.hasil_per_batch) > 0
          ? quantity / Number(child.hasil_per_batch) : 0;
        return '<div class="recipe-breakdown-item' + (isWip ? ' is-wip' : '') + '">' +
          '<div class="recipe-breakdown-line"><div class="recipe-breakdown-name">' +
            '<span>' + (isWip ? 'WIP' : 'Bahan') + '</span><b>' + escapeHtml(line.component_name) + '</b></div>' +
            '<span class="recipe-breakdown-qty">' + number(quantity) + ' ' + escapeHtml(line.unit_base) + '</span>' +
            '<b class="recipe-breakdown-cost">' + money(cost) + '</b></div>' +
          (isWip && child && childHpp && childHpp.valid
            ? '<div class="recipe-breakdown-nested">' + renderHppDetails(childHpp.details, childScale, depth + 1, root.WipService.getLines(child.id)) + '</div>'
            : '') +
        '</div>';
      }).join('') + '</div>';
  }

  function openWipBreakdown(wip) {
    const hpp = root.WipService.calculateHpp(wip.id);
    const details = hpp.valid
      ? '<div class="recipe-breakdown-head"><b>Rincian bahan per batch</b><span>Biaya tiap komponen</span></div>' +
        renderHppDetails(hpp.details, 1, 0, root.WipService.getLines(wip.id)) +
        '<div class="recipe-breakdown-summary"><span>Total biaya batch</span><b>' + money(hpp.batch_cost) + '</b></div>' +
        '<div class="recipe-breakdown-summary"><span>Hasil batch</span><b>' + number(hpp.yield_quantity) + ' ' + escapeHtml(hpp.yield_unit) + '</b></div>' +
        '<div class="recipe-breakdown-summary is-margin"><span>HPP per ' + escapeHtml(hpp.yield_unit) + '</span><b>' + money(hpp.hpp_per_yield) + '</b></div>'
      : '<p class="wip-breakdown-empty">' + escapeHtml(hpp.reason) + '</p>';
    root.openSheet('<div class="wip-sheet wip-breakdown-sheet"><div class="wip-sheet-heading"><div><span class="wip-eyebrow">RINCIAN HPP</span><h2>' +
      escapeHtml(wip.nama_wip) + '</h2></div><button type="button" class="wip-close" data-wip-action="close" aria-label="Tutup">×</button></div>' +
      '<div class="wip-breakdown">' + details + '</div></div>');
  }

  function cardHtml(wip) {
    const hpp = root.WipService.calculateHpp(wip.id);
    const statusLabel = wip.status === 'active' ? 'Aktif' : 'Nonaktif';
    const hppLabel = hpp.valid
      ? money(hpp.hpp_per_yield) + ' / ' + escapeHtml(hpp.yield_unit) + (hpp.is_estimated ? ' · Estimasi' : '')
      : 'Belum valid';
    const batchCost = hpp.valid ? money(hpp.batch_cost) : '—';
    const hppReason = hpp.valid ? '' : '<p class="wip-invalid-reason">' + escapeHtml(hpp.reason) + '</p>';

    return '<article class="wip-card">' +
      '<div class="wip-card-heading">' +
        '<div class="wip-card-copy">' +
          '<div class="wip-card-title-row"><h3>' + escapeHtml(wip.nama_wip) + '</h3>' +
          '<span class="wip-status ' + (wip.status === 'active' ? 'is-active' : 'is-inactive') + '">' + statusLabel + '</span></div>' +
          '<span class="wip-card-base">Hasil batch · ' + number(wip.hasil_per_batch) + ' ' + escapeHtml(wip.satuan_hasil) + '</span>' +
        '</div>' +
        '<div class="wip-card-metrics">' +
          '<div><small>HPP per satuan hasil</small><b class="' + (hpp.valid ? '' : 'is-invalid') + '">' + hppLabel + '</b></div>' +
          '<div><small>Biaya batch</small><b>' + batchCost + '</b></div>' +
        '</div>' +
      '</div>' + hppReason +
      '<div class="wip-card-footer"><button type="button" class="wip-breakdown-toggle" data-wip-action="show-breakdown" data-wip-id="' + escapeHtml(wip.id) + '">Lihat rincian HPP</button>' +
      '<div class="wip-card-actions">' +
        '<button type="button" class="wip-edit" data-wip-action="edit" data-wip-id="' + escapeHtml(wip.id) + '">Edit</button>' +
        '<button type="button" class="wip-status-action" data-wip-action="toggle-status" data-wip-id="' + escapeHtml(wip.id) + '">' +
        (wip.status === 'active' ? 'Nonaktifkan' : 'Aktifkan') + '</button>' +
      '</div></div>' +
      '</article>';
  }

  function renderPage(page) {
    if (page && page !== 'wips') return;
    const host = getRoot();
    if (!host) return;

    try {
      const counts = root.WipService.getCounts();
      const items = root.WipService.listWips({ status: currentTab, query: searchQuery });
      host.innerHTML = '<div class="wip-page">' +
        '<button type="button" class="page-back" data-wip-action="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/><path d="M9 12h12"/></svg><span>Master Barang</span></button>' +
        '<div class="wip-page-heading"><div><span class="wip-eyebrow">PENGELOLAAN RESEP</span><h1>Resep WIP</h1><p>Susun komposisi bahan dan hitung HPP per satuan hasil.</p></div></div>' +
        '<div class="wip-count-grid"><div><span>Total WIP</span><b>' + counts.total + '</b></div><div><span>Aktif</span><b>' + counts.active + '</b></div><div><span>Nonaktif</span><b>' + counts.inactive + '</b></div></div>' +
        '<div class="md-export-toolbar"><label class="wip-search"><span>⌕</span><input id="wipSearch" type="search" placeholder="Cari nama WIP..." value="' + escapeHtml(searchQuery) + '"></label>' +
        '<div class="md-export-toolbar-actions"><div class="wip-filter-row"><button type="button" class="' + (currentTab === 'active' ? 'is-selected' : '') + '" data-wip-action="filter" data-filter="active">Aktif</button>' +
        '<button type="button" class="' + (currentTab === 'inactive' ? 'is-selected' : '') + '" data-wip-action="filter" data-filter="inactive">Nonaktif</button></div>' +
        '<button type="button" class="md-export-button" data-export-excel="wips">Download Excel</button>' +
        '<button class="wip-primary" type="button" data-wip-action="add">+ Tambah WIP</button></div></div>' +
        '<div class="wip-list-heading"><h2>' + (currentTab === 'active' ? 'WIP aktif' : 'WIP nonaktif') + '</h2><span>' + items.length + ' resep</span></div>' +
        '<div class="wip-list">' + (items.length ? items.map(cardHtml).join('') :
          '<div class="wip-empty"><b>' + (searchQuery ? 'WIP tidak ditemukan' : 'Belum ada resep WIP') + '</b><p>' +
          (searchQuery ? 'Coba kata pencarian lain.' : 'Tambahkan resep WIP pertama untuk mulai menghitung HPP.') + '</p></div>') + '</div></div>';
    } catch (error) {
      host.innerHTML = '<div class="wip-page"><div class="wip-empty"><b>Resep WIP belum dapat dibuka</b><p>' +
        escapeHtml(error.message) + '</p><button type="button" data-wip-action="retry">Coba lagi</button></div></div>';
    }
  }

  async function handleSubmit(event) {
    if (event.target.id !== 'wipForm') return;
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('[type="submit"]');
    if (form.dataset.saving === 'true') return;
    form.dataset.saving = 'true';
    if (submitButton) submitButton.disabled = true;

    try {
      const saved = root.WipService.saveWip({
        id: form.elements.wipId.value || null,
        nama_wip: form.elements.wipName.value,
        hasil_per_batch: form.elements.wipYield.value,
        satuan_hasil: form.elements.wipYieldUnit.value
      }, getRecipeRows());

      const persisted = await root.MasterDataStore.flush();
      if (persisted === false) {
        if (typeof root.closeSheet === 'function') root.closeSheet();
        renderPage('wips');
        return;
      }
      if (typeof root.closeSheet === 'function') root.closeSheet();
      notify('Resep WIP berhasil disimpan.');
      renderPage('wips');
    } catch (error) {
      notify(error.message || 'Resep WIP belum berhasil disimpan.');
    } finally {
      delete form.dataset.saving;
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function handleClick(event) {
    const option = event.target.closest('[data-wip-component-option]');
    if (option) {
      const row = option.closest('[data-wip-recipe-row]');
      const type = option.dataset.type === 'wip' ? 'wip' : 'material';
      row.querySelector('[data-wip-type]').value = type;
      row.querySelector('[data-wip-recipe-type]').textContent = type === 'wip' ? 'WIP' : 'Barang';
      const select = row.querySelector('[data-wip-component]');
      select.innerHTML = componentOptions(type, option.dataset.wipComponentOption, root.document.querySelector('[name="wipId"]')?.value);
      select.value = option.dataset.wipComponentOption;
      row.querySelector('[data-wip-component-search]').value = option.dataset.name || option.textContent;
      row.querySelector('[data-wip-component-options]').hidden = true;
      refreshRowUnits(row);
      return;
    }
    const button = event.target.closest('[data-wip-action]');
    if (!button) return;
    const action = button.dataset.wipAction;
    const id = button.dataset.wipId;

    if (action === 'show-breakdown') {
      const wip = root.WipService.findWip(id);
      if (wip) openWipBreakdown(wip);
      return;
    }
    if (action === 'add') openWipForm(null);
    if (action === 'edit') openWipForm(id);
    if (action === 'close' && typeof root.closeSheet === 'function') root.closeSheet();
    if (action === 'back') {
      if (typeof root.go === 'function') root.go('master-items');
    }
    if (action === 'add-row') {
      const host = root.document.getElementById('wipRecipeRows');
      if (host) host.insertAdjacentHTML('beforeend', recipeRowHtml(null, root.document.querySelector('[name="wipId"]')?.value));
    }
    if (action === 'remove-row') {
      const host = root.document.getElementById('wipRecipeRows');
      if (host && host.querySelectorAll('[data-wip-recipe-row]').length > 1) {
        button.closest('[data-wip-recipe-row]')?.remove();
      } else {
        notify('Resep WIP minimal harus memiliki satu komponen.');
      }
    }
    if (action === 'filter') {
      currentTab = button.dataset.filter === 'inactive' ? 'inactive' : 'active';
      renderPage('wips');
    }
    if (action === 'toggle-status') {
      const wip = root.WipService.findWip(id);
      if (!wip) return notify('WIP tidak ditemukan.');
      const next = wip.status === 'active' ? 'inactive' : 'active';
      if (!root.confirm((next === 'inactive' ? 'Nonaktifkan ' : 'Aktifkan kembali ') + wip.nama_wip + '?')) return;
      button.disabled = true;
      try {
        root.WipService.setWipStatus(id, next);
        const persisted = await root.MasterDataStore.flush();
        if (persisted === false) {
          renderPage('wips');
          return;
        }
        renderPage('wips');
        notify(next === 'inactive' ? 'WIP dinonaktifkan.' : 'WIP diaktifkan.');
      } catch (error) {
        notify(error.message);
      } finally {
        button.disabled = false;
      }
    }
    if (action === 'retry') renderPage('wips');
    if (action === 'nav') {
      if (typeof root.closeMenu === 'function') root.closeMenu();
      if (typeof root.go === 'function') root.go('wips');
    }
  }

  function handleInput(event) {
    if (event.target.matches('[data-wip-component-search]')) {
      const row = event.target.closest('[data-wip-recipe-row]');
      row.querySelector('[data-wip-component]').value = '';
      row.querySelector('[data-wip-unit]').value = '';
      row.querySelector('[data-wip-unit-display]').textContent = '—';
      renderComponentOptions(row, event.target.value);
      return;
    }
    if (event.target.id === 'wipSearch') {
      searchQuery = event.target.value;
      const cursor = event.target.selectionStart;
      renderPage('wips');
      const input = root.document.getElementById('wipSearch');
      if (input) {
        input.focus();
        input.setSelectionRange(cursor, cursor);
      }
    }
  }

  function handleChange(event) {
    const target = event.target;
    if (target.matches('[data-wip-component]')) {
      const row = target.closest('[data-wip-recipe-row]');
      if (!row) return;
      refreshRowUnits(row);
    }
  }

  function init() {
    root.document.addEventListener('click', handleClick);
    root.document.addEventListener('submit', handleSubmit);
    root.document.addEventListener('input', handleInput);
    root.document.addEventListener('change', handleChange);
  }

  root.WipUI = { init: init, renderPage: renderPage };

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window);
