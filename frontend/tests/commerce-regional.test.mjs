import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateHidden,
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

const hidden = (doc, fieldname) => evaluateHidden(doc.fieldMap[fieldname], doc);

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

test('an Indian party asks for its GST registration instead of a tax ID', async () => {
  const party = newFrappeDoc('Party', { role: 'Customer' });
  assert.equal(party.fieldMap.tax_id, undefined);
  assert.equal(hidden(party, 'gst_type'), false);
  assert.equal(hidden(party, 'gstin'), true);
  await party.set('gst_type', 'Registered Regular');
  assert.equal(hidden(party, 'gstin'), false);
  assert.deepEqual(getSchema('Party').quickEditFields, [
    'email',
    'phone',
    'address',
    'default_account',
    'currency',
    'role',
    'gst_type',
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
  const party = newFrappeDoc('Party', { role: 'Customer' });
  assert.equal(hidden(party, 'loyalty_program'), false);
  assert.equal(hidden(party, 'loyalty_points'), true);
  await party.set('loyalty_program', 'Gold');
  assert.equal(hidden(party, 'loyalty_points'), false);
  await party.set('role', 'Supplier');
  assert.equal(hidden(party, 'loyalty_program'), true);
  assert.equal(hidden(party, 'loyalty_points'), true);
  fyo.singles.AccountingSettings = {};
  assert.equal(hidden(newFrappeDoc('Party'), 'loyalty_program'), true);
});

test('Indian party and address files hold GST fields, not a tax ID', () => {
  const exported = (schemaName) =>
    getExportFields(schemaName).map((f) => f.fieldname);
  const headers = [...new Importer('Party', fyo).templateFieldsMap.values()];
  const labels = headers.map(({ label }) => label);

  assert.ok(labels.includes('GST Registration'));
  assert.ok(labels.includes('GSTIN No.'));
  assert.ok(!labels.includes('Tax ID'));
  assert.deepEqual(exported('Party').slice(-6, -4), ['gst_type', 'gstin']);
  assert.ok(!exported('Party').includes('tax_id'));
  assert.ok(exported('Address').includes('pos'));
});
