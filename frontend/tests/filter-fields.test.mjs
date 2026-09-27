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

for (const [schemaName, values] of [
  [
    'SalesInvoice',
    [
      'Saved',
      'Unpaid',
      'PartlyPaid',
      'Paid',
      'Return',
      'ReturnIssued',
      'Cancelled',
    ],
  ],
  ['JournalEntry', ['Saved', 'Submitted', 'Cancelled']],
  ['Shipment', ['Saved', 'Submitted', 'Return', 'ReturnIssued', 'Cancelled']],
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
    if (schemaName === 'SalesInvoice')
      assert.equal(
        status.options.find((option) => option.value === 'PartlyPaid').label,
        'Partly Paid'
      );
  });
}

test('computed loyalty program statuses are not offered as filters', async () => {
  const fyo = await makeFyo();
  const fields = getFilterFields(
    fyo.schemaMap.LoyaltyProgram.fields,
    fyo.models.LoyaltyProgram.getListViewSettings?.(fyo)?.columns
  );
  assert.ok(!fields.some((field) => field.fieldname === 'status'));
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
