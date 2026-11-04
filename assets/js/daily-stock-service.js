(function (root) {
  'use strict';

  const dateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const state = { client:null, context:null, catalog:null, date:dateKey(), expenseDate:dateKey(), tab:'overview', data:null, busy:false, initialized:false };
  let sessionGeneration = 0, dataLoadGeneration = 0, sessionAbortController = null;

  function assertDailyCurrent(expectedGeneration, expectedClient, expectedContext) {
    if (expectedGeneration !== sessionGeneration || expectedClient !== state.client || expectedContext !== state.context || !expectedClient || !expectedContext) {
      throw new Error('Sesi workspace berubah. Operasi Daily SO dibatalkan.');
    }
  }

  async function verifyDailySession(expectedGeneration = sessionGeneration) {
    const capturedClient = state.client, capturedContext = state.context;
    assertDailyCurrent(expectedGeneration, capturedClient, capturedContext);
    if (!root.MasterDataStore?.isReady() || typeof root.MasterDataStore.assertSession !== 'function') {
      throw new Error('Sesi Master Data belum siap. Muat ulang halaman.');
    }
    const verified = await root.MasterDataStore.assertSession();
    assertDailyCurrent(expectedGeneration, capturedClient, capturedContext);
    if (!verified || verified.userId !== capturedContext.userId || verified.workspaceId !== capturedContext.workspaceId || verified.divisionId !== capturedContext.activeDivisionId) {
      throw new Error('Identitas akun, workspace, atau divisi tidak cocok. Operasi Daily SO diblokir.');
    }
    return { generation: expectedGeneration, client: capturedClient, context: capturedContext };
  }

  function dailyQuery(table, expectedGeneration = sessionGeneration) {
    assertDailyCurrent(expectedGeneration, state.client, state.context);
    const query = state.client.from(table);
    if (sessionAbortController && typeof query?.abortSignal === 'function') return query.abortSignal(sessionAbortController.signal);
    return query;
  }

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
  // Sales and WIP production are available to every division, including Service.
  function canUseSales() { return true; }

  async function initialize() {
    const context = root.AppAuth?.getContext(), client = root.AppAuth?.getClient();
    if (!context || !client || !root.MasterDataStore?.isReady()) return false;
    if (sessionAbortController) sessionAbortController.abort();
    sessionGeneration += 1;
    const generation = sessionGeneration;
    dataLoadGeneration += 1;
    sessionAbortController = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    state.context = context; state.client = client; state.catalog = null; state.data = null; state.initialized = false;
    const verified = await root.MasterDataStore.assertSession();
    assertDailyCurrent(generation, client, context);
    if (!verified || verified.userId !== context.userId || verified.workspaceId !== context.workspaceId || verified.divisionId !== context.activeDivisionId) {
      throw new Error('Identitas akun, workspace, atau divisi tidak cocok. Akses Daily SO diblokir.');
    }
    state.catalog = root.MasterDataStore.load();
    state.initialized = true;
    return true;
  }

  async function load(date) {
    if (!state.initialized && !(await initialize())) throw new Error('Workspace belum siap. Muat ulang halaman.');
    const guard = await verifyDailySession();
    const loadGeneration = ++dataLoadGeneration;
    state.date = date || state.date;
    const requestedDate = state.date;
    const { workspaceId, activeDivisionId } = guard.context;
    const [countResult, txResult, previousResult, historyResult] = await Promise.all([
      dailyQuery('daily_stock_counts', guard.generation).select('*').eq('workspace_id', workspaceId).eq('division_id', activeDivisionId).eq('stock_date', requestedDate).maybeSingle(),
      dailyQuery('inventory_transactions', guard.generation).select('*').eq('workspace_id', workspaceId).eq('division_id', activeDivisionId).eq('transaction_date', requestedDate).order('created_at', { ascending:false }),
      dailyQuery('daily_stock_counts', guard.generation).select('id,stock_date,status').eq('workspace_id', workspaceId).eq('division_id', activeDivisionId).eq('status', 'closed').lt('stock_date', requestedDate).order('stock_date', { ascending:false }).limit(1).maybeSingle(),
      dailyQuery('daily_stock_counts', guard.generation).select('id,stock_date,status,closed_at').eq('workspace_id', workspaceId).eq('division_id', activeDivisionId).order('stock_date', { ascending:false }).limit(30)
    ]);
    for (const result of [countResult, txResult, previousResult, historyResult]) if (result.error) throw result.error;
    await verifyDailySession(guard.generation);
    if (loadGeneration !== dataLoadGeneration || state.date !== requestedDate) throw new Error('Tanggal Daily SO berubah. Pemuatan lama dibatalkan.');

    const transactionIds = (txResult.data || []).map((row) => row.id);
    const [txLinesResult, countLinesResult, previousLinesResult] = await Promise.all([
      transactionIds.length ? dailyQuery('inventory_transaction_lines', guard.generation).select('*').in('transaction_id', transactionIds) : Promise.resolve({ data:[], error:null }),
      countResult.data ? dailyQuery('daily_stock_count_lines', guard.generation).select('*').eq('count_id', countResult.data.id).order('created_at') : Promise.resolve({ data:[], error:null }),
      previousResult.data ? dailyQuery('daily_stock_count_lines', guard.generation).select('*').eq('count_id', previousResult.data.id) : Promise.resolve({ data:[], error:null })
    ]);
    for (const result of [txLinesResult, countLinesResult, previousLinesResult]) if (result.error) throw result.error;
    await verifyDailySession(guard.generation);
    if (loadGeneration !== dataLoadGeneration || state.date !== requestedDate) throw new Error('Tanggal Daily SO berubah. Pemuatan lama dibatalkan.');

    state.data = {
      count:countResult.data || null, transactions:txResult.data || [], transactionLines:txLinesResult.data || [],
      countLines:countLinesResult.data || [], previous:previousResult.data || null, previousLines:previousLinesResult.data || [],
      history:historyResult.data || [], date:requestedDate
    };
    if (state.data.count?.status === 'draft') await refreshDraftCountSnapshot();
    await verifyDailySession(guard.generation);
    if (loadGeneration !== dataLoadGeneration) throw new Error('Pemuatan Daily SO sudah digantikan proses terbaru.');
    return state.data;
  }

  function catalogRows() {
    const items = state.catalog.masterItems.filter((item) => item.status === 'active').map((item) => ({
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
    const guard = await verifyDailySession();
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
    const activeKeys = new Set(catalogRows().map((row) => row.key));
    const removals = state.data.countLines.filter((line) => {
      const key = stockKey(line.stock_kind, line.stock_kind === 'wip' ? line.wip_recipe_id : line.item_id);
      return !activeKeys.has(key);
    });
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
        updates.push(dailyQuery('daily_stock_count_lines', guard.generation).update(snapshot).eq('id',line.id));
      }
    });
    await verifyDailySession(guard.generation);
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
    await verifyDailySession(guard.generation);
    const removed = await Promise.all(removals.map((line) =>
      dailyQuery('daily_stock_count_lines', guard.generation).delete().eq('id', line.id)
    ));
    const removalError = removed.find((result) => result.error);
    if (removalError) throw removalError.error;
    await verifyDailySession(guard.generation);
    if (inserts.length) {
      const result = await dailyQuery('daily_stock_count_lines', guard.generation).insert(inserts);
      if (result.error) throw result.error;
    }
    await verifyDailySession(guard.generation);
    if (updates.length || inserts.length || removals.length) {
      const refreshed = await dailyQuery('daily_stock_count_lines', guard.generation).select('*').eq('count_id',state.data.count.id).order('created_at');
      if (refreshed.error) throw refreshed.error;
      await verifyDailySession(guard.generation);
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
    const guard = await verifyDailySession();
    if (state.data.count) return;
    const rows = buildRows();
    if (!rows.length) throw new Error('Belum ada barang, Supplies, atau WIP pada divisi ini.');
    await verifyDailySession(guard.generation);
    const { data, error } = await dailyQuery('daily_stock_counts', guard.generation).insert({
      workspace_id:state.context.workspaceId, division_id:state.context.activeDivisionId, stock_date:state.date
    }).select('*').single();
    if (error) throw error;
    await verifyDailySession(guard.generation);
    const lines = rows.map((row) => ({
      count_id:data.id, workspace_id:state.context.workspaceId,
      count_division_id:state.context.activeDivisionId, stock_division_id:state.context.activeDivisionId,
      stock_kind:row.kind, item_id:row.kind === 'wip' ? null : row.id,
      wip_recipe_id:row.kind === 'wip' ? row.id : null,
      unit_name_snapshot:row.unit, opening_quantity:row.opening,
      inbound_quantity:row.inbound, outbound_quantity:row.outbound,
      unit_cost_snapshot:row.cost || null
    }));
    await verifyDailySession(guard.generation);
    const inserted = await dailyQuery('daily_stock_count_lines', guard.generation).insert(lines);
    if (inserted.error) {
      try {
        await verifyDailySession(guard.generation);
        await dailyQuery('daily_stock_counts', guard.generation).delete().eq('id', data.id);
      } catch (sessionError) {
        console.warn('Daily SO draft cleanup skipped after workspace session change.');
      }
      throw inserted.error;
    }
    await load(state.date);
  }

  async function savePhysicalCounts(entries) {
    const guard = await verifyDailySession();
    const updates = (entries || []).map(async (entry) => {
      const lineId = entry.lineId;
      const value = String(entry.value == null ? '' : entry.value).trim();
      if (value === '') throw new Error('Isi stok fisik semua barang sebelum menyimpan.');
      const quantity = Number(value.replace(',', '.'));
      if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Stok fisik harus angka 0 atau lebih.');
      await verifyDailySession(guard.generation);
      const result = await dailyQuery('daily_stock_count_lines', guard.generation).update({ physical_closing_quantity:quantity }).eq('id', lineId);
      if (result.error) throw result.error;
    });
    await Promise.all(updates);
    await verifyDailySession(guard.generation);
    await load(state.date);
  }

  async function closeCount(entries) {
    const guard = await verifyDailySession();
    if (!state.data.count || state.data.count.status !== 'draft') return;
    const countId = state.data.count.id;
    await savePhysicalCounts(entries);
    await verifyDailySession(guard.generation);
    const result = await dailyQuery('daily_stock_counts', guard.generation).update({
      status:'closed', closed_by:state.context.userId, closed_at:new Date().toISOString()
    }).eq('id', countId).eq('status','draft');
    if (result.error) throw result.error;
    await verifyDailySession(guard.generation);
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
    const guard = await verifyDailySession();
    if (state.data?.count?.status === 'closed') throw new Error('Daily SO tanggal ini sudah ditutup. Catat transaksi pada tanggal operasional berikutnya.');
    const lines = buildTransactionLines(type, form);
    if (!lines.length) throw new Error('Transaksi tidak memiliki pergerakan stok.');
    await verifyDailySession(guard.generation);
    const txType = type === 'production' ? 'wip_production' : type === 'sale' ? 'sale' :
      type === 'supply' ? (form.direction === 'in' ? 'supply_purchase' : 'supply_usage') : type;
    const header = await dailyQuery('inventory_transactions', guard.generation).insert({
      workspace_id:state.context.workspaceId, division_id:state.context.activeDivisionId,
      transaction_date:state.date, transaction_type:txType, reference_code:form.reference || null,
      expense_category:type === 'expense' ? (form.category || null) : null,
      notes:form.notes || null
    }).select('*').single();
    if (header.error) throw header.error;
    await verifyDailySession(guard.generation);
    const rows = lines.map((line) => Object.assign({}, line, {
      transaction_id:header.data.id, workspace_id:state.context.workspaceId,
      transaction_division_id:state.context.activeDivisionId,
      stock_division_id:state.context.activeDivisionId,
      notes:form.notes || null
    }));
    await verifyDailySession(guard.generation);
    const inserted = await dailyQuery('inventory_transaction_lines', guard.generation).insert(rows);
    if (inserted.error) {
      try {
        await verifyDailySession(guard.generation);
        await dailyQuery('inventory_transactions', guard.generation).delete().eq('id',header.data.id);
      } catch (sessionError) {
        console.warn('Transaction cleanup skipped after workspace session change.');
      }
      throw inserted.error;
    }
    await verifyDailySession(guard.generation);
    const posted = await dailyQuery('inventory_transactions', guard.generation).update({
      status:'posted', posted_by:state.context.userId, posted_at:new Date().toISOString()
    }).eq('id',header.data.id).eq('status','draft');
    if (posted.error) {
      try {
        await verifyDailySession(guard.generation);
        await dailyQuery('inventory_transactions', guard.generation).delete().eq('id',header.data.id);
      } catch (sessionError) {
        console.warn('Transaction cleanup skipped after workspace session change.');
      }
      throw posted.error;
    }
    await verifyDailySession(guard.generation);
    await load(state.date);
  }

  async function fetchTransactionHistory(date, transactionTypes) {
    const guard = await verifyDailySession();
    const types = Array.isArray(transactionTypes) ? transactionTypes.filter(Boolean) : [];
    if (!types.length) return { transactions:[], linesByTransaction:new Map() };
    const result = await dailyQuery('inventory_transactions', guard.generation).select('*')
      .eq('workspace_id', state.context.workspaceId).eq('division_id', state.context.activeDivisionId)
      .in('transaction_type', types).eq('transaction_date', date)
      .neq('status', 'void').order('created_at', { ascending:false });
    if (result.error) throw result.error;
    await verifyDailySession(guard.generation);
    const transactions = result.data || [];
    if (!transactions.length) return { transactions, linesByTransaction:new Map() };
    const ids = transactions.map((tx) => tx.id);
    const linesResult = await dailyQuery('inventory_transaction_lines', guard.generation).select('*').in('transaction_id', ids);
    if (linesResult.error) throw linesResult.error;
    await verifyDailySession(guard.generation);
    const linesByTransaction = new Map();
    (linesResult.data || []).forEach((line) => {
      const rows = linesByTransaction.get(line.transaction_id) || [];
      rows.push(line);
      linesByTransaction.set(line.transaction_id, rows);
    });
    return { transactions, linesByTransaction };
  }

  async function fetchExpenseHistory(date) {
    return fetchTransactionHistory(date, ['expense']);
  }

  async function switchDivision(divisionId) {
    const division = (state.context.divisions || []).find((item) => item.id === divisionId);
    if (!division || division.id === state.context.activeDivisionId) return false;

    const context = state.context, client = state.client;
    sessionGeneration += 1;
    const switchGeneration = sessionGeneration;
    dataLoadGeneration += 1;
    if (sessionAbortController) sessionAbortController.abort();
    sessionAbortController = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    state.initialized = false;
    state.data = null;
    context.activeDivisionId = division.id;
    context.activeDivisionName = division.name;

    await root.MasterDataStore.initialize(client, context.workspaceId, division.id);
    assertDailyCurrent(switchGeneration, client, context);
    const verified = await root.MasterDataStore.assertSession();
    assertDailyCurrent(switchGeneration, client, context);
    if (!verified || verified.userId !== context.userId || verified.workspaceId !== context.workspaceId || verified.divisionId !== division.id) {
      throw new Error('Identitas akun atau divisi tidak cocok. Pergantian divisi diblokir.');
    }
    state.catalog = root.MasterDataStore.load();
    state.initialized = true;
    await load(state.date);
    await verifyDailySession(switchGeneration);
    return true;
  }

  root.addEventListener('app:auth-signed-out', function () {
    sessionGeneration += 1;
    dataLoadGeneration += 1;
    if (sessionAbortController) sessionAbortController.abort();
    sessionAbortController = null;
    state.client=null; state.context=null; state.catalog=null; state.data=null;
    state.initialized=false; state.busy=false; state.tab='overview'; state.date=dateKey();
  });

  root.DailyStockService = {
    state, dateKey,
    verifyDailySession, dailyQuery, stockKey, itemKind, unitFactor, getItem, getWip, getMenu,
    activeWips, activeMenus, divisionIsService, canUseSales,
    initialize, load, catalogRows, movementsByKey, refreshDraftCountSnapshot,
    buildRows, createCount, savePhysicalCounts, closeCount,
    priceForItem, materialLine, wipLine, buildTransactionLines, postTransaction,
    fetchTransactionHistory, fetchExpenseHistory, switchDivision
  };
})(window);
