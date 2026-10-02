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

test('a tax template shows its name and detail rows as before', () => {
  const tax = getSchema('Tax');
  assert.equal(tax.label, 'Tax Template');
  assert.deepEqual(getLayout('Tax'), [
    'name | Name | ',
    'details | Details | ',
  ]);
  assert.deepEqual(tax.quickEditFields, ['details']);
  assert.deepEqual(getLayout('TaxDetail'), [
    'account | Tax Invoice Account | ',
    'payment_account | Tax Payment Account | ',
    'rate | Rate | 0%',
  ]);
  const detail = getSchema('TaxDetail');
  assert.deepEqual(detail.tableFields, ['account', 'payment_account', 'rate']);
  assert.ok(
    detail.fields.find((field) => field.fieldname === 'account').create
  );
  assert.deepEqual(frappeModels.Tax.getListViewSettings(fyo).columns, ['name']);
});

test('a payment method shows its type, account and clearance date as before', () => {
  const method = getSchema('PaymentMethod');
  assert.equal(method.label, 'Payment Method');
  assert.deepEqual(getLayout('PaymentMethod'), [
    'name | Name | ',
    'type | Type | ',
    'account | Account | ',
    'requires_clearance_date | Requires Clearance Date | ',
  ]);
  assert.deepEqual(method.quickEditFields, [
    'name',
    'type',
    'account',
    'requires_clearance_date',
  ]);
  const account = method.fields.find((field) => field.fieldname === 'account');
  assert.equal(account.create, false);
  assert.deepEqual(
    frappeModels.PaymentMethod.getListViewSettings(fyo).columns,
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
  assert.equal(labels.Payment, 'Payment');
  const digits = series.fields.find(
    ({ fieldname }) => fieldname === 'pad_zeros'
  );
  assert.match(digits.sub_label, /leading zeros/);
  // No document can use a series without a type, so a new one asks for it.
  assert.equal(labels['-'], undefined);
  assert.equal(referenceType.default, undefined);
});

test('number series links filter and create by reference_type', async () => {
  const { SalesInvoice, Defaults, Payment, JournalEntry, StockMovement } =
    frappeModels;
  const invoice = { schemaName: 'SalesInvoice' };
  const series = (schemaName) => [['reference_type', '=', schemaName]];
  assert.deepEqual(
    await SalesInvoice.filters.number_series(invoice),
    series('SalesInvoice')
  );
  assert.deepEqual(Payment.filters.number_series(), series('Payment'));
  assert.deepEqual(
    JournalEntry.filters.number_series(),
    series('JournalEntry')
  );
  assert.deepEqual(
    StockMovement.filters.number_series(),
    series('StockMovement')
  );
  assert.deepEqual(
    Defaults.createFilters.shipment_number_series(),
    series('Shipment')
  );
});

test('a currency created from /books is inserted enabled, for link pickers', async () => {
  const requests = stubFrappe(({ body }) => ({
    data: { ...body, name: body.currency_name, modified: '' },
  }));
  const currency = newFrappeDoc('Currency', { name: 'Test Coin' });
  await currency.set('symbol', 'TC');
  clearTimeout(currency._previewTimer);
  await currency.sync();

  const [insert] = requests.filter(({ method }) => method === 'POST');
  assert.equal(insert.path, '/api/v2/document/Currency');
  assert.deepEqual(
    [insert.body.currency_name, insert.body.symbol, insert.body.enabled],
    ['Test Coin', 'TC', 1]
  );
  assert.equal(currency.name, 'Test Coin');
});
