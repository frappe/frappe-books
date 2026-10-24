import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  frappeModels,
  fyo,
  getExportFields,
  getRegionalFrappeModels,
  getSchema,
  Importer,
  newFrappeDoc,
} from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/frappeModels.mjs';

await loadFrappeModels({
  ...frappeModels,
  ...(await getRegionalFrappeModels('in')),
});

const hidden = (doc, fieldname) => doc.getFieldState(doc.fieldMap[fieldname]).hidden;

test('an Indian address shows its place of supply, in quick edit too', () => {
  const address = newFrappeDoc('Address', { country: 'India' });
  assert.equal(hidden(address, 'pos'), false);
  assert.deepEqual(getSchema('Address').quickEditFields, [
    'address_line1',
    'address_line2',
    'city',
    'country',
    'state',
    'postal_code',
    'pos',
  ]);
});

test('an Indian customer or supplier asks for its GST registration instead of a tax ID', async () => {
  for (const schemaName of ['Customer', 'Supplier']) {
    const party = newFrappeDoc(schemaName);
    assert.equal(party.fieldMap.tax_id, undefined);
    assert.equal(hidden(party, 'gst_category'), false);
    assert.equal(hidden(party, 'gstin'), true);
    await party.set('gst_category', 'Registered Regular');
    assert.equal(hidden(party, 'gstin'), false);
  }

  assert.deepEqual(getSchema('Customer').quickEditFields, [
    'email',
    'phone',
    'address',
    'accounts',
    'loyalty_program',
    'default_currency',
    'gst_category',
    'gstin',
  ]);
  assert.deepEqual(getSchema('Supplier').quickEditFields, [
    'email',
    'phone',
    'address',
    'accounts',
    'default_currency',
    'gst_category',
    'gstin',
  ]);
});

test('an Indian account names the GST head it holds, in quick edit too', () => {
  const account = newFrappeDoc('Account', { account_type: 'Tax' });
  assert.equal(hidden(account, 'gst_head'), false);
  assert.deepEqual(getSchema('Account').quickEditFields, [
    'root_type',
    'parent_books_account',
    'account_type',
    'is_group',
    'gst_head',
  ]);
});

test('an Indian customer shows loyalty fields when the program is on', async () => {
  fyo.singles.AccountingSettings = { enable_loyalty_program: true };
  const customer = newFrappeDoc('Customer');
  assert.equal(hidden(customer, 'loyalty_program'), false);
  assert.equal(hidden(customer, 'loyalty_points'), true);
  await customer.set('loyalty_program', 'Gold');
  assert.equal(hidden(customer, 'loyalty_points'), false);
  fyo.singles.AccountingSettings = {};
  assert.equal(hidden(newFrappeDoc('Customer'), 'loyalty_program'), true);
});

test('Indian customer, supplier and address files hold GST fields, not a tax ID', () => {
  const exported = (schemaName) =>
    getExportFields(schemaName).map((f) => f.fieldname);
  for (const schemaName of ['Customer', 'Supplier']) {
    const headers = [
      ...new Importer(schemaName, fyo).templateFieldsMap.values(),
    ];
    const labels = headers.map(({ label }) => label);

    assert.ok(labels.includes('GST Category'));
    assert.ok(labels.includes('GSTIN / UIN'));
    assert.ok(!labels.includes('Tax ID'));
    assert.deepEqual(exported(schemaName).slice(-6, -4), ['gst_category', 'gstin']);
    assert.ok(!exported(schemaName).includes('tax_id'));
  }

  assert.ok(exported('Address').includes('pos'));
});
