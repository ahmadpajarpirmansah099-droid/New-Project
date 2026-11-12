(function(root) {
  'use strict';
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const sum = (rows, field) => rows.reduce((total, row) => total + number(row[field]), 0);
  const sorted = map => [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const present = value => value != null && value !== '' && Number.isFinite(Number(value));
  function monthBounds(date) {
    const month = date.slice(0, 7);
    const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
    return {start: month + '-01', end: month + '-' + days};
  }
  function validRange(start, end) {
    const valid = value => {
      const date = new Date(value + 'T12:00:00Z');
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    return valid(start) && valid(end) && start <= end && start.slice(0, 7) === end.slice(0, 7);
  }
  function add(map, row, fields) {
    if (!map.has(row.key)) map.set(row.key, {...row, ...Object.fromEntries(fields.map(field => [field, 0]))});
    const target = map.get(row.key);
    for (const field of fields) target[field] += number(row[field]);
    return target;
  }
  function salesLines(doc) {
    if (Array.isArray(doc.source_sales) && doc.source_sales.length) {
      return doc.source_sales.map(line => ({
        key: 's:' + line.menu_id, name: line.menu_name || line.menu_id, qty: number(line.qty),
        sales: present(line.gross_sales_snapshot) ? number(line.gross_sales_snapshot) : null,
        hpp: present(line.total_hpp_snapshot) ? number(line.total_hpp_snapshot) : null
      }));
    }
    const saved = doc.catalog_snapshot || {}, postings = doc.postings || [];
    let offset = 0;
    return (doc.lines || []).map(line => {
      const id = line.key.slice(2), menu = (saved.menus || []).find(row => row.id === id);
      const recipe = (saved.menuRecipeLines || []).filter(row => row.menu_id === id);
      const used = postings.slice(offset, offset + recipe.length);
      offset += recipe.length;
      const matched = recipe.length > 0 && used.length === recipe.length && recipe.every((row, i) =>
        used[i].key === (row.component_type === 'material' ? 'm:' + row.item_id : 'w:' + row.component_wip_id)) &&
        used.every(row => present(row.price) && number(row.qty) < 0);
      return {key: line.key, name: menu?.nama_menu || line.key, qty: number(line.qty),
        sales: present(menu?.harga_jual) ? number(line.qty) * number(menu.harga_jual) : null,
        hpp: matched ? used.reduce((total, row) => total - number(row.qty) * number(row.price), 0) : null};
    });
  }
  function supplyFlag(row, period, current) {
    if (typeof row.is_supply === 'boolean') return row.is_supply;
    const source = period?.physical_source_refs?.[row.key]?.source_kind;
    if (source === 'barapp_supplies_so') return true;
    if (source === 'cogs_daily_so') return false;
    return current.get(row.key)?.is_supply === true;
  }
  function monthlyStock(data, bounds, documents, periods, current) {
    const eligible = periods.filter(period => period.start <= bounds.start).sort((a, b) => a.start.localeCompare(b.start));
    const openingPeriod = eligible.at(-1) || periods.find(period => period.start.slice(0, 7) === bounds.start.slice(0, 7));
    if (!openingPeriod || openingPeriod.status === 'opening_pending' || (openingPeriod.status === 'closed' && openingPeriod.end < bounds.start)) return {rows: [], closed: false, available: false};
    const balances = {...openingPeriod.opening};
    const closing = periods.find(period => period.status === 'closed' && period.end === bounds.end);
    const catalog = new Map();
    for (const row of [...(closing ? [] : data.catalog || []), ...(openingPeriod.opening_catalog || [])]) catalog.set(row.key, row);
    // Reconstruct the calendar opening from the period covering the first day.
    for (const doc of documents) {
      const beforeMonth = doc.period_id === openingPeriod.id && doc.end >= openingPeriod.start && doc.end < bounds.start;
      const inMonth = doc.end >= bounds.start && doc.end <= bounds.end && doc.end >= openingPeriod.start;
      if (!beforeMonth && !inMonth) continue;
      for (const line of doc.postings || []) {
        balances[line.key] = number(balances[line.key]) + number(line.qty);
        catalog.set(line.key, {...catalog.get(line.key), ...line});
      }
    }
    const finalRows = new Map((closing?.result || []).map(row => [row.key, row]));
    for (const row of finalRows.values()) catalog.set(row.key, row);
    const rows = [];
    for (const [key, row] of catalog) {
      if (key.startsWith('s:') || row.error || supplyFlag(row, closing, current)) continue;
      const final = finalRows.get(key), system = number(balances[key]);
      const physical = closing && present(closing.physical?.[key]) ? number(closing.physical[key]) : null;
      const variance = physical === null ? null : physical - system;
      rows.push({...row, system, physical, variance,
        value: variance !== null && present(final?.price) ? variance * number(final.price) : null});
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, 'id'));
    return {rows, closed: !!closing, available: true, openingDate: openingPeriod.start,
      complete: !!closing && rows.every(row => row.value !== null), total: sum(rows, 'value')};
  }
  function build(data, start, end) {
    if (!validRange(start, end)) throw Error('Pilih tanggal dalam satu bulan kalender yang sama.');
    const state = data.state || {periods: [], documents: []};
    const periods = (state.periods || []).filter(period => period.status !== 'held');
    const periodIds = new Set(periods.map(period => period.id));
    const documents = (state.documents || []).filter(doc => !doc.void && periodIds.has(doc.period_id));
    const current = new Map((data.catalog || []).map(row => [row.key, row]));
    const sales = new Map(), production = new Map(), receipts = new Map(), expenses = new Map(), supplies = new Map();
    const days = [];
    for (let day = Number(start.slice(8)); day <= Number(end.slice(8)); day++) {
      days.push({date: start.slice(0, 8) + String(day).padStart(2, '0'), sales: 0, hpp: 0, receipt: 0, expense: 0, production: 0});
    }
    const byDate = new Map(days.map(day => [day.date, day]));
    let missingSales = 0, rangeSales = 0;
    for (const doc of documents) {
      const day = byDate.get(doc.end);
      if (!day) continue;
      if (doc.type === 'sales') {
        if (doc.start !== doc.end) rangeSales++;
        for (const line of salesLines(doc)) {
          const row = add(sales, line, ['qty', 'sales', 'hpp']);
          row.details = row.details || [];
          row.details.push({start: doc.start, end: doc.end, ...line});
          row.salesKnown = !!row.salesKnown || line.sales !== null;
          row.hppKnown = !!row.hppKnown || line.hpp !== null;
          row.missingSales = !!row.missingSales || line.sales === null;
          row.missingHpp = !!row.missingHpp || line.hpp === null;
          if (line.sales === null || line.hpp === null) missingSales++;
          day.sales += number(line.sales); day.hpp += number(line.hpp);
        }
      } else if (doc.type === 'receipt') {
        for (const line of doc.postings || []) {
          const value = number(line.qty) * number(line.price);
          const row = add(receipts, {...line, value}, ['qty', 'value']);
          row.details = row.details || [];
          row.details.push({...line, date: doc.end, value});
          day.receipt += value;
        }
      } else if (doc.type === 'expense' || doc.type === 'adjustment') {
        const category = doc.category || 'Lainnya';
        const row = add(expenses, {key: category, name: category}, ['value']);
        row.items = row.items || new Map();
        for (const line of doc.postings || []) {
          const qty = -number(line.qty), value = qty * number(line.price);
          row.value += value; day.expense += value;
          add(row.items, {...line, key: doc.end + ':' + line.key, date: doc.end, qty, value}, ['qty', 'value']);
        }
      } else if (doc.type === 'production') {
        const outputCosts = new Map();
        let cost = 0;
        for (const posting of doc.postings || []) {
          if (number(posting.qty) < 0) cost -= number(posting.qty) * number(posting.price);
          else if (posting.key.startsWith('w:')) {
            const row = add(outputCosts, {...posting, value: cost}, ['qty', 'value']);
            cost = 0;
            row.batches = (doc.lines || []).filter(line => line.key === posting.key).reduce((total, line) => total + number(line.qty), 0);
          }
        }
        for (const line of outputCosts.values()) {
          const row = add(production, {...line, transactions: 1}, ['qty', 'value', 'batches', 'transactions']);
          row.details = row.details || [];
          row.details.push({...line, date: doc.end});
          day.production += line.value;
        }
      }
    }
    for (const period of periods) {
      const day = byDate.get(period.end);
      if (!day || period.status !== 'closed') continue;
      for (const line of period.result || []) {
        if (!supplyFlag(line, period, current)) continue;
        const row = add(supplies, {...line, qty: line.variance, value: line.variance_value}, ['qty', 'value']);
        row.details = row.details || [];
        row.details.push({date: period.end, qty: number(line.variance), value: number(line.variance_value)});
        day.expense += number(line.variance_value);
      }
    }
    const bounds = monthBounds(start);
    return {start, end, bounds, days, sales: sorted(sales), production: sorted(production),
      receipts: sorted(receipts).filter(row => row.value !== 0),
      expenses: sorted(expenses).map(row => ({...row, items: sorted(row.items)})), supplies: sorted(supplies),
      monthly: monthlyStock(data, bounds, documents, periods, current), missingSales, rangeSales,
      totals: {sales: sum([...sales.values()], 'sales'), units: sum([...sales.values()], 'qty'),
        production: sum([...production.values()], 'value'), receipt: sum([...receipts.values()], 'value'),
        expense: sum([...expenses.values()], 'value'), supplies: sum([...supplies.values()], 'value')}};
  }
  root.StockDashboardModel = {build, validRange, monthBounds};
})(typeof window === 'undefined' ? globalThis : window);
