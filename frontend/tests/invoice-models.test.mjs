import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMetaBundle, mapping } from './helpers/doctypes.mjs';
import {
  evaluateHidden,
  evaluateRequired,
  frappeModels,
  fyo,
  getMappedBooksDoc,
  getSchema,
  ListFilters,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

window.frappe.boot.books.doctypes = Object.fromEntries(
  Object.entries(mapping).map(([schemaName, { doctype }]) => [
    schemaName,
    doctype,
  ])
);
stubFrappe(({ path, body }) =>
  path.endsWith('getdoctype')
    ? { docs: getMetaBundle(body.doctype) }
    : { data: [] }
);
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();
fyo.singles.SystemSettings = { currency: 'INR' };

/** The tabs, sections and fields a form shows, as getFieldsGroupedByTabAndSection groups them. */
function getLayout(doc) {
  const layout = {};
  for (const field of doc.schema.fields) {
    if (field.meta || evaluateHidden(field, doc)) {
      continue;
    }

    const tab = (layout[field.tab ?? 'Main'] ??= {});
    (tab[field.section ?? 'Default'] ??= []).push(field.fieldname);
  }

  return layout;
}

function newInvoice(schemaName, values = {}) {
  const doc = newFrappeDoc(schemaName, values);
  clearTimeout(doc._previewTimer);
  return doc;
}

function setSettings({ accounting = {}, inventory = {}, defaults = {} } = {}) {
  fyo.singles.AccountingSettings = accounting;
  fyo.singles.InventorySettings = inventory;
  fyo.singles.Defaults = defaults;
}

test('a new sales invoice shows the fields it showed, in its sections', () => {
  setSettings();
  assert.deepEqual(getLayout(newInvoice('SalesInvoice')), {
    Main: {
      Default: ['number_series', 'party', 'account', 'date'],
      Items: ['items', 'net_total'],
      'Tax and Totals': ['grand_total'],
      Outstanding: ['outstanding_amount', 'stock_not_transferred'],
      References: ['terms', 'attachment', 'return_against'],
    },
  });
});

test('features and totals show the fields that go with them', () => {
  setSettings({
    accounting: {
      enableDiscounting: true,
      enableInventory: true,
      enablePriceList: true,
      enableCouponCode: true,
    },
    defaults: { salesPaymentAccount: 'Cash', shipmentLocation: 'Stores' },
  });
  const invoice = newInvoice('SalesInvoice', {
    total_discount: fyo.pesa(5),
    exchange_rate: 80,
    base_grand_total: fyo.pesa(800),
    currency: 'USD',
  });

  const layout = getLayout(invoice);
  assert.deepEqual(layout.Main.Default, [
    'number_series',
    'party',
    'account',
    'date',
    'price_list',
  ]);
  assert.deepEqual(layout.Main['Tax and Totals'], [
    'total_discount',
    'base_grand_total',
    'grand_total',
  ]);
  assert.deepEqual(layout.Main.Coupons, ['coupons']);
  assert.deepEqual(layout.Settings.Default, [
    'discount_after_tax',
    'make_auto_payment',
    'make_auto_stock_transfer',
  ]);
  assert.equal(evaluateRequired(invoice.fieldMap.exchange_rate, invoice), true);
});

test('a submitted invoice hides what only a draft offers', () => {
  setSettings({ defaults: { salesPaymentAccount: 'Cash' } });
  const invoice = newInvoice('SalesInvoice', { docstatus: 1 });
  const layout = getLayout(invoice);

  assert.equal(layout.Main.References, undefined);
  assert.equal(layout.Settings, undefined);
  invoice.terms = 'Pay in 30 days';
  assert.deepEqual(getLayout(invoice).Main.References, ['terms']);
});

test('the quote asks for the Type of its party and hides invoice fields', () => {
  setSettings();
  const quote = newInvoice('SalesQuote');

  assert.deepEqual(getLayout(quote).Main.Default, [
    'number_series',
    'party',
    'date',
    'reference_type',
  ]);
  const type = quote.fieldMap.reference_type;
  assert.equal(type.fieldtype, 'Select');
  assert.deepEqual(
    type.options.map(({ value, label }) => [value, label]),
    [
      ['Books Party', 'Party'],
      ['Books Lead', 'Lead'],
    ]
  );
  assert.equal(quote.reference_type, 'Books Party');
  assert.equal(quote.fieldMap.party.create, true);
  assert.equal(getSchema('SalesQuote').label, 'Quote');
});

test('item tables keep their columns, row editor and Invoice No', () => {
  for (const schemaName of ['SalesInvoice', 'PurchaseInvoice', 'SalesQuote']) {
    const schema = getSchema(schemaName);
    const items = schema.fields.find(({ fieldname }) => fieldname === 'items');
    assert.equal(items.edit, true, schemaName);
    assert.equal(
      schema.fields.find(({ fieldname }) => fieldname === 'name').label,
      'Invoice No'
    );
    assert.deepEqual(getSchema(items.target).tableFields, [
      'item',
      'tax',
      'qty',
      'rate',
      'amount',
    ]);
  }

  const create = (schemaName, fieldname) =>
    getSchema(schemaName).fields.find((field) => field.fieldname === fieldname)
      .create;
  assert.deepEqual(
    ['number_series', 'party', 'account', 'price_list', 'return_against'].map(
      (fieldname) => create('SalesInvoice', fieldname)
    ),
    [true, true, true, false, false]
  );
  assert.deepEqual(
    ['item', 'tax', 'batch', 'account', 'unit', 'transfer_unit'].map(
      (fieldname) => create('SalesInvoiceItem', fieldname)
    ),
    [true, true, true, false, false, false]
  );
  assert.equal(create('AppliedCouponCodes', 'coupons'), false);
  assert.ok(
    getSchema('SalesInvoiceItem').quickEditFields.includes('serial_number')
  );
  assert.ok(
    !getSchema('SalesQuoteItem').quickEditFields.includes('serial_number')
  );
  assert.equal(
    getSchema('SalesInvoiceItem').fields.find(
      ({ fieldname }) => fieldname === 'qty'
    ).readOnly,
    undefined
  );
});

test('row fields show by the features and discounts turned on', () => {
  setSettings({ accounting: { enableDiscounting: true } });
  const invoice = newInvoice('SalesInvoice');
  invoice.push('items', { item: 'Pen' });
  const row = invoice.items[0];
  const hidden = (fieldname) => evaluateHidden(row.fieldMap[fieldname], row);

  assert.equal(hidden('item_discount_percent'), false);
  assert.equal(hidden('item_discount_amount'), true);
  assert.equal(hidden('item_discounted_total'), true);
  assert.equal(hidden('batch'), true);
  assert.equal(hidden('transfer_unit'), true);
  row.set_item_discount_amount = true;
  row.item_discount_amount = fyo.pesa(2);
  assert.equal(hidden('item_discount_amount'), false);
  assert.equal(hidden('item_discounted_total'), false);
});

test('a new invoice leaves its payment and stock follow-ups to the server', () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  const sent = invoice.getMethodDocument({ clearServerFilled: true });

  assert.equal('make_auto_payment' in sent, false);
  assert.equal('make_auto_stock_transfer' in sent, false);
  const copy = newInvoice('SalesInvoice', { make_auto_payment: false });
  assert.equal(copy.getMethodDocument({ clearServerFilled: true }).make_auto_payment, 0);
});

test('row edits ask the server for the price, details and quantities that follow', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  invoice.push('items', { item: 'Pen', rate: fyo.pesa(5), quantity: 1 });
  const row = invoice.items[0];
  const sent = () =>
    invoice.getMethodDocument({ keepRowNames: true, clearServerFilled: true })
      .items[0];

  await row.set('qty', 3);
  assert.deepEqual([row.qty, row.transfer_quantity], [3, 3]);
  assert.equal('quantity' in sent(), false);

  await row.set('rate', fyo.pesa(7));
  assert.equal(row.is_manual_rate, true);

  await row.set('item', 'Ink');
  assert.equal(row.is_manual_rate, false);
  for (const fieldname of ['rate', 'account', 'tax', 'description', 'unit']) {
    assert.equal(fieldname in sent(), false, fieldname);
  }
  clearTimeout(invoice._previewTimer);
});

test('a return takes quantities back, however they are typed', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice', { return_against: 'SINV-1001' });
  invoice.push('items', { item: 'Pen', quantity: -1 });
  const row = invoice.items[0];

  await row.set('quantity', 2);
  assert.equal(row.quantity, -2);
  await row.set('transfer_quantity', 4);
  assert.deepEqual([row.transfer_quantity, row.qty], [-4, -4]);
  clearTimeout(invoice._previewTimer);
});

test('a new party or price list prices rows again, except manual and free ones', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  invoice.push('items', { item: 'Pen', rate: fyo.pesa(5) });
  invoice.push('items', { item: 'Ink', rate: fyo.pesa(9), is_manual_rate: true });
  invoice.push('items', { item: 'Cap', is_free_item: true });

  await invoice.set('party', 'Acme');
  const sent = invoice.getMethodDocument({
    keepRowNames: true,
    clearServerFilled: true,
  });
  assert.equal('account' in sent, false);
  assert.equal('currency' in sent, false);
  assert.deepEqual(
    sent.items.map((row) => 'rate' in row),
    [false, true, true]
  );
  clearTimeout(invoice._previewTimer);
});

test('amounts show in the party currency, base amounts in the company one', () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice', {
    currency: 'USD',
    exchange_rate: 80,
  });
  invoice.push('items', { item: 'Pen' });
  invoice.push('taxes', { account: 'GST' });

  assert.equal(invoice.getCurrencies.grand_total(), 'USD');
  assert.equal(invoice.getCurrencies.base_grand_total(), 'INR');
  assert.equal(invoice.getCurrencies.outstanding_amount(), 'INR');
  assert.equal(invoice.items[0].getCurrencies.amount(), 'USD');
  assert.equal(invoice.taxes[0].getCurrencies.amount(), 'USD');
  invoice.exchange_rate = 1;
  assert.equal(invoice.getCurrencies.grand_total(), 'INR');
});

test('links filter by the doctypes they point to', async () => {
  const sale = newInvoice('SalesInvoice');
  const purchase = newInvoice('PurchaseInvoice');
  const { filters, createFilters } = frappeModels.SalesInvoice;

  assert.deepEqual(filters.party(purchase), {
    role: ['in', ['Supplier', 'Both']],
  });
  assert.deepEqual(filters.account(sale), {
    isGroup: false,
    accountType: 'Receivable',
  });
  assert.deepEqual(filters.number_series(sale), {
    referenceType: 'SalesInvoice',
  });
  assert.deepEqual(filters.price_list(purchase), {
    isEnabled: true,
    isPurchase: true,
  });
  assert.deepEqual(createFilters.party(sale), { role: 'Customer' });
  assert.deepEqual(frappeModels.SalesQuote.filters.party, undefined);

  sale.push('items', { item: 'Pen' });
  const row = sale.items[0];
  const RowModel = row.constructor;
  assert.deepEqual(await RowModel.filters.item(row), {
    item_usage: ['not in', ['Purchases']],
  });
  assert.deepEqual(RowModel.createFilters.item(row), { item_usage: 'Sales' });
});

test('invoice actions follow the Frappe invoice values', () => {
  setSettings({ accounting: { enableInvoiceReturns: true } });
  const invoice = newInvoice('SalesInvoice', {
    docstatus: 1,
    outstanding_amount: fyo.pesa(10),
    stock_not_transferred: 2,
  });
  const labels = (doc) =>
    frappeModels.SalesInvoice.getActions(fyo)
      .filter(({ condition }) => condition?.(doc) ?? true)
      .map(({ label }) => label);

  assert.deepEqual(labels(invoice), [
    'Payment',
    'Shipment',
    'Accounting Entries',
    'Return',
  ]);
  invoice.outstanding_amount = fyo.pesa(0);
  invoice.return_against = 'SINV-1000';
  assert.deepEqual(labels(invoice), ['Shipment', 'Accounting Entries']);
});

test('a submitted quote makes a Frappe-backed sales invoice from its mapper', async () => {
  setSettings();
  const quote = newInvoice('SalesQuote', { docstatus: 1, name: 'SQUOT-1001' });
  const [makeInvoice] = frappeModels.SalesQuote.getActions(fyo);
  const requests = stubFrappe(() => ({
    message: {
      name: null,
      party: 'Acme',
      items: [{ name: null, item: 'Pen', qty: 2, quantity: 2, rate: 5 }],
    },
  }));

  assert.equal(makeInvoice.condition(quote), true);
  const invoice = await getMappedBooksDoc(
    quote,
    'SalesInvoice',
    'make_sales_invoice'
  );
  clearTimeout(invoice._previewTimer);

  assert.match(requests[0].path, /books_sales_quote\.make_sales_invoice$/);
  assert.ok(invoice instanceof frappeModels.SalesInvoice);
  assert.equal(invoice.items[0].qty, 2);
  assert.ok(invoice.date instanceof Date);
});

test('invoice lists show their columns and filter by status, totals and docstatus', () => {
  const filters = new ListFilters('SalesInvoice');
  const fieldnames = filters.fields.map(({ fieldname }) => fieldname);
  for (const fieldname of [
    'name',
    'number_series',
    'status',
    'net_total',
    'grand_total',
    'base_grand_total',
    'submitted',
    'cancelled',
  ]) {
    assert.ok(fieldnames.includes(fieldname), fieldname);
  }

  assert.ok(!fieldnames.includes('outstanding_amount'));
  const status = filters.fields.find(({ fieldname }) => fieldname === 'status');
  assert.deepEqual(status.states.Unpaid, 'Orange');
  assert.deepEqual(
    frappeModels.SalesInvoice.getListViewSettings()
      .columns.map((column) => column.fieldname ?? column),
    ['name', 'status', 'party', 'date', 'base_grand_total', 'outstanding_amount']
  );
});
