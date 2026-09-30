import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAvailableSerialNumbers } from './helpers/accounting.mjs';

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
