import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  frappeModels,
  fyo,
  getSchema,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

stubFrappe(({ path, body }) =>
  path.endsWith('get_books_meta')
    ? { message: getBooksMeta(body.doctypes) }
    : { data: [] }
);
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();

/** The fields a form shows, as `fieldname | label | placeholder`. */
function getLayout(schemaName) {
  return getSchema(schemaName)
    .fields.filter((field) => !field.meta && !field.hidden)
    .map(({ fieldname, label, placeholder }) =>
      [fieldname, label, placeholder ?? ''].join(' | ')
    );
}

test('a tax template shows its title and tax rate rows', () => {
  const tax = getSchema('ItemTaxTemplate');
  assert.equal(tax.label, 'Tax Template');
  assert.deepEqual(getLayout('ItemTaxTemplate'), [
    'title | Title | ',
    'taxes | Tax Rates | ',
  ]);
  assert.deepEqual(tax.quickEditFields, ['taxes']);
  assert.deepEqual(getLayout('ItemTaxTemplateDetail'), [
    'tax_type | Tax | ',
    'payment_account | Tax Payment Account | ',
    'tax_rate | Tax Rate | 0%',
  ]);
  const detail = getSchema('ItemTaxTemplateDetail');
  assert.deepEqual(detail.tableFields, [
    'tax_type',
    'payment_account',
    'tax_rate',
  ]);
  assert.ok(
    detail.fields.find((field) => field.fieldname === 'tax_type').create
  );
  assert.deepEqual(
    frappeModels.ItemTaxTemplate.getListViewSettings(fyo).columns,
    ['name']
  );
});

test('a mode of payment shows its type, default account and clearance date', () => {
  const mode = getSchema('ModeOfPayment');
  assert.equal(mode.label, 'Mode of Payment');
  assert.deepEqual(getLayout('ModeOfPayment'), [
    'mode_of_payment | Mode of Payment | ',
    'type | Type | ',
    'accounts | Accounts | ',
    'default_account | Default Account | ',
    'requires_clearance_date | Requires Clearance Date | ',
  ]);
  // The Default Account field edits the current company's row.
  assert.equal(
    mode.fields.find((f) => f.fieldname === 'accounts').hidden,
    true
  );
  assert.equal(
    mode.fields.find((f) => f.fieldname === 'default_account').companyTable,
    'accounts'
  );
  assert.deepEqual(mode.quickEditFields, [
    'type',
    'default_account',
    'requires_clearance_date',
  ]);
  const account = getSchema('ModeofPaymentAccount').fields.find(
    (field) => field.fieldname === 'default_account'
  );
  assert.equal(account.create, false);
  assert.deepEqual(
    frappeModels.ModeOfPayment.getListViewSettings(fyo).columns,
    ['name', 'type']
  );
});

test('a currency shows its name, fraction and symbol, not Frappe-only settings', () => {
  const currency = getSchema('Currency');
  assert.equal(currency.naming, 'manual');
  assert.deepEqual(getLayout('Currency'), [
    'currency_name | Currency Name | ',
    'fraction | Fraction | ',
    'fraction_units | Fraction Units | ',
    'smallest_currency_fraction_value | Smallest Currency Fraction Value | ',
    'symbol | Symbol | ',
  ]);
  assert.deepEqual(currency.quickEditFields, ['symbol']);
  const name = currency.fields.find((field) => field.fieldname === 'name');
  assert.equal(name.label, 'Currency Name');
});

test('a number series shows its prefix, counter and labelled reference types', () => {
  const series = getSchema('NumberSeries');
  assert.deepEqual(getLayout('NumberSeries'), [
    'name | Prefix | ',
    'start | Start | ',
    'pad_zeros | Digits | ',
    'reference_type | Reference Type | ',
    'current | Current | ',
  ]);
  assert.deepEqual(series.quickEditFields, [
    'reference_type',
    'start',
    'pad_zeros',
  ]);
  const referenceType = series.fields.find(
    (field) => field.fieldname === 'reference_type'
  );
  const labels = Object.fromEntries(
    referenceType.options.map(({ value, label }) => [value, label])
  );
  assert.equal(labels.SalesInvoice, 'Sales Invoice');
  assert.equal(labels.PaymentEntry, 'Payment Entry');
  const digits = series.fields.find(
    ({ fieldname }) => fieldname === 'pad_zeros'
  );
  assert.match(digits.sub_label, /leading zeros/);
  // No document can use a series without a type, so a new one asks for it.
  assert.equal(labels['-'], undefined);
  assert.equal(referenceType.default, undefined);
});

test('number series links filter and create by reference_type', async () => {
  const { SalesInvoice, Defaults, PaymentEntry, JournalEntry, StockEntry } =
    frappeModels;
  const invoice = { schemaName: 'SalesInvoice' };
  const series = (schemaName) => [['reference_type', '=', schemaName]];
  assert.deepEqual(
    await SalesInvoice.filters.naming_series(invoice),
    series('SalesInvoice')
  );
  assert.deepEqual(
    PaymentEntry.filters.naming_series(),
    series('PaymentEntry')
  );
  assert.deepEqual(
    JournalEntry.filters.naming_series(),
    series('JournalEntry')
  );
  assert.deepEqual(StockEntry.filters.naming_series(), series('StockEntry'));
  assert.deepEqual(
    Defaults.createFilters.delivery_note_number_series(),
    series('DeliveryNote')
  );
});

test('a currency created from /books is inserted enabled, for link pickers', async () => {
  const requests = stubFrappe(({ body }) => ({
    data: { ...body, name: body.currency_name, modified: '' },
  }));
  const currency = newFrappeDoc('Currency', { name: 'Test Coin' });
  await currency.set('symbol', 'TC');
  await currency.sync();

  const [insert] = requests.filter(({ method }) => method === 'POST');
  assert.equal(insert.path, '/api/v2/document/Currency');
  assert.deepEqual(
    [insert.body.currency_name, insert.body.symbol, insert.body.enabled],
    ['Test Coin', 'TC', 1]
  );
  assert.equal(currency.name, 'Test Coin');
});
