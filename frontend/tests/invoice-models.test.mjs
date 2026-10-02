import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  evaluateHidden,
  evaluateReadOnly,
  evaluateRequired,
  frappeModels,
  fyo,
  getFrappeDoc,
  getMappedDoc,
  getNewDocValues,
  getSidebarConfig,
  getSchema,
  ListFilters,
  ListView,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  router,
  stubFrappe,
} from './helpers/frappe.mjs';

stubFrappe(({ path, body }) =>
  path.endsWith('get_books_meta')
    ? { message: getBooksMeta(body.doctypes) }
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
      References: ['terms', 'attachment'],
    },
  });
});

test('features and totals show the fields that go with them', () => {
  setSettings({
    accounting: {
      enable_discounting: true,
      enable_inventory: true,
      enable_price_list: true,
      enable_coupon_code: true,
    },
    defaults: { sales_payment_account: 'Cash', shipment_location: 'Stores' },
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
  setSettings({ defaults: { sales_payment_account: 'Cash' } });
  const invoice = newInvoice('SalesInvoice', { docstatus: 1 });
  const layout = getLayout(invoice);

  assert.equal(layout.Main.References, undefined);
  assert.equal(layout.Settings, undefined);
  invoice.terms = 'Pay in 30 days';
  assert.deepEqual(getLayout(invoice).Main.References, ['terms']);
});

test('an invoice posts ledger entries and a quote does not', () => {
  assert.equal(newInvoice('SalesInvoice').isTransactional, true);
  assert.equal(newInvoice('SalesQuote').isTransactional, false);
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

test('a quote posts nothing, so it offers no ledger or payment on submit', () => {
  setSettings({ defaults: { sales_payment_account: 'Cash' } });
  const quote = newInvoice('SalesQuote');

  assert.equal(quote.isTransactional, false);
  assert.equal(getLayout(quote).Settings, undefined);
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
      'transfer_rate',
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
  setSettings({ accounting: { enable_discounting: true } });
  const invoice = newInvoice('SalesInvoice');
  invoice.push('items', { item: 'Pen' });
  const row = invoice.items[0];
  const hidden = (fieldname) => evaluateHidden(row.fieldMap[fieldname], row);

  assert.equal(hidden('item_discount_percent'), false);
  assert.equal(hidden('item_discount_amount'), true);
  assert.equal(hidden('item_discounted_total'), true);
  assert.equal(hidden('batch'), true);
  assert.equal(hidden('serial_number'), true);
  assert.equal(hidden('transfer_unit'), true);
  fyo.singles.InventorySettings = { enable_serial_number: true };
  assert.equal(hidden('serial_number'), false);
  assert.equal(hidden('hsn_code'), true);
  fyo.singles.AccountingSettings.country = 'India';
  assert.equal(hidden('hsn_code'), false);
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

test('a cleared row tax goes to the server empty, so it is not filled again', () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  invoice.push('items', { item: 'Pen', tax: 'GST-18' });
  const sentTax = () =>
    invoice.getMethodDocument({ clearServerFilled: true }).items[0].tax;

  // The Link control clears to an empty string.
  invoice.items[0].tax = '';
  assert.equal(sentTax(), '');
  invoice.items[0].tax = null;
  assert.equal(sentTax(), null);
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

test('a row in another unit shows and takes its rate per that unit', async () => {
  setSettings({ inventory: { enable_uom_conversions: true } });
  const invoice = newInvoice('PurchaseInvoice');
  invoice.push('items', {
    item: 'Paper',
    unit: 'Unit',
    transfer_unit: 'Box',
    unit_conversion_factor: 50,
    transfer_quantity: 6,
    quantity: 300,
    rate: fyo.pesa(62),
    transfer_rate: fyo.pesa(3100),
  });
  const row = invoice.items[0];
  const { rate, transfer_rate } = row.fieldMap;
  assert.equal(evaluateHidden(rate, row), true);
  assert.equal(evaluateHidden(transfer_rate, row), false);
  assert.equal(evaluateReadOnly(transfer_rate, row), false);
  assert.equal(transfer_rate.label, 'Rate');
  assert.ok(row.schema.quickEditFields.includes('transfer_rate'));

  // A typed rate per box replaces the price; the server sets the rate from it.
  await row.set('transfer_rate', fyo.pesa(3000));
  const [sent] = invoice.getMethodDocument({
    keepRowNames: true,
    clearServerFilled: true,
  }).items;
  assert.equal(sent.rate, undefined);
  assert.equal(Number(sent.transfer_rate), 3000);
  assert.equal(row.is_manual_rate, true);
  clearTimeout(invoice._previewTimer);
});

test('a new item on a purchase row leaves its batch for the server to name', async () => {
  setSettings();
  const invoices = ['PurchaseInvoice', 'SalesInvoice'].map((schemaName) =>
    newInvoice(schemaName, { items: [{ item: 'Pen', batch: 'PEN-1001' }] })
  );
  for (const invoice of invoices) {
    await invoice.items[0].set('item', 'Ink');
    clearTimeout(invoice._previewTimer);
  }

  assert.deepEqual(
    invoices.map((invoice) => invoice.items[0].batch ?? ''),
    ['', 'PEN-1001']
  );
});

test('a scanned item is priced by the server, and scanning it again adds to its row', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  await invoice.addItem('Pen', 2);
  const [sent] = invoice.getMethodDocument({
    keepRowNames: true,
    clearServerFilled: true,
  }).items;
  assert.deepEqual([sent.item, sent.quantity], ['Pen', 2]);
  for (const fieldname of ['rate', 'account', 'unit']) {
    assert.equal(fieldname in sent, false, fieldname);
  }

  await invoice.addItem('Pen');
  assert.deepEqual(
    invoice.items.map(({ item, quantity }) => [item, quantity]),
    [['Pen', 3]]
  );
  clearTimeout(invoice._previewTimer);
});

test('an invoice from selected items leaves their pricing to the server', async () => {
  setSettings();
  const requests = stubFrappe(() => ({ data: [] }));
  const routes = [];
  router.currentRoute = { value: { fullPath: '/list/Item' } };
  router.push = async (route) => routes.push(route);
  const list = { selectedItems: ['Pen', 'Ink'], isSelectionMode: true };

  await ListView.methods.createInvoice.call(list, 'SalesInvoice');

  const name = decodeURIComponent(routes[0].split('/').at(-1));
  const invoice = await getFrappeDoc('SalesInvoice', name);
  clearTimeout(invoice._previewTimer);
  const { items } = invoice.getMethodDocument({
    keepRowNames: true,
    clearServerFilled: true,
  });
  assert.deepEqual(
    items.map((row) => [row.item, 'rate' in row, !!row.is_manual_rate]),
    [
      ['Pen', false, false],
      ['Ink', false, false],
    ]
  );
  assert.deepEqual(requests, []);
});

test('selected items offer only the documents their Item Usage allows', async () => {
  const usages = { Pen: 'Sales', Ink: 'Both', Paper: 'Purchases' };
  stubFrappe(({ params }) => ({
    data: params.filters[0][2].map((name) => ({ name, item_usage: usages[name] })),
  }));
  const list = { schemaName: 'Item', t: fyo.t };
  const offered = async (selected) => {
    await ListView.methods.updateSelectedItems.call(list, selected);
    return ListView.computed.createOptions.call(list).map(({ value }) => value);
  };

  assert.deepEqual(await offered(['Ink']), [
    'SalesQuote',
    'SalesInvoice',
    'PurchaseInvoice',
  ]);
  assert.deepEqual(await offered(['Pen', 'Ink']), ['SalesQuote', 'SalesInvoice']);
  assert.deepEqual(await offered(['Paper']), ['PurchaseInvoice']);
  assert.deepEqual(await offered(['Pen', 'Paper']), []);
});

test('a new date fetches the exchange rate for it again', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice', {
    party: 'Acme',
    currency: 'USD',
    exchange_rate: 80,
  });
  invoice.push('items', { item: 'Pen', rate: fyo.pesa(5) });

  await invoice.set('date', new Date('2026-01-15'));
  const sent = invoice.getMethodDocument({
    keepRowNames: true,
    clearServerFilled: true,
  });
  assert.equal('exchange_rate' in sent, false);
  assert.equal(sent.currency, 'USD');
  assert.equal('rate' in sent.items[0], false);
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

  assert.deepEqual(filters.party(purchase), [
    ['role', 'in', ['Supplier', 'Both']],
  ]);
  assert.deepEqual(filters.account(sale), [
    ['is_group', '=', 0],
    ['account_type', '=', 'Receivable'],
  ]);
  assert.deepEqual(filters.number_series(sale), [
    ['reference_type', '=', 'SalesInvoice'],
  ]);
  assert.deepEqual(filters.price_list(purchase), [
    ['is_enabled', '=', 1],
    ['is_purchase', '=', 1],
  ]);
  assert.deepEqual(createFilters.party(sale), [['role', '=', 'Customer']]);
  const quote = newInvoice('SalesQuote');
  const quoteFilters = frappeModels.SalesQuote.filters;
  assert.deepEqual(quoteFilters.party(quote), [
    ['role', 'in', ['Customer', 'Both']],
  ]);
  assert.deepEqual(quoteFilters.price_list(quote), [
    ['is_enabled', '=', 1],
    ['is_sales', '=', 1],
  ]);
  // Leads have no role.
  quote.reference_type = 'Books Lead';
  assert.deepEqual(quoteFilters.party(quote), []);

  sale.push('items', { item: 'Pen' });
  const row = sale.items[0];
  const RowModel = row.constructor;
  assert.deepEqual(await RowModel.filters.item(row), [
    ['item_usage', 'not in', ['Purchases']],
  ]);
  assert.deepEqual(RowModel.createFilters.item(row), [
    ['item_usage', '=', 'Sales'],
  ]);
});

test('a new invoice from a filtered list takes the values users enter', async () => {
  setSettings();
  stubFrappe(() => ({ data: [] }));
  const routes = [];
  router.currentRoute = { value: { fullPath: '/list/SalesInvoice' } };
  router.push = async (route) => routes.push(route);
  // A party's sales, as the dashboard's paid list narrows them.
  const filters = [
    ['party', '=', 'Acme'],
    ['docstatus', '=', 1],
    ['outstanding_amount', '=', 0],
    ['date', '>=', '2031-09-01'],
  ];
  const list = { schemaName: 'SalesInvoice', canCreate: true, filters };

  await ListView.methods.makeNewDoc.call(list);

  const name = decodeURIComponent(routes[0].split('/').at(-1));
  const invoice = await getFrappeDoc('SalesInvoice', name);
  clearTimeout(invoice._previewTimer);
  assert.equal(invoice.party, 'Acme');
  assert.equal(invoice.docstatus, 0);
  assert.deepEqual(getNewDocValues('SalesInvoice', filters), {
    party: 'Acme',
  });
});

test('a record created from a link takes the values its filters choose', () => {
  const sale = newInvoice('SalesInvoice');
  const { filters, createFilters } = frappeModels.SalesInvoice;

  assert.deepEqual(getNewDocValues('Account', filters.account(sale)), {
    is_group: false,
    account_type: 'Receivable',
  });
  assert.deepEqual(getNewDocValues('Party', filters.party(sale)), {
    role: 'Customer',
  });
  assert.deepEqual(getNewDocValues('Party', createFilters.party(sale)), {
    role: 'Customer',
  });
  assert.deepEqual(getNewDocValues('PriceList', filters.price_list(sale)), {
    is_enabled: true,
    is_sales: true,
  });
});

test('a new party from the list of every party takes the default role', () => {
  const party = getSidebarConfig()
    .flatMap(({ items }) => items ?? [])
    .find(({ name }) => name === 'party');
  assert.equal(party.route, '/list/Party');
  assert.deepEqual(getNewDocValues('Party', party.filters ?? []), {});
});

test("a row's transfer unit is its item's stock unit or one of its conversions", async () => {
  const sale = newInvoice('SalesInvoice');
  sale.push('items', { item: 'Pen', unit: 'Unit' });
  const row = sale.items[0];
  const requests = stubFrappe(() => ({
    data: [
      {
        unit: 'Unit',
        uom_conversions: [{ uom: 'Box', conversion_factor: 12 }],
      },
    ],
  }));

  await row.validations.transfer_unit('Unit');
  await row.validations.transfer_unit('Box');
  await assert.rejects(
    row.validations.transfer_unit('Crate'),
    /Transfer Unit Crate is not applicable for Item Pen/
  );
  assert.equal(requests[0].path, '/api/v2/document/Books Item');
  assert.deepEqual(requests[0].params.filters, [['name', '=', 'Pen']]);
});

test('invoice actions follow the Frappe invoice values', () => {
  setSettings({ accounting: { enable_invoice_returns: true } });
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

test('Return Against shows while returns are on, or once it is set', () => {
  for (const schemaName of ['SalesInvoice', 'PurchaseInvoice']) {
    setSettings();
    const draft = newInvoice(schemaName);
    const isHidden = () =>
      evaluateHidden(draft.fieldMap.return_against, draft);

    assert.equal(isHidden(), true);
    setSettings({ accounting: { enable_invoice_returns: true } });
    assert.equal(isHidden(), false);
    setSettings();
    draft.return_against = 'INV-1000';
    assert.equal(isHidden(), false);
  }
});

test('a fully returned invoice offers no Return', () => {
  setSettings({ accounting: { enable_invoice_returns: true } });
  const invoice = newInvoice('SalesInvoice', { docstatus: 1 });
  const makeReturn = frappeModels.SalesInvoice.getActions(fyo).find(
    ({ label }) => label === 'Return'
  );

  assert.equal(makeReturn.condition(invoice), true);
  invoice.is_fully_returned = true;
  assert.equal(makeReturn.condition(invoice), false);
});

test('the payment step of a return names the refund', () => {
  const step = (schemaName, values = {}) =>
    frappeModels[schemaName]
      .getActions(fyo)[0]
      .nextStep(newInvoice(schemaName, values));

  assert.equal(step('SalesInvoice'), 'Receive Payment');
  assert.equal(
    step('SalesInvoice', { return_against: 'SINV-1000' }),
    'Make Payment'
  );
  assert.equal(step('PurchaseInvoice'), 'Make Payment');
  assert.equal(
    step('PurchaseInvoice', { return_against: 'PINV-1000' }),
    'Receive Payment'
  );
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
  // The mapper invoices only customers, not leads.
  quote.reference_type = 'Books Lead';
  assert.equal(makeInvoice.condition(quote), false);
  quote.reference_type = 'Books Party';
  const invoice = await getMappedDoc(
    quote,
    'SalesInvoice',
    'make_sales_invoice'
  );
  clearTimeout(invoice._previewTimer);

  assert.equal(
    requests[0].path,
    '/api/method/frappe.model.mapper.make_mapped_doc'
  );
  assert.match(requests[0].body.method, /books_sales_quote\.make_sales_invoice$/);
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
