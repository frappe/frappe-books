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

test('list status filters are queried on the server', async () => {
  const fyo = await makeFyo();
  let query;
  fyo.db.getAll = async (_schema, options) => {
    query = options;
    return [{ name: 'A', status: 'Cancelled' }];
  };
  const list = makeList('JournalEntry', { status: ['not like', 'Cancelled'] });
  const { rows } = await loadListData(fyo, list);
  assert.deepEqual(query.filters.status, ['not like', 'Cancelled']);
  assert.equal(rows.length, 1);
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
