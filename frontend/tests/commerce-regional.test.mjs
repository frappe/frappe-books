import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateHidden,
  frappeModels,
  fyo,
  getRegionalFrappeModels,
  getSchema,
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
  assert.equal(hidden(party, 'tax_id'), true);
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
