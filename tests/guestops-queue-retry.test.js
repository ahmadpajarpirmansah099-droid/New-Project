'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const queuePath = path.join(__dirname, '..', 'assets/js/guestops-queue.js');

function createRuntime() {
  const smokingGroupClasses = new Set();
  const smokingGroup = { classList: {
    add(name) { smokingGroupClasses.add(name); },
    remove(name) { smokingGroupClasses.delete(name); },
    contains(name) { return smokingGroupClasses.has(name); }
  } };
  const fields = {
    initialStatus: { value: 'waiting' },
    initialTableLabel: { value: '' },
    guestSmoking: { value: 'true' },
    guestName: { value: 'Budi' },
    guestPack: { value: '2' },
    guestPhone: { value: '' },
    guestSmokingError: { textContent: '', hidden: true },
    segSmoking: {
      parentElement: smokingGroup,
      classList: { toggle() {} },
      setAttribute() {},
      removeAttribute() {},
      focus() {}
    },
    segNonSmoking: {
      classList: { toggle() {} },
      setAttribute() {},
      removeAttribute() {}
    }
  };
  const toasts = [];
  const savedStates = [];
  const tickets = ['WL-001', 'WL-002', 'WL-003'];
  let ticketCalls = 0;
  let ids = 0;
  let failNextSave = false;

  const runtime = {
    console, Date, Math, Promise, Error, Array, Number, String, JSON,
    HTMLButtonElement: class HTMLButtonElement {},
    document: { addEventListener() {} },
    $: id => fields[id],
    state: { guests: [] },
    todayKey: () => '2026-11-20',
    uid: () => 'guest-' + (++ids),
    toast: message => toasts.push(message),
    closeSheet() {},
    renderAll() {},
    openSheet() {},
    save: async () => {
      savedStates.push(JSON.parse(JSON.stringify(runtime.state.guests)));
      if (failNextSave) {
        failNextSave = false;
        return false;
      }
      return undefined;
    }
  };
  runtime.window = runtime;
  runtime.GuestOpsService = { nextTicket: async () => tickets[ticketCalls++] };

  vm.createContext(runtime);
  vm.runInContext(fs.readFileSync(queuePath, 'utf8'), runtime, { filename: 'guestops-queue.js' });
  runtime.renderAll = () => {};

  return {
    runtime,
    fields,
    smokingGroup,
    toasts,
    savedStates,
    failNextSave: () => { failNextSave = true; },
    ticketCalls: () => ticketCalls
  };
}

const form = { tagName: 'FORM', querySelector: () => null };
const submit = runtime => runtime.saveGuest({ preventDefault() {}, target: form, submitter: null });

test('Missing smoking area shows inline validation and prevents guest save', async () => {
  const { runtime, fields, smokingGroup, toasts, ticketCalls, savedStates } = createRuntime();
  fields.guestSmoking.value = '';

  await submit(runtime);

  assert.equal(fields.guestSmokingError.hidden, false);
  assert.match(fields.guestSmokingError.textContent, /Area merokok wajib dipilih/);
  assert.equal(smokingGroup.classList.contains('has-validation-error'), true);
  assert.equal(toasts.at(-1), 'Area merokok wajib dipilih');
  assert.equal(ticketCalls(), 0);
  assert.equal(savedStates.length, 0);
  assert.deepEqual(Array.from(runtime.state.guests), []);

  runtime.chooseSmoking('false');
  assert.equal(fields.guestSmoking.value, 'false');
  assert.equal(fields.guestSmokingError.hidden, true);
  assert.equal(fields.guestSmokingError.textContent, '');
  assert.equal(smokingGroup.classList.contains('has-validation-error'), false);
});

test('Retrying a failed guest save reuses the same id and ticket', async () => {
  const { runtime, fields, toasts, savedStates, failNextSave, ticketCalls } = createRuntime();

  failNextSave();
  await submit(runtime);
  assert.deepEqual(Array.from(runtime.state.guests), []);
  assert.equal(ticketCalls(), 1);

  fields.guestName.value = 'Budi Santoso';
  await submit(runtime);

  assert.equal(ticketCalls(), 1);
  assert.equal(savedStates.at(-1).length, 1);
  const saved = savedStates.at(-1)[0];
  assert.equal(saved.id, 'guest-1');
  assert.equal(saved.ticket, 'WL-001');
  assert.equal(saved.name, 'Budi Santoso');
  assert.equal(toasts.at(-1), 'Tamu berhasil ditambahkan · WL-001');
});

test('Opening the add form again starts a fresh id and ticket', async () => {
  const { runtime, savedStates, failNextSave, ticketCalls } = createRuntime();

  failNextSave();
  await submit(runtime);

  runtime.openAdd();
  await submit(runtime);

  assert.equal(ticketCalls(), 2);
  const saved = savedStates.at(-1)[0];
  assert.equal(saved.id, 'guest-2');
  assert.equal(saved.ticket, 'WL-002');
});
