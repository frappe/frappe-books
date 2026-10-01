import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLayout, loadFrappeModels } from './helpers/models.mjs';
import { previousForms } from './helpers/previousForms.mjs';
import {
  frappeModels,
  fyo,
  getFrappeListPage,
  getSchema,
  stubFrappe,
} from './helpers/frappe.mjs';

// The list columns the ledgers showed.
const previousColumns = {
  AccountingLedgerEntry: [
    'posting_date',
    'account',
    'party',
    'debit',
    'credit',
    'voucher_no',
  ],
  StockLedgerEntry: [
    'date',
    'item',
    'location',
    'rate',
    'quantity',
    'reference_name',
  ],
  LoyaltyPointEntry: [
    'loyalty_program',
    'customer',
    'purchase_amount',
    'loyalty_points',
  ],
};
const ledgers = Object.keys(previousColumns);
await loadFrappeModels();

for (const schemaName of ledgers) {
  test(`the ${schemaName} form shows the fields, labels and sections it showed`, () => {
    assert.deepEqual(
      getLayout(getSchema(schemaName)),
      previousForms.layouts[schemaName]
    );
    assert.equal(getSchema(schemaName).label, previousForms.labels[schemaName]);
  });

  test(`the ${schemaName} list shows the columns it showed`, () => {
    const { columns } = frappeModels[schemaName].getListViewSettings(fyo);
    assert.deepEqual(columns, previousColumns[schemaName]);
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
    path.endsWith('/count') ? { data: 0 } : { message: [] }
  );
  const page = { filters: [], orFilters: [], start: 0, limit: 20 };
  await getFrappeListPage(fyo, 'AccountingLedgerEntry', page);
  await getFrappeListPage(fyo, 'StockLedgerEntry', page);
  await getFrappeListPage(fyo, 'LoyaltyPointEntry', page);
  assert.deepEqual(
    requests
      .filter(({ path }) => !path.endsWith('/count'))
      .map(({ body }) => body.order_by),
    [
      'posting_date desc, creation desc',
      'date desc, creation desc',
      'creation desc',
    ]
  );
});
