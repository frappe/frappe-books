import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fieldProperties, getSchemas } from './helpers/accounting.mjs';
import { getMetaBundle, mapping } from './helpers/doctypes.mjs';
import {
  frappeModels,
  fyo,
  getFrappeListPage,
  getSchema,
  loadFrappeDocTypes,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

// The list columns of the bridge models.
const bridgeColumns = {
  AccountingLedgerEntry: [
    'date',
    'account',
    'party',
    'debit',
    'credit',
    'referenceName',
  ],
  StockLedgerEntry: [
    'date',
    'item',
    'location',
    'rate',
    'quantity',
    'referenceName',
  ],
  LoyaltyPointEntry: [
    'loyaltyProgram',
    'customer',
    'purchaseAmount',
    'loyaltyPoints',
  ],
};
const ledgers = Object.keys(bridgeColumns);
window.frappe.boot.books.doctypes = Object.fromEntries(
  Object.entries(mapping).map(([schemaName, { doctype }]) => [
    schemaName,
    doctype,
  ])
);
stubFrappe(({ path, body }) =>
  path.endsWith('getdoctype')
    ? { docs: getMetaBundle(body.doctype) }
    : { data: [] }
);
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();
const bridgeSchemas = getSchemas('in', [], fieldProperties);

/** The fields a form shows, by Frappe fieldname, with their labels and sections. */
function getLayout(schema, fieldnames = {}) {
  return schema.fields
    .filter((field) => !field.meta && !field.hidden)
    .map(({ fieldname, label, section }) =>
      [fieldnames[fieldname] ?? fieldname, label, section ?? 'Default'].join(
        ' | '
      )
    );
}

for (const schemaName of ledgers) {
  test(`the ${schemaName} form shows the fields, labels and sections it showed`, () => {
    assert.deepEqual(
      getLayout(getSchema(schemaName)),
      getLayout(bridgeSchemas[schemaName], mapping[schemaName].fields)
    );
    assert.equal(getSchema(schemaName).label, bridgeSchemas[schemaName].label);
  });

  test(`the ${schemaName} list shows the columns it showed`, () => {
    const { columns } = frappeModels[schemaName].getListViewSettings(fyo);
    const { fields } = mapping[schemaName];
    assert.deepEqual(
      columns,
      bridgeColumns[schemaName].map((fieldname) => fields[fieldname])
    );
  });
}

test('a ledger entry shows the schema of its voucher as Books did', () => {
  const field = getSchema('AccountingLedgerEntry').fields.find(
    ({ fieldname }) => fieldname === 'voucher_type'
  );
  assert.equal(fyo.format('Books Sales Invoice', field), 'SalesInvoice');
});

test('the accounting ledger lists newest posting first', async () => {
  const requests = stubFrappe(({ path }) =>
    path.endsWith('/count') ? { data: 0 } : { data: [] }
  );
  const page = { filters: {}, orFilters: {}, start: 0, limit: 20 };
  await getFrappeListPage(fyo, 'AccountingLedgerEntry', page);
  await getFrappeListPage(fyo, 'StockLedgerEntry', page);
  await getFrappeListPage(fyo, 'LoyaltyPointEntry', page);
  assert.deepEqual(
    requests
      .filter(({ path }) => !path.endsWith('/count'))
      .map(({ params }) => params.order_by),
    [
      'posting_date desc, creation desc',
      'date desc, creation desc',
      'creation desc',
    ]
  );
});
