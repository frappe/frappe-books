import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPrintTemplatePropValues, makeFyo } from './helpers/accounting.mjs';

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

async function getValues(schemaName, values) {
  const fyo = await makeFyo();
  const singles = {
    PrintSettings: fyo.doc.getNewDoc('PrintSettings', { companyName: 'Co' }),
    AccountingSettings: fyo.doc.getNewDoc('AccountingSettings'),
    Currency: { fraction: 'Cent', fractionUnits: 100 },
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

test('JournalEntry print values have no totals', async () => {
  const { doc } = await getValues('JournalEntry', {});
  assert.equal(doc.subTotal, undefined);
  assert.equal(doc.grandTotalInWords, undefined);
  assert.equal(doc.date, 'Jan 2, 2026');
});
