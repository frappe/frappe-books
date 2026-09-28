import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateHidden, makeFyo } from './helpers/accounting.mjs';

test('the invoice form keeps the POS payment rows hidden', async () => {
  const fyo = await makeFyo();
  const invoice = fyo.doc.getNewDoc('SalesInvoice', {
    isPOS: true,
    payments: [{ paymentMethod: 'Cash', amount: 150 }],
  });
  const field = fyo.getField('SalesInvoice', 'payments');

  assert.equal(invoice.payments.length, 1);
  assert.equal(evaluateHidden(field, invoice), true);
});
