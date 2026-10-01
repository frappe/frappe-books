import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAvailableSerialNumbers } from './helpers/accounting.mjs';

test('in-stock serial numbers at a location come from the server pick', async () => {
  const requests = [];
  globalThis.window = { location: { hostname: 'books.localhost' } };
  globalThis.fetch = async (url, { body }) => {
    const path = decodeURIComponent(url);
    requests.push([path, body && JSON.parse(body)]);
    return path.startsWith('/api/v2/document/Books Item')
      ? Response.json({ data: [{ has_serial_number: 1 }] })
      : Response.json({ message: ['S1', 'S2'] });
  };

  assert.equal(await getAvailableSerialNumbers('Pen', 'Shelf', 2), 'S1\nS2');
  assert.equal(await getAvailableSerialNumbers('Pen', undefined, 2), '');
  assert.deepEqual(requests, [
    [
      '/api/v2/document/Books Item?fields=["has_serial_number"]&filters=[["name","=","Pen"]]&limit=1',
      undefined,
    ],
    [
      '/api/method/frappe_books.frappe_books.doctype.books_serial_number.books_serial_number.get_available_serial_numbers',
      { item: 'Pen', location: 'Shelf', quantity: 2 },
    ],
  ]);
  delete globalThis.window;
});
