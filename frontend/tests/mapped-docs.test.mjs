import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Fyo,
  getSchemas,
  models,
  frappeModels,
  getMappedDoc,
  getStockTransferActions,
} from './helpers/accounting.mjs';

test('a mapped payment comes from the server mapper and keeps unset defaults', async () => {
  const calls = [];
  const fyo = await makeFyo((method, ...args) => {
    calls.push([method, ...args]);
    return {
      name: null,
      numberSeries: null,
      party: 'Supplier',
      paymentType: 'Pay',
      amount: 150,
      for: [
        {
          name: null,
          referenceType: 'PurchaseInvoice',
          referenceName: 'PINV-1',
          amount: 150,
        },
      ],
    };
  });
  const invoice = fyo.doc.getNewDoc('PurchaseInvoice', { name: 'PINV-1' });

  const payment = await getMappedDoc(invoice, 'Payment', 'make_payment');

  assert.deepEqual(calls, [
    [
      'getMapped',
      'frappe_books.frappe_books.doctype.books_purchase_invoice.books_purchase_invoice.make_payment',
      'PINV-1',
    ],
  ]);
  assert.equal(payment.numberSeries, 'PAY-');
  assert.equal(payment.amount.float, 150);
  assert.equal(payment.for[0].referenceName, 'PINV-1');
  assert.ok(payment.name);
  assert.ok(payment.for[0].name);
  assert.equal(await fyo.doc.getDoc('Payment', payment.name), payment);
});

test('transfer invoices and returns come from the transfer mappers', async () => {
  const calls = [];
  const fyo = await makeFyo((method, ...args) => {
    calls.push([method, ...args]);
    return { party: 'Supplier', items: [{ item: 'Pen', quantity: -2 }] };
  });
  const receipt = fyo.doc.getNewDoc('PurchaseReceipt', { name: 'PREC-1' });

  await getMappedDoc(receipt, 'PurchaseInvoice', 'make_purchase_invoice');
  const purchaseReturn = await getMappedDoc(
    receipt,
    'PurchaseReceipt',
    'make_return'
  );

  const module =
    'frappe_books.frappe_books.doctype.books_purchase_receipt.books_purchase_receipt';
  assert.deepEqual(calls, [
    ['getMapped', `${module}.make_purchase_invoice`, 'PREC-1'],
    ['getMapped', `${module}.make_return`, 'PREC-1'],
  ]);
  assert.equal(purchaseReturn.items[0].quantity, -2);
});

test('an invoice maps its pending stock with the transfer mapper', async () => {
  const calls = [];
  const fyo = await makeFyo((method, ...args) => {
    calls.push([method, ...args]);
    return { party: 'Supplier', items: [{ item: 'Pen', quantity: 2 }] };
  });
  const invoice = fyo.doc.getNewDoc('PurchaseInvoice', { name: 'PINV-1' });

  const receipt = await getMappedDoc(
    invoice,
    invoice.stockTransferSchemaName,
    invoice.stockTransferMapper
  );

  assert.deepEqual(calls, [
    [
      'getMapped',
      'frappe_books.frappe_books.doctype.books_purchase_invoice.books_purchase_invoice.make_purchase_receipt',
      'PINV-1',
    ],
  ]);
  assert.equal(receipt.schemaName, 'PurchaseReceipt');
  assert.equal(receipt.items[0].quantity, 2);
});

test('a fully billed shipment does not offer an invoice', async () => {
  const fyo = await makeFyo(() => ({}));
  const [makeInvoice] = getStockTransferActions(fyo, 'Shipment');
  const shipment = fyo.doc.getNewDoc('Shipment', { submitted: true });

  assert.equal(makeInvoice.condition(shipment), true);
  shipment.isFullyBilled = true;
  assert.equal(makeInvoice.condition(shipment), false);
});

test('a duplicate is the copy the server makes, with its unset values left out', async () => {
  const calls = [];
  const fyo = await makeFyo((method, ...args) => {
    calls.push([method, ...args]);
    return {
      name: null,
      numberSeries: 'SINV-',
      party: 'Customer',
      isReturned: 0,
      outstandingAmount: null,
      items: [{ name: null, item: 'Pen', quantity: 1 }],
    };
  });
  const invoice = fyo.doc.getNewDoc('SalesInvoice', {
    name: 'SINV-1001',
    numberSeries: 'SINV-',
    isReturned: true,
    outstandingAmount: 100,
  });
  invoice._notInserted = false;
  await invoice.set('terms', 'Unsaved edit');
  clearTimeout(invoice._previewTimer);

  const duplicate = await invoice.duplicate();

  const [[method, schemaName, values]] = calls;
  assert.deepEqual([method, schemaName], ['getDuplicate', 'SalesInvoice']);
  assert.equal(values.terms, 'Unsaved edit');
  assert.equal(Object.hasOwn(values, 'modified'), false);
  assert.equal(duplicate.notInserted, true);
  assert.equal(duplicate.isReturned, false);
  assert.equal(duplicate.outstandingAmount.float, 0);
  assert.equal(duplicate.party, 'Customer');
  assert.notEqual(duplicate.name, 'SINV-1001');
  assert.ok(duplicate.items[0].name);
});

test('a duplicate of a named document is named after it', async () => {
  const fyo = await makeFyo(() => ({
    name: null,
    type: 'SalesInvoice',
    isCustom: 1,
  }));
  const template = fyo.doc.getNewDoc('PrintTemplate', {
    name: 'Basic',
    type: 'SalesInvoice',
    isCustom: false,
  });

  const duplicate = await template.duplicate();

  assert.equal(duplicate.name, 'Basic CPY');
  assert.equal(duplicate.isCustom, true);
});

test('lead, party and item actions open documents from their server mappers', async () => {
  const calls = [];
  const fyo = await makeFyo((method, ...args) => {
    calls.push(args);
    return { party: 'Acme', items: [{ item: 'Pen', quantity: 1 }] };
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
    const source = fyo.doc.getNewDoc(schemaName, { name: 'Acme' });
    source._notInserted = false;
    // A Frappe-backed model presents the doctype; the bridge doc stands in as the source.
    const Model = frappeModels[schemaName] ?? fyo.models[schemaName];
    const { action } = Model.getActions(fyo)
      .find((action) => action.label === label);
    let route = '';
    await action(source, { push: (to) => (route = to.path ?? to) });

    const method = `frappe_books.frappe_books.doctype.${mapper}`;
    assert.deepEqual(calls.at(-1), [method, 'Acme'], label);
    assert.ok(route.startsWith(path), label);
  }
});

async function makeFyo(call) {
  class Store {
    getSchemaMap() {
      return getSchemas('-', []);
    }

    call(method, ...args) {
      return call(method, ...args);
    }

    getDuplicate(...args) {
      return call('getDuplicate', ...args);
    }
  }

  const fyo = new Fyo({ DatabaseDemux: Store });
  await fyo.db.init();
  fyo.doc.registerModels(models);
  fyo.singles.SystemSettings = { currency: 'USD', display_precision: 2 };
  fyo.defaultNumberSeries = { Payment: 'PAY-' };
  return fyo;
}
