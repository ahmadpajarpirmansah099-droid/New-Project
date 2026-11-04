(function (root) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
  const number = (value) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const dateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const state = { client:null, context:null, catalog:null, date:dateKey(), tab:'overview', data:null, busy:false, initialized:false };

  function stockKey(kind, id) { return kind + ':' + id; }
  function itemKind(item) { return item.is_supply ? 'supply' : 'material'; }
  function unitFactor(item, unit) {
    const row = (item.konversi_satuan || []).find((entry) => String(entry.unit).toUpperCase() === String(unit).toUpperCase());
    return row ? Number(row.factor) : 0;
  }
  function getItem(id) { return state.catalog.masterItems.find((item) => String(item.id) === String(id)); }
  function getWip(id) { return state.catalog.wips.find((item) => String(item.id) === String(id)); }
  function getMenu(id) { return state.catalog.menus.find((item) => String(item.id) === String(id)); }
  function activeWips() { return state.catalog.wips.filter((item) => item.status === 'active'); }
  function activeMenus() { return state.catalog.menus.filter((item) => item.status === 'active'); }
  function divisionIsService() { return String(state.context?.activeDivisionName || '').trim().toLowerCase() === 'service'; }
  function canUseSales() { return !divisionIsService(); }

  async function initialize() {
    const context = root.AppAuth?.getContext();
    const client = root.AppAuth?.getClient();
    if (!context || !client || !root.MasterDataStore?.isReady()) return false;
    state.context = context;
    state.client = client;
    state.catalog = root.MasterDataStore.load();
    state.initialized = true;
    return true;
  }

  async function load(date) {
    if (!state.initialized && !(await initialize())) throw new Error('Workspace belum siap. Muat ulang halaman.');
    state.date = date || state.date;
    const { workspaceId, activeDivisionId } = state.context;
    const [countResult, txResult, previousResult, historyResult] = await Promise.all([
      state.client.from('daily_stock_counts').select('*').eq('workspace_id', workspaceId).eq('division_id', activeDivisionId).eq('stock_date', state.date).maybeSingle(),
      state.client.from('inventory_transactions').select('*').eq('workspace_id', workspaceId).eq('division_id', activeDivisionId).eq('transaction_date', state.date).order('created_at', { ascending:false }),
      state.client.from('daily_stock_counts').select('id,stock_date,status').eq('workspace_id', workspaceId).eq('division_id', activeDivisionId).eq('status', 'closed').lt('stock_date', state.date).order('stock_date', { ascending:false }).limit(1).maybeSingle(),
      state.client.from('daily_stock_counts').select('id,stock_date,status,closed_at').eq('workspace_id', workspaceId).eq('division_id', activeDivisionId).order('stock_date', { ascending:false }).limit(30)
    ]);
    for (const result of [countResult, txResult, previousResult, historyResult]) if (result.error) throw result.error;
    const transactionIds = (txResult.data || []).map((row) => row.id);
    const [txLinesResult, countLinesResult, previousLinesResult] = await Promise.all([
      transactionIds.length ? state.client.from('inventory_transaction_lines').select('*').in('transaction_id', transactionIds) : Promise.resolve({ data:[], error:null }),
      countResult.data ? state.client.from('daily_stock_count_lines').select('*').eq('count_id', countResult.data.id).order('created_at') : Promise.resolve({ data:[], error:null }),
      previousResult.data ? state.client.from('daily_stock_count_lines').select('*').eq('count_id', previousResult.data.id) : Promise.resolve({ data:[], error:null })
    ]);
    for (const result of [txLinesResult, countLinesResult, previousLinesResult]) if (result.error) throw result.error;
    state.data = {
      count:countResult.data || null,
      transactions:txResult.data || [],
      transactionLines:txLinesResult.data || [],
      countLines:countLinesResult.data || [],
      previous:previousResult.data || null,
      previousLines:previousLinesResult.data || [],
      history:historyResult.data || [], date:state.date
    };
    if (state.data.count?.status === 'draft') await refreshDraftCountSnapshot();
    return state.data;
  }

  function catalogRows() {
    const items = state.catalog.masterItems.map((item) => ({
      key:stockKey(itemKind(item), item.id), kind:itemKind(item), id:item.id,
      name:item.nama_barang, unit:item.satuan_dasar, factor:1,
      cost:Number(item.harga_beli_terakhir_per_satuan_dasar || item.harga_per_satuan_dasar || 0),
      active:item.status === 'active'
    }));
    const wips = (divisionIsService() ? [] : state.catalog.wips).map((item) => ({
      key:stockKey('wip', item.id), kind:'wip', id:item.id,
      name:item.nama_wip, unit:item.satuan_hasil, factor:1,
      cost:Number(root.WipService?.calculateHpp(item.id)?.hpp_per_yield || 0),
      active:item.status === 'active'
    }));
    return items.concat(wips);
  }

  function movementsByKey() {
    const map = new Map();
    state.data.transactions.filter((tx) => tx.status === 'posted').forEach((tx) => {
      state.data.transactionLines.filter((line) => line.transaction_id === tx.id).forEach((line) => {
        const key = stockKey(line.stock_kind, line.stock_kind === 'wip' ? line.wip_recipe_id : line.item_id);
        const current = map.get(key) || { inbound:0, outbound:0 };
        if (line.direction === 'in') current.inbound += Number(line.base_quantity || 0);
        else current.outbound += Number(line.base_quantity || 0);
        map.set(key, current);
      });
    });
    return map;
  }

  async function refreshDraftCountSnapshot() {
    if (!state.data?.count || state.data.count.status !== 'draft') return;
    const movements = movementsByKey();
    const previous = new Map(state.data.previousLines.map((line) => [
      stockKey(line.stock_kind, line.stock_kind === 'wip' ? line.wip_recipe_id : line.item_id),
      Number(line.physical_closing_quantity || 0)
    ]));
    const existing = new Map(state.data.countLines.map((line) => [
      stockKey(line.stock_kind, line.stock_kind === 'wip' ? line.wip_recipe_id : line.item_id), line
    ]));
    const inserts = [];
    const updates = [];
    catalogRows().forEach((row) => {
      const movement = movements.get(row.key) || { inbound:0, outbound:0 };
      const snapshot = {
        opening_quantity:previous.has(row.key) ? previous.get(row.key) : 0,
        inbound_quantity:movement.inbound,
        outbound_quantity:movement.outbound
      };
      const line = existing.get(row.key);
      if (!line) {
        inserts.push({
          count_id:state.data.count.id, workspace_id:state.context.workspaceId,
          count_division_id:state.context.activeDivisionId, stock_division_id:state.context.activeDivisionId,
          stock_kind:row.kind, item_id:row.kind === 'wip' ? null : row.id,
          wip_recipe_id:row.kind === 'wip' ? row.id : null,
          unit_name_snapshot:row.unit, ...snapshot, unit_cost_snapshot:row.cost || null
        });
      } else if (
        Number(line.opening_quantity) !== snapshot.opening_quantity ||
        Number(line.inbound_quantity) !== snapshot.inbound_quantity ||
        Number(line.outbound_quantity) !== snapshot.outbound_quantity
      ) {
        updates.push(state.client.from('daily_stock_count_lines').update(snapshot).eq('id',line.id));
      }
    });
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
    if (inserts.length) {
      const result = await state.client.from('daily_stock_count_lines').insert(inserts);
      if (result.error) throw result.error;
    }
    if (updates.length || inserts.length) {
      const refreshed = await state.client.from('daily_stock_count_lines').select('*').eq('count_id',state.data.count.id).order('created_at');
      if (refreshed.error) throw refreshed.error;
      state.data.countLines = refreshed.data || [];
    }
  }

  function buildRows() {
    const movements = movementsByKey();
    const previous = new Map(state.data.previousLines.map((line) => [
      stockKey(line.stock_kind, line.stock_kind === 'wip' ? line.wip_recipe_id : line.item_id),
      Number(line.physical_closing_quantity || 0)
    ]));
    const saved = new Map(state.data.countLines.map((line) => [
      stockKey(line.stock_kind, line.stock_kind === 'wip' ? line.wip_recipe_id : line.item_id), line
    ]));
    return catalogRows().map((row) => {
      const movement = movements.get(row.key) || { inbound:0, outbound:0 };
      const opening = previous.has(row.key) ? previous.get(row.key) : 0;
      const expected = opening + movement.inbound - movement.outbound;
      const line = saved.get(row.key) || null;
      return Object.assign({}, row, {
        opening:line ? Number(line.opening_quantity) : opening,
        inbound:line ? Number(line.inbound_quantity) : movement.inbound,
        outbound:line ? Number(line.outbound_quantity) : movement.outbound,
        expected:line ? Number(line.expected_closing_quantity) : expected,
        physical:line && line.physical_closing_quantity != null ? Number(line.physical_closing_quantity) : '',
        variance:line && line.variance_quantity != null ? Number(line.variance_quantity) : null,
        lineId:line?.id || null
      });
    }).sort((a,b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'id'));
  }

  async function createCount() {
    if (state.data.count) return;
    const rows = buildRows();
    if (!rows.length) throw new Error('Belum ada barang, Supplies, atau WIP pada divisi ini.');
    const { data, error } = await state.client.from('daily_stock_counts').insert({
      workspace_id:state.context.workspaceId, division_id:state.context.activeDivisionId, stock_date:state.date
    }).select('*').single();
    if (error) throw error;
    const lines = rows.map((row) => ({
      count_id:data.id, workspace_id:state.context.workspaceId,
      count_division_id:state.context.activeDivisionId, stock_division_id:state.context.activeDivisionId,
      stock_kind:row.kind, item_id:row.kind === 'wip' ? null : row.id,
      wip_recipe_id:row.kind === 'wip' ? row.id : null,
      unit_name_snapshot:row.unit, opening_quantity:row.opening,
      inbound_quantity:row.inbound, outbound_quantity:row.outbound,
      unit_cost_snapshot:row.cost || null
    }));
    const inserted = await state.client.from('daily_stock_count_lines').insert(lines);
    if (inserted.error) {
      await state.client.from('daily_stock_counts').delete().eq('id', data.id);
      throw inserted.error;
    }
    await load(state.date);
  }

  async function savePhysicalCounts() {
    const inputs = Array.from($('dailyStockRows').querySelectorAll('[data-physical]'));
    const updates = inputs.map(async (input) => {
      const lineId = input.dataset.lineId;
      const value = input.value.trim();
      if (value === '') throw new Error('Isi stok fisik semua barang sebelum menyimpan.');
      const quantity = Number(value.replace(',', '.'));
      if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Stok fisik harus angka 0 atau lebih.');
      const result = await state.client.from('daily_stock_count_lines').update({ physical_closing_quantity:quantity }).eq('id', lineId);
      if (result.error) throw result.error;
    });
    await Promise.all(updates);
    await load(state.date);
  }

  async function closeCount() {
    if (!state.data.count || state.data.count.status !== 'draft') return;
    await savePhysicalCounts();
    const result = await state.client.from('daily_stock_counts').update({
      status:'closed', closed_by:state.context.userId, closed_at:new Date().toISOString()
    }).eq('id', state.data.count.id).eq('status','draft');
    if (result.error) throw result.error;
    await load(state.date);
  }

  function priceForItem(item) {
    const source = root.MasterDataService?.getPriceSource(item);
    return source ? Number(source.value) : null;
  }

  function materialLine(item, quantity, unit) {
    const factor = unitFactor(item, unit);
    if (!(factor > 0)) throw new Error('Satuan ' + unit + ' tidak tersedia pada ' + item.nama_barang + '.');
    return {
      stock_kind:itemKind(item), item_id:item.id, wip_recipe_id:null,
      direction:'out', quantity, unit_name_snapshot:unit,
      factor_to_base_snapshot:factor, unit_cost_snapshot:priceForItem(item)
    };
  }

  function wipLine(wip, quantity, direction) {
    return {
      stock_kind:'wip', item_id:null, wip_recipe_id:wip.id,
      direction, quantity, unit_name_snapshot:wip.satuan_hasil,
      factor_to_base_snapshot:1,
      unit_cost_snapshot:Number(root.WipService?.calculateHpp(wip.id)?.hpp_per_yield || 0) || null
    };
  }

  function buildTransactionLines(type, form) {
    const lines = [];
    if (type === 'purchase' || type === 'expense' || type === 'supply') {
      const item = getItem(form.itemId);
      if (!item) throw new Error('Pilih barang terlebih dahulu.');
      const quantity = Number(form.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Jumlah harus lebih besar dari 0.');
      const unit = form.unit || item.satuan_dasar;
      const factor = unitFactor(item, unit);
      if (!(factor > 0)) throw new Error('Satuan barang tidak valid.');
      const isSupply = Boolean(item.is_supply);
      if (type === 'supply' && !isSupply) throw new Error('Pilih barang yang ditandai sebagai Supplies.');
      if (type !== 'supply' && isSupply) throw new Error('Barang Supplies harus dicatat dari menu Supplies.');
      const direction = type === 'purchase' || (type === 'supply' && form.direction === 'in') ? 'in' : 'out';
      lines.push({
        stock_kind:isSupply ? 'supply' : 'material', item_id:item.id, wip_recipe_id:null,
        direction, quantity, unit_name_snapshot:unit, factor_to_base_snapshot:factor,
        unit_cost_snapshot:priceForItem(item)
      });
      return lines;
    }

    if (type === 'production') {
      const wip = getWip(form.wipId);
      const batches = Number(form.quantity);
      if (!wip || wip.status !== 'active') throw new Error('Pilih WIP aktif.');
      if (!Number.isFinite(batches) || batches <= 0) throw new Error('Jumlah batch harus lebih besar dari 0.');
      const recipe = state.catalog.wipRecipeLines.filter((line) => String(line.wip_id) === String(wip.id));
      if (!recipe.length) throw new Error('Resep WIP belum memiliki komponen.');
      recipe.forEach((line) => {
        const quantity = Number(line.qty_input) * batches;
        if (line.component_type === 'material') {
          const item = getItem(line.item_id);
          if (!item) throw new Error('Bahan resep tidak ditemukan.');
          lines.push(materialLine(item, quantity, line.unit_input));
        } else {
          const child = getWip(line.component_wip_id);
          if (!child) throw new Error('WIP turunan resep tidak ditemukan.');
          lines.push(wipLine(child, quantity, 'out'));
        }
      });
      lines.push(wipLine(wip, batches * Number(wip.hasil_per_batch), 'in'));
      return lines;
    }

    if (type === 'sale') {
      const menu = getMenu(form.menuId);
      const portions = Number(form.quantity);
      if (!menu || menu.status !== 'active') throw new Error('Pilih menu aktif.');
      if (!Number.isFinite(portions) || portions <= 0) throw new Error('Jumlah porsi harus lebih besar dari 0.');
      const recipe = state.catalog.menuRecipeLines.filter((line) => String(line.menu_id) === String(menu.id));
      if (!recipe.length) throw new Error('Komposisi menu belum diisi.');
      recipe.forEach((line) => {
        const quantity = Number(line.qty_input) * portions;
        if (line.component_type === 'material') {
          const item = getItem(line.item_id);
          if (!item) throw new Error('Bahan menu tidak ditemukan.');
          lines.push(materialLine(item, quantity, line.unit_input));
        } else {
          const wip = getWip(line.component_wip_id);
          if (!wip) throw new Error('WIP menu tidak ditemukan.');
          lines.push(wipLine(wip, quantity, 'out'));
        }
      });
      return lines;
    }
    throw new Error('Jenis transaksi tidak dikenali.');
  }

  async function postTransaction(type, form) {
    if (state.data?.count?.status === 'closed') throw new Error('Daily SO tanggal ini sudah ditutup. Catat transaksi pada tanggal operasional berikutnya.');
    const lines = buildTransactionLines(type, form);
    if (!lines.length) throw new Error('Transaksi tidak memiliki pergerakan stok.');
    const txType = type === 'production' ? 'wip_production' : type === 'sale' ? 'sale' :
      type === 'supply' ? (form.direction === 'in' ? 'supply_purchase' : 'supply_usage') : type;
    const header = await state.client.from('inventory_transactions').insert({
      workspace_id:state.context.workspaceId, division_id:state.context.activeDivisionId,
      transaction_date:state.date, transaction_type:txType, reference_code:form.reference || null,
      notes:form.notes || null
    }).select('*').single();
    if (header.error) throw header.error;
    const rows = lines.map((line) => Object.assign({}, line, {
      transaction_id:header.data.id, workspace_id:state.context.workspaceId,
      transaction_division_id:state.context.activeDivisionId,
      stock_division_id:state.context.activeDivisionId,
      notes:form.notes || null
    }));
    const inserted = await state.client.from('inventory_transaction_lines').insert(rows);
    if (inserted.error) {
      await state.client.from('inventory_transactions').delete().eq('id',header.data.id);
      throw inserted.error;
    }
    const posted = await state.client.from('inventory_transactions').update({
      status:'posted', posted_by:state.context.userId, posted_at:new Date().toISOString()
    }).eq('id',header.data.id).eq('status','draft');
    if (posted.error) {
      await state.client.from('inventory_transactions').delete().eq('id',header.data.id);
      throw posted.error;
    }
    await load(state.date);
  }

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
    const divisionPicker = (state.context.divisions || []).length > 1 ? '<label class="ds-division">Divisi aktif<select id="dailyStockDivision">' + divisionOptions + '</select></label>' : '';
    rootEl.innerHTML = '<div class="ds-page"><div class="ds-heading"><div><span class="ds-eyebrow">STOK OPERASIONAL</span><h1>Daily SO</h1><p>' + escapeHtml(state.context.activeDivisionName) + ' · ' + escapeHtml(state.context.workspaceRole) + '</p></div><span class="ds-status ' + status + '">' + (status === 'closed' ? 'Ditutup' : status === 'draft' ? 'Draft' : 'Belum dimulai') + '</span></div>' + divisionPicker + '<label class="ds-date">Tanggal operasional<input id="dailyStockDate" type="date" value="' + state.date + '"></label><div class="ds-summary"><div><small>Bahan</small><strong>' + counts.material + '</strong></div><div><small>WIP</small><strong>' + counts.wip + '</strong></div><div><small>Supplies</small><strong>' + counts.supply + '</strong></div></div><div class="ds-value-card"><small>Estimasi nilai stok sesuai saldo hitungan</small><strong>' + money(totalExpected) + '</strong><span>Nilai perkiraan dari harga Master Barang dan HPP WIP.</span></div><div class="ds-tabs"><button data-ds-action="tab" data-tab="overview" class="' + (state.tab === 'overview' ? 'active' : '') + '">Ringkasan</button><button data-ds-action="tab" data-tab="count" class="' + (state.tab === 'count' ? 'active' : '') + '">Hitung stok</button><button data-ds-action="tab" data-tab="transactions" class="' + (state.tab === 'transactions' ? 'active' : '') + '">Transaksi</button><button data-ds-action="tab" data-tab="history" class="' + (state.tab === 'history' ? 'active' : '') + '">Riwayat</button></div><section class="ds-panel" id="dsTabPanel">' + renderTabContent() + '</section><div id="dailyStockModal"></div></div>';
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

  function rowsCount(kind) { return catalogRows().filter((row) => row.kind === kind).length; }

  function renderForm(type) {
    if (!state.initialized) return;
    const modal = $('dailyStockModal');
    if (!modal) return;
    const items = state.catalog.masterItems.filter((item) => item.status === 'active');
    const materialItems = items.filter((item) => !item.is_supply);
    const supplyItems = items.filter((item) => item.is_supply);
    const itemOptions = (list) => list.map((item) => '<option value="' + item.id + '">' + escapeHtml(item.nama_barang) + '</option>').join('');
    let fields = '';
    let title = '';
    if (type === 'purchase') {
      title = 'Barang Masuk';
      fields = '<label>Barang<select name="itemId" required><option value="">Pilih bahan</option>' + itemOptions(materialItems) + '</select></label><label>Jumlah<input name="quantity" type="number" min="0.000001" step="any" required></label><label>Satuan<select name="unit" data-unit-select required></select></label>';
    } else if (type === 'expense') {
      title = 'Pengeluaran';
      fields = '<label>Barang<select name="itemId" required><option value="">Pilih bahan</option>' + itemOptions(materialItems) + '</select></label><label>Jumlah<input name="quantity" type="number" min="0.000001" step="any" required></label><label>Satuan<select name="unit" data-unit-select required></select></label>';
    } else if (type === 'supply') {
      title = 'Supplies';
      fields = '<label>Jenis catatan<select name="direction"><option value="in">Supplies masuk</option><option value="out">Supplies keluar</option></select></label><label>Barang<select name="itemId" required><option value="">Pilih Supplies</option>' + itemOptions(supplyItems) + '</select></label><label>Jumlah<input name="quantity" type="number" min="0.000001" step="any" required></label><label>Satuan<select name="unit" data-unit-select required></select></label>';
    } else if (type === 'production') {
      title = 'Produksi WIP';
      fields = '<label>Produk WIP<select name="wipId" required><option value="">Pilih WIP</option>' + activeWips().map((item) => '<option value="' + item.id + '">' + escapeHtml(item.nama_wip) + '</option>').join('') + '</select></label><label>Jumlah batch<input name="quantity" type="number" min="0.000001" step="any" required></label><p class="ds-field-help">Bahan dan WIP komponen akan dihitung dari resep yang tersimpan.</p>';
    } else if (type === 'sale') {
      title = 'Penjualan';
      fields = '<label>Menu<select name="menuId" required><option value="">Pilih menu</option>' + activeMenus().map((item) => '<option value="' + item.id + '">' + escapeHtml(item.nama_menu) + '</option>').join('') + '</select></label><label>Jumlah porsi<input name="quantity" type="number" min="1" step="1" required></label><p class="ds-field-help">Pemakaian bahan dan WIP dihitung dari komposisi menu.</p>';
    }
    modal.innerHTML = '<div class="ds-modal-backdrop" data-ds-action="close-form"></div><section class="ds-modal"><div class="ds-modal-head"><div><span class="ds-eyebrow">CATAT STOK</span><h2>' + title + '</h2></div><button type="button" data-ds-action="close-form" aria-label="Tutup">×</button></div><form id="dsTransactionForm" data-type="' + type + '">' + fields + '<label>Referensi <span>(opsional)</span><input name="reference" maxlength="80" placeholder="Nomor nota / keterangan"></label><label>Catatan <span>(opsional)</span><textarea name="notes" rows="2"></textarea></label><div class="ds-form-actions"><button type="button" class="ds-light" data-ds-action="close-form">Batal</button><button type="submit" class="ds-primary">Simpan transaksi</button></div></form></section>';
    const form = $('dsTransactionForm');
    const itemSelect = form?.querySelector('[name="itemId"]');
    if (itemSelect) itemSelect.addEventListener('change', syncUnitOptions);
    syncUnitOptions();
  }

  function syncUnitOptions() {
    const form = $('dsTransactionForm');
    if (!form) return;
    const item = getItem(form.elements.itemId?.value);
    const select = form.querySelector('[data-unit-select]');
    if (!select || !item) { if (select) select.innerHTML = '<option value="">Pilih barang dulu</option>'; return; }
    select.innerHTML = (item.konversi_satuan || []).map((unit) => '<option value="' + escapeHtml(unit.unit) + '">' + escapeHtml(unit.unit) + '</option>').join('');
    select.value = item.satuan_dasar;
  }

  async function runAction(action) {
    if (action === 'daily-stock') { await goToPage(); return; }
    if (action === 'stock-in') { await goToPage(); renderForm('purchase'); return; }
    if (action === 'stock-out') { await goToPage(); renderForm('expense'); return; }
    if (action === 'stock-supplies') { await goToPage(); renderForm('supply'); return; }
    if (action === 'stock-production' && canUseSales()) { await goToPage(); renderForm('production'); return; }
    if (action === 'stock-sale' && canUseSales()) { await goToPage(); renderForm('sale'); return; }
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
      if (action === 'tab') { state.tab = button.dataset.tab || 'overview'; render(); }
      else if (action === 'start-count') { await createCount(); state.tab='count'; render(); }
      else if (action === 'save-count') { await savePhysicalCounts(); render(); root.toast?.('Hitungan fisik tersimpan.'); }
      else if (action === 'close-count') {
        if (!root.confirm('Tutup Daily SO? Setelah ditutup, hitungan tidak bisa diedit.')) return;
        await closeCount(); render(); root.toast?.('Daily SO berhasil ditutup.');
      } else if (action === 'close-form') { $('dailyStockModal').innerHTML=''; }
      else if (action === 'open-history-date') {
        state.date = button.dataset.date; state.tab='count'; await load(state.date); render();
      }
    } catch (error) {
      console.error('Daily SO action failed:', error);
      root.toast?.(error.message || 'Aksi belum berhasil. Coba lagi.');
    }
  }

  async function handleSubmit(event) {
    const form = event.target.closest('#dsTransactionForm');
    if (!form) return;
    event.preventDefault();
    if (state.busy) return;
    state.busy = true;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true; button.textContent = 'Menyimpan...';
    try {
      const data = new FormData(form);
      const values = Object.fromEntries(data.entries());
      await postTransaction(form.dataset.type, values);
      $('dailyStockModal').innerHTML='';
      state.tab='transactions'; render();
      root.toast?.('Transaksi stok berhasil dicatat.');
    } catch (error) {
      console.error('Daily SO transaction failed:', error);
      root.toast?.(error.message || 'Transaksi belum berhasil disimpan.');
      button.disabled = false; button.textContent = 'Simpan transaksi';
    } finally { state.busy = false; }
  }

  async function handleDateChange(event) {
    if (event.target.id === 'dailyStockDivision') {
      const division = (state.context.divisions || []).find((item) => item.id === event.target.value);
      if (!division || division.id === state.context.activeDivisionId) return;
      try {
        state.context.activeDivisionId = division.id;
        state.context.activeDivisionName = division.name;
        await root.MasterDataStore.initialize(state.client,state.context.workspaceId,division.id);
        state.catalog = root.MasterDataStore.load();
        state.data = null;
        await load(state.date);
        render();
      } catch (error) { root.toast?.(error.message || 'Divisi tidak bisa diganti.'); }
      return;
    }
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

    const quickMenu = $('quickMenu');
    if (quickMenu) {
      const actions = [
        ['stock-in','Barang Masuk','M12 5v14m-7-7h14'],
        ['stock-out','Pengeluaran','M5 12h14'],
        ['stock-production','Produksi WIP','m12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5m-18 5 9 5 9-5'],
        ['stock-sale','Penjualan','M3 3h2l2 13h11l2-9H7'],
        ['stock-supplies','Supplies','M4 7h16v13H4zM8 7V4h8v3'],
        ['stock-history','Riwayat','M3 12a9 9 0 1 0 3-6.7M3 4v5h5m4-1v5l3 2']
      ];
      actions.forEach(([action,label,path]) => {
        const button = document.createElement('button');
        button.type='button'; button.className='quick-menu-item'; button.dataset.quickContext='stock';
        button.dataset.action='runQuickAction'; button.dataset.actionArgs=JSON.stringify([action]); button.dataset.stockAction=action;
        button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg><span>' + label + '</span><svg class="quick-menu-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
        quickMenu.appendChild(button);
      });
      ['guest','master'].forEach((contextName) => {
        const entry=document.createElement('button');
        entry.type='button'; entry.className='quick-menu-item'; entry.dataset.quickContext=contextName;
        entry.dataset.action='runQuickAction'; entry.dataset.actionArgs='["daily-stock"]';
        entry.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14H4V6a2 2 0 0 1 2-2h2M8 11h8M8 15h6"/></svg><span>Daily SO</span><svg class="quick-menu-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
        quickMenu.appendChild(entry);
      });
    }

    const originalGo = root.go;
    root.go = function (targetPage) {
      if (targetPage === 'daily-stock') {
        if (typeof originalGo === 'function') originalGo(targetPage);
        root.setWorkspaceHeader?.('daily-stock');
        root.MasterDataStore?.load();
        renderPage(targetPage);
        return;
      }
      if (typeof originalGo === 'function') originalGo(targetPage);
    };

    const originalHeader = root.setWorkspaceHeader;
    root.setWorkspaceHeader = function (targetPage) {
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
        menu.querySelectorAll('.quick-menu-item[data-quick-context="stock"]').forEach((item)=>{
          const unavailable=divisionIsService() && ['stock-sale','stock-production'].includes(item.dataset.stockAction);
          item.hidden=unavailable; item.style.display=unavailable?'none':'flex';
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

  root.addEventListener('app:auth-signed-out', function () {
    state.client=null; state.context=null; state.catalog=null; state.data=null;
    state.initialized=false; state.busy=false; state.tab='overview'; state.date=dateKey();
  });

  root.DailyStockUI = { initialize, renderPage, render, runAction };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',installNavigation,{once:true});
  else installNavigation();
})(window);
