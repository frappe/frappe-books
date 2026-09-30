import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toSchema } from './helpers/frappe.mjs';

const context = { schemaNames: {}, roles: [], placements: {} };
const voucherMeta = {
  name: 'Books Voucher',
  naming_rule: 'By script',
  permissions: [],
  fields: [
    { fieldname: 'details', fieldtype: 'Section Break', label: 'Details' },
    { fieldname: 'posting_date', fieldtype: 'Date', label: 'Date' },
  ],
};

const fieldnames = (schema) =>
  schema.fields.filter((field) => !field.meta).map(({ fieldname }) => fieldname);

test('a doctype its controller names is numbered as a series', () => {
  const schema = toSchema(voucherMeta, 'Voucher', { label: 'Voucher' }, context);
  assert.equal(schema.naming, 'numberSeries');
  const hashed = { ...voucherMeta, naming_rule: 'Random', autoname: 'hash' };
  assert.equal(toSchema(hashed, 'Voucher', { label: '' }, context).naming, 'random');
});

test('a server-named document shows its name first, read only, when its model labels it', () => {
  const presentation = { label: 'Voucher', nameField: { label: 'Entry No' } };
  const schema = toSchema(voucherMeta, 'Voucher', presentation, context);
  const [name] = schema.fields;
  assert.deepEqual(fieldnames(schema), ['name', 'posting_date']);
  assert.deepEqual(
    [name.label, name.readOnly, name.required, name.section, name.meta],
    ['Entry No', true, true, 'Details', undefined]
  );

  const unlabelled = toSchema(voucherMeta, 'Voucher', { label: '' }, context);
  assert.deepEqual(fieldnames(unlabelled), ['posting_date']);
});
