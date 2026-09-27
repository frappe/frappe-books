import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getExistingActiveSerialNumbersForItem,
  getSerialNumbersForQuantity,
  getSuggestedBatchName,
} from './helpers/accounting.mjs';

function makeFyo(item, reserved) {
  const requests = [];
  const fyo = {
    getValue: async (_schemaName, _name, fieldname) => item[fieldname],
    db: {
      getNewSeriesNames: async (...args) => {
        requests.push(args);
        return reserved.splice(0, args[2]);
      },
    },
  };
  return { fyo, requests };
}

test('a suggested batch is reserved from the item series on the server', async () => {
  const { fyo, requests } = makeFyo({ hasBatch: true }, ['PEN-1001']);
  assert.equal(await getSuggestedBatchName(fyo, 'Pen'), 'PEN-1001');
  assert.deepEqual(requests, [['Batch', 'Pen', 1]]);

  const noBatches = makeFyo({ hasBatch: false }, ['PEN-1002']);
  assert.equal(await getSuggestedBatchName(noBatches.fyo, 'Pen'), undefined);
  assert.deepEqual(noBatches.requests, []);
});

test('serial numbers keep the row numbers and reserve only the shortfall', async () => {
  const { fyo, requests } = makeFyo({ hasSerialNumber: true }, ['SN-3']);
  assert.equal(
    await getSerialNumbersForQuantity(fyo, 'Pen', 'SN-1\n SN-2 ', 3),
    'SN-1\nSN-2\nSN-3'
  );
  assert.equal(
    await getSerialNumbersForQuantity(fyo, 'Pen', 'SN-1\nSN-2', 1),
    'SN-1'
  );
  assert.deepEqual(requests, [['SerialNumber', 'Pen', 1]]);

  const noSerials = makeFyo({ hasSerialNumber: false }, ['SN-4']);
  assert.equal(
    await getSerialNumbersForQuantity(noSerials.fyo, 'Pen', undefined, 2),
    ''
  );
  assert.deepEqual(noSerials.requests, []);
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
