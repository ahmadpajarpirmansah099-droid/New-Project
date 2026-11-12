(function(root) {
  'use strict';
  const model = root.StockDashboardModel;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const number = value => Number(value).toLocaleString('id-ID', {maximumFractionDigits: 3});
  const money = (value, signed = false) => value == null ? '—' : (value < 0 ? '−' : signed && value > 0 ? '+' : '') + 'Rp' + Math.abs(value).toLocaleString('id-ID', {maximumFractionDigits: 0});
  const quantity = (value, unit = '', signed = false) => value == null ? '—' : (signed && value > 0 ? '+' : '') + number(value) + ' ' + escape(unit);
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const dateLabel = value => new Intl.DateTimeFormat('id-ID', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date(value + 'T12:00:00'));
  const monthLabel = value => new Intl.DateTimeFormat('id-ID', {month: 'long', year: 'numeric'}).format(new Date(value + 'T12:00:00'));
  const rangeLabel = (start, end) => start === end ? dateLabel(start) : dateLabel(start) + ' – ' + dateLabel(end);
  const calendarIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4m8-4v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg>';
  const series = [
    {key:'sales', name:'Total Sales', color:'#56751d', dash:[]},
    {key:'hpp', name:'HPP Menu Terjual', color:'#b06c20', dash:[6,3]},
    {key:'receipt', name:'Total Biaya Barang Masuk', color:'#3378b5', dash:[2,3]},
    {key:'expense', name:'Total Pengeluaran', color:'#b54860', dash:[8,3,2,3]},
    {key:'production', name:'Total Biaya Produksi', color:'#21867b', dash:[10,4]}
  ];
  const titles = {sales:'Total Sales', production:'Total Biaya Produksi', receipt:'Barang Masuk', expense:'Pengeluaran', supplies:'Pengeluaran Suplies', variance:'Selisih semua barang'};
  const page = () => document.getElementById('page-stock-dashboard');
  let range = null, report = null, snapshot = null, generation = 0, observer = null, dialog = null;
  function closeDialog() { if (dialog) { dialog.close(); dialog.remove(); dialog = null; } }
  function reset() {
    generation++; observer?.disconnect(); observer = null; closeDialog();
    range = null; report = null; snapshot = null;
    if (page()) page().innerHTML = '';
  }
  function header() {
    const context = root.AppAuth?.getContext();
    const scope = [context?.workspaceName, context?.activeDivisionName].filter(Boolean).join(' · ');
    return `<header class="sd-head"><div><h1>Dashboard Stock Opname</h1><p>${escape(scope)}</p></div><div class="sd-actions"><button type="button" data-sd="transactions">Transaksi</button><button type="button" data-sd="calendar" class="sd-icon-button" aria-label="Pilih periode dashboard">${calendarIcon}</button></div></header><div class="sd-period"><span>${escape(rangeLabel(range.start, range.end))}</span><button type="button" data-sd="refresh">Muat ulang</button></div>`;
  }
  async function show() {
    if (!root.StockOpnameService.dashboardAvailable()) return;
    range = range || model.monthBounds(today());
    const token = ++generation;
    observer?.disconnect(); closeDialog(); report = null; snapshot = null;
    page().innerHTML = header() + '<p class="sd-status" role="status">Memuat dashboard…</p>';
    try {
      const data = await root.StockOpnameService.readDashboard();
      if (token !== generation) return;
      snapshot = data; render();
    } catch (error) {
      if (token !== generation) return;
      page().innerHTML = header() + `<div class="sd-status" role="alert"><p>${escape(error.message)}</p><button type="button" data-sd="refresh">Coba lagi</button></div>`;
    }
  }
  function render() {
    report = model.build(snapshot, range.start, range.end);
    observer?.disconnect();
    const totals = report.totals;
    const cards = Object.keys(titles).map(key => {
      const value = key === 'variance' ? (report.monthly.complete ? report.monthly.total : null) : key === 'sales' && report.sales.length && !report.sales.some(row => row.salesKnown) ? null : totals[key];
      const meta = key === 'sales' ? number(totals.units) + ' menu terjual' : key === 'variance' ? monthLabel(range.start) + (report.monthly.closed ? ' · Akhir bulan' : ' · Sementara') : 'Lihat rincian';
      return `<button type="button" class="sd-card sd-card-${key}" data-sd-card="${key}"><span>${titles[key]}</span><strong>${money(value, key === 'variance' || key === 'supplies')}</strong><small>${escape(meta)}</small></button>`;
    }).join('');
    const notes = [];
    if (report.rangeSales) notes.push('Sales gabungan ditampilkan pada tanggal akhir catatan. Rentang asal tersedia di rincian Sales.');
    if (report.missingSales) notes.push('Sebagian harga Sales belum tersedia. Total memakai angka yang tersimpan.');
    page().innerHTML = header() + `<div class="sd-cards">${cards}</div><section class="sd-chart-panel" aria-label="Grafik transaksi dalam rupiah"><h2>Transaksi harian</h2><ul class="sd-legend">${series.map(line => `<li><span style="--sd-series:${line.color}"></span>${line.name}</li>`).join('')}</ul><div class="sd-chart-wrap"><canvas id="sdChart" tabindex="0" role="img" aria-label="Grafik lima garis dalam rupiah. Gunakan panah kiri dan kanan untuk melihat rincian tanggal."></canvas></div><div id="sdChartDetail" class="sd-chart-detail" aria-live="polite"></div>${notes.map(note => `<p class="sd-note">${note}</p>`).join('')}</section>`;
    drawChart();
    observer = new ResizeObserver(drawChart);
    observer.observe(page().querySelector('.sd-chart-wrap'));
  }
  function openDialog(title, content) {
    closeDialog();
    const previous = document.activeElement;
    dialog = document.createElement('dialog'); dialog.className = 'sd-dialog';
    dialog.setAttribute('aria-label', title);
    dialog.innerHTML = `<header><h2>${escape(title)}</h2><button type="button" data-sd-close>Tutup</button></header><div class="sd-dialog-body">${content}</div>`;
    document.body.appendChild(dialog);
    const current = dialog;
    current.addEventListener('close', () => { current.remove(); if (dialog === current) dialog = null; if (previous?.isConnected) previous.focus(); }, {once:true});
    current.addEventListener('click', event => { if (event.target === current || event.target.closest('[data-sd-close]')) current.close(); });
    current.showModal();
    return current;
  }
  const empty = '<p class="sd-status">Belum ada transaksi pada periode ini</p>';
  function metric(label, value) { return `<span><small>${escape(label)}</small><b>${value}</b></span>`; }
  function row(name, metrics, extra = '') { return `<li class="sd-detail-row"><div class="sd-item-name">${escape(name)}</div><div class="sd-metrics">${metrics}</div>${extra}</li>`; }
  function list(rows) { return rows.length ? `<ul class="sd-detail-list">${rows.join('')}</ul>` : empty; }
  function details(key) {
    if (!report) return;
    let content = '';
    if (key === 'sales') content = list(report.sales.map(item => row(item.name,
      metric('Terjual', quantity(item.qty)) + metric('Omzet', money(item.salesKnown ? item.sales : null)) + metric('HPP', money(item.hppKnown ? item.hpp : null)),
      (item.missingSales || item.missingHpp ? '<p class="sd-note">Harga tersimpan belum lengkap.</p>' : '') +
      `<details><summary>Catatan penjualan</summary>${list(item.details.map(line => row(rangeLabel(line.start, line.end), metric('Terjual', quantity(line.qty)) + metric('Omzet', money(line.sales)) + metric('HPP', money(line.hpp)))))}</details>`)));
    if (key === 'production') content = list(report.production.map(item => row(item.name, metric('Transaksi', number(item.transactions)) + metric('Batch', number(item.batches)) + metric('Biaya produksi', money(item.value)))));
    if (key === 'receipt') content = list(report.receipts.map((item, index) => `<li class="sd-detail-row"><button type="button" class="sd-item-link" data-sd-drill="${index}">${escape(item.name)}</button><div class="sd-metrics">${metric('Jumlah', quantity(item.qty, item.unit)) + metric('Nilai', money(item.value))}</div></li>`));
    if (key === 'expense') content = list(report.expenses.map((item, index) => row(item.name, metric('Total', money(item.value)), `<button type="button" data-sd-drill="${index}">Detail</button>`)));
    if (key === 'supplies') content = list(report.supplies.map(item => row(item.name, metric('Selisih', quantity(item.qty, item.unit, true)) + metric('Nilai selisih', money(item.value, true)))));
    if (key === 'variance') {
      const monthly = report.monthly;
      content = `<p class="sd-note">${escape(monthLabel(range.start))} · ${monthly.closed ? 'Opname akhir bulan' : 'Stok sistem sementara'}</p>`;
      if (monthly.openingDate > report.bounds.start) content += `<p class="sd-note">Stok awal tersedia mulai ${escape(dateLabel(monthly.openingDate))}.</p>`;
      if (!monthly.available) content += '<p class="sd-status">Stok awal bulan ini belum tersedia.</p>';
      else content += list(monthly.rows.map(item => row(item.name + (item.kind === 'wip' ? ' (WIP)' : ''),
        metric('Stok sistem', quantity(item.system, item.unit)) + (monthly.closed ? metric('Fisik akhir', quantity(item.physical, item.unit)) + metric('Selisih', quantity(item.variance, item.unit, true)) + metric('Nilai selisih', money(item.value, true)) : ''))));
    }
    const current = openDialog(titles[key], content);
    current.addEventListener('click', event => {
      const target = event.target.closest('[data-sd-drill]');
      if (!target) return;
      const item = (key === 'receipt' ? report.receipts : report.expenses)[Number(target.dataset.sdDrill)];
      const rows = key === 'receipt' ? item.details : item.items;
      current.querySelector('h2').textContent = item.name;
      current.querySelector('.sd-dialog-body').innerHTML = '<button type="button" data-sd-back>Kembali</button>' + list(rows.map(line => row(line.name, metric('Tanggal', escape(dateLabel(line.date))) + metric('Jumlah', quantity(line.qty, line.unit)) + (key === 'receipt' ? metric('Nilai', money(line.value)) : ''))));
      current.querySelector('[data-sd-back]').addEventListener('click', () => {
        current.querySelector('h2').textContent = titles[key];
        current.querySelector('.sd-dialog-body').innerHTML = content;
        current.querySelector('[data-sd-drill]')?.focus();
      });
      current.querySelector('[data-sd-back]').focus();
    });
  }
  function calendar() {
    if (!range) return;
    let month = range.start.slice(0, 7), start = range.start, end = range.end, selectingEnd = false;
    const current = openDialog('Pilih periode', '<div class="sd-calendar-nav"><button type="button" data-sd-month="-1" aria-label="Bulan sebelumnya">‹</button><strong></strong><button type="button" data-sd-month="1" aria-label="Bulan berikutnya">›</button></div><div class="sd-calendar-grid"></div><p class="sd-calendar-selected" aria-live="polite"></p><div class="sd-calendar-actions"><button type="button" data-sd-full>Seluruh bulan</button><button type="button" class="sd-primary" data-sd-apply>Terapkan</button></div>');
    current.classList.add('sd-calendar');
    function draw() {
      const bounds = model.monthBounds(month + '-01');
      current.querySelector('.sd-calendar-nav strong').textContent = monthLabel(bounds.start);
      const offset = (new Date(bounds.start + 'T12:00:00').getDay() + 6) % 7;
      let cells = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'].map(day => `<span>${day}</span>`).join('') + '<span></span>'.repeat(offset);
      for (let day = 1; day <= Number(bounds.end.slice(8)); day++) {
        const value = month + '-' + String(day).padStart(2, '0');
        const selected = value >= start && value <= end;
        cells += `<button type="button" data-sd-day="${value}" class="${selected ? 'is-range' : ''} ${value === start || value === end ? 'is-selected' : ''}" aria-label="${escape(dateLabel(value))}" aria-pressed="${selected}">${day}</button>`;
      }
      current.querySelector('.sd-calendar-grid').innerHTML = cells;
      current.querySelector('.sd-calendar-selected').textContent = rangeLabel(start, end);
    }
    current.addEventListener('click', event => {
      const target = event.target.closest('button'); if (!target) return;
      if (target.dataset.sdMonth) {
        const cursor = new Date(month + '-01T12:00:00'); cursor.setMonth(cursor.getMonth() + Number(target.dataset.sdMonth));
        month = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0');
        ({start, end} = model.monthBounds(month + '-01')); selectingEnd = false; draw();
      }
      if (target.dataset.sdDay) {
        const value = target.dataset.sdDay;
        if (selectingEnd) { end = value; if (end < start) [start, end] = [end, start]; selectingEnd = false; }
        else { start = end = value; selectingEnd = true; }
        draw(); current.querySelector(`[data-sd-day="${value}"]`).focus();
      }
      if (target.hasAttribute('data-sd-full')) { ({start, end} = model.monthBounds(month + '-01')); selectingEnd = false; draw(); }
      if (target.hasAttribute('data-sd-apply') && model.validRange(start, end)) {
        range = {start, end}; current.close();
        if (snapshot) render(); else show();
      }
    });
    draw();
  }
  function chartDetail(index) {
    const day = report?.days[index], node = document.getElementById('sdChartDetail');
    if (!day || !node) return;
    node.innerHTML = `<strong>${escape(dateLabel(day.date))}</strong><div>${series.map(line => metric(line.name, money(day[line.key], line.key === 'expense'))).join('')}</div>`;
  }
  function drawChart() {
    const canvas = document.getElementById('sdChart'); if (!canvas || !report) return;
    const width = canvas.parentElement.clientWidth, height = 270, scale = root.devicePixelRatio || 1;
    if (!width) return;
    canvas.width = width * scale; canvas.height = height * scale;
    const context = canvas.getContext('2d'); context.scale(scale, scale);
    const left = 60, right = width - 16, top = 14, bottom = height - 30;
    const values = report.days.flatMap(day => series.map(line => day[line.key]));
    const min = Math.min(0, ...values), max = Math.max(1, ...values), span = max - min;
    const x = index => report.days.length === 1 ? (left + right) / 2 : left + index * (right - left) / (report.days.length - 1);
    const y = value => bottom - (value - min) / span * (bottom - top);
    context.font = '11px sans-serif'; context.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const value = min + span * i / 4, position = y(value);
      context.strokeStyle = '#e4e8de'; context.beginPath(); context.moveTo(left, position); context.lineTo(right, position); context.stroke();
      context.fillStyle = '#586557'; context.fillText(new Intl.NumberFormat('id-ID', {notation:'compact', maximumFractionDigits:1}).format(value), left - 8, position + 4);
    }
    context.textAlign = 'center';
    for (let i = 0; i < report.days.length; i++) {
      if (i % Math.max(1, Math.ceil(report.days.length / 6)) === 0 || i === report.days.length - 1) context.fillText(String(Number(report.days[i].date.slice(8))), x(i), height - 9);
    }
    for (const line of series) {
      context.strokeStyle = line.color; context.fillStyle = line.color; context.lineWidth = 2; context.setLineDash(line.dash); context.beginPath();
      report.days.forEach((day, i) => { if (i) context.lineTo(x(i), y(day[line.key])); else context.moveTo(x(i), y(day[line.key])); });
      context.stroke(); context.setLineDash([]);
      report.days.forEach((day, i) => { context.beginPath(); context.arc(x(i), y(day[line.key]), 2.5, 0, Math.PI * 2); context.fill(); });
    }
    let selected = report.days.length - 1;
    canvas.onpointermove = event => {
      selected = Math.max(0, Math.min(report.days.length - 1, Math.round((event.clientX - canvas.getBoundingClientRect().left - left) / (right - left) * (report.days.length - 1)))); chartDetail(selected);
    };
    canvas.onkeydown = event => { if (!['ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault(); selected = Math.max(0, Math.min(report.days.length - 1, selected + (event.key === 'ArrowRight' ? 1 : -1))); chartDetail(selected); };
    chartDetail(selected);
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-sd], [data-sd-card]'); if (!target) return;
    if (target.dataset.sdCard) details(target.dataset.sdCard);
    if (target.dataset.sd === 'calendar') calendar();
    if (target.dataset.sd === 'refresh') show();
    if (target.dataset.sd === 'transactions') root.go('stock-opname');
    if (target.dataset.sd === 'open') root.go('stock-dashboard');
  });
  root.StockDashboardUI = {show, reset};
})(window);
