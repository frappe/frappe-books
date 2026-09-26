import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  linkOnSave,
  loadListData,
  makeFyo,
  onListChange,
} from './helpers/accounting.mjs';

test('a new linked record updates the parent it was created from', async () => {
  let onSave;
  const child = {
    name: 'New Child',
    once: (_event, callback) => {
      onSave = callback;
    },
  };
  const assignments = [];
  const parent = {
    set: async (field, value) => assignments.push([field, value]),
  };
  const linked = [];

  linkOnSave(child, parent, 'party', (name) => linked.push(name));
  await onSave();
  assert.deepEqual(assignments, [['party', 'New Child']]);
  assert.deepEqual(linked, ['New Child']);
});

test('list queries never send computed statuses to the database', async () => {
  const fyo = await makeFyo();
  let query;
  fyo.db.getAll = async (_schema, options) => {
    query = options;
    return [
      { name: 'A', submitted: true, cancelled: true },
      { name: 'B', submitted: true, cancelled: false },
    ];
  };
  for (const filter of [
    ['not like', 'Cancelled'],
    ['like', '%can%'],
    ['is null', ''],
  ]) {
    const list = makeList('JournalEntry', { status: filter });
    const { rows } = await loadListData(fyo, list);
    assert.equal(Object.hasOwn(query.filters, 'status'), false);
    assert.equal(rows.length, filter[0] === 'is null' ? 0 : 1);
  }
  await loadListData(fyo, makeList('Lead', { status: ['!=', 'Lost'] }));
  assert.deepEqual(query.filters.status, ['!=', 'Lost']);
});

test('a submittable list refreshes after a cancel', () => {
  const events = [];
  const observer = { on: (event) => events.push(event) };
  const fyo = {
    schemaMap: { SalesInvoice: { isSubmittable: true } },
    doc: { observer },
    db: { observer },
  };
  onListChange(fyo, 'SalesInvoice', async () => {});
  assert.ok(events.includes('submit:SalesInvoice'));
  assert.ok(events.includes('cancel:SalesInvoice'));
});

function makeList(schemaName, filters) {
  return { schemaName, filters, activeFilters: {}, requestId: 0 };
}
