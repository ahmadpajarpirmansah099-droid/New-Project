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
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(value) || 0);
  }
  function money(value) {
    return 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(value) || 0);
  }
  function notify(message) {
    if (typeof root.toast === 'function') root.toast(message);
  }
  function getRoot() { return root.document.getElementById('menuDataRoot'); }
  function materials() { return root.MasterDataService.listItems({ status: 'active' }); }
  function wips() { return root.WipService.listWips({ status: 'active' }); }

  function componentOptions(type, selectedId) {
    const entries = type === 'wip' ? wips() : materials();
    return '<option value="">Pilih ' + (type === 'wip' ? 'WIP' : 'bahan') + '</option>' +
      entries.map(function (entry) {
        const name = type === 'wip' ? entry.nama_wip : entry.nama_barang;
        return '<option value="' + escapeHtml(entry.id) + '" ' +
          (String(entry.id) === String(selectedId || '') ? 'selected' : '') + '>' + escapeHtml(name) + '</option>';
      }).join('');
  }

function findComponent(type, id) {
    if (!id) return null;
    const entries = type === 'wip' ? wips() : materials();
    return entries.find(function (entry) { return String(entry.id) === String(id); }) || null;
  }

  function componentSearchOptions(type, query, excludeId) {
    const entries = type === 'wip' ? getAvailableWips(excludeId) : materials();
    const q = String(query || '').trim().toLocaleLowerCase('id-ID');
    const filtered = entries.filter(function (entry) {
      return String(type === 'wip' ? entry.nama_wip : entry.nama_barang).toLocaleLowerCase('id-ID').includes(q);
    });
    return filtered.map(function (entry) {
      const name = type === 'wip' ? entry.nama_wip : entry.nama_barang;
      return '<button type="button" class="menu-component-option" data-menu-component-option="' + escapeHtml(entry.id) + '" data-name="' + escapeHtml(name) + '">' + escapeHtml(name) + '</button>';
    }).join('') || '<div class="menu-component-empty">Tidak ditemukan</div>';
  }

  function renderComponentOptions(row, query) {
    const type = row.querySelector('[data-menu-type]').value;
    const dropdown = row.querySelector('[data-menu-component-options]');
    if (!dropdown) return;
    dropdown.innerHTML = componentSearchOptions(type, query, '');
    dropdown.hidden = !String(query || '').trim();
  }

  function unitOptions(type, selectedId, selectedUnit) {
    let baseUnit = '';
    if (type === 'wip') {
      const wip = root.WipService.findWip(selectedId);
      if (wip) baseUnit = wip.satuan_hasil;
    } else {
      const item = root.MasterDataService.findItem(selectedId);
      if (item) baseUnit = item.satuan_dasar;
    }
    if (!baseUnit) return '<option value="">Pilih bahan dulu</option>';
    return '<option value="' + escapeHtml(baseUnit) + '" selected>' + escapeHtml(baseUnit) + '</option>';
  }
  function recipeRowHtml(line) {
    const type = line && line.component_type === 'wip' ? 'wip' : 'material';
    const selectedId = type === 'wip' ? line && line.component_wip_id : line && line.item_id;
    const selected = findComponent(type, selectedId);
    const selectedName = selected ? (type === 'wip' ? selected.nama_wip : selected.nama_barang) : '';
    return '<div class="menu-recipe-row" data-menu-recipe-row>' +
      '<div class="menu-row-top"><label class="menu-field menu-type-field"><select data-menu-type aria-label="Jenis komponen"><option value="material" ' + (type === 'material' ? 'selected' : '') + '>Master Barang</option><option value="wip" ' + (type === 'wip' ? 'selected' : '') + '>WIP</option></select></label>' +
      '<div class="menu-field menu-component-search"><input type="search" data-menu-component-search autocomplete="off" placeholder="Cari bahan..." value="' + escapeHtml(selectedName) + '" aria-label="Cari bahan"><select data-menu-component hidden>' + componentOptions(type, selectedId) + '</select><div class="menu-component-options" data-menu-component-options hidden></div></div></div>' +
      '<div class="menu-row-bottom"><label class="menu-field"><span>Jumlah per porsi</span><input data-menu-qty type="number" min="0.000001" step="any" inputmode="decimal" placeholder="1" value="' + escapeHtml(line && line.qty_input != null ? line.qty_input : '') + '"></label>' +
      '<label class="menu-field"><span>Satuan</span><select data-menu-unit>' + unitOptions(type, selectedId, line && line.unit_input || '') + '</select></label></div>' +
      '<button type="button" class="menu-remove-row" data-menu-action="remove-row" aria-label="Hapus komponen">×</button></div>';
  }
  function getRecipeRows() {
    return Array.from(root.document.querySelectorAll('[data-menu-recipe-row]')).map(function (row) {
      const type = row.querySelector('[data-menu-type]').value;
      const componentId = row.querySelector('[data-menu-component]').value;
      return {
        component_type: type,
        item_id: type === 'material' ? componentId : null,
        component_wip_id: type === 'wip' ? componentId : null,
        qty_input: row.querySelector('[data-menu-qty]').value,
        unit_input: row.querySelector('[data-menu-unit]').value
      };
    });
  }

  function refreshRowUnits(row) {
    const type = row.querySelector('[data-menu-type]').value;
    const id = row.querySelector('[data-menu-component]').value;
    row.querySelector('[data-menu-unit]').innerHTML = unitOptions(type, id, '');
  }

  function openMenuForm(id) {
    const existing = id ? root.MenuService.findMenu(id) : null;
    if (id && !existing) return notify('Menu tidak ditemukan. Muat ulang daftar.');
    const lines = existing ? root.MenuService.getLines(id) : [];
    const html = '<div class="menu-sheet"><div class="menu-sheet-heading"><div><span class="menu-eyebrow">COGS MENU</span><h2>' +
      (existing ? 'Edit menu' : 'Tambah menu') + '</h2></div><button type="button" class="menu-close" data-menu-action="close" aria-label="Tutup">×</button></div>' +
      '<form id="menuForm" novalidate><input type="hidden" name="menuId" value="' + escapeHtml(existing ? existing.id : '') + '">' +
      '<label class="menu-field"><span>Nama menu <i>*</i></span><input name="menuName" type="text" maxlength="120" required placeholder="Contoh: Iced Latte" value="' + escapeHtml(existing ? existing.nama_menu : '') + '"></label>' +
      '<label class="menu-field"><span>Harga jual per porsi <i>*</i></span><input name="menuSellingPrice" type="number" min="0" step="any" inputmode="decimal" required placeholder="28000" value="' + escapeHtml(existing ? existing.harga_jual : '') + '"></label>' +
      '<section class="menu-recipe-section"><div class="menu-recipe-heading"><div><b>Komposisi per porsi</b><small>Gunakan bahan langsung atau WIP yang sudah dibuat.</small></div><button type="button" class="menu-add-row" data-menu-action="add-row">+ Komponen</button></div>' +
      '<div id="menuRecipeRows">' + (lines.length ? lines.map(recipeRowHtml).join('') : recipeRowHtml(null)) + '</div></section>' +
      '<p class="menu-form-note">HPP menu adalah total biaya seluruh komponen dalam satu porsi. Margin dihitung dari harga jual dibanding HPP.</p>' +
      '<div class="menu-sheet-actions"><button type="button" class="menu-cancel" data-menu-action="close">Batal</button><button type="submit" class="menu-save">Simpan menu</button></div></form></div>';
    if (typeof root.openSheet !== 'function') return notify('Komponen popup belum tersedia.');
    root.openSheet(html);
  }

  function cardHtml(menu) {
    const hpp = root.MenuService.calculateHpp(menu.id);
    const status = menu.status === 'active' ? 'Aktif' : 'Nonaktif';
    const hppText = hpp.valid
      ? money(hpp.hpp_per_serving) + (hpp.is_estimated ? ' · Estimasi' : '')
      : 'Belum valid';
    const marginText = hpp.valid
      ? number(hpp.margin_pct) + '% · ' + money(hpp.margin_amount)
      : '—';
    return '<article class="menu-card">' +
      '<div class="menu-card-heading">' +
        '<div class="menu-card-copy">' +
          '<div class="menu-card-title-row"><h3>' + escapeHtml(menu.nama_menu) + '</h3>' +
          '<span class="menu-status ' + (menu.status === 'active' ? 'is-active' : 'is-inactive') + '">' + status + '</span></div>' +
          '<span class="menu-card-base">Harga per porsi</span>' +
        '</div>' +
        '<div class="menu-card-prices">' +
          '<div><small>Harga jual</small><b>' + money(menu.harga_jual) + '</b></div>' +
          '<div><small>HPP per porsi</small><b class="' + (hpp.valid ? '' : 'is-invalid') + '">' + hppText + '</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="menu-margin"><span>Margin</span><b>' + marginText + '</b></div>' +
      (hpp.valid ? '' : '<p class="menu-invalid-reason">' + escapeHtml(hpp.reason) + '</p>') +
      '<div class="menu-card-footer"><span>' + (hpp.valid ? (hpp.is_estimated ? 'Perhitungan menggunakan harga referensi' : 'Perhitungan valid') : 'Periksa harga dan komposisi') + '</span>' +
      '<div class="menu-card-actions">' +
        '<button type="button" class="menu-edit" data-menu-action="edit" data-menu-id="' + escapeHtml(menu.id) + '">Edit</button>' +
        '<button type="button" class="menu-status-action" data-menu-action="toggle-status" data-menu-id="' + escapeHtml(menu.id) + '">' +
        (menu.status === 'active' ? 'Nonaktifkan' : 'Aktifkan') + '</button>' +
      '</div></div></article>';
  }

  function renderPage(page) {
    if (page && page !== 'menus') return;
    const host = getRoot();
    if (!host) return;
    try {
      const counts = root.MenuService.getCounts();
      const items = root.MenuService.listMenus({ status: currentTab, query: searchQuery });
      host.innerHTML = '<div class="menu-page"><button type="button" class="page-back" data-menu-action="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/><path d="M9 12h12"/></svg><span>Master Barang</span></button>' +
        '<div class="menu-page-heading"><div><span class="menu-eyebrow">COST OF GOODS SOLD</span><h1>Menu</h1><p>Susun komposisi per porsi, hitung HPP, dan lihat margin.</p></div>' +
        '<button class="menu-primary" type="button" data-menu-action="add">+ Tambah menu</button></div>' +
        '<div class="menu-count-grid"><div><span>Total menu</span><b>' + counts.total + '</b></div><div><span>Aktif</span><b>' + counts.active + '</b></div><div><span>Nonaktif</span><b>' + counts.inactive + '</b></div></div>' +
        '<label class="menu-search"><span>⌕</span><input id="menuSearch" type="search" placeholder="Cari nama menu..." value="' + escapeHtml(searchQuery) + '"></label>' +
        '<div class="menu-filter-row"><button type="button" class="' + (currentTab === 'active' ? 'is-selected' : '') + '" data-menu-action="filter" data-filter="active">Aktif</button>' +
        '<button type="button" class="' + (currentTab === 'inactive' ? 'is-selected' : '') + '" data-menu-action="filter" data-filter="inactive">Nonaktif</button></div>' +
        '<div class="menu-list-heading"><h2>' + (currentTab === 'active' ? 'Menu aktif' : 'Menu nonaktif') + '</h2><span>' + items.length + ' menu</span></div>' +
        '<div class="menu-list">' + (items.length ? items.map(cardHtml).join('') : '<div class="menu-empty"><b>' +
          (searchQuery ? 'Menu tidak ditemukan' : 'Belum ada menu') + '</b><p>' +
          (searchQuery ? 'Coba kata pencarian lain.' : 'Tambahkan menu pertama untuk mulai menghitung HPP per porsi.') + '</p></div>') + '</div></div>';
    } catch (error) {
      host.innerHTML = '<div class="menu-page"><div class="menu-empty"><b>Menu belum dapat dibuka</b><p>' +
        escapeHtml(error.message) + '</p><button type="button" data-menu-action="retry">Coba lagi</button></div></div>';
    }
  }

  function handleSubmit(event) {
    if (event.target.id !== 'menuForm') return;
    event.preventDefault();
    const form = event.target;
    try {
      root.MenuService.saveMenu({
        id: form.elements.menuId.value || null,
        nama_menu: form.elements.menuName.value,
        harga_jual: form.elements.menuSellingPrice.value
      }, getRecipeRows());
      if (typeof root.closeSheet === 'function') root.closeSheet();
      notify('Menu berhasil disimpan.');
      renderPage('menus');
    } catch (error) {
      notify(error.message || 'Menu belum berhasil disimpan.');
    }
  }

  function handleClick(event) {
    const option = event.target.closest('[data-menu-component-option]');
    if (option) {
      const row = option.closest('[data-menu-recipe-row]');
      const select = row && row.querySelector('[data-menu-component]');
      const search = row && row.querySelector('[data-menu-component-search]');
      if (select && search) {
        select.value = option.dataset.menuComponentOption;
        search.value = option.dataset.name || option.textContent;
        row.querySelector('[data-menu-component-options]').hidden = true;
        refreshRowUnits(row);
      }
      return;
    }
    const button = event.target.closest('[data-menu-action]');
    if (!button) return;
    const action = button.dataset.menuAction;
    const id = button.dataset.menuId;
    if (action === 'add') openMenuForm(null);
    if (action === 'edit') openMenuForm(id);
    if (action === 'close' && typeof root.closeSheet === 'function') root.closeSheet();
    if (action === 'back') {
      if (typeof root.go === 'function') root.go('master-items');
    }
    if (action === 'add-row') {
      const host = root.document.getElementById('menuRecipeRows');
      if (host) host.insertAdjacentHTML('beforeend', recipeRowHtml(null));
    }
    if (action === 'remove-row') {
      const host = root.document.getElementById('menuRecipeRows');
      if (host && host.querySelectorAll('[data-menu-recipe-row]').length > 1) button.closest('[data-menu-recipe-row]')?.remove();
      else notify('Komposisi menu minimal harus memiliki satu komponen.');
    }
    if (action === 'filter') {
      currentTab = button.dataset.filter === 'inactive' ? 'inactive' : 'active';
      renderPage('menus');
    }
    if (action === 'toggle-status') {
      const menu = root.MenuService.findMenu(id);
      if (!menu) return notify('Menu tidak ditemukan.');
      const next = menu.status === 'active' ? 'inactive' : 'active';
      if (!root.confirm((next === 'inactive' ? 'Nonaktifkan ' : 'Aktifkan kembali ') + menu.nama_menu + '?')) return;
      try {
        root.MenuService.setMenuStatus(id, next);
        renderPage('menus');
        notify(next === 'inactive' ? 'Menu dinonaktifkan.' : 'Menu diaktifkan.');
      } catch (error) { notify(error.message); }
    }
    if (action === 'retry') renderPage('menus');
    if (action === 'nav') {
      if (typeof root.closeMenu === 'function') root.closeMenu();
      if (typeof root.go === 'function') root.go('menus');
    }
  }

  function handleInput(event) {
    if (event.target.matches('[data-menu-component-search]')) {
      const row = event.target.closest('[data-menu-recipe-row]');
      if (row) {
        row.querySelector('[data-menu-component]').value = '';
        row.querySelector('[data-menu-unit]').innerHTML = unitOptions(row.querySelector('[data-menu-type]').value, '', '');
        renderComponentOptions(row, event.target.value);
      }
      return;
    }
    if (event.target.id === 'menuSearch') {
      searchQuery = event.target.value;
      const cursor = event.target.selectionStart;
      renderPage('menus');
      const input = root.document.getElementById('menuSearch');
      if (input) { input.focus(); input.setSelectionRange(cursor, cursor); }
    }
  }

  function handleChange(event) {
    const target = event.target;
    if (target.matches('[data-menu-type], [data-menu-component]')) {
      const row = target.closest('[data-menu-recipe-row]');
      if (!row) return;
      if (target.matches('[data-menu-type]')) {
        row.querySelector('[data-menu-component]').innerHTML = componentOptions(target.value, '');
        row.querySelector('[data-menu-component-search]').value = '';
        row.querySelector('[data-menu-component-options]').hidden = true;
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

  root.MenuUI = { init: init, renderPage: renderPage };
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
