import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

test('a scanned item adds the quantity its barcode carries', async () => {
  const fyo = await makeFyo();
  fyo.doc.getNewDoc('Item', { name: 'Rice', rate: fyo.pesa(100) });
  const invoice = fyo.doc.getNewDoc('SalesInvoice');

  await invoice.addItem('Rice', 1.5);
  await invoice.addItem('Rice', 1.5);
  await invoice.addItem('Rice');

  assert.equal(invoice.items.length, 1);
  assert.equal(invoice.items[0].quantity, 4);
  clearTimeout(invoice._previewTimer);
});
