import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFilterFields } from './helpers/accounting.mjs';
import { doctypes } from './helpers/doctypes.mjs';
import {
  createFilters,
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
const { PaymentEntry } = frappeModels;

for (const schemaName of ['PaymentEntry', 'PaymentEntryReference']) {
  test(`the ${schemaName} form shows ERPNext's fields, with labels, placeholders and sections`, () => {
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

test('a payment reference shows its invoice type and what the invoice owes', () => {
  const field = getSchema('PaymentEntryReference').fields[0];
  assert.equal(field.fieldname, 'reference_doctype');
  assert.equal(fyo.format('Books Purchase Invoice', field), 'Purchase Invoice');
  assert.deepEqual(getSchema('PaymentEntryReference').tableFields, [
    'reference_doctype',
    'reference_name',
    'total_amount',
    'outstanding_amount',
    'allocated_amount',
  ]);
});

test('the payment type offers Receive, Pay and Internal Transfer, and starts empty', () => {
  // The empty first option keeps Frappe from defaulting new payments to Receive.
  const docfield = doctypes
    .find(({ name }) => name === 'Books Payment Entry')
    .fields.find(({ fieldname }) => fieldname === 'payment_type');
  assert.equal(docfield.options, '\nReceive\nPay\nInternal Transfer');

  const field = getSchema('PaymentEntry').fields.find(
    ({ fieldname }) => fieldname === 'payment_type'
  );
  assert.deepEqual(
    field.options.map(({ value }) => value),
    ['Receive', 'Pay', 'Internal Transfer']
  );
  assert.equal(newFrappeDoc('PaymentEntry').payment_type, null);
});

test('an internal transfer hides the party, the write-off and the references', () => {
  const payment = newFrappeDoc('PaymentEntry', { payment_type: 'Receive' });
  const hidden = (fieldname) =>
    payment.getFieldState(payment.fieldMap[fieldname]).hidden;
  const fieldnames = ['party_type', 'party', 'write_off', 'references'];
  assert.deepEqual(fieldnames.map(hidden), [false, false, false, false]);
  assert.equal(hidden('realised_taxes'), true);

  payment.payment_type = 'Internal Transfer';
  assert.deepEqual(fieldnames.map(hidden), [true, true, true, true]);

  payment.payment_type = 'Pay';
  payment.docstatus = 1;
  assert.equal(hidden('references'), true);
});

test('the write-off is the deductions, negative on a payment out, as ERPNext signs it', async () => {
  const previews = [];
  stubFrappe(({ body }) => {
    previews.push(body.document);
    return { docs: [body.document] };
  });
  const payment = newFrappeDoc('PaymentEntry', { payment_type: 'Pay' });
  assert.equal(payment.write_off.float, 0);

  await payment.set('write_off', fyo.pesa(10));
  await payment.whenFilled();
  assert.deepEqual(
    payment.deductions.map((row) => row.amount.float),
    [-10]
  );
  assert.equal(payment.write_off.float, 10);
  assert.equal('write_off' in previews[0], false);
  assert.equal(Number(previews[0].deductions[0].amount), -10);

  await payment.set('payment_type', 'Receive');
  assert.deepEqual(
    payment.deductions.map((row) => row.amount.float),
    [10]
  );
  await payment.set('payment_type', 'Internal Transfer');
  assert.deepEqual(payment.deductions, []);
});

test('the server fills an account again after the mode or type it follows', async () => {
  const previews = [];
  stubFrappe(({ body }) => {
    previews.push(body.document);
    return { docs: [{ ...body.document, paid_to: 'Bank' }] };
  });
  const payment = newFrappeDoc('PaymentEntry', {
    payment_type: 'Receive',
    paid_from: 'Debtors',
    paid_to: 'Cash',
  });

  await payment.set('reference_no', 'CHQ-1');
  await payment.whenFilled();
  assert.equal(previews.length, 1);
  assert.equal(previews[0].paid_to, 'Cash');

  await payment.set('mode_of_payment', 'Bank');
  await payment.whenFilled();
  assert.equal(previews.length, 2);
  assert.equal('paid_to' in previews[1], false);
  assert.equal(previews[1].paid_from, 'Debtors');
});

test('a new party type leaves the payment type and accounts to the server', async () => {
  const previews = [];
  stubFrappe(({ body }) => {
    previews.push(body.document);
    return { docs: [body.document] };
  });
  const payment = newFrappeDoc('PaymentEntry', {
    payment_type: 'Receive',
    paid_from: 'Debtors',
  });
  assert.deepEqual(
    payment.fieldMap.party_type.options.map(({ value }) => value),
    ['Books Customer', 'Books Supplier']
  );

  await payment.set('party_type', 'Books Supplier');
  await payment.whenFilled();
  assert.equal('payment_type' in previews[0], false);
  assert.equal('paid_from' in previews[0], false);
});

test("a reference's allocation is filled again for the invoice it now names", async () => {
  const previews = [];
  stubFrappe(({ body }) => {
    previews.push(body.document);
    return { docs: [body.document] };
  });
  const payment = newFrappeDoc('PaymentEntry', {
    paid_amount: fyo.pesa(100),
    references: [
      {
        reference_doctype: 'Books Sales Invoice',
        reference_name: 'SINV-1',
        allocated_amount: fyo.pesa(100),
      },
    ],
  });

  await payment.references[0].set('reference_name', 'SINV-2');
  await payment.whenFilled();
  assert.equal(previews.length, 1);
  const [reference] = previews[0].references;
  assert.equal(reference.reference_name, 'SINV-2');
  assert.equal('allocated_amount' in reference, false);
  assert.equal('outstanding_amount' in reference, false);
  assert.equal('paid_amount' in previews[0], false);
});

test('payment links filter by the way money moves', async () => {
  const pay = newFrappeDoc('PaymentEntry', {
    payment_type: 'Pay',
    party_type: 'Books Supplier',
    party: 'Acme',
  });
  const { filters } = PaymentEntry;
  assert.equal(filters.party, undefined);
  assert.deepEqual(filters.paid_to(pay), [
    ['account_type', '=', 'Payable'],
    ['is_group', '=', 0],
  ]);
  assert.deepEqual(filters.naming_series(pay), [
    ['reference_type', '=', 'PaymentEntry'],
  ]);

  const requests = stubFrappe(() => ({ data: [{ type: 'Cash' }] }));
  await pay.set('mode_of_payment', 'Cash');
  assert.deepEqual(await filters.paid_from(pay), [
    ['account_type', 'in', ['Cash']],
    ['is_group', '=', 0],
  ]);
  const [read] = requests.filter(({ path }) =>
    path.includes('Mode of Payment')
  );
  assert.equal(read.path, '/api/v2/document/Books Mode of Payment');
  assert.deepEqual(read.params, {
    fields: ['type'],
    filters: [['name', '=', 'Cash']],
    limit: 1,
  });

  const transfer = newFrappeDoc('PaymentEntry', {
    payment_type: 'Internal Transfer',
  });
  assert.deepEqual(filters.paid_to(transfer), [
    ['account_type', 'in', ['Bank', 'Cash']],
    ['is_group', '=', 0],
  ]);

  await pay.append('references', {
    reference_doctype: 'Books Purchase Invoice',
  });
  const PaymentEntryReference = getModel('PaymentEntryReference');
  const referenceFilters = PaymentEntryReference.filters.reference_name(
    pay.references[0]
  );
  assert.deepEqual(referenceFilters.slice(1), [
    ['docstatus', '=', 1],
    ['supplier', '=', 'Acme'],
  ]);
});

test("an invoice's payment is mapped by the server with ERPNext fieldnames", async () => {
  const requests = stubFrappe(() => ({
    message: {
      doctype: 'Books Payment Entry',
      party_type: 'Books Customer',
      party: 'Acme',
      payment_type: 'Receive',
      paid_amount: 150,
      references: [
        {
          reference_doctype: 'Books Sales Invoice',
          reference_name: 'SINV-1',
          allocated_amount: 150,
        },
      ],
    },
  }));
  const invoice = { schemaName: 'SalesInvoice', name: 'SINV-1' };

  const payment = await getMappedDoc(invoice, 'PaymentEntry', 'make_payment');

  assert.equal(
    requests[0].body.method,
    'frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice.make_payment'
  );
  assert.ok(payment instanceof PaymentEntry);
  assert.equal(payment.paid_amount.float, 150);
  assert.ok(payment.references[0] instanceof getModel('PaymentEntryReference'));
  assert.match(payment.name, /^New Payment Entry \d{2}$/);
});

test('the payment lists show, filter and open by party type', () => {
  const { columns } = PaymentEntry.getListViewSettings(fyo);
  const fieldnames = (list) =>
    list.map((column) =>
      typeof column === 'string' ? column : column.fieldname
    );
  assert.deepEqual(fieldnames(columns), [
    'name',
    'status',
    'party',
    'posting_date',
    'paid_amount',
  ]);
  assert.deepEqual(routeFilters.SalesPayments, [
    ['party_type', '=', 'Books Customer'],
  ]);
  assert.deepEqual(createFilters.PurchasePayments, { payment_type: 'Pay' });

  const filters = getFilterFields(getSchema('PaymentEntry').fields, columns);
  const status = filters.find(({ fieldname }) => fieldname === 'status');
  assert.deepEqual(
    status.options.map(({ value }) => value),
    ['Draft', 'Submitted', 'Cancelled']
  );
  for (const fieldname of ['name', 'naming_series', 'submitted', 'cancelled'])
    assert.ok(filters.some((field) => field.fieldname === fieldname));
  assert.equal(
    filters.some(({ fieldname }) => fieldname === 'write_off'),
    false
  );
});
