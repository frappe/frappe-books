import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo, getFilterFields, FilterSet } from './helpers/accounting.mjs';

const audits = [
  'created',
  'modified',
  'createdBy',
  'modifiedBy',
  'submitted',
  'cancelled',
];
const totals = ['netTotal', 'grandTotal', 'baseGrandTotal'];
for (const schemaName of [
  'SalesInvoice',
  'PurchaseInvoice',
  'SalesQuote',
  'JournalEntry',
  'Payment',
  'Shipment',
  'PurchaseReceipt',
]) {
  test(`${schemaName} exposes its document number and audit fields`, async () => {
    const fyo = await makeFyo();
    const fields = getFilterFields(
      fyo.schemaMap[schemaName].fields,
      fyo.models[schemaName].getListViewSettings?.(fyo)?.columns
    );
    const names = fields.map((field) => field.fieldname);
    for (const name of ['name', 'numberSeries', ...audits])
      assert.ok(names.includes(name), `${schemaName}.${name}`);
    if (schemaName.includes('Invoice') || schemaName === 'SalesQuote') {
      for (const total of totals)
        assert.ok(names.includes(total), `${schemaName}.${total}`);
      assert.ok(
        !names.includes('outstandingAmount'),
        'Converted return balances need their own filter semantics'
      );
    }
    const query = { name: ['like', '%001%'], numberSeries: ['=', 'SINV-'] };
    const set = new FilterSet();
    set.setQuery(query);
    assert.deepEqual(set.toQuery(fields), query);
  });
}

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
  const fields = ['owner', 'modified_by', 'creation', 'modified', 'idx'].map(
    (fieldname) => ({ fieldname, fieldtype: 'Data', meta: true })
  );
  assert.deepEqual(
    getFilterFields(fields).map((field) => field.fieldname),
    ['owner', 'modified_by', 'creation', 'modified']
  );
});

for (const [schemaName, values] of [
  [
    'SalesInvoice',
    [
      'Saved',
      'Unpaid',
      'Partly Paid',
      'Paid',
      'Return',
      'Return Issued',
      'Cancelled',
    ],
  ],
  ['JournalEntry', ['Saved', 'Submitted', 'Cancelled']],
  ['Shipment', ['Saved', 'Submitted', 'Return', 'Return Issued', 'Cancelled']],
]) {
  test(`${schemaName} supplies stored status values and display labels to the filter`, async () => {
    const fyo = await makeFyo();
    const fields = getFilterFields(
      fyo.schemaMap[schemaName].fields,
      fyo.models[schemaName].getListViewSettings?.(fyo)?.columns
    );
    const status = fields.find((field) => field.fieldname === 'status');
    assert.deepEqual(
      status.options.map((option) => option.value),
      values
    );
    assert.ok(status.options.every((option) => option.label));
  });
}

test('stored loyalty program statuses are offered as filters', async () => {
  const fyo = await makeFyo();
  const fields = getFilterFields(
    fyo.schemaMap.LoyaltyProgram.fields,
    fyo.models.LoyaltyProgram.getListViewSettings?.(fyo)?.columns
  );
  const status = fields.find((field) => field.fieldname === 'status');
  assert.deepEqual(
    status.options.map(({ value }) => value),
    ['Active', 'Disabled', 'Expired', 'Maxed']
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
