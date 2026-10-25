import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrappeModels } from './helpers/frappeModels.mjs';
import { frappeModels, fyo, newFrappeDoc, pos } from './helpers/frappe.mjs';

const requests = await loadFrappeModels(frappeModels, ({ path, body }) =>
  path === '/api/method/frappe.client.get_list' &&
  body.doctype === 'Books Pricing Rule'
    ? { message: [{ name: 'PRLE-1002', title: 'Buy 2 get 1' }] }
    : { data: [] }
);

test('cart rows name their pricing rule by its title, read once for the cart', async () => {
  fyo.singles.AccountingSettings = {};
  const sale = newFrappeDoc('SalesInvoice', {
    items: [
      { item_code: 'Tea', pricing_rules: 'PRLE-1002' },
      { item_code: 'Tea', is_free_item: true, pricing_rules: '["PRLE-1002"]' },
      { item_code: 'Cake', is_free_item: true, pricing_rules: 'PRLE-9999' },
    ],
  });
  const [paid, free, gone] = sale.items;
  assert.equal(pos.getRowPricingRule(free), 'Free item');
  assert.equal(pos.getRowPricingRule(paid), '');

  await pos.loadPricingRuleTitles(sale.items);
  await pos.loadPricingRuleTitles(sale.items);

  const reads = requests.filter(
    ({ body }) => body.doctype === 'Books Pricing Rule'
  );
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0].body.filters, [
    ['name', 'in', ['PRLE-1002', 'PRLE-9999']],
  ]);
  assert.equal(pos.getRowPricingRule(paid), 'Buy 2 get 1');
  assert.equal(pos.getRowPricingRule(free), 'Buy 2 get 1');
  // A rule the server no longer has keeps the free row's label.
  assert.equal(pos.getRowPricingRule(gone), 'Free item');
});
