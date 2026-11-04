(function (root) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
  const number = (value) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  const {
    state, dateKey, verifyDailySession, stockKey, getItem,
    activeWips, activeMenus, divisionIsService, canUseSales,
    initialize, load, catalogRows, buildRows,
    createCount, savePhysicalCounts, closeCount, postTransaction,
    fetchTransactionHistory, fetchExpenseHistory, switchDivision
  } = root.DailyStockService;

  function readPhysicalCountInputs() {
    return Array.from($('dailyStockRows')?.querySelectorAll('[data-physical]') || [])
      .map((input) => ({ lineId:input.dataset.lineId, value:input.value }));
  }

  const TRANSACTION_PAGES = {
    production: {
      page:'daily-production', root:'dailyProductionRoot', title:'Produksi WIP',
      description:'Catat produksi berdasarkan resep WIP yang tersimpan.',
      formTitle:'Input produksi WIP', historyTitle:'Riwayat produksi WIP',
      historyDescription:'Catatan produksi pada tanggal yang dipilih.',
      types:['wip_production'], field:'wip', submit:'Simpan produksi'
    },
    sale: {
      page:'daily-sale', root:'dailySaleRoot', title:'Sales',
      description:'Catat penjualan dan pemakaian bahan dari komposisi menu.',
      formTitle:'Input sales', historyTitle:'Riwayat sales',
      historyDescription:'Catatan pemakaian stok dari transaksi sales.',
      types:['sale'], field:'menu', submit:'Simpan sales'
    },
    purchase: {
      page:'daily-purchase', root:'dailyPurchaseRoot', title:'Barang Masuk',
      description:'Catat penerimaan bahan baku ke stok operasional.',
      formTitle:'Input barang masuk', historyTitle:'Riwayat barang masuk',
      historyDescription:'Catatan penerimaan bahan pada tanggal yang dipilih.',
      types:['purchase'], field:'item', submit:'Simpan barang masuk'
    },
    supplies: {
      page:'daily-supplies', root:'dailySuppliesRoot', title:'Supplies',
      description:'Catat supplies masuk dan supplies keluar.',
      formTitle:'Input supplies', historyTitle:'Riwayat supplies',
      historyDescription:'Catatan pergerakan supplies pada tanggal yang dipilih.',
      types:['supply_purchase','supply_usage'], field:'supply', submit:'Simpan supplies'
    }
  };

  function rowLabel(kind) { return kind === 'wip' ? 'WIP' : kind === 'supply' ? 'Supplies' : 'Bahan'; }
  function renderRows() {
    const rows = buildRows();
    const target = $('dailyStockRows');
    if (!target) return;
    if (!state.data.count) {
      target.innerHTML = '<div class="ds-empty">Mulai Daily SO untuk membuat lembar hitung pada tanggal ini.</div>';
      return;
    }
    target.innerHTML = rows.map((row) => {
      const line = state.data.countLines.find((entry) => stockKey(entry.stock_kind, entry.stock_kind === 'wip' ? entry.wip_recipe_id : entry.item_id) === row.key);
      if (!line) return '';
      const physical = line.physical_closing_quantity == null ? '' : String(line.physical_closing_quantity);
      const variance = line.variance_quantity == null ? '—' : number(line.variance_quantity);
      return '<article class="ds-stock-row"><div class="ds-stock-top"><div><span class="ds-kind">' + rowLabel(row.kind) + '</span><strong>' + escapeHtml(row.name) + '</strong><small>Satuan: ' + escapeHtml(line.unit_name_snapshot) + '</small></div><span class="ds-expected">' + number(line.expected_closing_quantity) + ' ' + escapeHtml(line.unit_name_snapshot) + '</span></div><div class="ds-stock-math"><span>Awal <b>' + number(line.opening_quantity) + '</b></span><span>Masuk <b>' + number(line.inbound_quantity) + '</b></span><span>Keluar <b>' + number(line.outbound_quantity) + '</b></span><span>Selisih <b>' + variance + '</b></span></div><label class="ds-physical">Stok fisik<input data-physical data-line-id="' + line.id + '" inputmode="decimal" placeholder="0" value="' + physical + '" ' + (state.data.count.status === 'closed' ? 'disabled' : '') + '></label></article>';
    }).join('');
  }

  function renderTransactions() {
    const target = $('dailyStockTransactions');
    if (!target) return;
    if (!state.data.transactions.length) {
      target.innerHTML = '<div class="ds-empty">Belum ada transaksi stok pada tanggal ini.</div>';
      return;
    }
    const labels = { purchase:'Barang Masuk', expense:'Pengeluaran', wip_production:'Produksi WIP', sale:'Penjualan', supply_purchase:'Supplies Masuk', supply_usage:'Supplies Keluar', waste:'Waste', adjustment:'Penyesuaian' };
    target.innerHTML = state.data.transactions.map((tx) => '<article class="ds-history-row"><div><strong>' + escapeHtml(labels[tx.transaction_type] || tx.transaction_type) + '</strong><small>' + escapeHtml(tx.reference_code || 'Tanpa referensi') + ' · ' + new Date(tx.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) + '</small></div><span class="ds-state ' + tx.status + '">' + (tx.status === 'posted' ? 'Tercatat' : tx.status === 'draft' ? 'Draft' : 'Batal') + '</span></article>').join('');
  }

  function renderHistory() {
    const target = $('dailyStockHistory');
    if (!target) return;
    target.innerHTML = state.data.history.length ? state.data.history.map((entry) => '<button class="ds-history-row" type="button" data-ds-action="open-history-date" data-date="' + entry.stock_date + '"><div><strong>' + new Date(entry.stock_date + 'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}) + '</strong><small>' + (entry.status === 'closed' ? 'Sudah ditutup' : 'Masih draft') + '</small></div><span class="ds-state ' + entry.status + '">' + (entry.status === 'closed' ? 'Selesai' : 'Draft') + '</span></button>').join('') : '<div class="ds-empty">Belum ada riwayat Daily SO.</div>';
  }

  function render() {
    const rootEl = $('dailyStockRoot');
    if (!rootEl || !state.data) return;
    const rows = buildRows();
    const counts = { material:rows.filter((row) => row.kind === 'material').length, supply:rows.filter((row) => row.kind === 'supply').length, wip:rows.filter((row) => row.kind === 'wip').length };
    const totalExpected = rows.reduce((sum,row) => sum + row.expected * (row.cost || 0),0);
    const status = state.data.count?.status || 'not-started';
    const divisionOptions = (state.context.divisions || []).map((division) => '<option value="' + division.id + '" ' + (division.id === state.context.activeDivisionId ? 'selected' : '') + '>' + escapeHtml(division.name) + '</option>').join('');
    const divisionPicker = (state.context.divisions || []).length > 1 ? '<label class="ds-division">Divisi aktif<div class="ds-division-picker" id="dsDivisionPicker"><select id="dailyStockDivision" class="ds-native-select" tabindex="-1" aria-hidden="true">' + divisionOptions + '</select><button type="button" class="ds-division-trigger" aria-haspopup="listbox" aria-expanded="false"><span>' + escapeHtml(state.context.activeDivisionName) + '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="ds-division-options" role="listbox" aria-label="Pilih divisi" hidden>' + (state.context.divisions || []).map((division) => '<button type="button" role="option" class="ds-division-option ' + (division.id === state.context.activeDivisionId ? 'active' : '') + '" data-division-id="' + escapeHtml(division.id) + '">' + escapeHtml(division.name) + '</button>').join('') + '</div></div></label>' : '';
    rootEl.innerHTML = '<div class="ds-page"><div class="ds-heading"><div><span class="ds-eyebrow">STOK OPERASIONAL</span><h1>Daily SO</h1><p>' + escapeHtml(state.context.activeDivisionName) + ' · ' + escapeHtml(state.context.workspaceRole) + '</p></div><span class="ds-status ' + status + '">' + (status === 'closed' ? 'Ditutup' : status === 'draft' ? 'Draft' : 'Belum dimulai') + '</span></div>' + divisionPicker + '<label class="ds-date">Tanggal operasional<input id="dailyStockDate" type="date" value="' + state.date + '"></label><div class="ds-summary"><div><small>Bahan</small><strong>' + counts.material + '</strong></div><div><small>WIP</small><strong>' + counts.wip + '</strong></div><div><small>Supplies</small><strong>' + counts.supply + '</strong></div></div><div class="ds-value-card"><small>Estimasi nilai stok sesuai saldo hitungan</small><strong>' + money(totalExpected) + '</strong><span>Nilai perkiraan dari harga Master Barang dan HPP WIP.</span></div><div class="ds-tabs"><button data-ds-action="tab" data-tab="overview" class="' + (state.tab === 'overview' ? 'active' : '') + '">Ringkasan</button><button data-ds-action="tab" data-tab="count" class="' + (state.tab === 'count' ? 'active' : '') + '">Hitung stok</button><button data-ds-action="tab" data-tab="transactions" class="' + (state.tab === 'transactions' ? 'active' : '') + '">Transaksi</button><button data-ds-action="tab" data-tab="history" class="' + (state.tab === 'history' ? 'active' : '') + '">Riwayat</button></div><section class="ds-panel" id="dsTabPanel">' + renderTabContent() + '</section><div id="dailyStockModal"></div></div>';
    const divisionPickerElement = $('dsDivisionPicker');
    if (divisionPickerElement) {
      const trigger = divisionPickerElement.querySelector('.ds-division-trigger');
      const panel = divisionPickerElement.querySelector('.ds-division-options');
      const nativeSelect = divisionPickerElement.querySelector('#dailyStockDivision');
      trigger?.addEventListener('click', () => {
        const open = panel.hidden;
        panel.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        divisionPickerElement.classList.toggle('is-open', open);
      });
      divisionPickerElement.querySelectorAll('[data-division-id]').forEach((option) => {
        option.addEventListener('click', () => {
          panel.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          divisionPickerElement.classList.remove('is-open');
          nativeSelect.value = option.dataset.divisionId;
          nativeSelect.dispatchEvent(new Event('change', { bubbles:true }));
        });
      });
      divisionPickerElement.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          panel.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          divisionPickerElement.classList.remove('is-open');
          trigger.focus();
        }
      });
    }
    if (state.tab === 'count') renderRows();
    if (state.tab === 'transactions') renderTransactions();
    if (state.tab === 'history') renderHistory();
  }

  function renderTabContent() {
    if (state.tab === 'count') {
      return '<div class="ds-section-title"><div><h2>Hitung stok fisik</h2><p>Masukkan jumlah aktual yang ada di outlet.</p></div></div>' + (state.data.count ? '<div class="ds-note">Saldo awal dan pergerakan dihitung dari catatan stok divisi ini. Setelah ditutup, hasil hitungan terkunci.</div><div id="dailyStockRows" class="ds-stock-list"></div><div class="ds-form-actions">' + (state.data.count.status === 'draft' ? '<button class="ds-primary" data-ds-action="save-count">Simpan hitungan</button><button class="ds-dark" data-ds-action="close-count">Tutup Daily SO</button>' : '<span class="ds-locked-note">Daily SO sudah ditutup dan tidak bisa diedit.</span>') + '</div>' : '<div class="ds-empty">Belum ada lembar hitung untuk tanggal ini.</div><button class="ds-primary ds-wide" data-ds-action="start-count">Mulai Daily SO</button>');
    }
    if (state.tab === 'transactions') return '<div class="ds-section-title"><div><h2>Transaksi tanggal ini</h2><p>Semua pergerakan stok pada divisi aktif.</p></div></div><div id="dailyStockTransactions" class="ds-history-list"></div>';
    if (state.tab === 'history') return '<div class="ds-section-title"><div><h2>Riwayat Daily SO</h2><p>Catatan hitungan per tanggal.</p></div></div><div id="dailyStockHistory" class="ds-history-list"></div>';
    return '<div class="ds-section-title"><div><h2>Ringkasan stok</h2><p>Saldo dipisah antara bahan, WIP, dan Supplies.</p></div></div><div class="ds-overview-grid"><div><span>Bahan</span><strong>' + rowsCount('material') + '</strong></div><div><span>WIP</span><strong>' + rowsCount('wip') + '</strong></div><div><span>Supplies</span><strong>' + rowsCount('supply') + '</strong></div></div><div class="ds-note">' + (state.data.count ? 'Lembar Daily SO tanggal ini ' + (state.data.count.status === 'closed' ? 'sudah ditutup.' : 'masih dalam draft.') : 'Belum ada lembar hitung. Catat transaksi stok terlebih dahulu, lalu mulai Daily SO.') + '</div><button class="ds-primary ds-wide" data-ds-action="tab" data-tab="count">Buka hitung stok</button>';
  }

  function renderTabPanel() {
    const panel = $('dsTabPanel');
    if (!panel) return;
    panel.classList.remove('ds-tab-enter');
    panel.innerHTML = renderTabContent();
    void panel.offsetWidth;
    panel.classList.add('ds-tab-enter');
    document.querySelectorAll('#dailyStockRoot .ds-tabs [data-ds-action="tab"]').forEach((tabButton) => {
      const active = tabButton.dataset.tab === state.tab;
      tabButton.classList.toggle('active', active);
      tabButton.setAttribute('aria-selected', String(active));
    });
    if (state.tab === 'count') renderRows();
    if (state.tab === 'transactions') renderTransactions();
    if (state.tab === 'history') renderHistory();
  }

  function rowsCount(kind) { return catalogRows().filter((row) => row.kind === kind).length; }

  function syncUnitOptions() {
    const form = document.querySelector('.page.active #dsStandaloneTransactionForm, .page.active #dsExpenseForm, .page.active #dsTransactionForm');
    if (!form) return;
    const item = getItem(form.elements.itemId?.value);
    const unitField = form.querySelector('[data-unit-select]');
    const picker = form.querySelector('#dsTransactionUnitPicker, #dsExpenseUnitPicker');
    if (!unitField || !item) {
      if (unitField) unitField.value = '';
      if (picker) {
        const trigger = picker.querySelector('.ds-unit-trigger');
        const panel = picker.querySelector('.ds-unit-options');
        trigger.disabled = true;
        trigger.querySelector('span').textContent = 'Pilih barang dulu';
        panel.innerHTML = '';
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        picker.classList.remove('is-open');
      }
      return;
    }
    const units = (item.konversi_satuan || []).map((unit) => unit.unit).filter(Boolean);
    const defaultUnit = units.includes(item.satuan_dasar) ? item.satuan_dasar : (units[0] || '');
    if (picker) {
      unitField.value = defaultUnit;
      const trigger = picker.querySelector('.ds-unit-trigger');
      const panel = picker.querySelector('.ds-unit-options');
      trigger.disabled = units.length === 0;
      trigger.querySelector('span').textContent = defaultUnit || 'Pilih barang dulu';
      panel.innerHTML = units.map((unit) => '<button type="button" role="option" class="ds-unit-option ' + (unit === defaultUnit ? 'active' : '') + '" data-unit-value="' + escapeHtml(unit) + '">' + escapeHtml(unit) + '</button>').join('');
      return;
    }
    unitField.innerHTML = units.map((unit) => '<option value="' + escapeHtml(unit) + '">' + escapeHtml(unit) + '</option>').join('');
    unitField.value = defaultUnit;
  }

  async function goToExpensePage() {
    if (!state.initialized && !(await initialize())) { root.toast?.('Data divisi belum siap. Muat ulang halaman.'); return; }
    const guard = await verifyDailySession();
    state.catalog = root.MasterDataStore?.isReady() ? root.MasterDataStore.load() : state.catalog;
    state.date = dateKey();
    await load(state.date);
    await verifyDailySession(guard.generation);
    root.go('daily-expense');
  }

  async function renderExpensePage() {
    const target = $('dailyExpenseRoot');
    if (!target || !state.initialized) return;
    const items = state.catalog.masterItems.filter((item) => item.status === 'active' && !item.is_supply);
    const options = items.map((item) => '<option value="' + item.id + '">' + escapeHtml(item.nama_barang) + '</option>').join('');
    const categories = ['Kalibrasi','Waste','QC','R&D','MOVE','SUPLIES','LAINNYA'];
    const categoryOptions = categories.map((category) => '<option value="' + category + '">' + category + '</option>').join('');
    target.innerHTML = '<div class="ds-page ds-expense-page"><div class="ds-expense-intro"><button class="page-back" type="button" data-ds-action="back-daily-stock" aria-label="Kembali ke Daily SO"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/><path d="M9 12h12"/></svg><span>Daily SO</span></button><h1>Pengeluaran</h1><p>Catat pemakaian bahan dan telusuri riwayat pengeluaran.</p></div><section class="ds-panel"><div class="ds-section-title"><div><h2>Input pengeluaran</h2><p>Tanggal transaksi otomatis mengikuti hari ini.</p></div></div><form id="dsExpenseForm" data-type="expense"><label>Kategori<div class="ds-category-picker" id="dsExpenseCategory"><input type="hidden" name="category" value=""><button type="button" class="ds-category-trigger" aria-haspopup="listbox" aria-expanded="false"><span>Pilih kategori</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="ds-category-options" role="listbox" aria-label="Kategori pengeluaran" hidden>' + categories.map((category) => '<button type="button" class="ds-category-option" role="option" data-category-value="' + escapeHtml(category) + '">' + escapeHtml(category) + '</button>').join('') + '</div></div></label><label>Barang<div class="ds-item-search" id="dsExpenseItemSearch"><input type="hidden" name="itemId" value=""><input type="search" name="itemSearch" autocomplete="off" placeholder="Cari nama bahan..." aria-label="Cari nama bahan"><div class="ds-item-search-results" role="listbox" aria-label="Hasil pencarian bahan" hidden>' + items.map((item) => '<button type="button" class="ds-item-search-option" role="option" data-item-id="' + escapeHtml(item.id) + '" data-item-name="' + escapeHtml(item.nama_barang) + '">' + escapeHtml(item.nama_barang) + '</button>').join('') + '</div><small class="ds-item-search-selected" aria-live="polite"></small></div></label><label>Jumlah<input name="quantity" type="number" min="0.000001" step="any" inputmode="decimal" required placeholder="Masukkan jumlah"></label><label>Satuan<div class="ds-unit-picker" id="dsExpenseUnitPicker"><input type="hidden" name="unit" data-unit-select value=""><button type="button" class="ds-unit-trigger" aria-haspopup="listbox" aria-expanded="false" disabled><span>Pilih barang dulu</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="ds-unit-options" role="listbox" aria-label="Pilih satuan" hidden></div></div></label><label>Referensi <span>(opsional)</span><input name="reference" maxlength="80" placeholder="Nomor nota / keterangan"></label><label>Catatan <span>(opsional)</span><textarea name="notes" rows="3" placeholder="Tambahkan keterangan jika perlu"></textarea></label><div class="ds-form-actions"><button type="submit" class="ds-primary">Simpan pengeluaran</button></div></form></section><section class="ds-panel"><div class="ds-section-title"><div><h2>Riwayat pengeluaran</h2><p>Otomatis menampilkan transaksi hari ini. Ubah tanggal untuk mencari riwayat lain.</p></div></div><label class="ds-date">Filter tanggal<input id="dailyExpenseDate" type="date" value="' + state.expenseDate + '"></label><div id="dailyExpenseHistory" class="ds-history-list ds-expense-history"><div class="ds-empty">Memuat riwayat...</div></div></section></div>';
    const categoryPicker = $('dsExpenseCategory');
    if (categoryPicker) {
      const trigger = categoryPicker.querySelector('.ds-category-trigger');
      const optionsPanel = categoryPicker.querySelector('.ds-category-options');
      const categoryInput = categoryPicker.querySelector('[name="category"]');
      trigger?.addEventListener('click', () => {
        const open = optionsPanel.hidden;
        optionsPanel.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        categoryPicker.classList.toggle('is-open', open);
      });
      categoryPicker.querySelectorAll('[data-category-value]').forEach((option) => {
        option.addEventListener('click', () => {
          categoryInput.value = option.dataset.categoryValue;
          trigger.querySelector('span').textContent = option.dataset.categoryValue;
          optionsPanel.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          categoryPicker.classList.remove('is-open');
        });
      });
      categoryPicker.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          optionsPanel.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          categoryPicker.classList.remove('is-open');
          trigger.focus();
        }
      });
    }
    const unitPicker = $('dsExpenseUnitPicker');
    if (unitPicker) {
      const trigger = unitPicker.querySelector('.ds-unit-trigger');
      const panel = unitPicker.querySelector('.ds-unit-options');
      const unitSelect = unitPicker.querySelector('[data-unit-select]');
      trigger?.addEventListener('click', () => {
        if (trigger.disabled) return;
        const open = panel.hidden;
        panel.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        unitPicker.classList.toggle('is-open', open);
      });
      panel?.addEventListener('click', (event) => {
        const option = event.target.closest('[data-unit-value]');
        if (!option) return;
        unitSelect.value = option.dataset.unitValue;
        trigger.querySelector('span').textContent = unitSelect.value;
        panel.querySelectorAll('[data-unit-value]').forEach((node) => node.classList.toggle('active', node === option));
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        unitPicker.classList.remove('is-open');
        unitSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
      unitPicker.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          panel.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          unitPicker.classList.remove('is-open');
          trigger.focus();
        }
      });
    }
    const itemSearch = $('dsExpenseItemSearch');
    if (itemSearch) {
      const input = itemSearch.querySelector('[name="itemSearch"]');
      const hidden = itemSearch.querySelector('[name="itemId"]');
      const results = itemSearch.querySelector('.ds-item-search-results');
      const selectedLabel = itemSearch.querySelector('.ds-item-search-selected');
      const allItems = items;
      const showResults = (query) => {
        const normalized = query.trim().toLocaleLowerCase('id');
        const matches = allItems.filter((item) => !normalized || String(item.nama_barang || '').toLocaleLowerCase('id').includes(normalized)).slice(0, 30);
        results.innerHTML = matches.length ? matches.map((item) => '<button type="button" class="ds-item-search-option" role="option" data-item-id="' + escapeHtml(item.id) + '" data-item-name="' + escapeHtml(item.nama_barang) + '">' + escapeHtml(item.nama_barang) + '</button>').join('') : '<div class="ds-item-search-empty">Barang tidak ditemukan</div>';
        results.hidden = false;
        itemSearch.classList.add('is-open');
      };
      input.addEventListener('focus', () => {
        if (input.value.trim()) showResults(input.value);
      });
      input.addEventListener('input', () => {
        hidden.value = '';
        selectedLabel.textContent = '';
        syncUnitOptions();
        if (input.value.trim()) showResults(input.value);
        else {
          results.hidden = true;
          itemSearch.classList.remove('is-open');
        }
      });
      results.addEventListener('click', (event) => {
        const option = event.target.closest('[data-item-id]');
        if (!option) return;
        hidden.value = option.dataset.itemId;
        input.value = option.dataset.itemName;
        selectedLabel.textContent = 'Dipilih: ' + option.dataset.itemName;
        results.hidden = true;
        itemSearch.classList.remove('is-open');
        syncUnitOptions();
      });
      document.addEventListener('click', (event) => {
        if (!itemSearch.contains(event.target)) {
          results.hidden = true;
          itemSearch.classList.remove('is-open');
        }
      }, { once: true });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          results.hidden = true;
          itemSearch.classList.remove('is-open');
        }
      });
    }
    syncUnitOptions();
    await loadExpenseHistory();
  }

  async function loadExpenseHistory() {
    const target = $('dailyExpenseHistory');
    if (!target) return;
    target.innerHTML = '<div class="ds-empty">Memuat riwayat...</div>';
    const { transactions, linesByTransaction } = await fetchExpenseHistory(state.expenseDate);
    if (!transactions.length) { target.innerHTML = '<div class="ds-empty">Belum ada pengeluaran pada tanggal ini.</div>'; return; }
    target.innerHTML = transactions.map((tx) => {
      const details = (linesByTransaction.get(tx.id) || []).map((line) => '<div class="ds-expense-line"><strong>' + escapeHtml(getItem(line.item_id)?.nama_barang || 'Barang tidak ditemukan') + '</strong><span>' + number(line.quantity) + ' ' + escapeHtml(line.unit_name_snapshot) + '</span></div>').join('');
      return '<article class="ds-expense-history-card"><div class="ds-expense-history-head"><div><span class="ds-expense-category">' + escapeHtml(tx.expense_category || 'Belum dikategorikan') + '</span><strong>' + new Date(tx.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) + '</strong></div><span class="ds-state ' + tx.status + '">' + (tx.status === 'posted' ? 'Tercatat' : 'Draft') + '</span></div><div class="ds-expense-lines">' + details + '</div>' + (tx.reference_code ? '<small>Referensi: ' + escapeHtml(tx.reference_code) + '</small>' : '') + (tx.notes ? '<p>' + escapeHtml(tx.notes) + '</p>' : '') + '</article>';
    }).join('');
  }


  function transactionSearchField(label, name, placeholder, items, idKey, labelKey) {
    const options = items.map((item) => '<button type="button" class="ds-item-search-option" role="option" data-search-value="' +
      escapeHtml(item[idKey]) + '" data-search-label="' + escapeHtml(item[labelKey]) + '">' +
      escapeHtml(item[labelKey]) + '</button>').join('');
    return '<label>' + label + '<div class="ds-item-search" data-ds-search-picker="' + name + '">' +
      '<input type="hidden" name="' + name + '" value="">' +
      '<input type="search" name="' + name + 'Search" autocomplete="off" placeholder="' + placeholder + '" aria-label="' + label + '">' +
      '<div class="ds-item-search-results" role="listbox" aria-label="' + label + '" hidden>' + options + '</div>' +
      '<small class="ds-item-search-selected" aria-live="polite"></small></div></label>';
  }

  function productionRowMarkup(wip, index) {
    return '<article class="ds-production-row" data-production-row>' +
      '<input type="hidden" data-production-wip-id value="' + escapeHtml(wip.id) + '">' +
      '<div class="ds-production-item">' +
      '<span class="ds-production-index">' + String(index + 1).padStart(2, '0') + '</span>' +
      '<div class="ds-production-item-copy"><strong>' + escapeHtml(wip.nama_wip) + '</strong>' +
      '<small>Hasil per batch: ' + number(wip.hasil_per_batch) + ' ' + escapeHtml(wip.satuan_hasil || '') + '</small></div></div>' +
      '<label class="ds-production-quantity">Jumlah batch<input data-production-quantity type="number" min="0.000001" step="any" inputmode="decimal" placeholder="0"></label>' +
      '<div class="ds-production-yield"><span>Hasil jadi</span><strong data-production-yield>—</strong></div></article>';
  }

  function updateProductionYield(row) {
    const id = row.querySelector('[data-production-wip-id]')?.value;
    const quantity = Number(row.querySelector('[data-production-quantity]')?.value || 0);
    const wip = activeWips().find((item) => String(item.id) === String(id));
    const output = wip && quantity > 0 ? quantity * Number(wip.hasil_per_batch || 0) : null;
    const target = row.querySelector('[data-production-yield]');
    if (target) target.textContent = output == null ? '—' : number(output) + ' ' + (wip.satuan_hasil || '');
  }

  function wireProductionBatch(target, form) {
    const rowsTarget = target.querySelector('#dsProductionRows');
    if (!rowsTarget || rowsTarget.dataset.bound === 'true') return;
    const wips = activeWips();
    rowsTarget.innerHTML = wips.length
      ? wips.map((wip, index) => productionRowMarkup(wip, index)).join('')
      : '<div class="ds-empty">Belum ada WIP aktif. Tambahkan resep WIP terlebih dahulu.</div>';
    rowsTarget.dataset.bound = 'true';
    rowsTarget.addEventListener('input', (event) => {
      if (event.target.matches('[data-production-quantity]')) {
        updateProductionYield(event.target.closest('[data-production-row]'));
      }
    });
  }

  function transactionUnitField() {
    return '<label>Satuan<div class="ds-unit-picker" id="dsTransactionUnitPicker">' +
      '<input class="ds-native-select" type="hidden" name="unit" data-unit-select value="">' +
      '<button type="button" class="ds-unit-trigger" aria-haspopup="listbox" aria-expanded="false" disabled><span>Pilih barang dulu</span>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>' +
      '<div class="ds-unit-options" role="listbox" aria-label="Pilih satuan" hidden></div></div></label>';
  }

  function transactionDirectionField() {
    return '<label>Arah catatan<div class="ds-direction-picker" role="group" aria-label="Arah supplies">' +
      '<input type="hidden" name="direction" value="in">' +
      '<button type="button" class="active" data-direction-value="in" aria-pressed="true">Supplies masuk</button>' +
      '<button type="button" data-direction-value="out" aria-pressed="false">Supplies keluar</button>' +
      '</div></label>';
  }

  async function goToTransactionPage(type) {
    const config = TRANSACTION_PAGES[type];
    if (!config) return;
    if (!state.initialized && !(await initialize())) {
      root.toast?.('Data divisi belum siap. Muat ulang halaman.');
      return;
    }
    const guard = await verifyDailySession();
    state.catalog = root.MasterDataStore?.isReady() ? root.MasterDataStore.load() : state.catalog;
    state.date = dateKey();
    state.expenseDate = state.expenseDate || dateKey();
    await load(state.date);
    await verifyDailySession(guard.generation);
    root.go(config.page);
  }

  function renderTransactionPage(type) {
    const config = TRANSACTION_PAGES[type];
    const target = config && $(config.root);
    if (!target || !state.initialized) return;

    const materialItems = state.catalog.masterItems.filter((item) => item.status === 'active' && !item.is_supply);
    const supplyItems = state.catalog.masterItems.filter((item) => item.status === 'active' && item.is_supply);
    let fields = '';

    if (config.field === 'wip') {
      const active = activeWips();
      fields = '<div class="ds-production-batch-head"><div><strong>Daftar WIP aktif</strong><small>Semua WIP tampil otomatis. Isi jumlah batch pada produk yang dibuat.</small></div><span>' + active.length + ' WIP</span></div>' +
        '<div class="ds-production-list-head"><span>PRODUK WIP</span><span>JUMLAH BATCH</span><span>HASIL JADI</span></div>' +
        '<div id="dsProductionRows" class="ds-production-rows"></div>' +
        '<p class="ds-field-help">Biarkan jumlah batch kosong untuk WIP yang tidak diproduksi. Hasil jadi dihitung otomatis dari resep.</p>';
    } else if (config.field === 'menu') {
      fields = transactionSearchField('Menu', 'menuId', 'Cari nama menu...', activeMenus(), 'id', 'nama_menu') +
        '<label>Jumlah porsi<input name="quantity" type="number" min="1" step="1" inputmode="numeric" required placeholder="Masukkan jumlah porsi"></label>' +
        '<p class="ds-field-help">Pemakaian bahan dan WIP dihitung otomatis dari komposisi menu.</p>';
    } else if (config.field === 'item') {
      fields = transactionSearchField('Barang', 'itemId', 'Cari nama bahan...', materialItems, 'id', 'nama_barang') +
        '<label>Jumlah<input name="quantity" type="number" min="0.000001" step="any" inputmode="decimal" required placeholder="Masukkan jumlah"></label>' +
        transactionUnitField();
    } else if (config.field === 'supply') {
      fields = transactionDirectionField() +
        transactionSearchField('Barang supplies', 'itemId', 'Cari nama supplies...', supplyItems, 'id', 'nama_barang') +
        '<label>Jumlah<input name="quantity" type="number" min="0.000001" step="any" inputmode="decimal" required placeholder="Masukkan jumlah"></label>' +
        transactionUnitField();
    }

    target.innerHTML = '<div class="ds-page ds-expense-page ds-transaction-page">' +
      '<div class="ds-expense-intro ds-transaction-intro">' +
      '<button class="page-back" type="button" data-ds-action="back-daily-stock" aria-label="Kembali ke Daily SO"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/><path d="M9 12h12"/></svg><span>Daily SO</span></button>' +
      '<h1>' + config.title + '</h1><p>' + config.description + '</p></div>' +
      '<section class="ds-panel"><div class="ds-section-title"><div><h2>' + config.formTitle + '</h2><p>Tanggal transaksi otomatis mengikuti hari ini.</p></div></div>' +
      '<form id="dsStandaloneTransactionForm" class="ds-transaction-form" data-type="' + type + '">' + fields +
      '<label>Referensi <span>(opsional)</span><input name="reference" maxlength="80" placeholder="Nomor nota / keterangan"></label>' +
      '<label>Catatan <span>(opsional)</span><textarea name="notes" rows="3" placeholder="Tambahkan keterangan jika perlu"></textarea></label>' +
      '<div class="ds-form-actions"><button type="submit" class="ds-primary">' + config.submit + '</button></div></form></section>' +
      '<section class="ds-panel"><div class="ds-section-title"><div><h2>' + config.historyTitle + '</h2><p>' + config.historyDescription + '</p></div></div>' +
      '<label class="ds-date">Filter tanggal<input id="dailyTransactionDate-' + type + '" data-ds-transaction-date="' + type + '" type="date" value="' + escapeHtml(state.expenseDate || dateKey()) + '"></label>' +
      '<div id="dailyTransactionHistory-' + type + '" class="ds-history-list ds-expense-history ds-transaction-history"><div class="ds-empty">Memuat riwayat...</div></div></section></div>';

    wireTransactionPage(type);
    syncUnitOptions();
    loadTransactionHistory(type);
  }

  function wireTransactionPage(type) {
    const target = $(TRANSACTION_PAGES[type].root);
    const form = target?.querySelector('#dsStandaloneTransactionForm');
    if (!form) return;

    if (type === 'production') wireProductionBatch(target, form);

    if (!target.dataset.searchPickerCloseBound) {
      target.addEventListener('click', (event) => {
        target.querySelectorAll('[data-ds-search-picker].is-open').forEach((picker) => {
          if (!picker.contains(event.target)) {
            const results = picker.querySelector('.ds-item-search-results');
            if (results) results.hidden = true;
            picker.classList.remove('is-open');
          }
        });
      });
      target.dataset.searchPickerCloseBound = 'true';
    }

    target.querySelectorAll('[data-ds-search-picker]').forEach((picker) => {
      const input = picker.querySelector('input[type="search"]');
      const hidden = picker.querySelector('input[type="hidden"]');
      const results = picker.querySelector('.ds-item-search-results');
      const selectedLabel = picker.querySelector('.ds-item-search-selected');
      const showResults = () => {
        const query = input.value.trim().toLocaleLowerCase('id');
        const options = Array.from(results.querySelectorAll('[data-search-value]'));
        let visible = 0;
        options.forEach((option) => {
          const match = !query || option.dataset.searchLabel.toLocaleLowerCase('id').includes(query);
          option.hidden = !match;
          if (match) visible += 1;
        });
        let empty = results.querySelector('.ds-item-search-empty');
        if (!visible) {
          if (!empty) { empty = document.createElement('div'); empty.className = 'ds-item-search-empty'; empty.textContent = 'Data tidak ditemukan'; results.appendChild(empty); }
        } else if (empty) empty.remove();
        results.hidden = false;
        picker.classList.add('is-open');
      };
      input.addEventListener('focus', showResults);
      input.addEventListener('input', () => {
        hidden.value = '';
        selectedLabel.textContent = '';
        if (picker.dataset.dsSearchPicker === 'itemId') syncUnitOptions();
        showResults();
      });
      results.addEventListener('click', (event) => {
        const option = event.target.closest('[data-search-value]');
        if (!option) return;
        hidden.value = option.dataset.searchValue;
        input.value = option.dataset.searchLabel;
        selectedLabel.textContent = 'Dipilih: ' + option.dataset.searchLabel;
        results.hidden = true;
        picker.classList.remove('is-open');
        if (picker.dataset.dsSearchPicker === 'itemId') syncUnitOptions();
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          results.hidden = true;
          picker.classList.remove('is-open');
          input.blur();
        }
      });
    });

    const unitPicker = target.querySelector('#dsTransactionUnitPicker');
    if (unitPicker) {
      const trigger = unitPicker.querySelector('.ds-unit-trigger');
      const panel = unitPicker.querySelector('.ds-unit-options');
      const unitInput = unitPicker.querySelector('[data-unit-select]');
      trigger.addEventListener('click', () => {
        if (trigger.disabled) return;
        const open = panel.hidden;
        panel.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        unitPicker.classList.toggle('is-open', open);
      });
      panel.addEventListener('click', (event) => {
        const option = event.target.closest('[data-unit-value]');
        if (!option) return;
        unitInput.value = option.dataset.unitValue;
        trigger.querySelector('span').textContent = unitInput.value;
        panel.querySelectorAll('[data-unit-value]').forEach((node) => node.classList.toggle('active', node === option));
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        unitPicker.classList.remove('is-open');
      });
      unitPicker.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          panel.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          unitPicker.classList.remove('is-open');
          trigger.focus();
        }
      });
    }

    const directionInput = form.elements.direction;
    if (directionInput) {
      target.querySelectorAll('[data-direction-value]').forEach((button) => {
        button.addEventListener('click', () => {
          directionInput.value = button.dataset.directionValue;
          target.querySelectorAll('[data-direction-value]').forEach((option) => {
            const active = option === button;
            option.classList.toggle('active', active);
            option.setAttribute('aria-pressed', String(active));
          });
        });
      });
    }
  }

  async function loadTransactionHistory(type) {
    const config = TRANSACTION_PAGES[type];
    const target = config && $('dailyTransactionHistory-' + type);
    if (!target) return;
    target.innerHTML = '<div class="ds-empty">Memuat riwayat...</div>';
    try {
      const result = await fetchTransactionHistory(state.expenseDate || dateKey(), config.types);
      if (!transactionsPageIsActive(type, target)) return;
      if (!result.transactions.length) {
        target.innerHTML = '<div class="ds-empty">Belum ada catatan pada tanggal ini.</div>';
        return;
      }
      target.innerHTML = result.transactions.map((tx) => {
        const lines = (result.linesByTransaction.get(tx.id) || []).map((line) => {
          const item = line.stock_kind === 'wip' ? getWip(line.wip_recipe_id) : getItem(line.item_id);
          const label = item?.nama_wip || item?.nama_barang || 'Barang tidak ditemukan';
          const direction = line.direction === 'in' ? 'Masuk' : 'Keluar';
          return '<div class="ds-expense-line"><strong>' + escapeHtml(label) + '</strong><span>' +
            number(line.quantity) + ' ' + escapeHtml(line.unit_name_snapshot || '') + ' · ' + direction + '</span></div>';
        }).join('');
        const kindLabel = type === 'supplies' ? (tx.transaction_type === 'supply_purchase' ? 'Supplies masuk' : 'Supplies keluar') :
          type === 'production' ? 'Produksi WIP' : type === 'sale' ? 'Sales' : 'Barang masuk';
        const time = new Date(tx.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
        const status = tx.status === 'posted' ? 'Tercatat' : 'Draft';
        return '<article class="ds-expense-history-card ds-transaction-history-card">' +
          '<div class="ds-expense-history-head"><div><span class="ds-expense-category">' + kindLabel + '</span><strong>' + time + '</strong></div>' +
          '<span class="ds-state ' + escapeHtml(tx.status) + '">' + status + '</span></div>' +
          '<div class="ds-expense-lines">' + (lines || '<small>Detail pergerakan stok tidak tersedia.</small>') + '</div>' +
          (tx.reference_code ? '<small>Referensi: ' + escapeHtml(tx.reference_code) + '</small>' : '') +
          (tx.notes ? '<p>' + escapeHtml(tx.notes) + '</p>' : '') + '</article>';
      }).join('');
    } catch (error) {
      target.innerHTML = '<div class="ds-empty">Riwayat belum bisa dimuat. Coba lagi.</div>';
      root.toast?.(error.message || 'Riwayat transaksi tidak bisa dimuat.');
    }
  }

  function transactionsPageIsActive(type, target) {
    return $(TRANSACTION_PAGES[type].root)?.contains(target) && target.isConnected;
  }

  async function runAction(action) {
    if (action === 'daily-stock') { await goToPage(); return; }
    if (action === 'stock-in') { await goToTransactionPage('purchase'); return; }
    if (action === 'stock-out') { await goToExpensePage(); return; }
    if (action === 'stock-supplies') { await goToTransactionPage('supplies'); return; }
    if (action === 'stock-production') { await goToTransactionPage('production'); return; }
    if (action === 'stock-sale') { await goToTransactionPage('sale'); return; }
    if (action === 'stock-history') { await goToPage(); state.tab='history'; render(); return; }
  }

  async function goToPage() {
    if (!state.initialized) await initialize();
    if (!state.initialized) { root.toast?.('Data divisi belum siap. Muat ulang halaman.'); return; }
    if (!state.data || state.data.date !== state.date) await load(state.date);
    root.go('daily-stock');
  }

  async function refreshPage() {
    await load(state.date);
    render();
  }

  async function handleClick(event) {
    const button = event.target.closest('[data-ds-action]');
    if (!button) return;
    const action = button.dataset.dsAction;
    try {
      if (action === 'back-daily-stock') { root.go('daily-stock'); }
      else if (action === 'tab') { state.tab = button.dataset.tab || 'overview'; renderTabPanel(); }
      else if (action === 'start-count') { await createCount(); state.tab='count'; render(); }
      else if (action === 'save-count') { await savePhysicalCounts(readPhysicalCountInputs()); render(); root.toast?.('Hitungan fisik tersimpan.'); }
      else if (action === 'close-count') {
        if (!root.confirm('Tutup Daily SO? Setelah ditutup, hitungan tidak bisa diedit.')) return;
        await closeCount(readPhysicalCountInputs()); render(); root.toast?.('Daily SO berhasil ditutup.');
      } else if (action === 'close-form') { $('dailyStockModal').innerHTML=''; $('fab').style.display='grid'; }
      else if (action === 'open-history-date') {
        state.date = button.dataset.date; state.tab='count'; await load(state.date); render();
      }
    } catch (error) {
      console.error('Daily SO action failed:', error);
      root.toast?.(error.message || 'Aksi belum berhasil. Coba lagi.');
    }
  }

  async function handleSubmit(event) {
    const form = event.target.closest('#dsTransactionForm, #dsExpenseForm, #dsStandaloneTransactionForm');
    if (!form) return;
    event.preventDefault();
    const isStandalone = form.id === 'dsStandaloneTransactionForm';
    const transactionType = form.dataset.type;
    if (isStandalone && ['purchase','supply'].includes(transactionType) && !form.elements.itemId?.value) {
      root.toast?.('Cari lalu pilih barang terlebih dahulu.');
      form.querySelector('[type="search"]')?.focus();
      return;
    }
    if (isStandalone && transactionType === 'production') {
      const rows = Array.from(form.querySelectorAll('[data-production-row]'));
      const enteredRows = rows.filter((row) => String(row.querySelector('[data-production-quantity]')?.value || '').trim());
      if (!enteredRows.length) {
        root.toast?.('Masukkan jumlah batch pada minimal satu WIP.');
        rows[0]?.querySelector('[data-production-quantity]')?.focus();
        return;
      }
      const invalidRow = enteredRows.find((row) => {
        const quantity = Number(row.querySelector('[data-production-quantity]')?.value);
        return !Number.isFinite(quantity) || quantity <= 0;
      });
      if (invalidRow) {
        root.toast?.('Jumlah batch harus lebih besar dari 0.');
        invalidRow.querySelector('[data-production-quantity]')?.focus();
        return;
      }
    }
    if (isStandalone && transactionType === 'sale' && !form.elements.menuId?.value) {
      root.toast?.('Pilih menu terlebih dahulu.');
      form.querySelector('[type="search"]')?.focus();
      return;
    }
    if (isStandalone && ['purchase','supply'].includes(transactionType) && !form.elements.unit?.value) {
      root.toast?.('Pilih satuan barang terlebih dahulu.');
      form.querySelector('.ds-unit-trigger')?.focus();
      return;
    }
    if (form.id === 'dsExpenseForm' && !form.elements.category.value) {
      root.toast?.('Pilih kategori pengeluaran dulu.');
      form.querySelector('.ds-category-trigger')?.focus();
      return;
    }
    if (form.id === 'dsExpenseForm' && !form.elements.itemId.value) {
      root.toast?.('Cari lalu pilih barang yang akan dikeluarkan.');
      form.querySelector('[name="itemSearch"]')?.focus();
      return;
    }
    if (form.id === 'dsExpenseForm' && !form.elements.unit.value) {
      root.toast?.('Pilih satuan barang terlebih dahulu.');
      form.querySelector('.ds-unit-trigger')?.focus();
      return;
    }
    if (state.busy) return;
    state.busy = true;
    const button = form.querySelector('[type="submit"]');
    const submitLabel = button.textContent;
    button.disabled = true; button.textContent = 'Menyimpan...';
    try {
      const data = new FormData(form);
      const values = Object.fromEntries(data.entries());
      if (isStandalone && transactionType === 'production') {
        values.items = Array.from(form.querySelectorAll('[data-production-row]')).map((row) => ({
          wipId: row.querySelector('[data-production-wip-id]')?.value || '',
          quantity: row.querySelector('[data-production-quantity]')?.value || ''
        })).filter((item) => item.wipId && item.quantity);
      }
      await postTransaction(form.dataset.type, values);
      if (form.id === 'dsExpenseForm') { await renderExpensePage(); }
      else if (isStandalone) { await renderTransactionPage(transactionType); }
      else { $('dailyStockModal').innerHTML=''; $('fab').style.display='grid'; state.tab='transactions'; render(); }
      root.toast?.('Transaksi stok berhasil dicatat.');
    } catch (error) {
      console.error('Daily SO transaction failed:', error);
      root.toast?.(error.message || 'Transaksi belum berhasil disimpan.');
      button.disabled = false; button.textContent = submitLabel;
    } finally { state.busy = false; }
  }

  async function handleDateChange(event) {
    if (event.target.matches('[data-ds-transaction-date]')) {
      const type = event.target.dataset.dsTransactionDate;
      state.expenseDate = event.target.value || dateKey();
      await loadTransactionHistory(type);
      return;
    }
    if (event.target.id === 'dailyStockDivision') {
      try {
        const changed = await switchDivision(event.target.value);
        if (changed) render();
      } catch (error) { root.toast?.(error.message || 'Divisi tidak bisa diganti.'); }
      return;
    }
    if (event.target.id === 'dailyExpenseDate') { try { state.expenseDate = event.target.value || dateKey(); await loadExpenseHistory(); } catch (error) { root.toast?.(error.message || 'Riwayat tidak bisa dimuat.'); } return; }
    if (event.target.id !== 'dailyStockDate') return;
    try { state.date = event.target.value || dateKey(); await load(state.date); render(); }
    catch (error) { root.toast?.(error.message || 'Tanggal tidak bisa dimuat.'); }
  }

  function renderPage(page) {
    if (page !== 'daily-stock') return;
    if (!state.initialized) initialize().then(() => load(state.date)).then(render).catch((error) => root.toast?.(error.message));
    else if (state.data && state.data.date === state.date) render();
    else load(state.date).then(render).catch((error) => root.toast?.(error.message));
  }

  function installNavigation() {
    const main = document.querySelector('.content');
    if (!main || $('page-daily-stock')) return;
    const page = document.createElement('section');
    page.className = 'page';
    page.id = 'page-daily-stock';
    page.innerHTML = '<div id="dailyStockRoot"></div>';
    main.appendChild(page);
    const expensePage = document.createElement('section');
    expensePage.className = 'page';
    expensePage.id = 'page-daily-expense';
    expensePage.innerHTML = '<div id="dailyExpenseRoot"></div>';
    main.appendChild(expensePage);
    Object.values(TRANSACTION_PAGES).forEach((config) => {
      const transactionPage = document.createElement('section');
      transactionPage.className = 'page';
      transactionPage.id = 'page-' + config.page;
      transactionPage.innerHTML = '<div id="' + config.root + '"></div>';
      main.appendChild(transactionPage);
    });

    const quickMenu = $('quickMenu');
    if (quickMenu) {
      const actions = [
        ['stock-out','Pengeluaran','M5 12h14'],
        ['stock-production','Produksi WIP','m12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5m-18 5 9 5 9-5'],
        ['stock-in','Barang Masuk','M12 5v14m-7-7h14'],
        ['stock-supplies','Supplies','M4 7h16v13H4zM8 7V4h8v3'],
        ['stock-sale','Sales','M3 3h2l2 13h11l2-9H7']
      ];
      actions.forEach(([action,label,path], index) => {
        const button = document.createElement('button');
        button.type='button'; button.className='quick-menu-item ds-fab-action'; button.dataset.quickContext='stock';
        button.dataset.action='runQuickAction'; button.dataset.actionArgs=JSON.stringify([action]); button.dataset.stockAction=action;
        button.style.right='-15px';
        button.style.bottom=(index * 58)+'px';
        button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg><span>' + label + '</span>';
        quickMenu.appendChild(button);
      });
    }

    const originalGo = root.go;
    root.go = function (targetPage) {
      const isDailyWorkspacePage = targetPage === 'daily-stock' ||
        targetPage === 'daily-expense' ||
        Object.values(TRANSACTION_PAGES).some((config) => config.page === targetPage);
      document.querySelectorAll('.desktop-nav-group-heading-action').forEach((button) => {
        button.classList.toggle('active', isDailyWorkspacePage);
      });
      const transactionConfig = Object.values(TRANSACTION_PAGES).find((config) => config.page === targetPage);
      if (transactionConfig) {
        document.querySelectorAll('.page').forEach((element) => element.classList.remove('active'));
        $('page-' + transactionConfig.page)?.classList.add('active');
        document.querySelectorAll('.drawer-item[data-page]').forEach((item) => {
          item.classList.toggle('active', item.dataset.page === targetPage);
        });
        root.closeQuickMenu?.();
        $('fab').style.display = 'none';
        $('quickMenuBackdrop')?.classList.remove('show');
        $('quickMenu')?.classList.remove('show');
        root.setWorkspaceHeader?.(targetPage);
        root.scrollTo({ top:0, behavior:'auto' });
        renderTransactionPage(Object.keys(TRANSACTION_PAGES).find((key) => TRANSACTION_PAGES[key] === transactionConfig));
        return;
      }
      if (targetPage === 'daily-expense') {
        document.querySelectorAll('.page').forEach((element) => element.classList.remove('active'));
        $('page-daily-expense')?.classList.add('active');
        document.querySelectorAll('.drawer-item[data-page]').forEach((item) => {
          item.classList.toggle('active', item.dataset.page === targetPage);
        });
        root.closeQuickMenu?.();
        $('fab').style.display = 'none';
        $('quickMenuBackdrop')?.classList.remove('show');
        $('quickMenu')?.classList.remove('show');
        root.setWorkspaceHeader?.('daily-expense');
        root.scrollTo({ top:0, behavior:'auto' });
        renderExpensePage();
        return;
      }
      if (targetPage === 'daily-stock') {
        if (typeof originalGo === 'function') originalGo(targetPage);
        root.setWorkspaceHeader?.('daily-stock');
        root.closeQuickMenu?.();
        $('fab').style.display = 'grid';
        $('quickMenuBackdrop')?.classList.remove('show');
        $('quickMenu')?.classList.remove('show');
        if (root.MasterDataStore?.isReady()) state.catalog = root.MasterDataStore.load();
        renderPage(targetPage);
        return;
      }
      if (typeof originalGo === 'function') originalGo(targetPage);
    };

    const originalHeader = root.setWorkspaceHeader;
    root.setWorkspaceHeader = function (targetPage) {
      const transactionConfig = Object.values(TRANSACTION_PAGES).find((config) => config.page === targetPage);
      if (transactionConfig) {
        const mark=$('workspaceBrandmark'), name=$('workspaceBrandname'), meta=$('workspaceBrandmeta');
        if (mark && name && meta) {
          mark.classList.add('is-master');
          mark.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>';
          name.textContent=transactionConfig.title.toUpperCase(); meta.textContent='STOCK OPERATIONS';
        }
        return;
      }
      if (targetPage === 'daily-expense') {
        const mark=$('workspaceBrandmark'), name=$('workspaceBrandname'), meta=$('workspaceBrandmeta');
        if (mark && name && meta) { mark.classList.add('is-master'); mark.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 8h14M7 8l-3 9h8L7 8zm10 0-4 9h8l-4-9z"/></svg>'; name.textContent='PENGELUARAN'; meta.textContent='STOCK OPERATIONS'; }
        return;
      }
      if (targetPage === 'daily-stock') {
        const mark=$('workspaceBrandmark'), name=$('workspaceBrandname'), meta=$('workspaceBrandmeta');
        if (mark && name && meta) {
          mark.classList.add('is-master');
          mark.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>';
          name.textContent='DAILY STOCK'; meta.textContent='STOCK OPERATIONS';
        }
        return;
      }
      if (typeof originalHeader === 'function') originalHeader(targetPage);
    };

    const originalToggle = root.toggleQuickMenu;
    root.toggleQuickMenu = function () {
      if ($('page-daily-stock')?.classList.contains('active')) {
        const menu=$('quickMenu'), backdrop=$('quickMenuBackdrop'), fab=$('fab');
        const open=!menu.classList.contains('show');
        menu.querySelectorAll('.quick-menu-item').forEach((item)=>{
          const isStockAction=item.classList.contains('ds-fab-action');
          item.hidden=!isStockAction;
          item.style.display=isStockAction?'flex':'none';
        });
        const heading=menu.querySelector('.quick-menu-heading'); if(heading) heading.textContent='DAILY STOCK';
        menu.setAttribute('aria-label','Daily Stock');
        menu.classList.toggle('show',open); backdrop.classList.toggle('show',open);
        menu.setAttribute('aria-hidden',String(!open)); backdrop.setAttribute('aria-hidden',String(!open));
        fab.classList.toggle('is-open',open); fab.setAttribute('aria-expanded',String(open));
        fab.setAttribute('aria-label',open?'Tutup menu cepat':'Buka menu cepat');
        return;
      }
      if (typeof originalToggle==='function') originalToggle();
      const heading=$('quickMenu')?.querySelector('.quick-menu-heading');
      if (heading) heading.textContent=['master-items','wips','menus'].some((page)=>$('page-'+page)?.classList.contains('active'))?'MASTER BARANG':'GUEST OPERATIONAL';
    };

    const originalRun = root.runQuickAction;
    root.runQuickAction = function (action) {
      if (String(action).startsWith('stock-') || action==='daily-stock') {
        const menu=$('quickMenu'),backdrop=$('quickMenuBackdrop'),fab=$('fab');
        menu?.classList.remove('show'); backdrop?.classList.remove('show'); fab?.classList.remove('is-open');
        menu?.setAttribute('aria-hidden','true'); backdrop?.setAttribute('aria-hidden','true'); fab?.setAttribute('aria-expanded','false');
        runAction(action); return;
      }
      if (typeof originalRun==='function') originalRun(action);
    };

    document.addEventListener('click',handleClick);
    document.addEventListener('submit',handleSubmit);
    document.addEventListener('change',handleDateChange);
    document.addEventListener('change',(event)=>{ if (event.target.matches('#dsTransactionForm [name="itemId"]')) syncUnitOptions(); });
  }

  root.DailyStockUI = { initialize, renderPage, render, runAction, goToTransactionPage };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',installNavigation,{once:true});
  else installNavigation();
})(window);
