'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets/js/guestops-operational.js'), 'utf8');

function renderChart(guests, mode = 'hour') {
  const classes = new Set();
  const chart = {
    innerHTML: '',
    classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
    querySelectorAll() { return []; }
  };
  const runtime = vm.createContext({ $: () => chart, guests });
  vm.runInContext(source, runtime);
  vm.runInContext('operationalChartMode = ' + JSON.stringify(mode) + '; renderOperationalChart(guests);', runtime);
  const slots = [...chart.innerHTML.matchAll(/<b>(\d+)<\/b>[\s\S]*?<small>([^<]+)<\/small>/g)]
    .map(match => ({ value: Number(match[1]), label: match[2] }));
  return { runtime, chart, classes, slots };
}

function guest(time, pack = 2) {
  return { created: Date.parse('2026-11-26T' + time + '+07:00'), pack };
}

test('Mobile hourly chart always shows 06:00 through the end-of-day 00:00 marker', () => {
  for (const guests of [[], [guest('12:30:00')]]) {
    const { chart, classes, slots } = renderChart(guests);
    assert.deepEqual(slots.map(slot => slot.label),
      Array.from({ length: 18 }, (_, index) => String(index + 6).padStart(2, '0') + ':00'));
    assert.match(chart.innerHTML, /<small>00:00<\/small><\/div>$/);
    assert.equal(classes.has('operational-chart-hours'), true);
    assert.equal(slots.find(slot => slot.label === '06:00').value, 0);
  }
});

test('Hourly buckets use Jakarta time and do not move early-morning visits to the end of the day', () => {
  const { slots } = renderChart([
    guest('00:00:00'), guest('05:59:59'),
    guest('06:00:00'), guest('06:59:59'),
    guest('12:00:00'), guest('23:59:59')
  ]);
  assert.equal(slots.find(slot => slot.label === '06:00').value, 2);
  assert.equal(slots.find(slot => slot.label === '12:00').value, 1);
  assert.equal(slots.find(slot => slot.label === '23:00').value, 1);
  assert.equal(slots.reduce((sum, slot) => sum + slot.value, 0), 4);
});

test('Pack mode keeps its six slots and sums pack rather than visit count', () => {
  const guests = [
    { created: Date.parse('2026-11-26T12:00:00'), pack: 3 },
    { created: Date.parse('2026-11-26T12:30:00'), pack: 4 }
  ];
  const { chart, classes, slots } = renderChart(guests, 'pack');
  assert.equal(slots.length, 6);
  assert.equal(slots.at(-1).value, 7);
  assert.equal(slots.reduce((sum, slot) => sum + slot.value, 0), 7);
  assert.equal(classes.has('operational-chart-hours'), false);
  assert.doesNotMatch(chart.innerHTML, /akhir hari/);
});

test('Switching modes removes the hourly scroll layout and restores it when returning to Jam', () => {
  const { runtime, chart, classes } = renderChart([guest('12:00:00')]);
  vm.runInContext("operationalChartMode = 'pack'; renderOperationalChart(guests);", runtime);
  assert.equal(classes.has('operational-chart-hours'), false);
  assert.doesNotMatch(chart.innerHTML, /akhir hari/);
  vm.runInContext("operationalChartMode = 'hour'; renderOperationalChart(guests);", runtime);
  assert.equal(classes.has('operational-chart-hours'), true);
  assert.match(chart.innerHTML, /akhir hari/);
});
