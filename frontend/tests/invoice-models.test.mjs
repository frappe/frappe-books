import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  frappeModels,
  fyo,
  getCalculatedState,
  getFrappeDoc,
  getMappedDoc,
  getNewDocValues,
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
    if (field.meta || doc.getFieldState(field).hidden) {
      continue;
    }

    const tab = (layout[field.tab ?? 'Main'] ??= {});
    (tab[field.section ?? 'Default'] ??= []).push(field.fieldname);
  }

  return layout;
}

function newInvoice(schemaName, values = {}) {
  return newFrappeDoc(schemaName, values);
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
      Default: ['naming_series', 'customer', 'debit_to', 'posting_date'],
      Items: ['items'],
      Taxes: ['taxes_and_charges', 'taxes'],
      Totals: ['net_total', 'total_taxes_and_charges', 'grand_total'],
      Outstanding: ['outstanding_amount', 'stock_not_transferred'],
      References: ['terms'],
    },
  });
});

test('features and totals show the fields that go with them', () => {
  setSettings({
    accounting: {
      enable_discounts_and_margin: true,
      enable_inventory: true,
      enable_price_list: true,
      enable_coupon_code: true,
    },
    defaults: {
      sales_payment_account: 'Cash',
      delivery_note_location: 'Stores',
    },
  });
  const invoice = newInvoice('SalesInvoice', {
    loyalty_amount: fyo.pesa(5),
    conversion_rate: 80,
    base_grand_total: fyo.pesa(800),
    currency: 'USD',
  });

  const layout = getLayout(invoice);
  assert.deepEqual(layout.Main.Default, [
    'naming_series',
    'customer',
    'debit_to',
    'posting_date',
    'selling_price_list',
  ]);
  assert.deepEqual(layout.Main.Totals, [
    'net_total',
    'total_taxes_and_charges',
    'loyalty_amount',
    'base_grand_total',
    'grand_total',
  ]);
  assert.deepEqual(layout.Main.Coupons, ['coupon_code']);
  assert.deepEqual(layout.Settings.Default, [
    'discount_after_tax',
    'make_auto_payment',
    'make_auto_stock_transfer',
  ]);
  assert.equal(
    invoice.getFieldState(invoice.fieldMap.conversion_rate).required,
    true
  );
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

test('a submitted invoice names its taxes template in the Taxes section', () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice', {
    docstatus: 1,
    taxes_and_charges: 'VAT 5%',
  });

  assert.deepEqual(getLayout(invoice).Main.Taxes, ['taxes']);
  assert.equal(
    invoice.getSectionDescription('Taxes'),
    'Sales Taxes and Charges Template: VAT 5%'
  );
  assert.equal(invoice.getSectionDescription('Items'), undefined);
  assert.equal(
    newInvoice('SalesInvoice', {
      taxes_and_charges: 'VAT 5%',
    }).getSectionDescription('Taxes'),
    undefined
  );
});

test('an invoice posts ledger entries and a quote does not', () => {
  assert.equal(newInvoice('SalesInvoice').isTransactional, true);
  assert.equal(newInvoice('Quotation').isTransactional, false);
});

test('the quote asks for the Type of its party and hides invoice fields', () => {
  setSettings();
  const quote = newInvoice('Quotation');

  assert.deepEqual(getLayout(quote).Main.Default, [
    'naming_series',
    'party_name',
    'transaction_date',
    'quotation_to',
  ]);
  const type = quote.fieldMap.quotation_to;
  assert.equal(type.fieldtype, 'Select');
  assert.deepEqual(
    type.options.map(({ value, label }) => [value, label]),
    [
      ['Books Customer', 'Customer'],
      ['Books Lead', 'Lead'],
    ]
  );
  assert.equal(quote.quotation_to, 'Books Customer');
  assert.equal(quote.fieldMap.party_name.create, true);
  assert.equal(getSchema('Quotation').label, 'Quotation');
});

test('a quote posts nothing, so it offers no ledger or payment on submit', () => {
  setSettings({ defaults: { sales_payment_account: 'Cash' } });
  const quote = newInvoice('Quotation');

  assert.equal(quote.isTransactional, false);
  assert.equal(getLayout(quote).Settings, undefined);
});

test('item tables keep their columns, row editor and Invoice No', () => {
  for (const schemaName of ['SalesInvoice', 'PurchaseInvoice', 'Quotation']) {
    const schema = getSchema(schemaName);
    const items = schema.fields.find(({ fieldname }) => fieldname === 'items');
    assert.equal(items.edit, true, schemaName);
    assert.equal(
      schema.fields.find(({ fieldname }) => fieldname === 'name').label,
      'Invoice No'
    );
    assert.deepEqual(getSchema(items.target).tableFields, [
      'item_code',
      'qty',
      'price_list_rate',
      'item_tax_template',
      'amount',
    ]);
  }

  const create = (schemaName, fieldname) =>
    getSchema(schemaName).fields.find((field) => field.fieldname === fieldname)
      .create;
  assert.deepEqual(
    [
      'naming_series',
      'customer',
      'debit_to',
      'selling_price_list',
      'return_against',
      'taxes_and_charges',
    ].map((fieldname) => create('SalesInvoice', fieldname)),
    [true, true, true, false, false, true]
  );
  assert.deepEqual(
    [
      'item_code',
      'item_tax_template',
      'batch_no',
      'income_account',
      'stock_uom',
      'uom',
    ].map((fieldname) => create('SalesInvoiceItem', fieldname)),
    [true, true, true, false, false, false]
  );
  assert.equal(create('SalesTaxesandCharges', 'account_head'), false);
  assert.ok(
    getSchema('SalesInvoiceItem').quickEditFields.includes('serial_no')
  );
  for (const fieldname of ['serial_no', 'batch_no', 'income_account']) {
    assert.ok(
      !getSchema('QuotationItem').quickEditFields.includes(fieldname),
      fieldname
    );
  }
  assert.equal(
    getSchema('SalesInvoiceItem').fields.find(
      ({ fieldname }) => fieldname === 'qty'
    ).readOnly,
    undefined
  );
});

test('row fields show by the features and discounts turned on', () => {
  setSettings({ accounting: { enable_discounts_and_margin: true } });
  const invoice = newInvoice('SalesInvoice');
  invoice.push('items', { item_code: 'Pen' });
  const row = invoice.items[0];
  const hidden = (fieldname) =>
    row.getFieldState(row.fieldMap[fieldname]).hidden;

  assert.equal(hidden('discount_percentage'), false);
  assert.equal(hidden('discount_amount'), false);
  assert.equal(hidden('batch_no'), true);
  assert.equal(hidden('serial_no'), true);
  assert.equal(hidden('uom'), true);
  assert.equal(hidden('stock_qty'), true);
  fyo.singles.InventorySettings = { enable_serial_number: true };
  assert.equal(hidden('serial_no'), false);
  assert.equal(hidden('gst_hsn_code'), true);
  fyo.singles.AccountingSettings.country = 'India';
  assert.equal(hidden('gst_hsn_code'), false);
  fyo.singles.AccountingSettings.enable_discounts_and_margin = false;
  assert.equal(hidden('discount_percentage'), true);
  assert.equal(hidden('discount_amount'), true);
});

test('a new invoice leaves its payment and stock follow-ups to the server', () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  const sent = invoice.getMethodDocument({ clearServerFilled: true });

  assert.equal('make_auto_payment' in sent, false);
  assert.equal('make_auto_stock_transfer' in sent, false);
  const copy = newInvoice('SalesInvoice', { make_auto_payment: false });
  assert.equal(
    copy.getMethodDocument({ clearServerFilled: true }).make_auto_payment,
    0
  );
});

test('a cleared row tax template goes to the server empty, so it is not filled again', () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  invoice.push('items', { item_code: 'Pen', item_tax_template: 'GST-18' });
  const sentTax = () =>
    invoice.getMethodDocument({ clearServerFilled: true }).items[0]
      .item_tax_template;

  // The Link control clears to an empty string.
  invoice.items[0].item_tax_template = '';
  assert.equal(sentTax(), '');
  invoice.items[0].item_tax_template = null;
  assert.equal(sentTax(), null);
});

test('a new taxes template replaces the rows, and a cleared one keeps them', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  invoice.push('taxes', { charge_type: 'Actual', account_head: 'Freight' });
  const sent = () => invoice.getMethodDocument({ clearServerFilled: true });

  await invoice.set('taxes_and_charges', 'VAT 5%');
  // The server fills the new template's rows.
  assert.deepEqual(invoice.taxes, []);
  assert.equal(sent().taxes_and_charges, 'VAT 5%');

  invoice.push('taxes', { charge_type: 'Actual', account_head: 'Freight' });
  await invoice.set('taxes_and_charges', '');
  assert.equal(invoice.taxes.length, 1);
  // Not null: the server starts a new document with the default template.
  assert.equal(sent().taxes_and_charges, '');
});

test('a tax row takes an amount only as an Actual charge, which has no rate', () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  invoice.push('taxes', { charge_type: 'On Net Total', account_head: 'VAT' });
  const [row] = invoice.taxes;
  const state = (fieldname) => row.getFieldState(row.fieldMap[fieldname]);

  assert.equal(state('tax_amount').readOnly, true);
  assert.equal(state('rate').hidden, false);
  assert.equal(state('total').readOnly, true);
  row.charge_type = 'Actual';
  assert.equal(state('tax_amount').readOnly, false);
  assert.equal(state('rate').hidden, true);
  assert.deepEqual(getSchema('SalesTaxesandCharges').tableFields, [
    'charge_type',
    'account_head',
    'rate',
    'tax_amount',
    'total',
  ]);
});

test('taxes show as being calculated until the preview answers, and failed rows as unknown', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  invoice.push('taxes', { charge_type: 'On Net Total', account_head: 'VAT' });
  invoice.push('taxes', { charge_type: 'Actual', account_head: 'Freight' });
  const [vat, freight] = invoice.taxes;

  invoice.schedulePreview();
  assert.equal(getCalculatedState(invoice, 'grand_total'), 'calculating');
  assert.equal(getCalculatedState(invoice, 'net_total'), undefined);
  assert.equal(getCalculatedState(vat, 'tax_amount'), 'calculating');
  // An Actual charge's amount is the user's.
  assert.equal(getCalculatedState(freight, 'tax_amount'), undefined);
  assert.equal(getCalculatedState(freight, 'total'), 'calculating');

  const message = 'Please specify a valid Row ID for row 2 in table Taxes';
  stubFrappe(() => ({ status: 417, body: { errors: [{ message }] } }));
  await vat.set('rate', 5);
  await assert.rejects(invoice.preview());
  assert.match(invoice.previewError, /valid Row ID/);
  assert.equal(invoice.isCalculating, false);
  assert.equal(getCalculatedState(vat, 'total'), 'failed');
  assert.equal(getCalculatedState(freight, 'total'), undefined);

  // The next edit asks again, and a preview that answers clears the failure.
  // The server fills the follow-up checks the form leaves to it.
  stubFrappe(({ body }) => ({
    docs: [
      { ...body.document, make_auto_payment: 0, make_auto_stock_transfer: 0 },
    ],
  }));
  await vat.set('rate', 6);
  assert.equal(invoice.previewError, undefined);
  await invoice.preview();
  assert.equal(getCalculatedState(vat, 'total'), undefined);
});

test('row edits ask the server for the price, details and quantities that follow', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  invoice.push('items', {
    item_code: 'Pen',
    price_list_rate: fyo.pesa(5),
    stock_qty: 1,
  });
  const row = invoice.items[0];
  const sent = () =>
    invoice.getMethodDocument({ keepRowNames: true, clearServerFilled: true })
      .items[0];

  await row.set('qty', 3);
  assert.equal(row.qty, 3);
  assert.equal('stock_qty' in sent(), false);

  await row.set('price_list_rate', fyo.pesa(7));
  assert.equal(row.is_manual_rate, true);

  await row.set('item_code', 'Ink');
  assert.equal(row.is_manual_rate, false);
  for (const fieldname of [
    'price_list_rate',
    'income_account',
    'item_tax_template',
    'description',
    'stock_uom',
    'uom',
  ]) {
    assert.equal(fieldname in sent(), false, fieldname);
  }
});

test('a row discount amount or percentage leaves the other to the server', async () => {
  setSettings({ accounting: { enable_discounts_and_margin: true } });
  const invoice = newInvoice('SalesInvoice');
  invoice.push('items', {
    item_code: 'Pen',
    price_list_rate: fyo.pesa(10),
    discount_percentage: 10,
    discount_amount: fyo.pesa(1),
  });
  const row = invoice.items[0];
  const sent = () =>
    invoice.getMethodDocument({ keepRowNames: true, clearServerFilled: true })
      .items[0];

  // An amount per unit replaces the percentage, which the server leaves at 0.
  await row.set('discount_amount', fyo.pesa(2));
  assert.equal('discount_percentage' in sent(), false);
  assert.equal(Number(sent().discount_amount), 2);

  // A percentage replaces the amount, which the server works out from it.
  await row.set('discount_percentage', 20);
  assert.equal('discount_amount' in sent(), false);
  assert.equal(sent().discount_percentage, 20);
});

test('a row in another unit shows and takes its rate per that unit', async () => {
  setSettings({ inventory: { enable_uom_conversions: true } });
  const invoice = newInvoice('PurchaseInvoice');
  invoice.push('items', {
    item_code: 'Paper',
    stock_uom: 'Unit',
    uom: 'Box',
    conversion_factor: 50,
    qty: 6,
    stock_qty: 300,
    price_list_rate: fyo.pesa(3100),
  });
  const row = invoice.items[0];
  const { rate, price_list_rate } = row.fieldMap;
  // The rate after discount is the server's.
  assert.equal(row.getFieldState(rate).readOnly, true);
  assert.equal(row.getFieldState(price_list_rate).hidden, false);
  assert.equal(row.getFieldState(price_list_rate).readOnly, false);
  assert.equal(price_list_rate.label, 'Rate');
  assert.ok(row.schema.quickEditFields.includes('price_list_rate'));

  // A typed rate per box replaces the price.
  await row.set('price_list_rate', fyo.pesa(3000));
  const [sent] = invoice.getMethodDocument({
    keepRowNames: true,
    clearServerFilled: true,
  }).items;
  assert.equal(Number(sent.price_list_rate), 3000);
  assert.equal(row.is_manual_rate, true);
});

test('a row rate cleared by text that is no number is refused, as the server requires a rate', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  invoice.push('items', { item_code: 'Paper', price_list_rate: fyo.pesa(62) });
  const row = invoice.items[0];

  await assert.rejects(row.set('price_list_rate', null), /Rate is required/);
  assert.equal(row.price_list_rate.float, 62);
});

test('a new item on a purchase row leaves its batch for the server to name', async () => {
  setSettings();
  const invoices = ['PurchaseInvoice', 'SalesInvoice'].map((schemaName) =>
    newInvoice(schemaName, {
      items: [{ item_code: 'Pen', batch_no: 'PEN-1001' }],
    })
  );
  for (const invoice of invoices) {
    await invoice.items[0].set('item_code', 'Ink');
  }

  assert.deepEqual(
    invoices.map((invoice) => invoice.items[0].batch_no ?? ''),
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
  assert.deepEqual([sent.item_code, sent.qty], ['Pen', 2]);
  for (const fieldname of ['price_list_rate', 'income_account', 'stock_uom']) {
    assert.equal(fieldname in sent, false, fieldname);
  }

  await invoice.addItem('Pen');
  assert.deepEqual(
    invoice.items.map(({ item_code, qty }) => [item_code, qty]),
    [['Pen', 3]]
  );
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
  const { items } = invoice.getMethodDocument({
    keepRowNames: true,
    clearServerFilled: true,
  });
  assert.deepEqual(
    items.map((row) => [
      row.item_code,
      'price_list_rate' in row,
      !!row.is_manual_rate,
    ]),
    [
      ['Pen', false, false],
      ['Ink', false, false],
    ]
  );
  assert.deepEqual(requests, []);
});

test('selected items offer every document made from items', () => {
  const offered = (schemaName, selectedItems) =>
    ListView.computed.createOptions
      .call({ schemaName, selectedItems, t: fyo.t })
      .map(({ value }) => value);

  assert.deepEqual(offered('Item', ['Pen', 'Ink']), [
    'Quotation',
    'SalesInvoice',
    'PurchaseInvoice',
  ]);
  assert.deepEqual(offered('Item', []), []);
  assert.deepEqual(offered('Customer', ['Acme']), []);
});

test('a new date fetches the exchange rate for it again', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice', {
    customer: 'Acme',
    currency: 'USD',
    conversion_rate: 80,
  });
  invoice.push('items', { item_code: 'Pen', price_list_rate: fyo.pesa(5) });

  await invoice.set('posting_date', new Date('2026-01-15'));
  const sent = invoice.getMethodDocument({
    keepRowNames: true,
    clearServerFilled: true,
  });
  assert.equal('conversion_rate' in sent, false);
  assert.equal(sent.currency, 'USD');
  assert.equal('price_list_rate' in sent.items[0], false);
});

test('a return takes quantities back, however they are typed', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice', { return_against: 'SINV-1001' });
  invoice.push('items', { item_code: 'Pen', stock_qty: -1 });
  const row = invoice.items[0];

  await row.set('stock_qty', 2);
  assert.equal(row.stock_qty, -2);
  await row.set('qty', 4);
  assert.equal(row.qty, -4);
});

test('a new party or price list prices rows again, except manual and free ones', async () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice');
  invoice.push('items', { item_code: 'Pen', price_list_rate: fyo.pesa(5) });
  invoice.push('items', {
    item_code: 'Ink',
    price_list_rate: fyo.pesa(9),
    is_manual_rate: true,
  });
  invoice.push('items', { item_code: 'Cap', is_free_item: true });

  await invoice.set('customer', 'Acme');
  const sent = invoice.getMethodDocument({
    keepRowNames: true,
    clearServerFilled: true,
  });
  assert.equal('debit_to' in sent, false);
  assert.equal('currency' in sent, false);
  assert.deepEqual(
    sent.items.map((row) => 'price_list_rate' in row),
    [false, true, true]
  );
});

test('a new supplier or quote party leaves the party currency to the server', async () => {
  setSettings();
  for (const [schemaName, partyField] of [
    ['PurchaseInvoice', 'supplier'],
    ['Quotation', 'party_name'],
  ]) {
    const invoice = newInvoice(schemaName, { currency: 'USD' });
    invoice.push('items', { item_code: 'Pen', price_list_rate: fyo.pesa(5) });

    await invoice.set(partyField, 'Acme');
    const sent = invoice.getMethodDocument({
      keepRowNames: true,
      clearServerFilled: true,
    });
    assert.equal('currency' in sent, false, schemaName);
    assert.equal('price_list_rate' in sent.items[0], false, schemaName);
  }
});

test('amounts show in the party currency, base amounts in the company one', () => {
  setSettings();
  const invoice = newInvoice('SalesInvoice', {
    currency: 'USD',
    conversion_rate: 80,
  });
  invoice.push('items', { item_code: 'Pen' });
  invoice.push('taxes', { account_head: 'GST' });

  assert.equal(invoice.getCurrencies.grand_total(), 'USD');
  assert.equal(invoice.getCurrencies.base_grand_total(), 'INR');
  assert.equal(invoice.getCurrencies.outstanding_amount(), 'INR');
  assert.equal(invoice.items[0].getCurrencies.amount(), 'USD');
  assert.equal(invoice.taxes[0].getCurrencies.tax_amount(), 'USD');
  invoice.conversion_rate = 1;
  assert.equal(invoice.getCurrencies.grand_total(), 'INR');
});

test('links filter by the doctypes they point to', async () => {
  const sale = newInvoice('SalesInvoice');
  const purchase = newInvoice('PurchaseInvoice');
  const { filters } = frappeModels.SalesInvoice;

  assert.deepEqual(filters.debit_to(sale), [
    ['is_group', '=', 0],
    ['account_type', '=', 'Receivable'],
  ]);
  assert.deepEqual(frappeModels.PurchaseInvoice.filters.credit_to(purchase), [
    ['is_group', '=', 0],
    ['account_type', '=', 'Payable'],
  ]);
  assert.deepEqual(filters.naming_series(sale), [
    ['reference_type', '=', 'SalesInvoice'],
  ]);
  assert.deepEqual(
    frappeModels.PurchaseInvoice.filters.buying_price_list(purchase),
    [
      ['enabled', '=', 1],
      ['buying', '=', 1],
      ['currency', 'in', ['INR', 'INR']],
    ]
  );
  assert.deepEqual(filters.taxes_and_charges(sale), [['disabled', '=', 0]]);
  const quote = newInvoice('Quotation');
  assert.deepEqual(frappeModels.Quotation.filters.selling_price_list(quote), [
    ['enabled', '=', 1],
    ['selling', '=', 1],
    ['currency', 'in', ['INR', 'INR']],
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
    ['customer', '=', 'Acme'],
    ['docstatus', '=', 1],
    ['outstanding_amount', '=', 0],
    ['posting_date', '>=', '2031-09-01'],
  ];
  const list = { schemaName: 'SalesInvoice', canCreate: true, filters };

  await ListView.methods.makeNewDoc.call(list);

  const name = decodeURIComponent(routes[0].split('/').at(-1));
  const invoice = await getFrappeDoc('SalesInvoice', name);
  assert.equal(invoice.customer, 'Acme');
  assert.equal(invoice.docstatus, 0);
  assert.deepEqual(getNewDocValues('SalesInvoice', filters), {
    customer: 'Acme',
  });
});

test('a record created from a link takes the values its filters choose', () => {
  const sale = newInvoice('SalesInvoice');
  const { filters } = frappeModels.SalesInvoice;

  assert.deepEqual(getNewDocValues('Account', filters.debit_to(sale)), {
    is_group: false,
    account_type: 'Receivable',
  });
  assert.deepEqual(
    getNewDocValues('PriceList', filters.selling_price_list(sale)),
    {
      enabled: true,
      selling: true,
      currency: 'INR',
    }
  );
});

test("a row's transfer unit is its item's stock unit or one of its conversions", async () => {
  const sale = newInvoice('SalesInvoice');
  sale.push('items', { item_code: 'Pen', stock_uom: 'Unit' });
  const row = sale.items[0];
  const requests = stubFrappe(() => ({
    data: [
      {
        stock_uom: 'Unit',
        uoms: [{ uom: 'Box', conversion_factor: 12 }],
      },
    ],
  }));

  await row.validations.uom('Unit');
  await row.validations.uom('Box');
  await assert.rejects(
    row.validations.uom('Crate'),
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
    'Delivery Note',
    'Accounting entries',
    'Return',
  ]);
  invoice.outstanding_amount = fyo.pesa(0);
  invoice.return_against = 'SINV-1000';
  assert.deepEqual(labels(invoice), ['Delivery Note', 'Accounting entries']);
});

test('a purchase offers a receipt until every tracked row is received', () => {
  setSettings();
  const invoice = newInvoice('PurchaseInvoice', {
    docstatus: 1,
    per_received: 40,
  });
  const receipt = frappeModels.PurchaseInvoice.getActions(fyo).find(
    ({ label }) => label === 'Purchase Receipt'
  );

  assert.equal(receipt.condition(invoice), true);
  invoice.per_received = 100;
  assert.equal(receipt.condition(invoice), false);
});

test('Return Against shows while returns are on, or once it is set', () => {
  for (const schemaName of ['SalesInvoice', 'PurchaseInvoice']) {
    setSettings();
    const draft = newInvoice(schemaName);
    const isHidden = () =>
      draft.getFieldState(draft.fieldMap.return_against).hidden;

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

  assert.equal(step('SalesInvoice'), 'Receive payment');
  assert.equal(
    step('SalesInvoice', { return_against: 'SINV-1000' }),
    'Make payment'
  );
  assert.equal(step('PurchaseInvoice'), 'Make payment');
  assert.equal(
    step('PurchaseInvoice', { return_against: 'PINV-1000' }),
    'Receive payment'
  );
});

test('a submitted quote makes a Frappe-backed sales invoice from its mapper', async () => {
  setSettings();
  const quote = newInvoice('Quotation', { docstatus: 1, name: 'SQUOT-1001' });
  const [makeInvoice] = frappeModels.Quotation.getActions(fyo);
  const requests = stubFrappe(() => ({
    message: {
      name: null,
      customer: 'Acme',
      items: [
        {
          name: null,
          item_code: 'Pen',
          qty: 2,
          stock_qty: 2,
          price_list_rate: 5,
        },
      ],
    },
  }));

  assert.equal(makeInvoice.condition(quote), true);
  // The mapper invoices only customers, not leads.
  quote.quotation_to = 'Books Lead';
  assert.equal(makeInvoice.condition(quote), false);
  quote.quotation_to = 'Books Customer';
  const invoice = await getMappedDoc(
    quote,
    'SalesInvoice',
    'make_sales_invoice'
  );

  assert.equal(
    requests[0].path,
    '/api/method/frappe.model.mapper.make_mapped_doc'
  );
  assert.match(requests[0].body.method, /books_quotation\.make_sales_invoice$/);
  assert.ok(invoice instanceof frappeModels.SalesInvoice);
  assert.equal(invoice.items[0].qty, 2);
  assert.ok(invoice.posting_date instanceof Date);
});

test('invoice lists show their columns and filter by status, totals and docstatus', () => {
  const filters = new ListFilters('SalesInvoice');
  const fieldnames = filters.fields.map(({ fieldname }) => fieldname);
  for (const fieldname of [
    'name',
    'naming_series',
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
    frappeModels.SalesInvoice.getListViewSettings().columns.map(
      (column) => column.fieldname ?? column
    ),
    [
      'name',
      'status',
      'customer',
      'posting_date',
      'base_grand_total',
      'outstanding_amount',
    ]
  );
});

test('the taxes template shows narrow above the Taxes table', () => {
  for (const schemaName of ['SalesInvoice', 'PurchaseInvoice', 'Quotation']) {
    const field = getSchema(schemaName).fields.find(
      ({ fieldname }) => fieldname === 'taxes_and_charges'
    );
    assert.equal(field.narrow, true, schemaName);
  }
});
