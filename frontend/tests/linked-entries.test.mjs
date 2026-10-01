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
        'Books Ledger Entry': ['7', '3'],
        'Books Payment': ['PAY-1002'],
        'Books Shipment': [],
      },
    });
  };
  const doctypes = {
    SalesInvoice: 'Books Sales Invoice',
    Shipment: 'Books Shipment',
    Payment: 'Books Payment',
    AccountingLedgerEntry: 'Books Ledger Entry',
  };
  const doc = {
    schemaName: 'SalesInvoice',
    name: 'SINV-1001',
    fyo: { store: { permissions: { doctypes, user: {} } } },
  };

  const entries = await getLinkedEntries(doc);

  assert.deepEqual(Object.entries(entries), [
    ['Payment', ['PAY-1002']],
    ['AccountingLedgerEntry', ['7', '3']],
  ]);
  assert.deepEqual(requests, [
    [
      '/api/method/frappe_books.linked_entries.get_linked_entries',
      { doctype: 'Books Sales Invoice', name: 'SINV-1001' },
    ],
  ]);
});
