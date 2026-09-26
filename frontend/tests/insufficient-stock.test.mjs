import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getInsufficientItems, makeFyo } from './helpers/accounting.mjs';

async function getShortfalls(items, stock) {
  const fyo = await makeFyo();
  fyo.getValue = async (_schemaName, item) => item !== 'Service';
  const requests = [];
  fyo.db.getStockQuantity = async (item, _location, _from, _to, batch) => {
    requests.push([item, batch]);
    return stock[`${item}:${batch ?? ''}`] ?? null;
  };
  const invoice = fyo.doc.getNewDoc('SalesInvoice', {
    date: new Date('2026-01-01'),
  });
  invoice.items = items.map(([item, quantity, batch]) => ({
    item,
    quantity,
    batch,
  }));
  return { insufficient: await getInsufficientItems(invoice), requests };
}

test('stock equal to the invoiced quantity is sufficient', async () => {
  const { insufficient } = await getShortfalls([['Pen', 5]], {
    'Pen:': 5,
  });
  assert.deepEqual(insufficient, []);
});

test('rows of the same item and batch share the stock', async () => {
  const { insufficient, requests } = await getShortfalls(
    [
      ['Pen', 3],
      ['Pen', 3],
      ['Ink', 2, 'B1'],
      ['Service', 9],
    ],
    { 'Pen:': 5, 'Ink:B1': 2 }
  );
  assert.deepEqual(insufficient, [
    { item: 'Pen', batch: undefined, quantity: 1 },
  ]);
  assert.deepEqual(requests, [
    ['Pen', undefined],
    ['Ink', 'B1'],
  ]);
});
