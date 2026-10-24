import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  frappeModels,
  fyo,
  getExportFields,
  getFrappeDoc,
  getLinkDisplayValue,
  getModel,
  getSchema,
  loadSaved,
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

const hidden = (doc, fieldname) =>
  doc.getFieldState(doc.fieldMap[fieldname]).hidden;

test('item group, unit, warehouse, batch and serial number forms show what they showed', () => {
  assert.deepEqual(getLayout('ItemGroup'), [
    'image | Image |  | Default',
    'item_group_name | Item Group Name |  | Default',
    'taxes | Taxes |  | Default',
    'gst_hsn_code | HSN/SAC | HSN/SAC Code | Default',
  ]);
  assert.deepEqual(getLayout('UOM'), [
    'uom_name | UOM Name |  | Default',
    'must_be_whole_number | Must be Whole Number |  | Default',
  ]);
  assert.deepEqual(getLayout('Warehouse'), [
    'warehouse_name | Warehouse Name |  | Default',
    'address | Address |  | Default',
  ]);
  assert.deepEqual(getLayout('Batch'), [
    'batch_id | Batch No |  | Default',
    'item | Item |  | Default',
    'expiry_date | Expiry Date |  | Default',
    'manufacturing_date | Manufacturing Date |  | Default',
  ]);
  assert.deepEqual(getLayout('SerialNo'), [
    'serial_no | Serial No |  | Default',
    'item_code | Item Code |  | Default',
    'description | Description | Serial Number Description | Default',
    'status | Status |  | Default',
  ]);
  assert.equal(getSchema('ItemGroup').label, 'Item Group');
  assert.deepEqual(getSchema('Batch').quickEditFields, [
    'item',
    'expiry_date',
    'manufacturing_date',
  ]);
});

test('item groups show HSN/SAC only for an Indian company', () => {
  const group = newFrappeDoc('ItemGroup', { item_group_name: 'Tea' });
  const columns = () =>
    getModel('ItemGroup')
      .getListViewSettings(fyo)
      .columns.map((column) => column.fieldname ?? column);

  fyo.singles.AccountingSettings = { country: 'United States' };
  assert.equal(hidden(group, 'gst_hsn_code'), true);
  assert.deepEqual(columns(), ['name']);
  fyo.singles.AccountingSettings = { country: 'India' };
  assert.equal(hidden(group, 'gst_hsn_code'), false);
  assert.deepEqual(columns(), ['name', 'gst_hsn_code']);
});

test('batch and serial number lists show their columns', () => {
  assert.deepEqual(getColumns('Batch'), [
    'name',
    'expiry_date',
    'manufacturing_date',
  ]);
  assert.deepEqual(getColumns('SerialNo'), [
    'name',
    'status',
    'item_code',
    'description',
  ]);
});

test('a serial number status badge takes the DocType state colour', () => {
  const [, status] = getModel('SerialNo').getListViewSettings().columns;
  const schema = getSchema('SerialNo');
  assert.deepEqual(status.badge({ schema, status: 'Delivered' }), {
    label: 'Delivered',
    theme: 'blue',
  });
  assert.deepEqual(status.badge({ schema, status: 'Active' }), {
    label: 'Active',
    theme: 'green',
  });
});

test("the address form is Frappe's Address, titled by its address title", () => {
  assert.deepEqual(getLayout('Address'), [
    'address_title | Address Title |  | Default',
    'address_type | Address Type |  | Default',
    'address_line1 | Address Line 1 |  | Default',
    'address_line2 | Address Line 2 |  | Default',
    'city | City/Town |  | Default',
    'county | County |  | Default',
    'state | State/Province |  | Default',
    'country | Country |  | Default',
    'pincode | Postal Code |  | Default',
    'email_id | Email Address |  | Default',
    'phone | Phone |  | Default',
    'fax | Fax |  | Default',
    'is_primary_address | Preferred Billing Address |  | Default',
    'is_shipping_address | Preferred Shipping Address |  | Default',
    'disabled | Disabled |  | Default',
    'links | Links |  | Reference',
  ]);
  const schema = getSchema('Address');
  const country = schema.fields.find((f) => f.fieldname === 'country');
  assert.equal(schema.titleField, 'address_title');
  assert.equal(schema.linkDisplayField, undefined);
  assert.equal(newFrappeDoc('Address').address_type, 'Billing');
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

test('a link shows an address by its name, without a request', async () => {
  requests.length = 0;

  assert.equal(
    await getLinkDisplayValue('Address', 'Home-Billing'),
    'Home-Billing'
  );
  assert.equal(await getLinkDisplayValue('Customer', 'Asha'), 'Asha');
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
  assert.equal(emptyMessages.state(address), 'Enter state');
  assert.equal(
    emptyMessages.state(newFrappeDoc('Address')),
    'Enter country to load states'
  );
  assert.equal(address.fieldMap.pos, undefined);
});

test('the lead form and list show what they showed, status coloured by state', () => {
  assert.deepEqual(getLayout('Lead'), [
    'lead_name | Full Name | Full Name | Default',
    'status | Status |  | Default',
    'email_id | Email | john@doe.com | Contacts',
    'mobile_no | Mobile No | Mobile | Contacts',
  ]);
  assert.deepEqual(getColumns('Lead'), [
    'name',
    'status',
    'email_id',
    'mobile_no',
  ]);
  const [, status] = getModel('Lead').getListViewSettings().columns;
  const schema = getSchema('Lead');
  assert.deepEqual(status.badge({ schema, status: 'Converted' }), {
    label: 'Converted',
    theme: 'green',
  });
  assert.deepEqual(status.badge({ schema, status: 'Do Not Contact' }), {
    label: 'Do Not Contact',
    theme: 'red',
  });
});

test('a lead makes a customer or a quote once saved', () => {
  const actions = getModel('Lead').getActions(fyo);
  assert.deepEqual(
    actions.map(({ label }) => label),
    ['Customer', 'Quotation']
  );
  assert.ok(
    actions.every(({ condition }) => !condition({ notInserted: true }))
  );
});

test('lead contacts are checked as Frappe checks them, with the Books messages', async () => {
  const lead = newFrappeDoc('Lead', { name: 'Asha' });
  await assert.rejects(lead.set('email_id', 'asha@'), {
    message: 'Invalid email: asha@',
  });
  await assert.rejects(lead.set('mobile_no', '98x'), {
    message: 'Invalid phone: 98x',
  });
  await lead.set('email_id', 'Asha <asha@example.com>, ops@example.com');
  await lead.set('mobile_no', '+91 (22) 555-0199');
  assert.equal(lead.mobile_no, '+91 (22) 555-0199');
});

test('a lead makes its customer with the server mapper, as an unsaved customer', async () => {
  const mapped = { doctype: 'Books Customer', name: 'Asha' };
  respond = () => ({
    message: {
      ...mapped,
      customer_name: 'Asha',
      lead_name: 'Asha',
      __islocal: 1,
    },
  });
  const lead = newFrappeDoc('Lead', { name: 'Asha' });
  await loadSaved(lead);
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
  assert.equal(route, '/edit/Customer/Asha');
  const customer = await getFrappeDoc('Customer', 'Asha');
  assert.deepEqual([customer.lead_name, customer.notInserted], ['Asha', true]);
});

test('saving or deleting a converted customer refreshes its open lead only', async () => {
  let leadStatus = 'Open';
  const saved = { name: 'Ravi', lead_name: 'Ravi' };
  respond = ({ method, path }) => {
    if (path === '/api/v2/document/Books Lead/Ravi') {
      return { data: { name: 'Ravi', status: leadStatus, modified: 'x' } };
    }
    return method === 'DELETE' ? { data: 'ok' } : { data: saved };
  };
  requests.length = 0;
  const lead = await getFrappeDoc('Lead', 'Ravi');
  const customer = newFrappeDoc('Customer', saved);
  const writes = () =>
    requests
      .filter(({ method }) => method !== 'GET')
      .map(({ method, path }) => `${method} ${path}`);

  leadStatus = 'Converted';
  await customer.sync();
  assert.equal(lead.status, 'Converted');
  leadStatus = 'Interested';
  await customer.delete();
  assert.equal(lead.status, 'Interested');
  assert.deepEqual(writes(), [
    'POST /api/v2/document/Books Customer',
    'DELETE /api/v2/document/Books Customer/Ravi',
  ]);
});

test('customer and supplier forms and lists show what they showed, without GST fields', () => {
  const supplierFields = [
    'image | Image |  | Default',
    'supplier_name | Supplier Name | Full Name | Default',
    'supplier_primary_contact | Primary Contact |  | Contact',
    'email_id | Email ID | john@doe.com | Contact',
    'mobile_no | Mobile No | Mobile No | Contact',
    'supplier_primary_address | Primary Address |  | Address',
    'primary_address | Primary Address Preview |  | Address',
    'accounts | Default Accounts |  | Billing',
    'default_currency | Billing Currency | INR | Billing',
    'tax_id | Tax ID |  | Billing',
    'outstanding_amount | Outstanding Amount |  | Billing',
    'address_line1 | Address Line 1 |  | Address',
    'address_line2 | Address Line 2 |  | Address',
    'city | City |  | Address',
    'state | State |  | Address',
    'pincode | Postal Code |  | Address',
    'country | Country |  | Address',
  ];
  assert.deepEqual(getLayout('Supplier'), supplierFields);
  assert.deepEqual(getLayout('Customer'), [
    'image | Image |  | Default',
    'customer_name | Customer Name | Full Name | Default',
    'customer_primary_contact | Customer Primary Contact |  | Contact',
    'email_id | Email Id | john@doe.com | Contact',
    'mobile_no | Mobile No | Mobile No | Contact',
    'customer_primary_address | Customer Primary Address |  | Address',
    'primary_address | Primary Address |  | Address',
    'accounts | Default Accounts |  | Billing',
    'default_currency | Billing Currency | INR | Billing',
    'lead_name | Lead |  | References',
    'loyalty_program | Loyalty Program |  | Loyalty Program',
    'loyalty_points | Loyalty Points |  | Loyalty Program',
    'tax_id | Tax ID |  | Billing',
    'outstanding_amount | Outstanding Amount |  | Billing',
    'address_line1 | Address Line 1 |  | Address',
    'address_line2 | Address Line 2 |  | Address',
    'city | City |  | Address',
    'state | State |  | Address',
    'pincode | Postal Code |  | Address',
    'country | Country |  | Address',
  ]);
  for (const schemaName of ['Customer', 'Supplier']) {
    const party = newFrappeDoc(schemaName);
    assert.equal(hidden(party, 'outstanding_amount'), true);
    assert.equal(hidden(party, 'tax_id'), false);
    assert.deepEqual(getColumns(schemaName), [
      'name',
      'email_id',
      'mobile_no',
      'outstanding_amount',
    ]);
  }
});

test('a new party asks for its contact and address, a saved one shows its primary ones', async () => {
  for (const [schemaName, key] of [
    ['Customer', 'customer'],
    ['Supplier', 'supplier'],
  ]) {
    const party = newFrappeDoc(schemaName, { name: `New ${key}` });
    const shown = (fieldname) => !hidden(party, fieldname);
    const entry = ['email_id', 'mobile_no', 'address_line1', 'country'];
    const primary = [`${key}_primary_contact`, `${key}_primary_address`];
    assert.ok(entry.every(shown) && !primary.some(shown), schemaName);
    assert.equal(
      party.getSectionDescription('Contact'),
      `Saved as the primary Contact for this ${key}`
    );
    await party.set('address_line1', '12 Harbour Road');
    assert.equal(party.getFrappeValues().address_line1, '12 Harbour Road');

    await loadSaved(party, { [primary[0]]: 'Asha-Asha' });
    assert.ok(primary.every(shown) && !entry.some(shown), schemaName);
    assert.equal('address_line1' in party.getFrappeValues(), false);
    assert.equal(party.getSectionDescription('Contact'), undefined);
    const sections = party
      .getFormFields(party.schema.fields)
      .filter(({ fieldname }) => primary.includes(fieldname))
      .map(({ section }) => section);
    assert.deepEqual(sections, ['Primary contact', 'Primary address']);
  }
});

test('a primary contact or address is picked from those linked to the party', async () => {
  const customer = newFrappeDoc('Customer', { name: 'Asha' });
  const { filters, emptyMessages } = getModel('Customer');
  const linked = [
    ['Dynamic Link', 'link_doctype', '=', 'Books Customer'],
    ['Dynamic Link', 'link_name', '=', 'Asha'],
  ];
  assert.deepEqual(await filters.customer_primary_contact(customer), linked);
  assert.deepEqual(await filters.customer_primary_address(customer), linked);
  assert.equal(
    emptyMessages.customer_primary_contact(customer),
    'No contacts linked to this customer'
  );
  const contactField = getSchema('Customer').fields.find(
    ({ fieldname }) => fieldname === 'customer_primary_contact'
  );
  assert.equal(contactField.create, false);
  // Files hold the DocType's fields, which the address a new party asks for is not.
  assert.ok(!getExportFields('Customer').some((f) => f.insertOnly));
});

test('a primary contact or address card shows its record', () => {
  const contact = getModel('Contact').linkCard.getContent({
    name: 'Asha-Asha',
    full_name: 'Asha',
    email_id: 'asha@example.com',
    mobile_no: null,
  });
  assert.deepEqual(contact, {
    title: 'Asha',
    lines: [{ icon: 'lucide-mail', text: 'asha@example.com' }],
  });

  const address = getModel('Address').linkCard.getContent({
    name: 'Asha-Billing',
    address_line1: '12 Harbour Road',
    address_line2: 'Unit 4',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
    country: 'India',
  });
  assert.deepEqual(address, {
    title: 'Asha-Billing',
    lines: [
      { icon: 'lucide-map-pin', text: '12 Harbour Road, Unit 4' },
      { text: 'Pune, Maharashtra 411001, India' },
    ],
  });
});

test('a customer shows loyalty fields only when the program is on', async () => {
  fyo.singles.AccountingSettings = {};
  const customer = newFrappeDoc('Customer');
  assert.equal(hidden(customer, 'loyalty_program'), true);
  assert.equal(hidden(customer, 'loyalty_points'), true);

  fyo.singles.AccountingSettings = { enable_loyalty_point_program: true };
  assert.equal(hidden(customer, 'loyalty_program'), false);
  assert.equal(hidden(customer, 'loyalty_points'), true);
  await customer.set('loyalty_program', 'Gold');
  assert.equal(hidden(customer, 'loyalty_points'), false);
  assert.equal(newFrappeDoc('Supplier').fieldMap.loyalty_program, undefined);
  fyo.singles.AccountingSettings = {};
});

test('a customer makes and lists sales, a supplier purchases', () => {
  const labels = (schemaName) =>
    getModel(schemaName)
      .getActions(fyo)
      .filter(({ condition }) => condition({ notInserted: false }))
      .map(({ label }) => label);
  assert.deepEqual(labels('Customer'), ['Create sale', 'View sales']);
  assert.deepEqual(labels('Supplier'), ['Create purchase', 'View purchases']);
});

test('a customer defaults to a receivable account, a supplier to a payable one', async () => {
  const accountType = async (schemaName) => {
    const party = newFrappeDoc(schemaName);
    await party.append('accounts');
    return getModel('PartyAccount').filters.account(party.accounts[0]);
  };
  assert.deepEqual(await accountType('Customer'), [
    ['is_group', '=', 0],
    ['account_type', '=', 'Receivable'],
  ]);
  assert.deepEqual(await accountType('Supplier'), [
    ['is_group', '=', 0],
    ['account_type', '=', 'Payable'],
  ]);
});

test('price list and item price forms show their fields; the list shows its use', () => {
  assert.deepEqual(getLayout('PriceList'), [
    'price_list_name | Price List Name |  | Default',
    'currency | Currency |  | Default',
    'selling | Selling |  | Default',
    'buying | Buying |  | Default',
    'enabled | Enabled |  | Default',
  ]);
  assert.deepEqual(getLayout('ItemPrice'), [
    'item_code | Item Code |  | Default',
    'uom | UOM |  | Default',
    'price_list | Price List |  | Default',
    'currency | Currency |  | Default',
    'selling | Selling |  | Default',
    'buying | Buying |  | Default',
    'price_list_rate | Rate |  | Default',
    'valid_from | Valid From |  | Default',
    'valid_upto | Valid Up To |  | Default',
  ]);
  const [, enabled, usage] =
    getModel('PriceList').getListViewSettings().columns;
  const row = { enabled: 1, selling: 1, buying: 1 };
  assert.equal(enabled.badge(row).label, 'Enabled');
  assert.equal(enabled.badge({}).label, 'Disabled');
  assert.equal(usage.badge(row).label, 'Sales and Purchase');
  assert.equal(usage.badge({ buying: 1 }).label, 'Purchase');
});

test("an item price takes its item's unit from the server preview", async () => {
  respond = ({ path, body }) => {
    if (path !== '/api/v2/method/run_doc_method') {
      return { data: [] };
    }
    return { docs: [{ ...body.document, uom: 'Kg' }] };
  };
  const price = newFrappeDoc('ItemPrice', { price_list: 'Retail' });
  await price.set('item_code', 'Sugar');

  await price.whenFilled();
  assert.equal(price.uom, 'Kg');
  assert.equal(requests.at(-1).body.method, 'preview');
});

test('a pricing rule row takes the unit of each item it is given', async () => {
  const units = { Sugar: 'Kg', Salt: 'Gram' };
  const sent = [];
  respond = ({ path, body }) => {
    if (path !== '/api/v2/method/run_doc_method') {
      return { data: [] };
    }
    // As the server's fetch_if_empty: an empty unit is the item's.
    const table = 'items';
    const rows = body.document[table].map((row) => {
      sent.push(row.uom ?? null);
      return { ...row, uom: row.uom || units[row.item_code] };
    });
    return { docs: [{ ...body.document, [table]: rows }] };
  };
  for (const [schemaName, table] of [['PricingRule', 'items']]) {
    sent.length = 0;
    const doc = newFrappeDoc(schemaName);
    await doc.append(table, { item_code: 'Sugar' });
    const row = doc[table][0];
    await doc.preview();
    assert.equal(row.uom, 'Kg');

    await row.set('uom', 'Gram');
    await doc.preview();
    assert.equal(row.uom, 'Gram');

    await row.set('item_code', 'Salt');
    await doc.preview();
    assert.equal(row.uom, 'Gram');

    await row.set('uom', 'Kg');
    await doc.preview();
    assert.equal(row.uom, 'Kg');
    assert.deepEqual(sent, [null, 'Gram', null, 'Kg']);
  }
});

test('the pricing rule form shows each discount scheme as it did', async () => {
  assert.deepEqual(getLayout('PricingRule').slice(0, 8), [
    'name | ID |  | Default',
    'naming_series | Number Series |  | Default',
    'disable | Disable |  | Default',
    'title | Title |  | Default',
    'items | Apply Rule On Item Code |  | Items',
    'price_or_product_discount | Price or Product Discount |  | Default',
    'coupon_code_based | Coupon Code Based |  | Default',
    'priority | Priority |  | Default',
  ]);
  const schema = getSchema('PricingRule');
  const field = (fieldname) =>
    schema.fields.find((f) => f.fieldname === fieldname);
  assert.equal(schema.naming, 'numberSeries');
  assert.equal(field('items').edit, true);
  assert.deepEqual(
    field('rate_or_discount').options.map(({ label }) => label),
    ['Rate', 'Discount Percentage', 'Discount Amount']
  );
  assert.equal(field('naming_series').setOnlyOnce, true);
  // Free items and applied items are picked, not created, as before.
  const creates = (schemaName, fieldnames) =>
    fieldnames.map(
      (name) =>
        getSchema(schemaName).fields.find((f) => f.fieldname === name).create
    );
  assert.deepEqual(creates('PricingRule', ['free_item', 'free_item_uom']), [
    false,
    false,
  ]);
  assert.deepEqual(creates('PricingRuleItemCode', ['item_code', 'uom']), [
    false,
    true,
  ]);
  assert.deepEqual(creates('ItemPrice', ['item_code', 'uom']), [true, false]);

  const rule = newFrappeDoc('PricingRule');
  assert.equal(rule.naming_series, 'PRLE-');
  const shown = () =>
    rule.schema.fields
      .filter(
        (f) => !f.meta && f.section !== 'Default' && f.section !== 'Items'
      )
      .filter((f) => !hidden(rule, f.fieldname))
      .map((f) => f.fieldname);
  await rule.set('price_or_product_discount', 'Price');
  await rule.set('rate_or_discount', 'Discount Percentage');
  assert.deepEqual(shown().slice(0, 2), [
    'rate_or_discount',
    'discount_percentage',
  ]);
  assert.equal(
    rule.getFieldState(rule.fieldMap.rate_or_discount).required,
    true
  );
  await rule.set('price_or_product_discount', 'Product');
  await rule.set('is_recursive', true);
  assert.deepEqual(shown().slice(0, 6), [
    'free_item',
    'free_qty',
    'free_item_uom',
    'round_free_qty',
    'is_recursive',
    'recurse_for',
  ]);
  assert.equal(
    rule.getFieldState(rule.fieldMap.rate_or_discount).required,
    false
  );
});

test('pricing rule limits show the message /books showed at each field', async () => {
  const rule = newFrappeDoc('PricingRule', { max_qty: 5 });
  await assert.rejects(rule.set('min_qty', 6), {
    message: 'Minimum Quantity should be less than the Maximum Quantity.',
  });
  await rule.set('max_qty', 0);
  await rule.set('min_qty', 6);
  await assert.rejects(rule.set('max_qty', 5), {
    message: 'Maximum Quantity should be greater than the Minimum Quantity.',
  });
  await rule.set('max_amt', fyo.pesa(10));
  await assert.rejects(rule.set('min_amt', fyo.pesa(10)), {
    message: 'Minimum Amount should be less than the Maximum Amount.',
  });
  await rule.set('valid_upto', new Date('2026-01-01'));
  await assert.rejects(rule.set('valid_from', new Date('2026-02-01')), {
    message: 'Valid From Date should be less than Valid To Date.',
  });
});

test('coupon and invoice links filter pricing rules and price lists by Frappe fieldnames', () => {
  assert.deepEqual(frappeModels.CouponCode.filters.pricing_rule(), [
    ['coupon_code_based', '=', 1],
  ]);
  assert.deepEqual(frappeModels.SalesInvoice.filters.selling_price_list(), [
    ['enabled', '=', 1],
    ['selling', '=', 1],
  ]);
  assert.deepEqual(frappeModels.PurchaseInvoice.filters.buying_price_list(), [
    ['enabled', '=', 1],
    ['buying', '=', 1],
  ]);
});

test('the coupon form shows what it showed and makes a new coupon a code from its name', async () => {
  assert.deepEqual(getLayout('CouponCode'), [
    'coupon_name | Coupon Name |  | Default',
    'coupon_type | Coupon Type |  | Default',
    'coupon_code | Coupon Code |  | Default',
    'is_enabled | Is Enabled |  | Default',
    'pricing_rule | Pricing Rule |  | Default',
    'min_amt | Min Amt |  | Amount',
    'max_amt | Max Amt |  | Amount',
    'valid_from | Valid From |  | Validity and Usage',
    'valid_upto | Valid Up To |  | Validity and Usage',
    'maximum_use | Maximum Use |  | Validity and Usage',
    'used | Used |  | Validity and Usage',
  ]);
  assert.deepEqual(getColumns('CouponCode'), [
    'name',
    'coupon_code',
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
  assert.equal(coupon.coupon_code, 'SAVETWEN');
  await coupon.set('coupon_name', 'Spring Sale');
  assert.equal(coupon.coupon_code, 'SPRINGSA');
  await coupon.set('coupon_code', 'SPRING');
  await coupon.set('coupon_name', 'Spring Offer');
  assert.equal(coupon.coupon_code, 'SPRING');
  await loadSaved(coupon);
  await coupon.set('coupon_code', '');
  await coupon.set('coupon_name', 'Other');
  assert.equal(coupon.coupon_code, '');
});

test('a coupon code leaves its amount and date rules to the server', async () => {
  const coupon = newFrappeDoc('CouponCode', {
    pricing_rule: 'Promotion',
    valid_from: new Date('2026-06-01'),
    min_amt: fyo.pesa(20),
  });
  await coupon.set('valid_upto', new Date('2026-05-01'));
  await coupon.set('max_amt', fyo.pesa(5));
  assert.equal(coupon.max_amt.float, 5);
});

test('the loyalty program form and list show what they showed', async () => {
  assert.deepEqual(getLayout('LoyaltyProgram'), [
    'loyalty_program_name | Loyalty Program Name |  | Default',
    'from_date | From Date |  | Default',
    'to_date | To Date |  | Default',
    'is_enabled | Is Enabled |  | Default',
    'status | Status |  | Default',
    'collection_rules | Collection Rules |  | Default',
    'conversion_factor | Conversion Factor |  | Default',
    'expiry_duration | Expiry Duration (in days) |  | Default',
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
  const tiers = getSchema('LoyaltyProgramCollection');
  assert.deepEqual(tiers.tableFields, [
    'tier_name',
    'min_spent',
    'collection_factor',
  ]);
  assert.equal(
    field(tiers, 'collection_factor').sub_label,
    'For how much spent = 1 Loyalty Point'
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
