import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getQuickEditFieldnames,
  getRowEditFieldnames,
} from './helpers/accounting.mjs';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  frappeModels,
  getSchema,
  loadFrappeDocTypes,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

// The server requires a custom field only with a default.
const customFields = {
  'Books Party': {
    fieldname: 'custom_books_region',
    fieldtype: 'Data',
    label: 'Region',
    reqd: 1,
    default: 'North',
    is_custom_field: 1,
  },
  'Books Sales Invoice Item': {
    fieldname: 'custom_books_warranty',
    fieldtype: 'Data',
    label: 'Warranty',
    is_custom_field: 1,
  },
};
stubFrappe(({ body }) => {
  const { metas } = getBooksMeta(body.doctypes);
  const customized = metas.map((meta) => {
    const field = customFields[meta.name];
    return field ? { ...meta, fields: [...meta.fields, field] } : meta;
  });
  return { message: { metas: customized, placements: {} } };
});
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();

test('quick edit asks for required fields that have no default', () => {
  const coupon = getQuickEditFieldnames(getSchema('CouponCode'));
  assert.ok(coupon.includes('coupon_name'));
  assert.ok(!coupon.includes('is_enabled'));

  const party = getSchema('Party');
  assert.ok(getQuickEditFieldnames(party).includes('custom_books_region'));
  assert.ok(
    !getQuickEditFieldnames(party, ['custom_books_region']).includes(
      'custom_books_region'
    )
  );
});

test('row editors add the custom fields of a row', () => {
  const fieldnames = getRowEditFieldnames(getSchema('SalesInvoiceItem'));
  assert.ok(fieldnames.includes('item'));
  assert.ok(fieldnames.includes('custom_books_warranty'));
  assert.deepEqual(getRowEditFieldnames(getSchema('JournalEntryAccount')), [
    'account',
    'debit',
    'credit',
  ]);
});
