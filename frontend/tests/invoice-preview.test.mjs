import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Fyo, getSchemas, models } from './helpers/accounting.mjs';

test('a preview applies the values the server calculated', async () => {
  const { invoice, calls } = await makeInvoice((values) => ({
    ...values,
    name: null,
    netTotal: 200,
    grandTotal: 220,
    taxes: [{ account: 'Tax', rate: 10, amount: 20 }],
    items: [
      { ...values.items[0], rate: 100, amount: 200 },
      { item: 'Gift', quantity: 1, rate: 0, isFreeItem: true },
    ],
  }));
  const [row] = invoice.items;
  const name = invoice.name;

  await invoice.preview();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, undefined);
  assert.equal(invoice.name, name);
  assert.equal(invoice.grandTotal.float, 220);
  assert.equal(invoice.taxes[0].amount.float, 20);
  assert.equal(invoice.items[0], row);
  assert.equal(row.amount.float, 200);
  assert.equal(invoice.items[1].isFreeItem, true);
  assert.ok(invoice.items[1].name);
});

test('a preview is dropped when the invoice changes while it runs', async () => {
  let release;
  const running = new Promise((resolve) => (release = resolve));
  const { invoice } = await makeInvoice(async (values) => {
    await running;
    return { ...values, grandTotal: 999 };
  });

  const preview = invoice.preview();
  await invoice.set('terms', 'Changed while previewing');
  release();
  await preview;

  assert.equal(invoice.grandTotal.float, 0);
  assert.equal(invoice.terms, 'Changed while previewing');
  clearTimeout(invoice._previewTimer);
});

test('a preview sent before an item change does not price the new item', async () => {
  const previewed = Promise.withResolvers();
  const { invoice, holdLookups } = await makeInvoice(async (values) => {
    await previewed.promise;
    const items = values.items.map((row) => ({ ...row, rate: 150 }));
    return { ...values, items };
  });
  const [row] = invoice.items;
  const lookups = Promise.withResolvers();
  holdLookups(lookups.promise);

  const preview = invoice.preview();
  const edit = row.set('item', 'Other Service');
  await new Promise(setImmediate);
  previewed.resolve();
  await preview;
  lookups.resolve();
  await edit;

  assert.equal(row.item, 'Other Service');
  assert.equal(row.rate.float, 0);
  clearTimeout(invoice._previewTimer);
});

test('rows removed while a preview runs stay removed', async () => {
  const { invoice } = await makeInvoice((values) => ({
    ...values,
    items: values.items.map((row) => ({ ...row, amount: 5 })),
  }));

  const preview = invoice.preview();
  invoice.items = [];
  await preview;

  assert.deepEqual(invoice.items, []);
});

test('a preview keeps the row quantities the client computes', async () => {
  // The server fills the transfer unit of item rows and has no computed qty.
  const { invoice } = await makeInvoice((values) => ({
    ...values,
    items: [
      ...values.items.map((row) => ({ ...row, transferUnit: row.item && row.unit, qty: null })),
      { item: 'Gift', unit: 'Unit', transferUnit: 'Unit', quantity: 3, transferQuantity: 3, rate: 0, isFreeItem: true },
    ],
  }));
  await invoice.append('items');

  await invoice.preview();

  assert.deepEqual(invoice.items.map((row) => row.qty), [2, 1, 3]);
  clearTimeout(invoice._previewTimer);
});

test('edits in quick succession send one preview', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { invoice, calls } = await makeInvoice((values) => values);

  await invoice.set('terms', 'First');
  await invoice.set('terms', 'Second');
  await invoice.items[0].set('quantity', 3);
  t.mock.timers.tick(299);
  assert.equal(calls.length, 0);

  t.mock.timers.tick(1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].values.terms, 'Second');
});

test('a new price list clears standard rates but keeps manual ones', async () => {
  const { invoice, fyo } = await makeInvoice((values) => values);
  const [standard, manual] = [invoice.items[0], await addRow(invoice)];
  await manual.set('rate', fyo.pesa(50));

  await invoice.set('priceList', 'Wholesale');

  assert.equal(standard.rate.float, 0);
  assert.equal(manual.rate.float, 50);
  clearTimeout(invoice._previewTimer);
});

test('manual rates, including zero, survive quantity changes', async () => {
  const { invoice, fyo } = await makeInvoice((values) => values);
  const [row] = invoice.items;
  for (const rate of [75, 0]) {
    await row.set('rate', fyo.pesa(rate));
    await row.set('quantity', 4);
    assert.equal(row.isManualRate, true);
    assert.equal(row.rate.float, rate);
  }

  await row.set('item', 'Other Service');
  assert.equal(row.isManualRate, false);
  assert.equal(row.rate.float, 0);
  clearTimeout(invoice._previewTimer);
});

test('a new item drops the old item tax for the server to set again', async () => {
  const { invoice } = await makeInvoice((values) => values);
  const [row] = invoice.items;
  await row.set('tax', 'GST-18');

  await row.set('item', 'Other Service');

  assert.equal(row.tax, undefined);
  clearTimeout(invoice._previewTimer);
});

async function addRow(invoice) {
  await invoice.append('items', { item: 'Consulting', quantity: 1 });
  return invoice.items.at(-1);
}

async function makeInvoice(respond) {
  const calls = [];
  let lookups;
  class Store {
    getSchemaMap() {
      return getSchemas('-', []);
    }

    async call(method, ...args) {
      if (method === 'preview') {
        const [, values, name] = args;
        calls.push({ values, name });
        return await respond(structuredClone(values));
      }
      if (method === 'getAll') {
        await lookups;
        return [];
      }
      if (method === 'get') return {};
      throw new Error(`Unexpected database call: ${method}`);
    }
  }

  const fyo = new Fyo({ DatabaseDemux: Store });
  await fyo.db.init();
  fyo.doc.registerModels(models);
  fyo.singles.AccountingSettings = {};
  fyo.singles.SystemSettings = { currency: 'USD', displayPrecision: 2 };
  for (const name of ['Service', 'Consulting', 'Other Service']) {
    fyo.doc.getNewDoc('Item', { name });
  }
  const invoice = fyo.doc.getNewDoc('SalesInvoice', {
    party: 'Customer',
    items: [{ item: 'Service', quantity: 2, rate: 100 }],
  });
  return { invoice, calls, fyo, holdLookups: (until) => (lookups = until) };
}

test('discounts come from the row totals the server calculated', async () => {
  const { invoice, fyo } = await makeInvoice((values) => values);
  const [row] = invoice.items;
  Object.assign(row, {
    setItemDiscountAmount: true,
    itemDiscountAmount: fyo.pesa(15),
    amount: fyo.pesa(200),
    itemDiscountedTotal: fyo.pesa(185),
    itemTaxedTotal: fyo.pesa(203.5),
  });
  invoice.discountAmount = fyo.pesa(5);

  assert.equal(invoice.itemDiscount.float, 15);
  assert.equal(invoice.totalDiscount.float, 20);
  clearTimeout(invoice._previewTimer);
});
