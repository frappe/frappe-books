import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMissingBatches, makeFyo } from './helpers/accounting.mjs';

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

test('a receipt inserts only the missing batches of batched items', async () => {
  const { fyo, inserted } = await makeBatchFyo();
  await createMissingBatches(fyo.doc.getNewDoc('PurchaseReceipt', { items }));
  assert.deepEqual(inserted, [['Batch', 'NEW', 'Pen']]);
});

test('a shipment does not invent batches', async () => {
  const { fyo, inserted } = await makeBatchFyo();
  await createMissingBatches(fyo.doc.getNewDoc('Shipment', { items }));
  assert.deepEqual(inserted, []);
});

test('a failed batch insert stops the save', async () => {
  const { fyo } = await makeBatchFyo();
  fyo.db.insert = async () => {
    throw new Error('Not permitted');
  };
  await assert.rejects(
    createMissingBatches(fyo.doc.getNewDoc('PurchaseInvoice', { items })),
    /Not permitted/
  );
});

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
