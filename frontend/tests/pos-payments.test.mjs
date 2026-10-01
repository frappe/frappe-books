import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  evaluateHidden,
  frappeModels,
  fyo,
  getSchema,
  newFrappeDoc,
} from './helpers/frappe.mjs';

await loadFrappeModels(frappeModels);

test('the invoice form keeps the POS payment rows hidden, and saves them', () => {
  fyo.singles.AccountingSettings = {};
  const invoice = newFrappeDoc('SalesInvoice', {
    is_pos: true,
    payments: [{ payment_method: 'Cash', amount: fyo.pesa(150) }],
  });
  clearTimeout(invoice._previewTimer);
  const field = getSchema('SalesInvoice').fields.find(
    ({ fieldname }) => fieldname === 'payments'
  );

  assert.equal(evaluateHidden(field, invoice), true);
  const [payment] = invoice.getFrappeValues().payments;
  assert.deepEqual(
    [payment.payment_method, Number(payment.amount)],
    ['Cash', 150]
  );
});
