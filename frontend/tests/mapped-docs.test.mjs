import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { loadFrappeModels } from './helpers/models.mjs';
import {
  frappeModels,
  fyo,
  getMappedDoc,
  getStockTransferActions,
  newFrappeDoc,
  stubFrappe,
} from './helpers/frappe.mjs';

const DOCTYPES = 'frappe_books.frappe_books.doctype';

before(loadFrappeModels);

/** Answers each mapper request with `mapped`; returns the requests. */
function stubMapper(mapped) {
  const requests = [];
  stubFrappe((request) => {
    requests.push(request);
    return { message: mapped };
  });
  return requests;
}

function getSaved(schemaName, name) {
  const doc = newFrappeDoc(schemaName, { name });
  doc._notInserted = false;
  return doc;
}

test('transfer invoices and returns come from the transfer mappers', async () => {
  const requests = stubMapper({
    doctype: 'Books Purchase Receipt',
    party: 'Supplier',
    items: [{ item: 'Pen', quantity: -2 }],
  });
  const receipt = getSaved('PurchaseReceipt', 'PREC-1');

  await getMappedDoc(receipt, 'PurchaseInvoice', 'make_purchase_invoice');
  const purchaseReturn = await getMappedDoc(
    receipt,
    'PurchaseReceipt',
    'make_return'
  );

  const module = `${DOCTYPES}.books_purchase_receipt.books_purchase_receipt`;
  assert.deepEqual(
    requests.map(({ body }) => body),
    [
      { method: `${module}.make_purchase_invoice`, source_name: 'PREC-1' },
      { method: `${module}.make_return`, source_name: 'PREC-1' },
    ]
  );
  assert.equal(purchaseReturn.items[0].quantity, -2);
});

test('an invoice maps its pending stock with the transfer mapper', async () => {
  const requests = stubMapper({
    doctype: 'Books Purchase Receipt',
    party: 'Supplier',
    items: [{ item: 'Pen', quantity: 2 }],
  });
  const invoice = getSaved('PurchaseInvoice', 'PINV-1');

  const receipt = await getMappedDoc(
    invoice,
    invoice.stockTransferSchemaName,
    invoice.stockTransferMapper
  );

  assert.deepEqual(requests[0].body, {
    method: `${DOCTYPES}.books_purchase_invoice.books_purchase_invoice.make_purchase_receipt`,
    source_name: 'PINV-1',
  });
  assert.equal(receipt.schemaName, 'PurchaseReceipt');
  assert.equal(receipt.items[0].quantity, 2);
});

test('a fully billed shipment does not offer an invoice', () => {
  const [makeInvoice] = getStockTransferActions(fyo, 'Shipment');
  const shipment = { isSubmitted: true, is_fully_billed: 0 };

  assert.equal(makeInvoice.condition(shipment), true);
  shipment.is_fully_billed = 1;
  assert.equal(makeInvoice.condition(shipment), false);
});

test('lead, party and item actions open documents from their server mappers', async () => {
  const requests = stubMapper({
    party: 'Acme',
    items: [{ item: 'Pen', quantity: 1 }],
  });
  const cases = [
    ['Lead', 'Customer', 'books_lead.books_lead.make_customer', '/edit/Party/'],
    [
      'Lead',
      'Sales Quote',
      'books_lead.books_lead.make_sales_quote',
      '/edit/SalesQuote/',
    ],
    [
      'Party',
      'Create Sale',
      'books_party.books_party.make_sales_invoice',
      '/edit/SalesInvoice/',
    ],
    [
      'Item',
      'Purchase Invoice',
      'books_item.books_item.make_purchase_invoice',
      '/edit/PurchaseInvoice/',
    ],
  ];
  for (const [schemaName, label, mapper, path] of cases) {
    const source = getSaved(schemaName, 'Acme');
    const { action } = frappeModels[schemaName]
      .getActions(fyo)
      .find((action) => action.label === label);
    let route = '';
    await action(source, { push: (to) => (route = to.path ?? to) });

    assert.deepEqual(
      requests.at(-1).body,
      { method: `${DOCTYPES}.${mapper}`, source_name: 'Acme' },
      label
    );
    assert.ok(route.startsWith(path), label);
  }
});
