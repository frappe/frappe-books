import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { getLinkedEntries } from './helpers/accounting.mjs';

before(() => {
  globalThis.window = { location: { hostname: 'books.localhost' } };
});
after(() => {
  delete globalThis.window;
  delete globalThis.fetch;
});

test('linked entries come from the server by doctype, grouped by schema in schema order', async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push([url, JSON.parse(options.body)]);
    return Response.json({
      message: {
        'Books GL Entry': ['7', '3'],
        'Books Payment Entry': ['PAY-1002'],
        'Books Delivery Note': [],
      },
    });
  };
  const doctypes = {
    SalesInvoice: 'Books Sales Invoice',
    DeliveryNote: 'Books Delivery Note',
    PaymentEntry: 'Books Payment Entry',
    GLEntry: 'Books GL Entry',
  };
  const doc = {
    schemaName: 'SalesInvoice',
    name: 'SINV-1001',
    fyo: { store: { permissions: { doctypes, user: {} } } },
  };

  const entries = await getLinkedEntries(doc);

  assert.deepEqual(Object.entries(entries), [
    ['PaymentEntry', ['PAY-1002']],
    ['GLEntry', ['7', '3']],
  ]);
  assert.deepEqual(requests, [
    [
      '/api/method/frappe_books.linked_entries.get_linked_entries',
      { doctype: 'Books Sales Invoice', name: 'SINV-1001' },
    ],
  ]);
});
