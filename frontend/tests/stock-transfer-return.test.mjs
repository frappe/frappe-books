import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

test('a purchase return receipt returns against the original receipt', async () => {
  const fyo = await makeFyo();
  const original = fyo.doc.getNewDoc('PurchaseInvoice', { name: 'PINV-1' });
  const loaded = [];
  fyo.doc.getDoc = async (schemaName, name) => {
    loaded.push(schemaName);
    return schemaName === 'PurchaseInvoice' ? original : {};
  };
  fyo.db.getAllRaw = async (schemaName, { filters }) =>
    schemaName === 'PurchaseReceipt' && filters.backReference === 'PINV-1'
      ? [{ name: 'PREC-1', created: '2026-01-01' }]
      : [];
  const purchaseReturn = fyo.doc.getNewDoc('PurchaseInvoice', {
    name: 'PINV-2',
    party: 'Supplier',
    submitted: true,
    returnAgainst: 'PINV-1',
    items: [{ item: 'Pen', quantity: -2, rate: 10 }],
  });

  const receipt = await purchaseReturn.getStockTransfer();
  assert.equal(receipt.schemaName, 'PurchaseReceipt');
  assert.equal(receipt.returnAgainst, 'PREC-1');
  assert.ok(!loaded.includes('SalesInvoice'));
});
