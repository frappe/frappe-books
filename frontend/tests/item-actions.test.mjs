import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

test('an invoice made from an item sets the quantity in both units', async () => {
  const fyo = await makeFyo();
  const item = fyo.doc.getNewDoc('Item', { name: 'Widget', rate: fyo.pesa(100) });
  const createInvoice = fyo.models.Item.getActions(fyo).find(
    ({ label }) => label === 'Sales Invoice'
  );

  let route = '';
  await createInvoice.action(item, { push: (path) => (route = path) });
  const name = decodeURIComponent(route.split('/').at(-1));
  const invoice = fyo.doc.docs.get('SalesInvoice')[name];
  const [row] = invoice.items;

  assert.equal(row.quantity, 1);
  assert.equal(row.transferQuantity, 1);
  clearTimeout(invoice._previewTimer);
});
