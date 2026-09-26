import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  generateSerialNumbersForItem,
  getExistingActiveSerialNumbersForItem,
  getSuggestedBatchName,
} from './helpers/accounting.mjs';

function makeFyo({ item, names, taken = [], series }) {
  return {
    getValue: async (_schemaName, _name, fieldname) => item[fieldname],
    db: {
      exists: async (_schemaName, name) =>
        name === series.name || taken.includes(name),
      getAllRaw: async () => names.map((name) => ({ name })),
    },
    doc: { getDoc: async () => series },
  };
}

test('the suggested batch follows the highest batch of the series', async () => {
  const series = { name: 'PEN-', start: 1001, padZeros: 4 };
  const item = { batchSeries: ' PEN- ' };
  const names = ['PEN-1003', 'PEN-0999', 'OTHER-5000'];
  assert.equal(
    await getSuggestedBatchName(makeFyo({ item, names, series }), 'Pen'),
    'PEN-1004'
  );
  assert.equal(
    await getSuggestedBatchName(makeFyo({ item, names: [], series }), 'Pen'),
    'PEN-1001'
  );
});

test('new serial numbers skip taken names and move the series on', async () => {
  const series = {
    name: 'SN-',
    start: 1,
    padZeros: 3,
    async setAndSync(fieldname, value) {
      this[fieldname] = value;
    },
  };
  const fyo = makeFyo({
    item: { hasSerialNumber: true, serialNumberSeries: 'SN-' },
    names: ['SN-002'],
    taken: ['SN-004'],
    series,
  });
  assert.equal(
    await generateSerialNumbersForItem(fyo, 'Pen', 2),
    'SN-003\nSN-005'
  );
  assert.equal(series.current, 5);
  assert.equal(await generateSerialNumbersForItem(fyo, 'Pen', 0), '');
});

test('in-stock serial numbers are the oldest active ones on the server', async () => {
  const requests = [];
  const fyo = {
    getValue: async () => true,
    db: {
      getAllRaw: async (schemaName, options) => {
        requests.push([schemaName, options]);
        return [{ name: 'S1' }, { name: 'S2' }];
      },
    },
  };
  assert.equal(
    await getExistingActiveSerialNumbersForItem(fyo, 'Pen', 2),
    'S1\nS2'
  );
  assert.deepEqual(requests, [
    [
      'SerialNumber',
      {
        fields: ['name'],
        filters: { item: 'Pen', status: 'Active' },
        orderBy: 'created',
        order: 'asc',
        limit: 2,
      },
    ],
  ]);
});
