import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateHidden,
  frappeModels,
  fyo,
  getModel,
  getSchema,
  newFrappeDoc,
} from './helpers/frappe.mjs';
import {
  getColumns,
  getLayout,
  loadFrappeModels,
} from './helpers/frappeModels.mjs';

await loadFrappeModels(frappeModels);

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
  assert.equal(getSchema('ItemGroup').label, 'item Group');
  assert.deepEqual(getSchema('Batch').quickEditFields, [
    'item',
    'expiry_date',
    'manufacture_date',
  ]);
});

test('item group, batch and serial number lists show their columns', () => {
  assert.deepEqual(getColumns('ItemGroup'), ['name', 'tax', 'hsn_code']);
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
    'pos | Place of Supply | Place of Supply | Miscellaneous',
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

test('an address lists Indian states for India and hides the place of supply', () => {
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
  assert.equal(hidden(address, 'pos'), true);
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

test('lead contacts show the message Frappe refuses them with', async () => {
  const lead = newFrappeDoc('Lead', { name: 'Asha' });
  await assert.rejects(lead.set('email', 'asha@'), {
    message: 'asha@ is not a valid Email Address',
  });
  await assert.rejects(lead.set('mobile', '98x'), {
    message: '98x is not a valid Phone Number',
  });
  await lead.set('email', 'Asha <asha@example.com>, ops@example.com');
  await lead.set('mobile', '+91 (22) 555-0199');
  assert.equal(lead.mobile, '+91 (22) 555-0199');
});
