import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { getExchangeRate, makeFyo } from './helpers/accounting.mjs';

const requests = [];
beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  requests.length = 0;
});
afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.fetch;
});

function respondWith(reply) {
  globalThis.fetch = async (url) => {
    requests.push(url);
    return reply();
  };
}

const rateQuery = {
  fromCurrency: 'EUR',
  toCurrency: 'USD',
  date: '2026-09-01',
};

test('a fetched rate is cached and only currency codes and the date are sent', async () => {
  respondWith(() => Response.json({ rates: { USD: 1.1234 } }));

  assert.equal(await getExchangeRate(rateQuery), 1.1234);
  assert.equal(await getExchangeRate(rateQuery), 1.1234);
  assert.deepEqual(requests, [
    'https://api.vatcomply.com/rates?date=2026-09-01&base=EUR&symbols=USD',
  ]);
});

test('a failed fetch gives no rate instead of zero', async () => {
  respondWith(() => {
    throw new TypeError('Failed to fetch');
  });
  assert.equal(await getExchangeRate(rateQuery), undefined);

  respondWith(() => Response.json({ rates: {} }));
  assert.equal(await getExchangeRate(rateQuery), undefined);
  assert.equal(requests.length, 2);
});

test('a foreign-currency invoice without a rate needs one entered', async () => {
  respondWith(() => Response.json({}, { status: 503 }));
  const fyo = await makeFyo();
  const invoice = fyo.doc.getNewDoc('SalesInvoice', { currency: 'EUR' });
  // Already missing, so the user was warned before.
  invoice.exchangeRate = null;

  assert.equal(await invoice.getExchangeRate(), null);
  assert.equal(invoice.required.exchangeRate(), true);
  await invoice.set('currency', 'USD');
  assert.equal(invoice.required.exchangeRate(), false);
});
