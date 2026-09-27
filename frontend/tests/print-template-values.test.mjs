import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getPrintTemplatePropValues,
  getTemplateNameFromFile,
  makeFyo,
} from './helpers/accounting.mjs';

const date = new Date('2026-01-02T10:00:00');
const documents = {
  SalesInvoice: { grandTotal: 100 },
  SalesQuote: { grandTotal: 100 },
  PurchaseInvoice: { grandTotal: 100 },
  Payment: { amount: 100, amountPaid: 100 },
  Shipment: { grandTotal: 100 },
  PurchaseReceipt: { grandTotal: 100 },
  StockMovement: { amount: 100 },
};

async function getValues(
  schemaName,
  values,
  getLinkedDocs = () => ({}),
  systemSettings = {}
) {
  const fyo = await makeFyo();
  Object.assign(fyo.singles.SystemSettings, systemSettings);
  const singles = {
    PrintSettings: fyo.doc.getNewDoc('PrintSettings', { companyName: 'Co' }),
    AccountingSettings: fyo.doc.getNewDoc('AccountingSettings'),
    Currency: { fraction: 'Cent', fractionUnits: 100 },
    ...getLinkedDocs(fyo),
  };
  fyo.doc.getDoc = async (schemaName) => singles[schemaName];
  const doc = fyo.doc.getNewDoc(schemaName, { date, ...values });
  return await getPrintTemplatePropValues(doc);
}

for (const [schemaName, values] of Object.entries(documents)) {
  test(`${schemaName} print values include its totals`, async () => {
    const { doc, print } = await getValues(schemaName, values);
    assert.equal(doc.subTotal, '100.00');
    assert.equal(doc.grandTotalInWords, 'One Hundred only');
    assert.equal(doc.date, 'Jan 2, 2026');
    assert.equal(print.companyName, 'Co');
  });
}

test('Payment print values show the tax share it settles', async () => {
  const { doc } = await getValues(
    'Payment',
    {
      amount: 55,
      amountPaid: 55,
      referenceType: 'SalesInvoice',
      for: [
        {
          referenceType: 'SalesInvoice',
          referenceName: 'SINV-1',
          amount: 55,
        },
      ],
    },
    (fyo) => ({
      SalesInvoice: fyo.doc.getNewDoc('SalesInvoice', {
        baseGrandTotal: fyo.pesa(110),
        exchangeRate: 1,
        taxes: [{ account: 'CGST', amount: fyo.pesa(10) }],
      }),
    })
  );
  assert.equal(doc.subTotal, '50.00');
  assert.deepEqual(doc.taxes, [{ account: 'CGST', amount: '5.00' }]);
});

test('print values use the date format setting', async () => {
  const { doc } = await getValues('SalesInvoice', {}, undefined, {
    dateFormat: 'dd/MM/yyyy',
  });
  assert.equal(doc.date, '02/01/2026');
});

test('JournalEntry print values have no totals', async () => {
  const { doc } = await getValues('JournalEntry', {});
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
