import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo, getSchemas, models } from './helpers/accounting.mjs';

test('changing an invoice reference refreshes the payment amount', async () => {
  const { fyo, payment } = await makePayment();
  await payment.set('amount', fyo.pesa(490231));
  fyo.doc.getNewDoc('PurchaseInvoice', {
    name: 'OTHER-PI',
    party: payment.party,
    submitted: true,
    outstandingAmount: 1200000,
  });

  await payment.for[0].set('referenceName', 'OTHER-PI');
  await payment.sync();

  assert.equal(payment.amount.float, 1200000);
  assert.equal(payment.for[0].referenceName, 'OTHER-PI');
  assert.equal(payment.inserted, true);
});

test('a full payment takes the newly selected invoice balance', async () => {
  const { fyo, payment } = await makePayment();
  fyo.singles.AccountingSettings.enablePartialPayment = false;
  await payment.set('amount', fyo.pesa(490231));
  fyo.doc.getNewDoc('PurchaseInvoice', {
    name: 'SMALLER-PI',
    party: payment.party,
    submitted: true,
    outstandingAmount: 100000,
  });

  await payment.for[0].set('referenceName', 'SMALLER-PI');
  await payment.sync();

  assert.equal(payment.amount.float, 100000);
  assert.equal(payment.for[0].amount.float, 100000);
  assert.equal(payment.inserted, true);
});

test('a return allocation takes its negative balance as a positive amount', async () => {
  const { fyo, payment } = await makePayment();
  fyo.doc.getNewDoc('PurchaseInvoice', {
    name: 'RETURN-PI',
    party: payment.party,
    returnAgainst: 'DEMO-PI-1001',
    submitted: true,
    outstandingAmount: -50000,
  });

  await payment.for[0].set('referenceName', 'RETURN-PI');

  assert.equal(payment.for[0].amount.float, 50000);
  assert.equal(payment.amount.float, 50000);
});

async function makePayment() {
  const stored = new Map();
  let fyo;
  class PaymentStore {
    getSchemaMap() {
      return getSchemas('-', []);
    }

    call(method, schemaName, value) {
      if (method === 'exists') {
        return Boolean(fyo.doc.docs.get(schemaName)?.[value]);
      }
      if (method === 'getAll') return [];
      if (method === 'insert') {
        stored.set(schemaName, structuredClone(value));
        return structuredClone(value);
      }
      throw new Error(`Unexpected database call: ${method}`);
    }
  }

  fyo = new Fyo({ DatabaseDemux: PaymentStore });
  await fyo.db.init();
  fyo.doc.registerModels(models);
  fyo.singles.AccountingSettings = { enablePartialPayment: true };
  fyo.singles.SystemSettings = { currency: 'INR', displayPrecision: 2 };
  fyo.doc.getNewDoc('Party', { name: 'Supplier', role: 'Supplier' });
  fyo.doc.getNewDoc('Account', { name: 'Creditors' });
  fyo.doc.getNewDoc('Account', { name: 'Bank' });
  fyo.doc.getNewDoc('PaymentMethod', { name: 'Cash', type: 'Cash' });
  fyo.doc.getNewDoc('NumberSeries', {
    name: 'DEMO-PAY-',
    referenceType: 'Payment',
    start: 1002,
  });
  const invoice = fyo.doc.getNewDoc('PurchaseInvoice', {
    name: 'DEMO-PI-1001',
    party: 'Supplier',
    submitted: true,
    outstandingAmount: 490231,
  });
  const values = {
    numberSeries: 'DEMO-PAY-',
    party: 'Supplier',
    paymentType: 'Pay',
    paymentMethod: 'Cash',
    account: 'Creditors',
    paymentAccount: 'Bank',
    amount: 910429,
    for: [
      {
        referenceType: 'PurchaseInvoice',
        referenceName: invoice.name,
        amount: 910429,
      },
    ],
  };
  const original = fyo.doc.getNewDoc('Payment', {
    ...structuredClone(values),
    name: 'DEMO-PAY-1001',
    submitted: true,
  });
  original._notInserted = false;
  const payment = fyo.doc.getNewDoc('Payment', values);
  return { fyo, original, invoice, payment, stored };
}
