import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getInsufficientItems,
  newFrappeDoc,
  stubFrappe,
} from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/models.mjs';

await loadFrappeModels();

/** Asks the server for the invoice's shortfalls and records the request. */
async function getShortfalls(items, values = {}) {
  const requests = stubFrappe(() => ({
    message: [{ item: 'Pen', quantity: 1 }],
  }));
  const invoice = newFrappeDoc('SalesInvoice', {
    date: new Date('2026-01-01T00:00:00Z'),
    ...values,
  });
  invoice.items = items.map(([item, quantity, batch]) => ({
    item,
    quantity,
    batch,
  }));
  return { insufficient: await getInsufficientItems(invoice), requests };
}

test('the server tells a sale what its rows lack where it ships from, in one request', async () => {
  const { insufficient, requests } = await getShortfalls([
    ['Pen', 3],
    ['Ink', 2, 'B1'],
  ]);

  assert.deepEqual(insufficient, [{ item: 'Pen', quantity: 1 }]);
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].path,
    '/api/method/frappe_books.inventory.availability.get_sale_shortfalls'
  );
  assert.deepEqual(requests[0].body, {
    items: [
      { item: 'Pen', quantity: 3 },
      { item: 'Ink', quantity: 2, batch: 'B1' },
    ],
    date: '2026-01-01 05:30:00.000',
    is_pos: false,
  });
});

test('a POS sale asks about the POS location', async () => {
  const { requests } = await getShortfalls([['Pen', 1]], { is_pos: true });
  assert.equal(requests[0].body.is_pos, true);
});
