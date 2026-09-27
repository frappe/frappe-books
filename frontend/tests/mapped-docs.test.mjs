import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Fyo,
  getSchemas,
  models,
  getMappedDoc,
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

async function makeFyo(call) {
  class Store {
    getSchemaMap() {
      return getSchemas('-', []);
    }

    call(method, ...args) {
      return call(method, ...args);
    }
  }

  const fyo = new Fyo({ DatabaseDemux: Store });
  await fyo.db.init();
  fyo.doc.registerModels(models);
  fyo.singles.SystemSettings = { currency: 'USD', displayPrecision: 2 };
  fyo.singles.Defaults = { paymentNumberSeries: 'PAY-' };
  return fyo;
}
