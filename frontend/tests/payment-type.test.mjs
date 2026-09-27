import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

for (const [schemaName, returnAgainst, paymentType] of [
  ['SalesInvoice', undefined, 'Receive'],
  ['SalesInvoice', 'SINV-1', 'Pay'],
  ['PurchaseInvoice', undefined, 'Pay'],
  ['PurchaseInvoice', 'PINV-1', 'Receive'],
]) {
  test(`a Both party's payment for ${schemaName} ${
    returnAgainst ? 'returns' : 'invoices'
  } is ${paymentType}`, async () => {
    const fyo = await makeFyo();
    fyo.doc.getNewDoc('Party', { name: 'Trader', role: 'Both' });
    const invoice = fyo.doc.getNewDoc(schemaName, {
      name: 'INVOICE-1',
      party: 'Trader',
      returnAgainst,
    });
    const payment = fyo.doc.getNewDoc('Payment', {
      party: 'Trader',
      for: [{ referenceType: schemaName, referenceName: invoice.name }],
    });

    assert.equal(await payment.formulas.paymentType.formula(), paymentType);
  });
}

test('a Both party without a reference keeps the chosen payment type', async () => {
  const fyo = await makeFyo();
  fyo.doc.getNewDoc('Party', { name: 'Trader', role: 'Both' });
  fyo.doc.getNewDoc('PaymentMethod', { name: 'Cash', type: 'Cash' });
  fyo.doc.getNewDoc('NumberSeries', { name: 'PAY-', referenceType: 'Payment' });
  const payment = fyo.doc.getNewDoc('Payment', {
    party: 'Trader',
    paymentType: 'Pay',
  });

  assert.equal(await payment.formulas.paymentType.formula(), 'Pay');
});
