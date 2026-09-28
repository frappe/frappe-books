import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAvailableSerialNumbers,
  getSerialNumbersForQuantity,
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

test('in-stock serial numbers at a location come from the server pick', async () => {
  const requests = [];
  globalThis.window = { location: { hostname: 'books.localhost' } };
  globalThis.fetch = async (url, { body }) => {
    requests.push([url, JSON.parse(body)]);
    return Response.json({ message: ['S1', 'S2'] });
  };
  const fyo = { getValue: async () => true };

  assert.equal(
    await getAvailableSerialNumbers(fyo, 'Pen', 'Shelf', 2),
    'S1\nS2'
  );
  assert.equal(await getAvailableSerialNumbers(fyo, 'Pen', undefined, 2), '');
  assert.deepEqual(requests, [
    [
      '/api/method/frappe_books.frappe_books.doctype.books_serial_number.books_serial_number.get_available_serial_numbers',
      { item: 'Pen', location: 'Shelf', quantity: 2 },
    ],
  ]);
  delete globalThis.window;
});
