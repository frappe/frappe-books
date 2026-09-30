import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMetaBundle, mapping } from './helpers/doctypes.mjs';
import {
  frappeModels,
  fyo,
  getSchema,
  loadFrappeDocTypes,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

// Books schema names by doctype, as the boot sends them.
for (const [schemaName, { doctype }] of Object.entries(mapping)) {
  window.frappe.boot.books.doctypes[schemaName] = doctype;
}

stubFrappe(({ path, body }) =>
  path.endsWith('getdoctype')
    ? { docs: getMetaBundle(body.doctype) }
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
