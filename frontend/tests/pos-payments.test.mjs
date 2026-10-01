import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import {
  evaluateHidden,
  frappeModels,
  fyo,
  getSchema,
  newFrappeDoc,
  pos,
} from './helpers/frappe.mjs';

const requests = await loadFrappeModels(frappeModels, ({ path }) =>
  path === '/api/method/frappe.client.get_list'
    ? { message: [{ parent: 'PAY-1001' }, { parent: 'PAY-1002' }] }
    : { data: [] }
);

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

test('a paid sale names the payments that settle its invoice, oldest first', async () => {
  assert.deepEqual(await pos.getInvoicePayments('SINV-1001'), [
    'PAY-1001',
    'PAY-1002',
  ]);
  const { body } = requests.at(-1);
  assert.deepEqual(
    [body.doctype, body.parent, body.fields, body.order_by],
    ['Books Payment For', 'Books Payment', ['parent'], 'creation asc']
  );
  assert.deepEqual(body.filters, [
    ['reference_type', '=', 'Books Sales Invoice'],
    ['reference_name', '=', 'SINV-1001'],
  ]);
});
