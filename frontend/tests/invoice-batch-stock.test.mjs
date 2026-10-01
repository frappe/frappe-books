import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import { frappeModels, fyo, newFrappeDoc } from './helpers/frappe.mjs';

const AVAILABILITY = '/api/method/frappe_books.inventory.availability';
const stock = [
  { item: 'Pen', batch: 'B1', quantity: 2 },
  { item: 'Pen', batch: 'B2', quantity: 0 },
  { item: 'Pen', batch: null, quantity: 5 },
];

const requests = await loadFrappeModels(frappeModels, ({ path, body }) => {
  if (path === `${AVAILABILITY}.get_stock_location`) {
    const isPOSSale = body.doctype === 'Books Sales Invoice' && body.is_pos;
    return { message: isPOSSale ? 'Counter' : 'Stores' };
  }

  if (path.endsWith('get_stock_quantities')) {
    return { message: stock };
  }

  return { data: [] };
});

function makeRow(values = {}) {
  fyo.singles.InventorySettings = { enable_batches: true };
  const invoice = newFrappeDoc('SalesInvoice', {
    ...values,
    items: [{ item: 'Pen', quantity: 3 }],
  });
  clearTimeout(invoice._previewTimer);
  requests.length = 0;
  return invoice.items[0];
}

/** The locations the stock requests asked about. */
function getStockLocations() {
  return requests
    .filter(({ path }) => path.endsWith('get_stock_quantities'))
    .map(({ body }) => [body.location, body.items]);
}

test('sales batch choices are the batches in stock where the invoice ships from', async () => {
  const row = makeRow();
  const filters = await row.constructor.filters.batch(row);
  assert.deepEqual(filters, { name: ['in', ['B1']] });
  assert.deepEqual(getStockLocations(), [['Stores', ['Pen']]]);
});

test('a POS row checks its batch at the POS location', async () => {
  const row = makeRow({ is_pos: true });
  await assert.rejects(
    row.validateBatchQuantity('B1', 3),
    /Batch B1 only has 2 quantity available but 3 is required/
  );
  await row.validateBatchQuantity('B1', 2);
  assert.deepEqual(getStockLocations(), [
    ['Counter', ['Pen']],
    ['Counter', ['Pen']],
  ]);
});

test('returns may use any batch of the item and skip the stock check', async () => {
  const row = makeRow({ return_against: 'SINV-1' });
  assert.deepEqual(await row.constructor.filters.batch(row), { item: 'Pen' });
  await row.validateBatchQuantity('B1', 30);
  assert.deepEqual(requests, []);
});
