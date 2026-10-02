import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateHidden,
  evaluateRequired,
  frappeModels,
  fyo,
  getFrappeDoc,
  getLinkDisplayValue,
  getModel,
  getSchema,
  newFrappeDoc,
  searchFrappeLink,
  setLanguageMapOnTranslationString,
} from './helpers/frappe.mjs';
import { getFilterFields } from './helpers/accounting.mjs';
import {
  getColumns,
  getLayout,
  loadFrappeModels,
} from './helpers/frappeModels.mjs';

// Each test answers the requests after startup its own way.
let respond = () => ({ data: [] });
const requests = await loadFrappeModels(frappeModels, (request) =>
  respond(request)
);

const hidden = (doc, fieldname) => evaluateHidden(doc.fieldMap[fieldname], doc);

test('item group, unit, location, batch and serial number forms show what they showed', () => {
  assert.deepEqual(getLayout('ItemGroup'), [
    'image | Image |  | Default',
    'name | Name | Name | Default',
    'tax | Tax | Tax | Default',
    'hsn_code | HSN/SAC | HSN/SAC Code | Default',
  ]);
  assert.deepEqual(getLayout('UOM'), [
    'name | UOM | Item Name | Default',
    'is_whole | Is Whole |  | Default',
  ]);
  assert.deepEqual(getLayout('Location'), [
    'name | Location Name |  | Default',
    'address | Address |  | Default',
  ]);
  assert.deepEqual(getLayout('Batch'), [
    'name | Batch |  | Default',
    'item | Item |  | Default',
    'expiry_date | Expiry Date |  | Default',
    'manufacture_date | Manufacture Date |  | Default',
  ]);
  assert.deepEqual(getLayout('SerialNumber'), [
    'name | Serial Number |  | Default',
    'item | Item |  | Default',
    'description | Description | Serial Number Description | Default',
    'status | Status |  | Default',
  ]);
  assert.equal(getSchema('ItemGroup').label, 'Item Group');
  assert.deepEqual(getSchema('Batch').quickEditFields, [
    'item',
    'expiry_date',
    'manufacture_date',
  ]);
});

test('item groups show HSN/SAC only for an Indian company', () => {
  const group = newFrappeDoc('ItemGroup', { name: 'Tea' });
  const columns = () =>
    getModel('ItemGroup')
      .getListViewSettings(fyo)
      .columns.map((column) => column.fieldname ?? column);

  fyo.singles.AccountingSettings = { country: 'United States' };
  assert.equal(hidden(group, 'hsn_code'), true);
  assert.deepEqual(columns(), ['name', 'tax']);
  fyo.singles.AccountingSettings = { country: 'India' };
  assert.equal(hidden(group, 'hsn_code'), false);
  assert.deepEqual(columns(), ['name', 'tax', 'hsn_code']);
});

test('batch and serial number lists show their columns', () => {
  assert.deepEqual(getColumns('Batch'), [
    'name',
    'expiry_date',
    'manufacture_date',
  ]);
  assert.deepEqual(getColumns('SerialNumber'), [
    'name',
    'status',
    'item',
    'description',
  ]);
});

test('a serial number status badge takes the DocType state colour', () => {
  const [, status] = getModel('SerialNumber').getListViewSettings().columns;
  const schema = getSchema('SerialNumber');
  assert.deepEqual(status.badge({ schema, status: 'Delivered' }), {
    label: 'Delivered',
    theme: 'blue',
  });
  assert.deepEqual(status.badge({ schema, status: 'Active' }), {
    label: 'Active',
    theme: 'green',
  });
});

test('the address form shows what it showed, and links show its display text', () => {
  assert.deepEqual(getLayout('Address'), [
    'name | Address Name |  | Default',
    'address_line1 | Address Line 1 | Address Line 1 | Default',
    'address_line2 | Address Line 2 | Address Line 2 | Default',
    'city | City / Town | City / Town | Default',
    'country | Country | Country | Default',
    'state | State | State | Default',
    'postal_code | Postal Code | Postal Code | Default',
    'email_address | Email Address | Email Address | Contacts',
    'phone | Phone | Phone | Contacts',
    'fax | Fax |  | Contacts',
    'address_display | Address Display |  | Miscellaneous',
  ]);
  const schema = getSchema('Address');
  const country = schema.fields.find((f) => f.fieldname === 'country');
  assert.equal(schema.linkDisplayField, 'address_display');
  // Frappe's own Country, picked but not created from an address.
  assert.deepEqual(
    [country.fieldtype, country.target, country.create],
    ['Link', 'Country', false]
  );
  assert.equal(getModel('Address').lists.country, undefined);
  assert.deepEqual(getColumns('Address'), [
    'name',
    'address_line1',
    'city',
    'state',
    'country',
  ]);
});

test("a link shows an address's display text and other records' names", async () => {
  respond = ({ path }) =>
    path === '/api/v2/document/Books Address'
      ? { data: [{ address_display: '7 Hill Street' }] }
      : { data: [] };
  requests.length = 0;

  assert.equal(await getLinkDisplayValue('Address', 'Home'), '7 Hill Street');
  assert.equal(await getLinkDisplayValue('Address', undefined), '');
  assert.equal(await getLinkDisplayValue('Party', 'Asha'), 'Asha');
  assert.deepEqual(
    requests.map(({ path }) => path),
    ['/api/v2/document/Books Address']
  );
  assert.deepEqual(requests[0].params.fields, ['address_display']);
  assert.deepEqual(requests[0].params.filters, [['name', '=', 'Home']]);
});

test('a link to an open address shows its text without a request', async () => {
  const address = newFrappeDoc('Address', { address_display: '9 Lake Road' });
  requests.length = 0;

  assert.equal(
    await getLinkDisplayValue('Address', address.name),
    '9 Lake Road'
  );
  assert.deepEqual(requests, []);
});

test("countries are Frappe's, shown and searched by their names", async () => {
  assert.deepEqual(getLayout('Country'), [
    'country_name | Country Name |  | Default',
  ]);
  respond = () => ({ message: [{ name: 'India' }] });
  requests.length = 0;

  assert.deepEqual(await searchFrappeLink('Country', 'Ind', null, 10), [
    { label: 'India', value: 'India', record: { name: 'India' } },
  ]);
  assert.equal(
    requests[0].path,
    '/api/method/frappe.desk.search.search_widget'
  );
  // Frappe matches a translated doctype's names in Python, so letters are not spread.
  assert.deepEqual(
    [requests[0].body.doctype, requests[0].body.txt],
    ['Country', 'Ind']
  );

  // As Frappe's link search, a translated doctype's names show translated.
  setLanguageMapOnTranslationString({ India: { translation: 'Indien' } });
  try {
    const [india] = await searchFrappeLink('Country', 'Ind', null, 10);
    assert.deepEqual([india.label, india.value], ['Indien', 'India']);
  } finally {
    setLanguageMapOnTranslationString(undefined);
  }
});

test('an address lists Indian states for India and has no place of supply', () => {
  fyo.store.indianStates = { 27: 'Maharashtra', '07': 'Delhi' };
  const address = newFrappeDoc('Address', { country: 'India' });
  const { lists, emptyMessages } = getModel('Address');
  assert.deepEqual(lists.state(address), ['Delhi', 'Maharashtra']);
  assert.deepEqual(
    lists.state(newFrappeDoc('Address', { country: 'Chile' })),
    []
  );
  assert.equal(emptyMessages.state(address), 'Enter State');
  assert.equal(
    emptyMessages.state(newFrappeDoc('Address')),
    'Enter Country to load States'
  );
  assert.equal(address.fieldMap.pos, undefined);
});

test('an address leaves its display text to the server', async () => {
  const address = newFrappeDoc('Address', { name: 'Office' });
  await address.setMultiple({
    address_line1: '42 Market Road',
    city: 'Mumbai',
    country: 'India',
  });
  assert.ok(!address.address_display);
});

test('the lead form and list show what they showed, status coloured by state', () => {
  assert.deepEqual(getLayout('Lead'), [
    'name | Name | Full Name | Default',
    'status | Status |  | Default',
    'email | Email | john@doe.com | Contacts',
    'mobile | Mobile | Mobile | Contacts',
    'address | Address |  | Contacts',
  ]);
  assert.deepEqual(getColumns('Lead'), ['name', 'status', 'email', 'mobile']);
  const [, status] = getModel('Lead').getListViewSettings().columns;
  const schema = getSchema('Lead');
  assert.deepEqual(status.badge({ schema, status: 'Converted' }), {
    label: 'Converted',
    theme: 'green',
  });
  assert.deepEqual(status.badge({ schema, status: 'Do not Contact' }), {
    label: 'Do not Contact',
    theme: 'red',
  });
});

test('a lead makes a customer or a quote once saved', () => {
  const actions = getModel('Lead').getActions(fyo);
  assert.deepEqual(
    actions.map(({ label }) => label),
    ['Customer', 'Sales Quote']
  );
  assert.ok(
    actions.every(({ condition }) => !condition({ notInserted: true }))
  );
});

test('lead contacts are checked as Frappe checks them, with the Books messages', async () => {
  const lead = newFrappeDoc('Lead', { name: 'Asha' });
  await assert.rejects(lead.set('email', 'asha@'), {
    message: 'Invalid email: asha@',
  });
  await assert.rejects(lead.set('mobile', '98x'), {
    message: 'Invalid phone: 98x',
  });
  await lead.set('email', 'Asha <asha@example.com>, ops@example.com');
  await lead.set('mobile', '+91 (22) 555-0199');
  assert.equal(lead.mobile, '+91 (22) 555-0199');
});

test('a lead makes its customer with the server mapper, as an unsaved party', async () => {
  const mapped = { doctype: 'Books Party', name: 'Asha', role: 'Customer' };
  respond = () => ({ message: { ...mapped, from_lead: 'Asha', __islocal: 1 } });
  const lead = newFrappeDoc('Lead', { name: 'Asha' });
  lead._notInserted = false;
  const { action } = getModel('Lead')
    .getActions(fyo)
    .find(({ label }) => label === 'Customer');
  let route = '';
  await action(lead, { push: (to) => (route = to) });

  assert.deepEqual(requests.at(-1).body, {
    method:
      'frappe_books.frappe_books.doctype.books_lead.books_lead.make_customer',
    source_name: 'Asha',
  });
  assert.equal(route, '/edit/Party/Asha');
  const party = await getFrappeDoc('Party', 'Asha');
  assert.deepEqual(
    [party.role, party.from_lead, party.notInserted],
    ['Customer', 'Asha', true]
  );
});

test('a party leaves its default account and currency to the server', async () => {
  const party = newFrappeDoc('Party', {
    name: 'Acme',
    role: 'Customer',
    default_account: 'Debtors',
  });
  await party.set('role', 'Supplier');
  assert.ok(!party.default_account);
  assert.ok(!party.currency);
});

test('saving or deleting a converted party refreshes its open lead only', async () => {
  let leadStatus = 'Open';
  const saved = { name: 'Ravi', role: 'Customer', from_lead: 'Ravi' };
  respond = ({ method, path }) => {
    if (path === '/api/v2/document/Books Lead/Ravi') {
      return { data: { name: 'Ravi', status: leadStatus, modified: 'x' } };
    }
    return method === 'DELETE' ? { data: 'ok' } : { data: saved };
  };
  requests.length = 0;
  const lead = await getFrappeDoc('Lead', 'Ravi');
  const party = newFrappeDoc('Party', { ...saved, role: 'Customer' });
  const writes = () =>
    requests
      .filter(({ method }) => method !== 'GET')
      .map(({ method, path }) => `${method} ${path}`);

  leadStatus = 'Converted';
  await party.sync();
  assert.equal(lead.status, 'Converted');
  leadStatus = 'Interested';
  await party.delete();
  assert.equal(lead.status, 'Interested');
  assert.deepEqual(writes(), [
    'POST /api/v2/document/Books Party',
    'DELETE /api/v2/document/Books Party/Ravi',
  ]);
});

test('the party form and list show what they showed, without GST fields', () => {
  assert.deepEqual(getLayout('Party'), [
    'image | Image |  | Default',
    'name | Name | Full Name | Default',
    'role | Role |  | Default',
    'email | Email | john@doe.com | Contacts',
    'phone | Phone | Phone | Contacts',
    'address | Address |  | Contacts',
    'default_account | Default Account |  | Billing',
    'currency | Currency | INR | Billing',
    'from_lead | From Lead |  | References',
    'loyalty_program | Loyalty Program |  | Loyalty Program',
    'loyalty_points | Loyalty Points |  | Loyalty Program',
    'tax_id | Tax ID |  | Billing',
    'outstanding_amount | Outstanding Amount |  | Billing',
  ]);
  const party = newFrappeDoc('Party');
  assert.equal(hidden(party, 'outstanding_amount'), true);
  assert.equal(hidden(party, 'tax_id'), false);
  assert.deepEqual(getColumns('Party'), [
    'name',
    'email',
    'phone',
    'outstanding_amount',
  ]);
});

test('a customer shows loyalty fields only when the program is on', async () => {
  fyo.singles.AccountingSettings = {};
  const party = newFrappeDoc('Party', { role: 'Customer' });
  assert.equal(hidden(party, 'loyalty_program'), true);
  assert.equal(hidden(party, 'loyalty_points'), true);

  fyo.singles.AccountingSettings = { enable_loyalty_program: true };
  assert.equal(hidden(party, 'loyalty_program'), false);
  assert.equal(hidden(party, 'loyalty_points'), true);
  await party.set('loyalty_program', 'Gold');
  assert.equal(hidden(party, 'loyalty_points'), false);
  await party.set('role', 'Supplier');
  assert.equal(hidden(party, 'loyalty_program'), true);
  assert.equal(hidden(party, 'loyalty_points'), true);
  fyo.singles.AccountingSettings = {};
});

test('a party makes and lists the invoices its role allows', () => {
  const actions = getModel('Party').getActions(fyo);
  const labels = (role) =>
    actions
      .filter(({ condition }) => condition({ notInserted: false, role }))
      .map(({ label }) => label);
  assert.deepEqual(labels('Customer'), ['Create Sale', 'View Sales']);
  assert.deepEqual(labels('Supplier'), ['Create Purchase', 'View Purchases']);
  assert.equal(labels('Both').length, 4);
  assert.deepEqual(
    getModel('Party').filters.default_account({ role: 'Both' }),
    [
      ['is_group', '=', 0],
      ['account_type', 'in', ['Payable', 'Receivable']],
    ]
  );
});

test('the price list form shows its item prices; the list shows its use', () => {
  assert.deepEqual(getLayout('PriceList'), [
    'name | Name |  | Default',
    'is_enabled | Is Price List Enabled |  | Default',
    'is_sales | For Sales |  | Default',
    'is_purchase | For Purchase |  | Default',
    'price_list_item | Item Prices |  | Item Prices',
  ]);
  assert.deepEqual(getSchema('PriceListItem').tableFields, [
    'item',
    'unit',
    'rate',
  ]);
  const [, enabled, usage] =
    getModel('PriceList').getListViewSettings().columns;
  const row = { is_enabled: 1, is_sales: 1, is_purchase: 1 };
  assert.equal(enabled.badge(row).label, 'Enabled');
  assert.equal(enabled.badge({}).label, 'Disabled');
  assert.equal(usage.badge(row).label, 'Sales and Purchase');
  assert.equal(usage.badge({ is_purchase: 1 }).label, 'Purchase');
});

test("a price list row takes its item's unit from the server preview", async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  respond = ({ path, body }) => {
    if (path !== '/api/v2/method/run_doc_method') {
      return { data: [] };
    }
    const [row] = body.document.price_list_item;
    return {
      docs: [{ ...body.document, price_list_item: [{ ...row, unit: 'Kg' }] }],
    };
  };
  const prices = newFrappeDoc('PriceList', { name: 'Retail' });
  await prices.append('price_list_item', { item: 'Sugar' });
  await prices.price_list_item[0].set('rate', fyo.pesa(5));

  t.mock.timers.tick(300);
  await waitFor(() => prices.price_list_item[0].unit === 'Kg');
  assert.equal(requests.at(-1).body.method, 'preview');
});

test('a price list or pricing rule row takes the unit of each item it is given', async () => {
  const units = { Sugar: 'Kg', Salt: 'Gram' };
  const sent = [];
  respond = ({ path, body }) => {
    if (path !== '/api/v2/method/run_doc_method') {
      return { data: [] };
    }
    // As the server's fetch_if_empty: an empty unit is the item's.
    const table = body.document.price_list_item
      ? 'price_list_item'
      : 'applied_items';
    const rows = body.document[table].map((row) => {
      sent.push(row.unit ?? null);
      return { ...row, unit: row.unit || units[row.item] };
    });
    return { docs: [{ ...body.document, [table]: rows }] };
  };
  for (const [schemaName, table] of [
    ['PriceList', 'price_list_item'],
    ['PricingRule', 'applied_items'],
  ]) {
    sent.length = 0;
    const doc = newFrappeDoc(schemaName);
    await doc.append(table, { item: 'Sugar' });
    const row = doc[table][0];
    await doc.preview();
    assert.equal(row.unit, 'Kg');

    await row.set('unit', 'Gram');
    await doc.preview();
    assert.equal(row.unit, 'Gram');

    await row.set('item', 'Salt');
    await doc.preview();
    assert.equal(row.unit, 'Gram');

    await row.set('unit', 'Kg');
    await doc.preview();
    clearTimeout(doc._previewTimer);
    assert.equal(row.unit, 'Kg');
    assert.deepEqual(sent, [null, 'Gram', null, 'Kg']);
  }
});

test('the pricing rule form shows each discount scheme as it did', async () => {
  assert.deepEqual(getLayout('PricingRule').slice(0, 8), [
    'name | ID |  | Default',
    'number_series | Number Series |  | Default',
    'is_enabled | Is Pricing Rule Enabled |  | Default',
    'title | Title |  | Default',
    'applied_items | Applied Items |  | Items',
    'discount_type | Discount Type |  | Default',
    'is_coupon_code_based | Is Coupon Code Based |  | Default',
    'priority | Priority |  | Default',
  ]);
  const schema = getSchema('PricingRule');
  const field = (fieldname) =>
    schema.fields.find((f) => f.fieldname === fieldname);
  assert.equal(schema.naming, 'numberSeries');
  assert.equal(field('applied_items').edit, true);
  assert.deepEqual(
    field('price_discount_type').options.map(({ label }) => label),
    ['Rate', 'Discount Percentage', 'Discount Amount']
  );
  assert.equal(field('number_series').setOnlyOnce, true);
  // Free items and applied items are picked, not created, as before.
  const creates = (schemaName, fieldnames) =>
    fieldnames.map(
      (name) =>
        getSchema(schemaName).fields.find((f) => f.fieldname === name).create
    );
  assert.deepEqual(creates('PricingRule', ['free_item', 'free_item_unit']), [
    false,
    false,
  ]);
  assert.deepEqual(creates('PricingRuleItem', ['item', 'unit']), [false, true]);
  assert.deepEqual(creates('PriceListItem', ['item', 'unit']), [true, false]);

  const rule = newFrappeDoc('PricingRule');
  assert.equal(rule.number_series, 'PRLE-');
  const shown = () =>
    rule.schema.fields
      .filter(
        (f) => !f.meta && f.section !== 'Default' && f.section !== 'Items'
      )
      .filter((f) => !hidden(rule, f.fieldname))
      .map((f) => f.fieldname);
  await rule.set('discount_type', 'Price Discount');
  await rule.set('price_discount_type', 'percentage');
  assert.deepEqual(shown().slice(0, 2), [
    'price_discount_type',
    'discount_percentage',
  ]);
  assert.equal(evaluateRequired(rule.fieldMap.price_discount_type, rule), true);
  await rule.set('discount_type', 'Product Discount');
  await rule.set('is_recursive', true);
  assert.deepEqual(shown().slice(0, 6), [
    'free_item',
    'free_item_quantity',
    'free_item_unit',
    'round_free_item_qty',
    'is_recursive',
    'recurse_every',
  ]);
  assert.equal(
    evaluateRequired(rule.fieldMap.price_discount_type, rule),
    false
  );
  clearTimeout(rule._previewTimer);
});

test('pricing rule limits show the message /books showed at each field', async () => {
  const rule = newFrappeDoc('PricingRule', { max_quantity: 5 });
  await assert.rejects(rule.set('min_quantity', 6), {
    message: 'Minimum Quantity should be less than the Maximum Quantity.',
  });
  await rule.set('max_quantity', 0);
  await rule.set('min_quantity', 6);
  await assert.rejects(rule.set('max_quantity', 5), {
    message: 'Maximum Quantity should be greater than the Minimum Quantity.',
  });
  await rule.set('max_amount', fyo.pesa(10));
  await assert.rejects(rule.set('min_amount', fyo.pesa(10)), {
    message: 'Minimum Amount should be less than the Maximum Amount.',
  });
  await rule.set('valid_to', new Date('2026-01-01'));
  await assert.rejects(rule.set('valid_from', new Date('2026-02-01')), {
    message: 'Valid From Date should be less than Valid To Date.',
  });
  clearTimeout(rule._previewTimer);
});

test('coupon and invoice links filter pricing rules and price lists by Frappe fieldnames', () => {
  assert.deepEqual(frappeModels.CouponCode.filters.pricing_rule(), [
    ['is_coupon_code_based', '=', 1],
  ]);
  assert.deepEqual(
    frappeModels.SalesInvoice.filters.price_list({ isSales: true }),
    [
      ['is_enabled', '=', 1],
      ['is_sales', '=', 1],
    ]
  );
  assert.deepEqual(
    frappeModels.PurchaseInvoice.filters.price_list({ isSales: false }),
    [
      ['is_enabled', '=', 1],
      ['is_purchase', '=', 1],
    ]
  );
});

test('the coupon form shows what it showed and names a new coupon from its name', async () => {
  assert.deepEqual(getLayout('CouponCode'), [
    'name | Coupon Code |  | Default',
    'coupon_name | Name | Coupon Name | Default',
    'is_enabled | Is Enabled |  | Default',
    'pricing_rule | Pricing Rule |  | Default',
    'min_amount | Min Amount |  | Amount',
    'max_amount | Max Amount |  | Amount',
    'valid_from | Valid From |  | Validity and Usage',
    'valid_to | Valid To |  | Validity and Usage',
    'maximum_use | Maximum Use |  | Validity and Usage',
    'used | Used |  | Validity and Usage',
  ]);
  assert.deepEqual(getColumns('CouponCode'), [
    'name',
    'coupon_name',
    'pricing_rule',
    'maximum_use',
    'used',
  ]);
  const pricingRule = getSchema('CouponCode').fields.find(
    ({ fieldname }) => fieldname === 'pricing_rule'
  );
  assert.equal(pricingRule.create, false);

  const coupon = newFrappeDoc('CouponCode');
  await coupon.set('coupon_name', 'Save Twenty Five');
  assert.equal(coupon.name, 'SAVETWEN');
  coupon._notInserted = false;
  await coupon.set('coupon_name', 'Other');
  assert.equal(coupon.name, 'SAVETWEN');
});

test('a coupon code leaves its amount and date rules to the server', async () => {
  const coupon = newFrappeDoc('CouponCode', {
    pricing_rule: 'Promotion',
    valid_from: new Date('2026-06-01'),
    min_amount: fyo.pesa(20),
  });
  await coupon.set('valid_to', new Date('2026-05-01'));
  await coupon.set('max_amount', fyo.pesa(5));
  assert.equal(coupon.max_amount.float, 5);
});

test('the loyalty program form and list show what they showed', async () => {
  assert.deepEqual(getLayout('LoyaltyProgram'), [
    'name | Name | Name | Default',
    'from_date | From Date |  | Default',
    'to_date | To Date |  | Default',
    'is_enabled | Is Enabled |  | Default',
    'status | Status |  | Default',
    'collection_rules | Collection Rules |  | Default',
    'conversion_factor | Conversion Factor |  | Default',
    'expiry_duration | Expiry Duration |  | Default',
    'expense_account | Expense Account |  | Default',
    'maximum_use | Maximum Use |  | Validity and Usage',
    'used | Used |  | Validity and Usage',
  ]);
  const schema = getSchema('LoyaltyProgram');
  const field = (s, fieldname) =>
    s.fields.find((f) => f.fieldname === fieldname);
  assert.equal(field(schema, 'status').hidden, true);
  assert.equal(field(schema, 'expense_account').create, false);
  assert.equal(
    field(schema, 'conversion_factor').sub_label,
    '100 Points → 100 (Factor 1), 50 (Factor 0.5)'
  );
  const tiers = getSchema('CollectionRulesItems');
  assert.deepEqual(tiers.tableFields, [
    'tier_name',
    'collection_factor',
    'minimum_total_spent',
  ]);
  assert.equal(
    field(tiers, 'collection_factor').sub_label,
    'Sale 100→ 100 (1), 50 (0.5)'
  );

  const [, status] = getModel('LoyaltyProgram').getListViewSettings().columns;
  assert.deepEqual(status.badge({ schema, status: 'Maxed' }), {
    label: 'Maxed',
    theme: 'amber',
  });
  assert.deepEqual(getColumns('LoyaltyProgram'), [
    'name',
    'status',
    'from_date',
    'to_date',
  ]);
});

test('stored loyalty program statuses are offered as filters', () => {
  const fields = getFilterFields(
    getSchema('LoyaltyProgram').fields,
    getModel('LoyaltyProgram').getListViewSettings().columns
  );
  const status = fields.find((field) => field.fieldname === 'status');
  assert.deepEqual(
    status.options.map(({ value }) => value),
    ['Active', 'Disabled', 'Expired', 'Maxed']
  );
});

test('loyalty program usage shows the message /books showed, as the server does', async () => {
  const program = newFrappeDoc('LoyaltyProgram', { maximum_use: 2 });
  await assert.rejects(program.set('maximum_use', -1), {
    message: 'Maximum use cannot be negative',
  });
  await assert.rejects(program.set('used', -1), {
    message: 'Used count cannot be negative',
  });
  await assert.rejects(program.set('used', 3), {
    message: 'Used count cannot exceed maximum use limit',
  });
});

test('item enquiries list as before and are recorded through the REST API', async () => {
  assert.deepEqual(getLayout('ItemEnquiry'), [
    'name | ID |  | Default',
    'item | Item |  | Default',
    'customer | Customer |  | Default',
    'contact | Contact |  | Default',
    'description | Description |  | Default',
    'similar_product | Similar Product |  | Default',
  ]);
  assert.equal(getSchema('ItemEnquiry').create, false);
  assert.deepEqual(getColumns('ItemEnquiry'), [
    'item',
    'customer',
    'contact',
    'description',
    'similar_product',
  ]);

  respond = ({ body }) => ({ data: { ...body, name: '0000000001' } });
  requests.length = 0;
  const enquiry = newFrappeDoc('ItemEnquiry', {
    item: 'Pen',
    similar_product: 'Pencil',
  });
  await enquiry.sync();
  assert.equal(requests[0].path, '/api/v2/document/Books Item Enquiry');
  assert.equal(requests[0].body.similar_product, 'Pencil');
  assert.equal(enquiry.name, '0000000001');
});

async function waitFor(isDone) {
  for (let tries = 0; tries < 50 && !isDone(); tries++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(isDone());
}
