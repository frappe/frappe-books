import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

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

function respondWith(rate) {
  globalThis.fetch = async (url, options) => {
    requests.push([url, JSON.parse(options.body)]);
    return Response.json({ message: rate });
  };
}

test('the server fetches the rate for the invoice date', async () => {
  respondWith(1.1234);
  const fyo = await makeFyo();
  const invoice = fyo.doc.getNewDoc('SalesInvoice', {
    currency: 'EUR',
    date: new Date(2026, 8, 1, 0, 30),
  });

  assert.equal(await invoice.getExchangeRate(), 1.1234);
  assert.deepEqual(requests, [
    [
      '/api/method/frappe_books.currency.get_exchange_rate',
      { from_currency: 'EUR', to_currency: 'USD', date: '2026-09-01' },
    ],
  ]);
});

test('a foreign-currency invoice without a rate needs one entered', async () => {
  respondWith(null);
  const fyo = await makeFyo();
  const invoice = fyo.doc.getNewDoc('SalesInvoice', { currency: 'EUR' });
  // Already missing, so the user was warned before.
  invoice.exchangeRate = null;

  assert.equal(await invoice.getExchangeRate(), null);
  assert.equal(invoice.required.exchangeRate(), true);
  await invoice.set('currency', 'USD');
  assert.equal(invoice.required.exchangeRate(), false);
});
