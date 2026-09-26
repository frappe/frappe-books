import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getReturnItems } from './helpers/accounting.mjs';

const items = [
  { name: 'row-1', item: 'Pen', quantity: 5 },
  { name: 'row-2', item: 'Ink', batch: 'B1', quantity: 3 },
  { name: 'row-3', item: 'Ink', batch: 'B2', quantity: 2 },
  { name: 'row-4', item: 'Pen', quantity: 2 },
  { name: 'row-5', item: 'Box', quantity: 12, unitConversionFactor: 6 },
  { name: 'row-6', item: 'Watch', quantity: 2, serialNumber: 'S1\nS2' },
];

const summarize = (rows) =>
  rows.map((row) => [
    row.item,
    row.batch,
    row.quantity,
    row.transferQuantity,
    row.serialNumber,
  ]);

test('a first return negates every row in full', () => {
  const rows = getReturnItems(items, undefined);
  assert.ok(rows.every((row) => row.name === undefined));
  assert.deepEqual(summarize(rows), [
    ['Pen', undefined, -5, -5, undefined],
    ['Ink', 'B1', -3, -3, undefined],
    ['Ink', 'B2', -2, -2, undefined],
    ['Pen', undefined, -2, -2, undefined],
    ['Box', undefined, -12, -2, undefined],
    ['Watch', undefined, -2, -2, 'S1\nS2'],
  ]);
});

test('a later return takes only the balance of batched and plain rows', () => {
  const balance = (quantity, serialNumbers = [], batches = {}) => ({
    quantity,
    serialNumbers,
    batches,
  });
  const balances = {
    Pen: balance(-4),
    Ink: balance(-2, [], { B1: balance(0), B2: balance(-2) }),
    Box: balance(-6),
    Watch: balance(-1, ['S2']),
  };
  assert.deepEqual(summarize(getReturnItems(items, balances)), [
    ['Pen', undefined, -4, -4, undefined],
    ['Ink', 'B2', -2, -2, undefined],
    ['Box', undefined, -6, -1, undefined],
    ['Watch', undefined, -1, -1, 'S2'],
  ]);
});
