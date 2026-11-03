'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appPath = path.join(__dirname, '..', 'assets', 'js', 'app.js');
const appSource = fs.readFileSync(appPath, 'utf8');
const helperStart = appSource.indexOf('function sanitizeCSVText(value) {');
const exportStart = appSource.indexOf('function exportCSV() {', helperStart);

if (helperStart < 0 || exportStart < 0) {
  throw new Error('CSV export helpers were not found in assets/js/app.js');
}

const helperSource = appSource.slice(helperStart, exportStart);
const runtime = vm.createContext({});
vm.runInContext(helperSource, runtime, { filename: 'app.js#csv-export-helpers' });

test('CSV sanitizer protects ASCII formula prefixes and leading whitespace', () => {
  const cases = [
    ['=1+1', "'=1+1"],
    ['+1+1', "'+1+1"],
    ['-1+1', "'-1+1"],
    ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
    ['  =1+1', "'  =1+1"],
    ['\t=1+1', "'\t=1+1"],
    [' \t@SUM(A1)', "' \t@SUM(A1)"]
  ];

  for (const [input, expected] of cases) {
    assert.equal(runtime.sanitizeCSVText(input), expected);
  }
});

test('CSV sanitizer detects full-width formula characters after Unicode normalization', () => {
  const cases = [
    ['＝1+1', "'＝1+1"],
    ['＋1+1', "'＋1+1"],
    ['－1+1', "'－1+1"],
    ['＠SUM(A1:A2)', "'＠SUM(A1:A2)"],
    ['\u00A0＠SUM(A1)', "'\u00A0＠SUM(A1)"]
  ];

  for (const [input, expected] of cases) {
    assert.equal(runtime.sanitizeCSVText(input), expected);
  }
});

test('CSV sanitizer protects leading C0, DEL, and C1 control characters', () => {
  const controls = ['\t', '\r', '\n', '\u0000', '\u001F', '\u007F', '\u0085', '\u009F'];

  for (const control of controls) {
    assert.equal(runtime.sanitizeCSVText(control + '=1+1'), "'" + control + '=1+1');
    assert.equal(runtime.sanitizeCSVText(' ' + control + 'text'), "' " + control + 'text');
  }
});

test('ordinary labels, dates, ticket numbers, and text remain unchanged', () => {
  const values = [
    'Rina Kusuma',
    'WL-001',
    '2026-11-03',
    'Waiting',
    '19:30',
    'Catatan tamu, meja dekat jendela'
  ];

  for (const value of values) {
    assert.equal(runtime.sanitizeCSVText(value), value);
  }
});

test('CSV serialization quotes fields, escapes quotes, and preserves commas and line breaks', () => {
  const rows = [
    ['Nama', 'Pack', 'Catatan'],
    ['Rina "Ayu"', 2, 'Meja dekat jendela, lantai 1'],
    ['Budi', 4, 'Baris pertama\r\nBaris kedua']
  ];

  const csv = runtime.serializeCSVRows(rows);

  assert.equal(
    csv,
    '"Nama","Pack","Catatan"\n' +
    '"Rina ""Ayu""","2","Meja dekat jendela, lantai 1"\n' +
    '"Budi","4","Baris pertama\r\nBaris kedua"'
  );
});

test('CSV serialization preserves WhatsApp numbers as text without mutating source rows', () => {
  const rows = [
    ['Nomor antrean', 'WhatsApp', 'Pack'],
    ['WL-001', '082119503702', 2],
    ['WL-002', '+628123456789', 4],
    ['WL-003', '628987654321', 3]
  ];
  const original = JSON.stringify(rows);

  const csv = runtime.serializeCSVRows(rows, [1]);

  assert.equal(
    csv,
    `"Nomor antrean","WhatsApp","Pack"\n"WL-001","'082119503702","2"\n"WL-002","'+628123456789","4"\n"WL-003","'628987654321","3"`
  );
  assert.equal(JSON.stringify(rows), original);
});

test('CSV serialization converts nullish values to empty cells', () => {
  assert.equal(runtime.serializeCSVRows([[null, undefined, '']]), '"","",""');
});
