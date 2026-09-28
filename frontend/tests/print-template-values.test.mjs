import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import {
  getPrintTemplatePropValues,
  getTemplateNameFromFile,
  makeFyo,
} from './helpers/accounting.mjs';

const date = new Date('2026-01-02T10:00:00');
const requests = [];
before(() => {
  globalThis.window = { location: { hostname: 'books.localhost' } };
});
after(() => {
  delete globalThis.window;
});
afterEach(() => {
  delete globalThis.fetch;
  requests.length = 0;
});

function respondWith(totals) {
  globalThis.fetch = async (url, options) => {
    requests.push([url, JSON.parse(options.body)]);
    return Response.json({ message: totals });
  };
}

async function getValues(schemaName, values = {}, systemSettings = {}) {
  const fyo = await makeFyo();
  Object.assign(fyo.singles.SystemSettings, systemSettings);
  const singles = {
    PrintSettings: fyo.doc.getNewDoc('PrintSettings', { companyName: 'Co' }),
    AccountingSettings: fyo.doc.getNewDoc('AccountingSettings'),
  };
  fyo.doc.getDoc = async (schemaName) => singles[schemaName];
  const doc = fyo.doc.getNewDoc(schemaName, { name: 'DOC-1', date, ...values });
  doc._notInserted = false;
  return await getPrintTemplatePropValues(doc);
}

test('print values show the totals the server computes', async () => {
  respondWith({
    sub_total: 90,
    grand_total_in_words: 'USD One Hundred only.',
    total_discount: 0,
  });

  const { doc, print } = await getValues('SalesInvoice');

  assert.deepEqual(requests, [
    [
      '/api/method/frappe_books.ui_api.get_print_totals',
      { source_schema: 'SalesInvoice', name: 'DOC-1' },
    ],
  ]);
  assert.equal(doc.subTotal, '90.00');
  assert.equal(doc.grandTotalInWords, 'USD One Hundred only.');
  assert.equal(doc.totalDiscount, '');
  assert.equal(doc.paymentDetails, undefined);
  assert.equal(doc.date, 'Jan 2, 2026');
  assert.equal(print.companyName, 'Co');
});

test('invoice payment details show the amount allocated to it', async () => {
  respondWith({
    payment_details: [
      {
        amount: 40,
        amount_paid: 100,
        payment_method: 'Cash',
        outstanding_amount: 60,
      },
    ],
  });

  const { doc } = await getValues('SalesInvoice');

  assert.deepEqual(doc.paymentDetails, [
    {
      amount: '40.00',
      amountPaid: '100.00',
      paymentMethod: 'Cash',
      outstandingAmount: '60.00',
    },
  ]);
});

test('Payment print values show the tax lines the server gives', async () => {
  respondWith({
    sub_total: 50,
    amount_paid_in_words: 'USD Fifty Five only.',
    taxes: [{ account: 'CGST', amount: 5 }],
  });

  const { doc } = await getValues('Payment', {
    amount: 55,
    taxes: [
      { account: 'CGST Paid', from_account: 'CGST', rate: 10, amount: 5 },
    ],
  });

  assert.equal(doc.subTotal, '50.00');
  assert.equal(doc.amountPaidInWords, 'USD Fifty Five only.');
  assert.deepEqual(doc.taxes, [{ account: 'CGST', amount: '5.00' }]);
});

test('print values use the date format setting', async () => {
  respondWith({});
  const { doc } = await getValues(
    'SalesInvoice',
    {},
    {
      dateFormat: 'dd/MM/yyyy',
    }
  );
  assert.equal(doc.date, '02/01/2026');
});

test('JournalEntry print values have no totals', async () => {
  respondWith({});
  const { doc } = await getValues('JournalEntry');
  assert.equal(doc.subTotal, undefined);
  assert.equal(doc.grandTotalInWords, undefined);
  assert.equal(doc.date, 'Jan 2, 2026');
});

test('a template file name gives the template name', () => {
  assert.equal(getTemplateNameFromFile('Invoice.template.html'), 'Invoice');
  assert.equal(getTemplateNameFromFile('Invoice.html'), 'Invoice');
  assert.equal(getTemplateNameFromFile('Invoice.txt'), null);
  assert.equal(getTemplateNameFromFile('.html'), null);
});
