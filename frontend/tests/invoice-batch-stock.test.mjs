import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

async function makeRow(values = {}) {
  const fyo = await makeFyo();
  fyo.singles.Defaults = { shipmentLocation: 'Stores' };
  fyo.singles.POSSettings = { inventory: 'Counter' };
  fyo.singles.InventorySettings = { enableBatches: true };
  const locations = [];
  fyo.db.getStockQuantities = async (location, items) => {
    locations.push([location, items]);
    return [
      { item: 'Pen', batch: 'B1', quantity: 2 },
      { item: 'Pen', batch: 'B2', quantity: 0 },
      { item: 'Pen', batch: null, quantity: 5 },
    ];
  };
  fyo.db.getStockQuantity = async (_item, location) => {
    locations.push(location);
    return 2;
  };
  const invoice = fyo.doc.getNewDoc('SalesInvoice', {
    ...values,
    items: [{ item: 'Pen', quantity: 3 }],
  });
  return { row: invoice.items[0], locations };
}

test('sales batch choices are the batches in stock where the invoice ships from', async () => {
  const { row, locations } = await makeRow();
  const filters = await row.constructor.filters.batch(row);
  assert.deepEqual(filters, { name: ['in', ['B1']] });
  assert.deepEqual(locations, [['Stores', ['Pen']]]);
});

test('a POS row checks its batch at the POS location', async () => {
  const { row, locations } = await makeRow({ isPOS: true });
  await assert.rejects(
    row.validateBatchQuantity('B1', 3),
    /Batch B1 only has 2 quantity available but 3 is required/
  );
  await row.validateBatchQuantity('B1', 2);
  assert.deepEqual(locations, ['Counter', 'Counter']);
});

test('returns may use any batch of the item and skip the stock check', async () => {
  const { row, locations } = await makeRow({ returnAgainst: 'SINV-1' });
  assert.deepEqual(await row.constructor.filters.batch(row), { item: 'Pen' });
  await row.validateBatchQuantity('B1', 30);
  assert.deepEqual(locations, []);
});
