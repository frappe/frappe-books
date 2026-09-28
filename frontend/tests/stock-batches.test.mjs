import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

async function makeBatchFyo() {
  const fyo = await makeFyo();
  fyo.getValue = async (_schemaName, item) => item === 'Pen';
  fyo.db.exists = async (_schemaName, name) => name === 'OLD';
  const inserted = [];
  fyo.db.insert = async (schemaName, data) => {
    inserted.push([schemaName, data.name, data.item]);
    return data;
  };
  return { fyo, inserted };
}

const items = [
  { item: 'Pen', batch: 'NEW' },
  { item: 'Pen', batch: 'OLD' },
  { item: 'Ink', batch: 'INK' },
];

for (const schemaName of [
  'PurchaseReceipt',
  'PurchaseInvoice',
  'StockMovement',
]) {
  test(`a ${schemaName} leaves its new batches for the server to create`, async () => {
    const { fyo, inserted } = await makeBatchFyo();
    await fyo.doc.getNewDoc(schemaName, { items }).validate();
    assert.deepEqual(inserted, []);
  });
}

test("a movement row accepts a new batch but not another item's batch", async () => {
  const fyo = await makeFyo();
  fyo.getValue = async (_schemaName, batch) =>
    batch === 'INK-1' ? 'Ink' : undefined;
  const movement = fyo.doc.getNewDoc('StockMovement', {
    items: [{ item: 'Pen' }],
  });
  const row = movement.items[0];
  await row.validations.batch('NEW');
  await assert.rejects(
    row.validations.batch('INK-1'),
    /Batch INK-1 does not belong to Item Pen/
  );
});

test('a new item on a purchase row leaves its batch for the server to name', async () => {
  const fyo = await makeFyo();
  fyo.getValue = async () => undefined;
  fyo.db.getNewSeriesNames = async () => assert.fail('no batch is reserved');
  const invoices = ['PurchaseInvoice', 'SalesInvoice'].map((schemaName) =>
    fyo.doc.getNewDoc(schemaName, {
      items: [{ item: 'Pen', batch: 'PEN-1001' }],
    })
  );
  for (const invoice of invoices) {
    await invoice.items[0].set('item', 'Ink');
    clearTimeout(invoice._previewTimer);
  }
  assert.deepEqual(
    invoices.map((invoice) => invoice.items[0].batch),
    ['', 'PEN-1001']
  );
});
