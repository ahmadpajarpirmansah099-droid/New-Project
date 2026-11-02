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

  function unitOptions(type, selectedId, selectedUnit) {
    let units = [];
    if (type === 'wip') {
      const wip = root.WipService.findWip(selectedId);
      if (wip) units = [wip.satuan_hasil];
    } else {
      const item = root.MasterDataService.findItem(selectedId);
      if (item) units = (item.konversi_satuan || []).map(function (row) { return row.unit; });
    }

    if (!units.length) return '<option value="">Satuan</option>';
    return units.map(function (unit) {
      return '<option value="' + escapeHtml(unit) + '" ' + (String(unit).toLocaleUpperCase('id-ID') === String(selectedUnit || '').toLocaleUpperCase('id-ID') ? 'selected' : '') + '>' +
        escapeHtml(unit) + '</option>';
    }).join('');
  }

  function recipeRowHtml(line, excludeId) {
    const type = line && line.component_type === 'wip' ? 'wip' : 'material';
    const selectedId = type === 'wip' ? line && line.component_wip_id : line && line.item_id;
    const unit = line && line.unit_input || '';
    return '<div class="wip-recipe-row" data-wip-recipe-row>' +
      '<div class="wip-row-top"><label class="wip-field"><span>Jenis komponen</span><select data-wip-type><option value="material" ' + (type === 'material' ? 'selected' : '') + '>Master Barang</option><option value="wip" ' + (type === 'wip' ? 'selected' : '') + '>WIP lain</option></select></label>' +
      '<button type="button" class="wip-remove-row" data-wip-action="remove-row" aria-label="Hapus komponen">×</button></div>' +
      '<label class="wip-field"><span>Komponen</span><select data-wip-component>' + componentOptions(type, selectedId, excludeId) + '</select></label>' +
      '<div class="wip-row-bottom"><label class="wip-field"><span>Jumlah</span><input data-wip-qty type="number" min="0.000001" step="any" inputmode="decimal" placeholder="1" value="' + escapeHtml(line && line.qty_input != null ? line.qty_input : '') + '"></label>' +
      '<label class="wip-field"><span>Satuan</span><select data-wip-unit>' + unitOptions(type, selectedId, unit) + '</select></label></div></div>';
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
    });
  }

  function refreshRowUnits(row) {
    const type = row.querySelector('[data-wip-type]').value;
    const componentId = row.querySelector('[data-wip-component]').value;
    const unit = row.querySelector('[data-wip-unit]');
    if (unit) unit.innerHTML = unitOptions(type, componentId, '');
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
      '<label class="wip-field"><span>Nama WIP <i>*</i></span><input name="wipName" type="text" maxlength="120" required placeholder="Contoh: Simple Syrup" value="' + escapeHtml(existing ? existing.nama_wip : '') + '"></label>' +
      '<div class="wip-form-grid"><label class="wip-field"><span>Hasil per batch <i>*</i></span><input name="wipYield" type="number" min="0.000001" step="any" inputmode="decimal" required placeholder="1000" value="' + escapeHtml(existing ? existing.hasil_per_batch : '') + '"></label>' +
      '<label class="wip-field"><span>Satuan hasil <i>*</i></span><input name="wipYieldUnit" type="text" maxlength="20" required placeholder="ML / GR / PCS" value="' + escapeHtml(existing ? existing.satuan_hasil : '') + '"></label></div>' +
      '<section class="wip-recipe-section"><div class="wip-recipe-heading"><div><b>Komposisi resep</b><small>Campurkan Master Barang dan WIP lain jika diperlukan.</small></div><button type="button" class="wip-add-row" data-wip-action="add-row">+ Komponen</button></div>' +
      '<div id="wipRecipeRows">' + (lines.length ? lines.map(function (line) { return recipeRowHtml(line, id); }).join('') : recipeRowHtml(null, id)) + '</div></section>' +
      '<div class="wip-form-note">HPP dihitung dari biaya seluruh komponen dibagi hasil per batch. Harga referensi akan ditandai sebagai estimasi.</div>' +
      '<div class="wip-sheet-actions"><button type="button" class="wip-cancel" data-wip-action="close">Batal</button><button type="submit" class="wip-save">Simpan resep</button></div>' +
      '</form></div>';

    if (typeof root.openSheet !== 'function') return notify('Komponen popup belum tersedia.');
    root.openSheet(html);
  }

  function cardHtml(wip) {
    const hpp = root.WipService.calculateHpp(wip.id);
    const statusLabel = wip.status === 'active' ? 'Aktif' : 'Nonaktif';
    const hppLabel = hpp.valid
      ? money(hpp.hpp_per_yield) + ' / ' + escapeHtml(hpp.yield_unit) + (hpp.is_estimated ? ' · Estimasi' : '')
      : 'Belum valid';
    const hppReason = hpp.valid ? '' : '<p class="wip-invalid-reason">' + escapeHtml(hpp.reason) + '</p>';

    return '<article class="wip-card"><div class="wip-card-heading"><div><h3>' + escapeHtml(wip.nama_wip) +
      '</h3><span class="wip-status ' + (wip.status === 'active' ? 'is-active' : 'is-inactive') + '">' + statusLabel + '</span></div>' +
      '<button type="button" class="wip-edit" data-wip-action="edit" data-wip-id="' + escapeHtml(wip.id) + '">Edit</button></div>' +
      '<div class="wip-card-yield">Hasil batch <b>' + number(wip.hasil_per_batch) + ' ' + escapeHtml(wip.satuan_hasil) + '</b></div>' +
      '<div class="wip-hpp"><small>HPP per satuan hasil</small><strong class="' + (hpp.valid ? '' : 'is-invalid') + '">' + hppLabel + '</strong>' + hppReason + '</div>' +
      '<div class="wip-card-footer"><span>' + (hpp.valid ? 'Biaya batch ' + money(hpp.batch_cost) : 'Periksa komponen resep') + '</span>' +
      '<button type="button" data-wip-action="toggle-status" data-wip-id="' + escapeHtml(wip.id) + '">' +
      (wip.status === 'active' ? 'Nonaktifkan' : 'Aktifkan') + '</button></div></article>';
  }

  function renderPage(page) {
    if (page && page !== 'wips') return;
    const host = getRoot();
    if (!host) return;

    try {
      const counts = root.WipService.getCounts();
      const items = root.WipService.listWips({ status: currentTab, query: searchQuery });
      host.innerHTML = '<div class="wip-page">' +
        '<button type="button" class="page-back" data-wip-action="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/><path d="M9 12h12"/></svg><span>Guest Operational</span></button>' +
        '<div class="wip-page-heading"><div><span class="wip-eyebrow">PENGELOLAAN RESEP</span><h1>Resep WIP</h1><p>Susun komposisi bahan dan hitung HPP per satuan hasil.</p></div>' +
        '<button class="wip-primary" type="button" data-wip-action="add">+ Tambah WIP</button></div>' +
        '<div class="wip-count-grid"><div><span>Total WIP</span><b>' + counts.total + '</b></div><div><span>Aktif</span><b>' + counts.active + '</b></div><div><span>Nonaktif</span><b>' + counts.inactive + '</b></div></div>' +
        '<label class="wip-search"><span>⌕</span><input id="wipSearch" type="search" placeholder="Cari nama WIP..." value="' + escapeHtml(searchQuery) + '"></label>' +
        '<div class="wip-filter-row"><button type="button" class="' + (currentTab === 'active' ? 'is-selected' : '') + '" data-wip-action="filter" data-filter="active">Aktif</button>' +
        '<button type="button" class="' + (currentTab === 'inactive' ? 'is-selected' : '') + '" data-wip-action="filter" data-filter="inactive">Nonaktif</button></div>' +
        '<div class="wip-list-heading"><h2>' + (currentTab === 'active' ? 'WIP aktif' : 'WIP nonaktif') + '</h2><span>' + items.length + ' resep</span></div>' +
        '<div class="wip-list">' + (items.length ? items.map(cardHtml).join('') :
          '<div class="wip-empty"><b>' + (searchQuery ? 'WIP tidak ditemukan' : 'Belum ada resep WIP') + '</b><p>' +
          (searchQuery ? 'Coba kata pencarian lain.' : 'Tambahkan resep WIP pertama untuk mulai menghitung HPP.') + '</p></div>') + '</div></div>';
    } catch (error) {
      host.innerHTML = '<div class="wip-page"><div class="wip-empty"><b>Resep WIP belum dapat dibuka</b><p>' +
        escapeHtml(error.message) + '</p><button type="button" data-wip-action="retry">Coba lagi</button></div></div>';
    }
  }

  function handleSubmit(event) {
    if (event.target.id !== 'wipForm') return;
    event.preventDefault();
    const form = event.target;

    try {
      const saved = root.WipService.saveWip({
        id: form.elements.wipId.value || null,
        nama_wip: form.elements.wipName.value,
        hasil_per_batch: form.elements.wipYield.value,
        satuan_hasil: form.elements.wipYieldUnit.value
      }, getRecipeRows());

      if (typeof root.closeSheet === 'function') root.closeSheet();
      notify('Resep WIP berhasil disimpan.');
      renderPage('wips');
    } catch (error) {
      notify(error.message || 'Resep WIP belum berhasil disimpan.');
    }
  }

  function handleClick(event) {
    const button = event.target.closest('[data-wip-action]');
    if (!button) return;
    const action = button.dataset.wipAction;
    const id = button.dataset.wipId;

    if (action === 'add') openWipForm(null);
    if (action === 'edit') openWipForm(id);
    if (action === 'close' && typeof root.closeSheet === 'function') root.closeSheet();
    if (action === 'back') {
      if (typeof root.returnToGuestOperational === 'function') root.returnToGuestOperational();
      else if (typeof root.go === 'function') root.go('dashboard');
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
      try {
        root.WipService.setWipStatus(id, next);
        renderPage('wips');
        notify(next === 'inactive' ? 'WIP dinonaktifkan.' : 'WIP diaktifkan.');
      } catch (error) {
        notify(error.message);
      }
    }
    if (action === 'retry') renderPage('wips');
    if (action === 'nav') {
      if (typeof root.closeMenu === 'function') root.closeMenu();
      if (typeof root.go === 'function') root.go('wips');
    }
  }

  function handleInput(event) {
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
    if (target.matches('[data-wip-type], [data-wip-component]')) {
      const row = target.closest('[data-wip-recipe-row]');
      if (!row) return;
      if (target.matches('[data-wip-type]')) {
        const component = row.querySelector('[data-wip-component]');
        component.innerHTML = componentOptions(target.value, '', root.document.querySelector('[name="wipId"]')?.value);
      }
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
