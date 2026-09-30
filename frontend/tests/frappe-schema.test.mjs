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
  schema.fields
    .filter((field) => !field.meta)
    .map(({ fieldname }) => fieldname);

test('a doctype its controller names is numbered as a series', () => {
  const schema = toSchema(
    voucherMeta,
    'Voucher',
    { label: 'Voucher' },
    context
  );
  assert.equal(schema.naming, 'numberSeries');
  const hashed = { ...voucherMeta, naming_rule: 'Random', autoname: 'hash' };
  assert.equal(
    toSchema(hashed, 'Voucher', { label: '' }, context).naming,
    'random'
  );
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

  // A hidden name is not in the form, but still labels list columns and filters.
  const nameField = { label: 'Voucher No', hidden: true };
  const listed = toSchema(
    voucherMeta,
    'Voucher',
    { label: '', nameField },
    context
  );
  const listedName = listed.fields.find(({ fieldname }) => fieldname === 'name');
  assert.deepEqual([listedName.label, listedName.meta], ['Voucher No', true]);
});

test('a model presents fields its DocType has no property for, and a field that holds a doctype', () => {
  const meta = {
    ...voucherMeta,
    fields: [
      {
        fieldname: 'account',
        fieldtype: 'Link',
        label: 'Account',
        options: 'Books Account',
      },
      {
        fieldname: 'kind',
        fieldtype: 'Select',
        label: 'Kind',
        options: 'In\nOut',
      },
      {
        fieldname: 'voucher_type',
        fieldtype: 'Link',
        label: 'Type',
        options: 'DocType',
      },
      {
        fieldname: 'voucher_no',
        fieldtype: 'Dynamic Link',
        label: 'No',
        options: 'voucher_type',
      },
    ],
  };
  const presentation = {
    label: 'Voucher',
    fields: {
      account: { groupBy: 'rootType', create: false },
      kind: { optionLabels: { In: 'Receipt' } },
    },
  };
  const schemaNames = { 'Books Sales Invoice': 'SalesInvoice' };
  const schema = toSchema(meta, 'Voucher', presentation, {
    ...context,
    schemaNames,
  });
  const field = (fieldname) =>
    schema.fields.find((f) => f.fieldname === fieldname);

  assert.equal(field('account').groupBy, 'rootType');
  assert.equal(field('account').create, false);
  assert.deepEqual(field('kind').options, [
    { value: 'In', label: 'Receipt' },
    { value: 'Out', label: 'Out' },
  ]);
  // Books showed the schema a reference names.
  assert.equal(field('voucher_type').fieldtype, 'Select');
  assert.deepEqual(field('voucher_type').options, [
    { value: 'Books Sales Invoice', label: 'SalesInvoice' },
  ]);
  assert.equal(field('voucher_no').references, 'voucher_type');
});
