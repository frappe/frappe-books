import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRowDetails, makeFyo } from './helpers/accounting.mjs';

test('row details list every visible column of a row', async () => {
  const fyo = await makeFyo();
  const invoice = fyo.doc.getNewDoc('SalesInvoice', {
    items: [
      {
        item: 'Widget',
        quantity: 2,
        transferQuantity: 2,
        rate: fyo.pesa(50),
        amount: fyo.pesa(100),
      },
    ],
  });
  const details = getRowDetails(invoice.items[0]);
  const byKey = Object.fromEntries(
    details.map((detail) => [detail.key, detail])
  );

  for (const key of ['name', 'idx', 'parent', 'parentFieldname']) {
    assert.equal(byKey[key], undefined);
  }
  assert.equal(byKey.description.value, '—');
  assert.equal(byKey.setItemDiscountAmount.value, 'No');
  assert.deepEqual(
    details.filter((detail) => detail.emphasis).map((detail) => detail.key),
    ['amount']
  );
  clearTimeout(invoice._previewTimer);
});
