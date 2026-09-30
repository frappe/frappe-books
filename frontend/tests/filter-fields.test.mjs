import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo, getFilterFields } from './helpers/accounting.mjs';

test('stored totals filter Frappe-backed lists by their Frappe names', () => {
  const fields = ['net_total', 'grand_total', 'base_grand_total', 'balance'].map(
    (fieldname) => ({ fieldname, fieldtype: 'Currency', readOnly: true })
  );
  assert.deepEqual(
    getFilterFields(fields).map(({ fieldname }) => fieldname),
    ['net_total', 'grand_total', 'base_grand_total']
  );
});

test('unverified read-only fields, computed values, internal metadata and opt-outs stay excluded', () => {
  const fields = [
    { fieldname: 'name', fieldtype: 'Data', readOnly: true, hidden: true },
    {
      fieldname: 'grandTotal',
      fieldtype: 'Currency',
      readOnly: true,
      filter: false,
    },
    { fieldname: 'netTotal', fieldtype: 'Currency', computed: true },
    { fieldname: 'created', fieldtype: 'Datetime', meta: true, filter: false },
    { fieldname: 'balance', fieldtype: 'Currency', readOnly: true },
    { fieldname: 'idx', fieldtype: 'Int', meta: true },
    { fieldname: 'lft', fieldtype: 'Int', meta: true },
    { fieldname: 'parent', fieldtype: 'Link', meta: true },
    { fieldname: 'attachment', fieldtype: 'Attachment', filter: true },
  ];
  assert.deepEqual(
    getFilterFields(fields).map((field) => field.fieldname),
    ['name']
  );
});

test("a Frappe-backed schema's standard columns filter its list", () => {
  const fields = ['name', 'owner', 'modified_by', 'creation', 'modified', 'idx'].map(
    (fieldname) => ({ fieldname, fieldtype: 'Data', meta: true })
  );
  assert.deepEqual(
    getFilterFields(fields).map((field) => field.fieldname),
    ['name', 'owner', 'modified_by', 'creation', 'modified']
  );
});

test('stored Select fields retain all configured choices and labels', async () => {
  const fyo = await makeFyo();
  for (const schema of Object.values(fyo.schemaMap)) {
    const fields = getFilterFields(schema.fields);
    for (const field of fields.filter(
      (field) => field.fieldtype === 'Select'
    )) {
      assert.deepEqual(
        field.options,
        schema.fields.find((original) => original.fieldname === field.fieldname)
          .options,
        `${schema.name}.${field.fieldname}`
      );
    }
  }
});
