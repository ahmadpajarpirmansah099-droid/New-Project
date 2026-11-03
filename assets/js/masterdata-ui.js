(function (root) {
  'use strict';

  const service = function () { return root.MasterDataService; };
  let currentTab = 'active';
  let searchQuery = '';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function formatNumber(value, digits) {
    return new Intl.NumberFormat('id-ID', {
      maximumFractionDigits: Number.isInteger(digits) ? digits : 4
    }).format(Number(value) || 0);
  }

  function formatMoney(value) {
    return 'Rp ' + new Intl.NumberFormat('id-ID', {
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function notify(message) {
    if (typeof root.toast === 'function') root.toast(message);
  }

  function getRoot() {
    return root.document.getElementById('masterDataRoot');
  }

  function getConversionRows() {
    return Array.from(root.document.querySelectorAll('[data-md-conversion-row]')).map(function (row) {
      return {
        unit: row.querySelector('[data-md-unit]')?.value.trim() || '',
        factor: row.querySelector('[data-md-factor]')?.value || ''
      };
    }).filter(function (row) {
      return row.unit !== '';
    });
  }

  function getFormInput() {
    const form = root.document.getElementById('mdItemForm');
    if (!form) return null;

    return {
      id: form.elements.mdItemId.value || null,
      nama_barang: form.elements.mdItemName.value,
      satuan_dasar: form.elements.mdBaseUnit.value,
      konversi_satuan: getConversionRows(),
      harga_referensi: form.elements.mdReferencePrice.value,
      satuan_harga: form.elements.mdPriceUnit.value,
      status: form.elements.mdStatus.value,
      is_supply: form.elements.mdIsSupply.checked
    };
  }

  function conversionRowHtml(row) {
    const unit = row && row.unit ? row.unit : '';
    const factor = row && row.factor != null ? row.factor : '';
    return '<div class="md-conversion-row" data-md-conversion-row>' +
      '<label class="md-field"><span>Satuan</span><input data-md-unit type="text" maxlength="20" placeholder="Contoh: KG" value="' + escapeHtml(unit) + '"></label>' +
      '<label class="md-field"><span>Faktor ke satuan dasar</span><input data-md-factor type="number" min="0.000001" step="any" inputmode="decimal" placeholder="1000" value="' + escapeHtml(factor) + '"></label>' +
      '<button class="md-remove-unit" type="button" data-md-action="remove-unit" aria-label="Hapus satuan">×</button>' +
      '</div>';
  }

  function refreshPriceUnitOptions(selected) {
    const select = root.document.getElementById('mdPriceUnit');
    const baseInput = root.document.getElementById('mdBaseUnit');
    if (!select || !baseInput) return;

    const units = [];
    const base = baseInput.value.trim().toLocaleUpperCase('id-ID');
    if (base) units.push(base);

    getConversionRows().forEach(function (row) {
      const unit = row.unit.toLocaleUpperCase('id-ID');
      if (unit && !units.includes(unit)) units.push(unit);
    });

    const previous = selected || select.value;
    select.innerHTML = units.map(function (unit) {
      return '<option value="' + escapeHtml(unit) + '">' + escapeHtml(unit) + '</option>';
    }).join('');

    if (units.includes(String(previous).toLocaleUpperCase('id-ID'))) {
      select.value = String(previous).toLocaleUpperCase('id-ID');
    }
  }

  function renderPreview() {
    const preview = root.document.getElementById('mdPricePreview');
    const list = root.document.getElementById('mdConversionPreview');
    const form = root.document.getElementById('mdItemForm');
    if (!preview || !list || !form) return;

    const input = getFormInput();
    try {
      const conversions = service().normalizeConversions(input.satuan_dasar, input.konversi_satuan);
      list.innerHTML = conversions.map(function (row) {
        return '<div class="md-conversion-preview-row"><span>1 ' + escapeHtml(row.unit) +
          '</span><b>' + formatNumber(row.factor, 6) + ' ' + escapeHtml(input.satuan_dasar.toLocaleUpperCase('id-ID')) + '</b></div>';
      }).join('');

      const result = service().previewPrice(input);
      if (!result.valid) {
        preview.textContent = result.reason;
        preview.classList.add('is-muted');
        return;
      }

      preview.textContent = formatMoney(result.value) + ' / ' + result.baseUnit;
      preview.classList.remove('is-muted');
    } catch (error) {
      preview.textContent = error.message;
      preview.classList.add('is-muted');
      list.innerHTML = '';
    }
  }

  function openItemForm(id) {
    const existing = id ? service().findItem(id) : null;
    if (id && !existing) {
      notify('Barang tidak ditemukan. Muat ulang daftar.');
      return;
    }

    const conversions = existing
      ? existing.konversi_satuan.filter(function (row) {
          return String(row.unit).toLocaleUpperCase('id-ID') !== String(existing.satuan_dasar).toLocaleUpperCase('id-ID');
        })
      : [];

    const html = '<div class="md-sheet">' +
      '<div class="md-sheet-heading"><div><span class="md-eyebrow">MASTER BARANG</span><h2>' +
      (existing ? 'Edit barang' : 'Tambah barang') + '</h2></div>' +
      '<button type="button" class="md-close" data-md-action="close-sheet" aria-label="Tutup">×</button></div>' +
      '<form id="mdItemForm" novalidate>' +
        '<input id="mdItemId" type="hidden" name="mdItemId" value="' + escapeHtml(existing ? existing.id : '') + '">' +
        '<label class="md-field"><span>Nama barang <i>*</i></span><input id="mdItemName" name="mdItemName" type="text" maxlength="120" required placeholder="Contoh: Freshmilk" value="' + escapeHtml(existing ? existing.nama_barang : '') + '"></label>' +
        '<div class="md-form-grid">' +
          '<label class="md-field"><span>Satuan dasar <i>*</i></span><input id="mdBaseUnit" name="mdBaseUnit" type="text" maxlength="20" required placeholder="GR / ML / PCS" value="' + escapeHtml(existing ? existing.satuan_dasar : '') + '"></label>' +
          '<label class="md-field"><span>Status</span><select id="mdStatus" name="mdStatus"><option value="active" ' + (!existing || existing.status === 'active' ? 'selected' : '') + '>Aktif</option><option value="inactive" ' + (existing && existing.status === 'inactive' ? 'selected' : '') + '>Nonaktif</option></select></label>' +
        '</div>' +
        '<section class="md-form-section"><div class="md-section-heading"><div><b>Konversi satuan</b><small>Satuan dasar otomatis memiliki faktor 1.</small></div><button type="button" class="md-add-unit" data-md-action="add-unit">+ Satuan</button></div>' +
          '<div class="md-base-unit-row"><span>Satuan dasar</span><b id="mdBaseUnitPreview">' + escapeHtml(existing ? existing.satuan_dasar : '—') + '</b><strong>1</strong></div>' +
          '<div id="mdConversionRows" class="md-conversion-rows">' + conversions.map(conversionRowHtml).join('') + '</div>' +
          '<div id="mdConversionPreview" class="md-conversion-preview"></div>' +
        '</section>' +
        '<label class="md-supply-toggle"><input id="mdIsSupply" name="mdIsSupply" type="checkbox" ' + (existing && existing.is_supply ? 'checked' : '') + '><span><b>Barang supply</b><small>Tandai jika barang termasuk kategori supply.</small></span></label>' +
        '<section class="md-form-section"><b>Harga referensi</b><div class="md-form-grid">' +
          '<label class="md-field"><span>Harga <i>*</i></span><input id="mdReferencePrice" name="mdReferencePrice" type="number" min="0" step="any" inputmode="decimal" required placeholder="295000" value="' + escapeHtml(existing ? existing.harga_referensi : '') + '"></label>' +
          '<label class="md-field"><span>Satuan harga <i>*</i></span><select name="mdPriceUnit" id="mdPriceUnit"></select></label>' +
        '</div><div class="md-price-result"><span>Harga per satuan dasar</span><strong id="mdPricePreview">Lengkapi harga dan satuan terlebih dahulu.</strong></div></section>' +
        '<p class="md-form-note">Harga beli terakhir dikelola oleh transaksi pembelian pada tahap backend. Di tahap ini, harga referensi menjadi dasar estimasi HPP.</p>' +
        '<div class="md-sheet-actions"><button type="button" class="md-cancel" data-md-action="close-sheet">Batal</button><button type="submit" class="md-save">Simpan barang</button></div>' +
      '</form></div>';

    if (typeof root.openSheet !== 'function') {
      notify('Komponen popup belum tersedia.');
      return;
    }

    root.openSheet(html);
    refreshPriceUnitOptions(existing ? existing.satuan_harga : '');
    renderPreview();
    root.document.getElementById('mdBaseUnitPreview').textContent =
      root.document.getElementById('mdBaseUnit').value.trim().toLocaleUpperCase('id-ID') || '—';
  }

  function itemCardHtml(item) {
    const conversions = (item.konversi_satuan || []).map(function (row) {
      return '<span class="md-unit-chip">1 ' + escapeHtml(row.unit) + ' = ' +
        formatNumber(row.factor, 6) + ' ' + escapeHtml(item.satuan_dasar) + '</span>';
    }).join('');

    return '<article class="md-item-card">' +
      '<div class="md-item-heading"><div class="md-item-copy"><h3>' + escapeHtml(item.nama_barang) +
      '</h3><span class="md-status ' + (item.status === 'active' ? 'is-active' : 'is-inactive') + '">' +
      (item.status === 'active' ? 'Aktif' : 'Nonaktif') + '</span></div>' +
      '<button type="button" class="md-more" data-md-action="edit" data-item-id="' + escapeHtml(item.id) + '" aria-label="Edit ' + escapeHtml(item.nama_barang) + '">Edit</button></div>' +
      (item.is_supply ? '<span class="md-supply-chip">Supply</span>' : '') +
      '<div class="md-item-prices"><div><small>Harga referensi</small><b>' +
      formatMoney(item.harga_referensi) + ' / ' + escapeHtml(item.satuan_harga) + '</b></div>' +
      '<div><small>Harga per ' + escapeHtml(item.satuan_dasar) + '</small><b>' +
      formatMoney(item.harga_per_satuan_dasar) + '</b></div></div>' +
      '<div class="md-unit-list">' + conversions + '</div>' +
      '<div class="md-item-footer"><span>' + (item.status === 'active' ? 'Tersedia untuk resep baru' : 'Tidak tersedia untuk resep baru') + '</span>' +
      '<button type="button" class="md-status-action" data-md-action="toggle-status" data-item-id="' + escapeHtml(item.id) + '">' +
      (item.status === 'active' ? 'Nonaktifkan' : 'Aktifkan') + '</button></div></article>';
  }

  function renderPage(page) {
    if (page && page !== 'master-items') return;
    const host = getRoot();
    if (!host) return;

    try {
      const counts = service().getCounts();
      const items = service().listItems({ status: currentTab, query: searchQuery });
      host.innerHTML = '<div class="md-page">' +
        '<button type="button" class="page-back" data-md-action="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/><path d="M9 12h12"/></svg><span>Guest Operational</span></button>' +
        '<div class="md-page-heading"><div><span class="md-eyebrow">PENGELOLAAN DATA</span><h1>Master Barang</h1><p>Daftar bahan utama untuk seluruh resep WIP dan Menu.</p></div>' +
        '<button type="button" class="md-primary" data-md-action="add">+ Tambah barang</button></div>' +
        '<div class="md-count-grid"><div><span>Total barang</span><b>' + counts.total + '</b></div><div><span>Aktif</span><b>' + counts.active + '</b></div><div><span>Nonaktif</span><b>' + counts.inactive + '</b></div></div>' +
        '<label class="md-search"><span aria-hidden="true">⌕</span><input id="mdSearch" type="search" placeholder="Cari nama barang..." value="' + escapeHtml(searchQuery) + '"></label>' +
        '<div class="md-filter-row"><button type="button" class="' + (currentTab === 'active' ? 'is-selected' : '') + '" data-md-action="filter" data-filter="active">Aktif</button>' +
        '<button type="button" class="' + (currentTab === 'inactive' ? 'is-selected' : '') + '" data-md-action="filter" data-filter="inactive">Nonaktif</button></div>' +
        '<div class="md-list-heading"><h2>' + (currentTab === 'active' ? 'Barang aktif' : 'Barang nonaktif') + '</h2><span>' + items.length + ' barang</span></div>' +
        '<div class="md-item-list">' + (items.length
          ? items.map(itemCardHtml).join('')
          : '<div class="md-empty"><div class="md-empty-mark">□</div><b>' + (searchQuery ? 'Barang tidak ditemukan' : 'Belum ada barang') + '</b><p>' + (searchQuery ? 'Coba kata pencarian yang lain.' : 'Tambahkan Master Barang pertama untuk mulai menyusun resep.') + '</p></div>') +
        '</div></div>';
    } catch (error) {
      host.innerHTML = '<div class="md-page"><div class="md-error"><b>Master Barang belum dapat dibuka</b><p>' +
        escapeHtml(error.message) + '</p><button type="button" class="md-primary" data-md-action="retry">Coba lagi</button></div></div>';
    }
  }

  function handleSubmit(event) {
    if (event.target.id !== 'mdItemForm') return;
    event.preventDefault();

    try {
      const input = getFormInput();
      const saved = service().saveItem(input, function (change) {
        const detail = change.linkedCount
          ? '\n\nBarang ini sudah dipakai oleh ' + change.linkedCount + ' baris resep WIP/Menu. Sistem akan memperbarui jumlah dasar dari satuan yang sama.'
          : '\n\nTidak ditemukan baris resep yang menggunakan barang ini.';
        return root.confirm(
          'Struktur satuan barang akan berubah.' + detail +
          '\n\nPastikan perubahan faktor sesuai dengan definisi satuan yang benar. Lanjutkan?'
        );
      });

      if (!saved) return;
      if (typeof root.closeSheet === 'function') root.closeSheet();
      notify('Master Barang berhasil disimpan.');
      renderPage('master-items');
    } catch (error) {
      notify(error.message || 'Barang belum berhasil disimpan.');
    }
  }

  function handleClick(event) {
    const button = event.target.closest('[data-md-action]');
    if (!button) return;

    const action = button.dataset.mdAction;
    const id = button.dataset.itemId;

    if (action === 'add') openItemForm(null);
    if (action === 'edit') openItemForm(id);
    if (action === 'close-sheet') {
      if (typeof root.closeSheet === 'function') root.closeSheet();
    }
    if (action === 'back') {
      if (typeof root.returnToGuestOperational === 'function') root.returnToGuestOperational();
      else if (typeof root.go === 'function') root.go('dashboard');
    }
    if (action === 'filter') {
      currentTab = button.dataset.filter === 'inactive' ? 'inactive' : 'active';
      renderPage('master-items');
    }
    if (action === 'add-unit') {
      const rows = root.document.getElementById('mdConversionRows');
      if (rows) {
        rows.insertAdjacentHTML('beforeend', conversionRowHtml(null));
        refreshPriceUnitOptions();
        renderPreview();
      }
    }
    if (action === 'remove-unit') {
      button.closest('[data-md-conversion-row]')?.remove();
      refreshPriceUnitOptions();
      renderPreview();
    }
    if (action === 'toggle-status') {
      const item = service().findItem(id);
      if (!item) return notify('Barang tidak ditemukan.');
      const next = item.status === service().ACTIVE ? service().INACTIVE : service().ACTIVE;
      if (!root.confirm((next === 'inactive' ? 'Nonaktifkan ' : 'Aktifkan kembali ') + item.nama_barang + '?')) return;
      try {
        service().setItemStatus(id, next);
        renderPage('master-items');
        notify(next === 'inactive' ? 'Barang dinonaktifkan.' : 'Barang diaktifkan.');
      } catch (error) {
        notify(error.message);
      }
    }
    if (action === 'retry') renderPage('master-items');
    if (action === 'nav') {
      if (typeof root.closeMenu === 'function') root.closeMenu();
      if (typeof root.go === 'function') root.go('master-items');
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (target.id === 'mdSearch') {
      searchQuery = target.value;
      const cursor = target.selectionStart;
      renderPage('master-items');
      const replacement = root.document.getElementById('mdSearch');
      if (replacement) {
        replacement.focus();
        replacement.setSelectionRange(cursor, cursor);
      }
      return;
    }

    if (target.closest('#mdItemForm')) {
      if (target.name === 'mdBaseUnit') {
        const label = root.document.getElementById('mdBaseUnitPreview');
        if (label) label.textContent = target.value.trim().toLocaleUpperCase('id-ID') || '—';
        refreshPriceUnitOptions();
      }
      if (target.matches('[data-md-unit]')) refreshPriceUnitOptions();
      renderPreview();
    }
  }

  function handleChange(event) {
    if (event.target.closest('#mdItemForm')) {
      refreshPriceUnitOptions();
      renderPreview();
    }
  }

  function init() {
    root.document.addEventListener('click', handleClick);
    root.document.addEventListener('submit', handleSubmit);
    root.document.addEventListener('input', handleInput);
    root.document.addEventListener('change', handleChange);
  }

  root.MasterDataUI = {
    init: init,
    renderPage: renderPage
  };

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window);
