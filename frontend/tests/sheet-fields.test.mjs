import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getQuickEditFieldnames,
  getRowEditFieldnames,
  getSchemas,
} from './helpers/accounting.mjs';

// Books keeps a custom field required only when it has a default.
const customField = (parent, fieldname, isRequired) => ({
  parent,
  label: fieldname,
  fieldname,
  fieldtype: 'Data',
  isRequired,
  default: isRequired ? 'North' : undefined,
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
