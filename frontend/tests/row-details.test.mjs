import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fyo, getRowDetails, newFrappeDoc } from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/models.mjs';

await loadFrappeModels();

test('row details list every visible column of a row', () => {
  fyo.singles.AccountingSettings = { enable_discounting: true };
  const invoice = newFrappeDoc('SalesInvoice', {
    items: [
      {
        item: 'Widget',
        quantity: 2,
        transfer_quantity: 2,
        rate: fyo.pesa(50),
        amount: fyo.pesa(100),
      },
    ],
  });
  const details = getRowDetails(invoice.items[0]);
  const byKey = Object.fromEntries(
    details.map((detail) => [detail.key, detail])
  );

  for (const key of ['name', 'idx', 'parent', 'parentfield']) {
    assert.equal(byKey[key], undefined);
  }
  assert.equal(byKey.description.value, '—');
  assert.equal(byKey.set_item_discount_amount.value, 'No');
  assert.deepEqual(
    details.filter((detail) => detail.emphasis).map((detail) => detail.key),
    ['amount']
  );
});
