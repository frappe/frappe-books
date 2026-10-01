import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Fyo } from './helpers/fyo.mjs';

before(() => {
  globalThis.window = { location: { hostname: 'books.localhost' } };
});
after(() => {
  delete globalThis.window;
  delete globalThis.fetch;
});

test('amounts carry the currency symbol once symbols are loaded', async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push([url, JSON.parse(options.body)]);
    return Response.json({
      message: [
        { name: 'INR', symbol: '₹' },
        { name: 'XYZ', symbol: null },
      ],
    });
  };
  const fyo = new Fyo();
  const field = { fieldname: 'amount', fieldtype: 'Currency' };

  assert.doesNotMatch(fyo.format(fyo.pesa(5), field), /₹/);
  await fyo.loadCurrencySymbols();
  assert.deepEqual(fyo.currencySymbols, { INR: '₹', XYZ: undefined });
  assert.match(fyo.format(fyo.pesa(5), field), /^₹ 5\.00$/);
  assert.deepEqual(requests, [
    [
      '/api/method/frappe.client.get_list',
      {
        doctype: 'Currency',
        fields: ['name', 'symbol'],
        order_by: 'creation desc',
        limit_page_length: 0,
      },
    ],
  ]);
});
