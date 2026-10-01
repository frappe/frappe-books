import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFilterFields } from './helpers/accounting.mjs';
import { doctypes } from './helpers/doctypes.mjs';
import {
  createFilters,
  evaluateHidden,
  frappeModels,
  fyo,
  getMappedDoc,
  getModel,
  getSchema,
  newFrappeDoc,
  routeFilters,
  stubFrappe,
} from './helpers/frappe.mjs';
import { getLayout, loadFrappeModels } from './helpers/models.mjs';
import { previousForms } from './helpers/previousForms.mjs';

await loadFrappeModels();
const { Payment } = frappeModels;

for (const schemaName of ['Payment', 'PaymentFor']) {
  test(`the ${schemaName} form shows the fields, labels, placeholders and sections it showed`, () => {
    assert.deepEqual(
      getLayout(getSchema(schemaName)),
      previousForms.layouts[schemaName]
    );
    assert.deepEqual(
      getSchema(schemaName).quickEditFields,
      previousForms.quickEditFields[schemaName]
    );
  });
}

test('a payment reference shows its invoice type as Sales or Purchase', () => {
  const field = getSchema('PaymentFor').fields[0];
  assert.equal(field.fieldname, 'reference_type');
  assert.equal(fyo.format('Books Purchase Invoice', field), 'Purchase');
  assert.deepEqual(getSchema('PaymentFor').tableFields, [
    'reference_type',
    'reference_name',
    'amount',
  ]);
});

test('the payment type offers Receive and Pay only, and starts empty', () => {
  // The empty first option keeps Frappe from defaulting new payments to Receive.
  const docfield = doctypes
    .find(({ name }) => name === 'Books Payment')
    .fields.find(({ fieldname }) => fieldname === 'payment_type');
  assert.equal(docfield.options, '\nReceive\nPay');

  const field = getSchema('Payment').fields.find(
    ({ fieldname }) => fieldname === 'payment_type'
  );
  assert.deepEqual(
    field.options.map(({ value, label }) => [value, label]),
    [
      ['Receive', 'Receive'],
      ['Pay', 'Pay'],
    ]
  );
  assert.equal(newFrappeDoc('Payment').payment_type, null);
});

test('payment fields hide as they did', () => {
  const payment = newFrappeDoc('Payment', { writeoff: fyo.pesa(0) });
  const hidden = (fieldname) =>
    evaluateHidden(payment.fieldMap[fieldname], payment);
  assert.equal(hidden('amount_paid'), true);
  assert.equal(hidden('taxes'), true);
  assert.equal(hidden('payment_references'), false);
  payment.writeoff = fyo.pesa(5);
  assert.equal(hidden('amount_paid'), false);

  payment.docstatus = 1;
  assert.equal(hidden('payment_references'), true);
  assert.equal(hidden('attachment'), true);
});

for (const [paymentType, from, to] of [
  ['Receive', 'account', 'payment_account'],
  ['Pay', 'payment_account', 'account'],
]) {
  test(`a ${paymentType} payment form shows ${from} as From Account, then ${to} as To Account`, () => {
    const payment = newFrappeDoc('Payment', { payment_type: paymentType });
    const fields = payment
      .getFormFields(payment.schema.fields)
      .filter(({ fieldname }) =>
        ['account', 'payment_account'].includes(fieldname)
      );
    assert.deepEqual(
      fields.map(({ fieldname, label }) => [fieldname, label]),
      [
        [from, 'From Account'],
        [to, 'To Account'],
      ]
    );
    assert.equal(payment.fieldMap.account.label, 'Party Account');
  });
}

test('the server fills an account again after the method or type it follows', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previews = [];
  stubFrappe(({ body }) => {
    previews.push(body.document);
    return { docs: [{ ...body.document, payment_account: 'Bank' }] };
  });
  const payment = newFrappeDoc('Payment', { payment_account: 'Cash' });

  await payment.set('reference_id', 'CHQ-1');
  t.mock.timers.tick(300);
  await waitFor(() => previews.length === 1);
  assert.equal(previews[0].payment_account, 'Cash');

  await payment.set('payment_method', 'Bank');
  t.mock.timers.tick(300);
  await waitFor(() => previews.length === 2);
  assert.equal('payment_account' in previews[1], false);
});

test("a reference's amount is filled again for the invoice it now names", async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previews = [];
  stubFrappe(({ body }) => {
    previews.push(body.document);
    return { docs: [body.document] };
  });
  const payment = newFrappeDoc('Payment', {
    amount: fyo.pesa(100),
    payment_references: [
      {
        reference_type: 'Books Sales Invoice',
        reference_name: 'SINV-1',
        amount: fyo.pesa(100),
      },
    ],
  });

  await payment.payment_references[0].set('reference_name', 'SINV-2');
  t.mock.timers.tick(300);
  await waitFor(() => previews.length === 1);
  const [reference] = previews[0].payment_references;
  assert.equal(reference.reference_name, 'SINV-2');
  assert.equal('amount' in reference, false);
  assert.equal('amount' in previews[0], false);
});

test('payment links filter as they did', async () => {
  const pay = newFrappeDoc('Payment', {
    payment_type: 'Pay',
    party: 'Supplier',
  });
  const { filters } = Payment;
  assert.deepEqual(filters.party(pay), [
    ['role', 'in', ['Supplier', 'Both']],
  ]);
  assert.deepEqual(filters.account(pay), [
    ['account_type', '=', 'Payable'],
    ['is_group', '=', 0],
  ]);
  assert.deepEqual(filters.number_series(pay), [
    ['reference_type', '=', 'Payment'],
  ]);

  const requests = stubFrappe(() => ({ data: [{ type: 'Cash' }] }));
  await pay.set('payment_method', 'Cash');
  assert.deepEqual(await filters.payment_account(pay), [
    ['account_type', '=', 'Cash'],
    ['is_group', '=', 0],
  ]);
  const [read] = requests.filter(({ path }) => path.includes('Payment Method'));
  assert.equal(read.path, '/api/v2/document/Books Payment Method');
  assert.deepEqual(read.params, {
    fields: ['type'],
    filters: [['name', '=', 'Cash']],
    limit: 1,
  });

  await pay.append('payment_references', {});
  const PaymentFor = getModel('PaymentFor');
  const referenceFilters = PaymentFor.filters.reference_name(
    pay.payment_references[0]
  );
  assert.deepEqual(referenceFilters.slice(1), [
    ['docstatus', '=', 1],
    ['party', '=', 'Supplier'],
  ]);
  clearTimeout(pay._previewTimer);
});

test("an invoice's payment is mapped by the server with Frappe fieldnames", async () => {
  const requests = stubFrappe(() => ({
    message: {
      doctype: 'Books Payment',
      party: 'Customer',
      payment_type: 'Receive',
      amount: 150,
      payment_references: [
        {
          reference_type: 'Books Sales Invoice',
          reference_name: 'SINV-1',
          amount: 150,
        },
      ],
    },
  }));
  const invoice = { schemaName: 'SalesInvoice', name: 'SINV-1' };

  const payment = await getMappedDoc(invoice, 'Payment', 'make_payment');

  assert.equal(
    requests[0].body.method,
    'frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice.make_payment'
  );
  assert.ok(payment instanceof Payment);
  assert.equal(payment.amount.float, 150);
  assert.ok(payment.payment_references[0] instanceof getModel('PaymentFor'));
  assert.match(payment.name, /^New Payment \d{2}$/);
});

test('the payment lists show, filter and open as they did', () => {
  const { columns } = Payment.getListViewSettings(fyo);
  const fieldnames = (list) =>
    list.map((column) =>
      typeof column === 'string' ? column : column.fieldname
    );
  assert.deepEqual(fieldnames(columns), [
    'name',
    'status',
    'party',
    'date',
    'amount',
  ]);
  assert.deepEqual(routeFilters.SalesPayments, [
    ['reference_type', '=', 'SalesInvoice'],
  ]);
  assert.deepEqual(createFilters.PurchasePayments, { payment_type: 'Pay' });

  const filters = getFilterFields(getSchema('Payment').fields, columns);
  const status = filters.find(({ fieldname }) => fieldname === 'status');
  assert.deepEqual(
    status.options.map(({ value }) => value),
    ['Saved', 'Submitted', 'Cancelled']
  );
  for (const fieldname of ['name', 'number_series', 'submitted', 'cancelled'])
    assert.ok(filters.some((field) => field.fieldname === fieldname));
  const type = filters.find(({ fieldname }) => fieldname === 'reference_type');
  assert.deepEqual(
    type.options.map(({ label }) => label),
    ['Sales', 'Purchase']
  );
});

async function waitFor(condition) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.fail('The condition was never met');
}
