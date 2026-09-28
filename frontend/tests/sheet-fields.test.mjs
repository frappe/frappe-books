import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getQuickEditFieldnames,
  getRowEditFieldnames,
  getSchemas,
} from './helpers/accounting.mjs';

// The server requires a custom field only with a default.
const customField = (parent, fieldname, isRequired) => ({
  parent,
  fieldname,
  docfield: {
    fieldtype: 'Data',
    label: fieldname,
    ...(isRequired && { reqd: 1, default: 'North' }),
  },
});

test('quick edit asks for required fields that have no default', () => {
  const schemas = getSchemas('-', [customField('Party', 'region', true)]);

  const coupon = getQuickEditFieldnames(schemas.CouponCode);
  assert.ok(coupon.includes('couponName'));
  assert.ok(!coupon.includes('isEnabled'));

  assert.ok(getQuickEditFieldnames(schemas.Party).includes('region'));
  assert.ok(
    !getQuickEditFieldnames(schemas.Party, ['region']).includes('region')
  );
});

test('row editors add the custom fields of a row', () => {
  const schemas = getSchemas('-', [
    customField('SalesInvoiceItem', 'warranty', false),
  ]);

  const fieldnames = getRowEditFieldnames(schemas.SalesInvoiceItem);
  assert.ok(fieldnames.includes('item'));
  assert.ok(fieldnames.includes('warranty'));
  assert.deepEqual(getRowEditFieldnames(schemas.JournalEntryAccount), [
    'account',
    'debit',
    'credit',
  ]);
});
