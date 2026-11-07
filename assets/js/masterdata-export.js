(function (root) {
  'use strict';

  const MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const DEFAULT_COLUMNS = {
    'master-items': [
      'id', 'scope_id', 'nama_barang', 'satuan_dasar', 'konversi_satuan', 'harga_referensi',
      'satuan_harga', 'harga_per_satuan_dasar', 'harga_beli_terakhir_per_satuan_dasar',
      'status', 'is_supply', 'created_at', 'updated_at'
    ],
    'wips': [
      'id', 'scope_id', 'nama_wip', 'satuan_hasil', 'hasil_per_batch', 'status', 'created_at', 'updated_at'
    ],
    'menus': [
      'id', 'scope_id', 'nama_menu', 'harga_jual', 'status', 'created_at', 'updated_at'
    ]
  };
  const FILES = {
    'master-items': {
      filename: 'Master Barang.xlsx',
      title: 'Master Barang',
      confirm: 'Seluruh data Master Barang pada scope aktif akan diekspor ke file Excel.'
    },
    'menus': {
      filename: 'Master Menu.xlsx',
      title: 'Master Menu',
      confirm: 'Seluruh data Master Menu pada scope aktif beserta detail resepnya akan diekspor ke file Excel.'
    },
    'wips': {
      filename: 'Resep WIP.xlsx',
      title: 'Resep WIP',
      confirm: 'Seluruh data Resep WIP pada scope aktif beserta detail resepnya akan diekspor ke file Excel.'
    }
  };

  function escapeXml(value) {
    const text = String(value == null ? '' : value);
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
      throw new Error('Ada karakter kontrol yang tidak didukung format Excel. Nilai tidak diubah; periksa data sumber.');
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function columnName(index) {
    let value = index + 1;
    let name = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function displayValue(value) {
    if (value == null) return '';
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) return JSON.stringify(value);
    return String(value);
  }

  function getColumns(rows, defaults) {
    const found = new Set(defaults || []);
    rows.forEach(function (row) {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        Object.keys(row).forEach(function (key) { found.add(key); });
      }
    });
    const columns = Array.from(found);
    if (columns.length > 16384) throw new Error('Jumlah kolom melebihi batas format Excel.');
    return columns;
  }

  function isIdColumn(key) {
    return key === 'id' || key === 'ID' || /(^|_)id$/i.test(key) || /_id_/i.test(key);
  }

  function isHiddenColumn(key) {
    return isIdColumn(key) || /(^|_)scope_id$/i.test(key) || key === 'konversi_satuan';
  }

  function isDateColumn(key) {
    return /(^|_)(created|updated|deleted|changed|tanggal|date|time|timestamp)(_|$)/i.test(key) || /_at$/i.test(key);
  }

  function isMoneyColumn(key) {
    return /(harga|price|hpp|cost|biaya|margin|amount|total_biaya|nilai)/i.test(key);
  }

  function cellXml(value, reference, key) {
    if (value == null) return '<c r="' + reference + '"/>';

    if (typeof value === 'number' && Number.isFinite(value) && !isIdColumn(key)) {
      const style = isMoneyColumn(key) ? ' s="2"' : ' s="3"';
      return '<c r="' + reference + '"' + style + '><v>' + String(value) + '</v></c>';
    }

    if (typeof value === 'boolean') {
      return '<c r="' + reference + '" t="b"><v>' + (value ? '1' : '0') + '</v></c>';
    }

    const text = displayValue(value);
    if (text.length > 32767) {
      throw new Error('Ada isi sel yang melebihi batas 32.767 karakter Excel pada kolom ' + key + '.');
    }
    const style = isDateColumn(key) ? ' s="4"' : '';
    return '<c r="' + reference + '" t="inlineStr"' + style + '><is><t xml:space="preserve">' + escapeXml(text) + '</t></is></c>';
  }

  function estimateWidth(rows, columns) {
    return columns.map(function (key) {
      let longest = String(key).length;
      rows.slice(0, 250).forEach(function (row) {
        const value = displayValue(row && row[key]);
        if (value.length > longest) longest = value.length;
      });
      return Math.max(12, Math.min(48, Math.ceil(longest * 1.05 + 2)));
    });
  }

  function buildSheetXml(sheet) {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    if (rows.length > 1048575) throw new Error('Jumlah baris melebihi batas satu sheet Excel.');
    const columns = getColumns(rows, sheet.columns || []);
    if (!columns.length) columns.push('Data');
    const widths = estimateWidth(rows, columns);
    const lastColumn = columnName(columns.length - 1);
    const allRows = [columns].concat(rows.map(function (row) {
      return columns.map(function (key) {
        return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : null;
      });
    }));
    const columnXml = widths.map(function (width, index) {
      const number = index + 1;
      const hidden = isHiddenColumn(columns[index]) ? ' hidden="1"' : '';
      return '<col min="' + number + '" max="' + number + '" width="' + width + '" customWidth="1"' + hidden + '/>';
    }).join('');
    const rowXml = allRows.map(function (values, rowIndex) {
      const cells = values.map(function (value, columnIndex) {
        const key = columns[columnIndex];
        const reference = columnName(columnIndex) + (rowIndex + 1);
        return rowIndex === 0
          ? '<c r="' + reference + '" t="inlineStr" s="1"><is><t xml:space="preserve">' + escapeXml(key) + '</t></is></c>'
          : cellXml(value, reference, key);
      }).join('');
      return '<row r="' + (rowIndex + 1) + '">' + cells + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="18"/><cols>' + columnXml + '</cols>' +
      '<sheetData>' + rowXml + '</sheetData>' +
      '<autoFilter ref="A1:' + lastColumn + (rows.length + 1) + '"/>' +
      '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>' +
      '</worksheet>';
  }

  function buildStylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00"/>' +
      '<numFmt numFmtId="165" formatCode="#,##0.####;[Red]-#,##0.####"/>' +
      '<numFmt numFmtId="166" formatCode="@"/></numFmts>' +
      '<fonts count="2"><font><sz val="10"/><name val="Aptos"/></font>' +
      '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF17172A"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE7E7E2"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) {
      crc ^= bytes[index];
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function write16(view, offset, value) { view.setUint16(offset, value, true); }
  function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

  function zipFiles(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    const now = new Date();
    const zipTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const zipDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    files.forEach(function (file) {
      const name = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      const checksum = crc32(data);
      const localHeader = new Uint8Array(30 + name.length);
      const localView = new DataView(localHeader.buffer);
      write32(localView, 0, 0x04034B50);
      write16(localView, 4, 20);
      write16(localView, 6, 0x0800);
      write16(localView, 8, 0);
      write16(localView, 10, zipTime);
      write16(localView, 12, zipDate);
      write32(localView, 14, checksum);
      write32(localView, 18, data.length);
      write32(localView, 22, data.length);
      write16(localView, 26, name.length);
      write16(localView, 28, 0);
      localHeader.set(name, 30);
      localParts.push(localHeader, data);

      const centralHeader = new Uint8Array(46 + name.length);
      const centralView = new DataView(centralHeader.buffer);
      write32(centralView, 0, 0x02014B50);
      write16(centralView, 4, 20);
      write16(centralView, 6, 20);
      write16(centralView, 8, 0x0800);
      write16(centralView, 10, 0);
      write16(centralView, 12, zipTime);
      write16(centralView, 14, zipDate);
      write32(centralView, 16, checksum);
      write32(centralView, 20, data.length);
      write32(centralView, 24, data.length);
      write16(centralView, 28, name.length);
      write16(centralView, 30, 0);
      write16(centralView, 32, 0);
      write16(centralView, 34, 0);
      write16(centralView, 36, 0);
      write32(centralView, 38, 0);
      write32(centralView, 42, localOffset);
      centralHeader.set(name, 46);
      centralParts.push(centralHeader);
      localOffset += localHeader.length + data.length;
    });

    const centralSize = centralParts.reduce(function (total, part) { return total + part.length; }, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    write32(endView, 0, 0x06054B50);
    write16(endView, 4, 0);
    write16(endView, 6, 0);
    write16(endView, 8, files.length);
    write16(endView, 10, files.length);
    write32(endView, 12, centralSize);
    write32(endView, 16, localOffset);
    write16(endView, 20, 0);
    return new Blob(localParts.concat(centralParts, end), { type: MIME_TYPE });
  }

  function makeWorkbookBlob(sheets) {
    if (!Array.isArray(sheets) || !sheets.length) throw new Error('Data export kosong.');
    const files = [];
    const sheetOverrides = sheets.map(function (_sheet, index) {
      return '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }).join('');
    files.push({ name: '[Content_Types].xml', content:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheetOverrides + '</Types>'
    });
    files.push({ name: '_rels/.rels', content:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
    });
    files.push({ name: 'xl/workbook.xml', content:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + sheets.map(function (sheet, index) {
        return '<sheet name="' + escapeXml(sheet.name.slice(0, 31)) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>';
      }).join('') + '</sheets></workbook>'
    });
    files.push({ name: 'xl/_rels/workbook.xml.rels', content:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (_sheet, index) {
        return '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>'
    });
    files.push({ name: 'xl/styles.xml', content: buildStylesXml() });
    sheets.forEach(function (sheet, index) {
      files.push({ name: 'xl/worksheets/sheet' + (index + 1) + '.xml', content: buildSheetXml(sheet) });
    });
    return zipFiles(files);
  }

  function buildSheets(page, payload) {
    const scopeId = String(payload.active_scope_id || '');
    if (!scopeId) throw new Error('Scope aktif tidak ditemukan pada data Master Data.');
    const inScope = function (row) { return row && String(row.scope_id) === scopeId; };
    const items = payload.masterItems.filter(inScope);
    const wips = payload.wips.filter(inScope);
    const menus = payload.menus.filter(inScope);
    const itemById = new Map(items.map(function (item) { return [String(item.id), item]; }));
    const wipById = new Map(wips.map(function (wip) { return [String(wip.id), wip]; }));

    if (page === 'master-items') {
      const conversions = [];
      items.forEach(function (item) {
        (Array.isArray(item.konversi_satuan) ? item.konversi_satuan : []).forEach(function (conversion) {
          const row = conversion && typeof conversion === 'object' && !Array.isArray(conversion)
            ? Object.assign({}, conversion)
            : { nilai_konversi: conversion };
          row.master_item_id = item.id;
          row.master_item_nama = item.nama_barang;
          conversions.push(row);
        });
      });
      return [
        { name: 'Master Barang', columns: DEFAULT_COLUMNS[page], rows: items },
        { name: 'Konversi Satuan', columns: ['master_item_id', 'master_item_nama'], rows: conversions }
      ];
    }

    if (page === 'wips') {
      const wipIds = new Set(wips.map(function (wip) { return String(wip.id); }));
      const lines = payload.wipRecipeLines.filter(function (line) { return line && wipIds.has(String(line.wip_id)); });
      const detailRows = lines.map(function (line) {
        const parent = wipById.get(String(line.wip_id));
        const component = line.component_type === 'wip'
          ? wipById.get(String(line.component_wip_id))
          : itemById.get(String(line.item_id));
        return Object.assign({}, line, {
          nama_wip: parent ? parent.nama_wip : '',
          nama_komponen: component ? (line.component_type === 'wip' ? component.nama_wip : component.nama_barang) : ''
        });
      });
      return [
        { name: 'Resep WIP', columns: DEFAULT_COLUMNS[page], rows: wips },
        { name: 'Detail Resep', columns: ['id', 'wip_id', 'nama_wip', 'component_type', 'item_id', 'component_wip_id', 'nama_komponen', 'qty_input', 'unit_input', 'qty_base'], rows: detailRows }
      ];
    }

    if (page === 'menus') {
      const menuIds = new Set(menus.map(function (menu) { return String(menu.id); }));
      const lines = payload.menuRecipeLines.filter(function (line) { return line && menuIds.has(String(line.menu_id)); });
      const menuById = new Map(menus.map(function (menu) { return [String(menu.id), menu]; }));
      const detailRows = lines.map(function (line) {
        const parent = menuById.get(String(line.menu_id));
        const component = line.component_type === 'wip'
          ? wipById.get(String(line.component_wip_id))
          : itemById.get(String(line.item_id));
        return Object.assign({}, line, {
          nama_menu: parent ? parent.nama_menu : '',
          nama_komponen: component ? (line.component_type === 'wip' ? component.nama_wip : component.nama_barang) : ''
        });
      });
      return [
        { name: 'Master Menu', columns: DEFAULT_COLUMNS[page], rows: menus },
        { name: 'Detail Resep', columns: ['id', 'menu_id', 'nama_menu', 'component_type', 'item_id', 'component_wip_id', 'nama_komponen', 'qty_input', 'unit_input', 'qty_base'], rows: detailRows }
      ];
    }

    throw new Error('Halaman export tidak dikenal.');
  }

  function validateSessionSame(before, after) {
    return before && after && before.generation === after.generation &&
      before.userId === after.userId && before.workspaceId === after.workspaceId &&
      before.divisionId === after.divisionId;
  }

  async function getFreshPayload() {
    const store = root.MasterDataStore;
    const auth = root.AppAuth;
    if (!store || !store.isReady || !store.isReady()) throw new Error('Master Data belum siap. Muat ulang halaman lalu coba lagi.');
    if (!auth || typeof auth.getClient !== 'function' || typeof auth.getContext !== 'function') throw new Error('Sesi akun tidak dapat diperiksa. Silakan masuk kembali.');

    const sessionBefore = await store.assertSession();
    const context = auth.getContext();
    const client = auth.getClient();
    if (!client || !context || context.userId !== sessionBefore.userId || context.workspaceId !== sessionBefore.workspaceId || context.activeDivisionId !== sessionBefore.divisionId) {
      throw new Error('Identitas akun atau workspace berubah. Export dibatalkan.');
    }

    const moduleKey = store.key();
    if (moduleKey !== 'master_data:' + sessionBefore.divisionId) throw new Error('Divisi Master Data tidak cocok. Export dibatalkan.');

    const result = await client.from('workspace_module_state').select('payload')
      .eq('workspace_id', sessionBefore.workspaceId)
      .eq('module_key', moduleKey)
      .eq('division_id', sessionBefore.divisionId)
      .maybeSingle();
    if (result.error) throw result.error;

    const sessionAfter = await store.assertSession();
    if (!validateSessionSame(sessionBefore, sessionAfter)) throw new Error('Sesi workspace berubah saat export. Silakan ulangi.');

    const latestContext = auth.getContext();
    if (!latestContext || latestContext.userId !== sessionBefore.userId || latestContext.workspaceId !== sessionBefore.workspaceId || latestContext.activeDivisionId !== sessionBefore.divisionId) {
      throw new Error('Workspace atau divisi berubah saat export. Silakan ulangi.');
    }

    const payload = result.data && result.data.payload ? result.data.payload : store.createEmpty();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Struktur data Master Data tidak valid.');
    const normalized = Object.assign(store.createEmpty(), payload);
    ['masterItems', 'wips', 'wipRecipeLines', 'menus', 'menuRecipeLines'].forEach(function (field) {
      if (normalized[field] === undefined) normalized[field] = [];
      if (!Array.isArray(normalized[field])) throw new Error('Struktur ' + field + ' tidak valid.');
    });
    return normalized;
  }

  function downloadBlob(blob, filename) {
    const url = root.URL.createObjectURL(blob);
    const anchor = root.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    root.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
  }

  async function exportPage(page, button) {
    const config = FILES[page];
    if (!config) return;
    if (!root.confirm('Download ' + config.title + '?\n\n' + config.confirm)) return;
    if (button && button.disabled) return;

    const originalText = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Menyiapkan...';
      button.setAttribute('aria-busy', 'true');
    }

    try {
      const payload = await getFreshPayload();
      const blob = makeWorkbookBlob(buildSheets(page, payload));
      downloadBlob(blob, config.filename);
      if (typeof root.toast === 'function') root.toast(config.filename + ' berhasil disiapkan.');
    } catch (error) {
      console.error('Master Data Excel export failed:', error);
      const message = error && error.message ? error.message : 'File Excel belum berhasil dibuat.';
      if (typeof root.toast === 'function') root.toast(message);
      else root.alert(message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
        button.removeAttribute('aria-busy');
      }
    }
  }

  function handleClick(event) {
    const button = event.target.closest('[data-export-excel]');
    if (!button) return;
    event.preventDefault();
    exportPage(button.dataset.exportExcel, button);
  }

  root.MasterDataExport = {
    buildSheets: buildSheets,
    makeWorkbookBlob: makeWorkbookBlob,
    exportPage: exportPage
  };
  root.document.addEventListener('click', handleClick);
})(window);
