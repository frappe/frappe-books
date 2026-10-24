import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import { loadFrappeModels } from './helpers/models.mjs';
import {
  frappeModels,
  fyo,
  getDocType,
  getFrappeDoc,
  getStockTransferActions,
  loadSaved,
  newFrappeDoc,
  router,
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

async function getSaved(schemaName, name) {
  const doc = newFrappeDoc(schemaName, { name });
  await loadSaved(doc);
  return doc;
}

test('a fully billed shipment does not offer an invoice', () => {
  const [makeInvoice] = getStockTransferActions(fyo, 'DeliveryNote');
  const shipment = { isSubmitted: true, per_billed: 0 };

  assert.equal(makeInvoice.condition(shipment), true);
  shipment.per_billed = 100;
  assert.equal(makeInvoice.condition(shipment), false);
});

// By source: each action that builds a document with a mapper of the source, the mapper, and what it builds.
const mappedDocActions = {
  Lead: [
    ['Customer', 'make_customer', 'Customer'],
    ['Quotation', 'make_quotation', 'Quotation'],
  ],
  Customer: [['Create sale', 'make_sales_invoice', 'SalesInvoice']],
  Supplier: [['Create purchase', 'make_purchase_invoice', 'PurchaseInvoice']],
  Item: [
    ['Sales Invoice', 'make_sales_invoice', 'SalesInvoice'],
    ['Purchase Invoice', 'make_purchase_invoice', 'PurchaseInvoice'],
  ],
  Quotation: [['Sales Invoice', 'make_sales_invoice', 'SalesInvoice']],
  SalesInvoice: [
    ['Delivery Note', 'make_delivery_note', 'DeliveryNote'],
    ['Return', 'make_return', 'SalesInvoice'],
  ],
  PurchaseInvoice: [
    ['Purchase Receipt', 'make_purchase_receipt', 'PurchaseReceipt'],
    ['Return', 'make_return', 'PurchaseInvoice'],
  ],
  DeliveryNote: [
    ['Sales Invoice', 'make_sales_invoice', 'SalesInvoice'],
    ['Return', 'make_return', 'DeliveryNote'],
  ],
  PurchaseReceipt: [
    ['Purchase Invoice', 'make_purchase_invoice', 'PurchaseInvoice'],
    ['Return', 'make_return', 'PurchaseReceipt'],
  ],
};

function getAction(schemaName, label) {
  return frappeModels[schemaName]
    .getActions(fyo)
    .find((action) => action.label === label);
}

/** Whether the app's Python module that a dotted method path names whitelists that function. */
function isWhitelisted(method) {
  const path = method.split('.');
  const name = path.pop();
  const file = new URL(`../../${path.join('/')}.py`, import.meta.url);
  return readFileSync(file, 'utf8').includes(
    `@frappe.whitelist()\ndef ${name}(`
  );
}

test("each mapped document action opens the form of what its source's whitelisted mapper builds", async () => {
  const requests = stubMapper({ party: 'Acme' });
  for (const [schemaName, actions] of Object.entries(mappedDocActions)) {
    const source = await getSaved(schemaName, 'SRC-1');
    const module = getDocType(schemaName)
      .doctype.toLowerCase()
      .replaceAll(' ', '_');
    for (const [label, mapper, target] of actions) {
      let route = '';
      await getAction(schemaName, label).action(source, {
        push: (to) => (route = to),
      });

      const method = `${DOCTYPES}.${module}.${module}.${mapper}`;
      assert.deepEqual(requests.at(-1).body, { method, source_name: 'SRC-1' });
      assert.ok(isWhitelisted(method), method);
      const [, edit, routeSchemaName, name] = route.split('/');
      assert.deepEqual([edit, routeSchemaName], ['edit', target], label);
      assert.equal((await getFrappeDoc(target, name)).notInserted, true, label);
    }
  }
});

test('a payment action opens the payment in a quick edit without the fields its invoice sets', async () => {
  const pushed = [];
  router.currentRoute = {
    value: { fullPath: '/list/SalesInvoice', query: {} },
  };
  router.push = async (to) => pushed.push(to);
  for (const [schemaName, paymentType, partyAccount] of [
    ['SalesInvoice', 'Receive', 'paid_from'],
    ['PurchaseInvoice', 'Pay', 'paid_to'],
  ]) {
    const requests = stubMapper({ party: 'Acme', payment_type: paymentType });
    const invoice = await getSaved(schemaName, 'INV-1');

    await getAction(schemaName, 'Payment').action(invoice, router);

    const method = requests.at(-1).body.method;
    assert.ok(method.endsWith('.make_payment') && isWhitelisted(method));
    const { schemaName: opened, edit, hideFields } = pushed.at(-1).query;
    assert.deepEqual([opened, edit], ['PaymentEntry', 1]);
    assert.deepEqual(hideFields, [
      'party_type',
      'party',
      'references',
      partyAccount,
      'payment_type',
    ]);
  }
});
