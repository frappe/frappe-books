import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFilterFields } from './helpers/accounting.mjs';
import {
  evaluateHidden,
  frappeModels,
  fyo,
  getModel,
  getSchema,
  newFrappeDoc,
  stubFrappe,
} from './helpers/frappe.mjs';
import {
  bridgeSchemas,
  getFrappeFieldnames,
  getLayout,
  loadFrappeModels,
} from './helpers/models.mjs';

await loadFrappeModels();
const { JournalEntry } = frappeModels;

for (const schemaName of ['JournalEntry', 'JournalEntryAccount']) {
  test(`the ${schemaName} form shows the fields, labels, placeholders and sections it showed`, () => {
    const schema = getSchema(schemaName);
    const bridgeSchema = bridgeSchemas[schemaName];
    const fieldnames = getFrappeFieldnames(schemaName);
    assert.deepEqual(getLayout(schema), getLayout(bridgeSchema, fieldnames));
    assert.equal(schema.label, bridgeSchema.label);
  });
}

test('journal entry rows show the columns they showed', () => {
  const fieldnames = getFrappeFieldnames('JournalEntryAccount');
  assert.deepEqual(
    getSchema('JournalEntryAccount').tableFields,
    bridgeSchemas.JournalEntryAccount.tableFields.map(
      (name) => fieldnames[name]
    )
  );
});

test('a new journal entry is numbered as before, and its accounts group by root type', () => {
  const entry = newFrappeDoc('JournalEntry');
  assert.match(entry.name, /^New Journal Entry \d{2}$/);
  assert.equal(entry.isTransactional, true);
  assert.equal(getSchema('JournalEntryAccount').fields[0].groupBy, 'rootType');
});

test('references and attachments hide on a submitted entry without them', () => {
  const entry = newFrappeDoc('JournalEntry', { reference_number: 'CHQ-1' });
  const hidden = (fieldname) =>
    evaluateHidden(entry.fieldMap[fieldname], entry);
  assert.equal(hidden('user_remark'), false);

  entry.docstatus = 1;
  assert.equal(hidden('user_remark'), true);
  assert.equal(hidden('attachment'), true);
  assert.equal(hidden('reference_number'), false);
});

test('a row without amounts takes what balances the entry, as Books did', async (t) => {
  stubFrappe(({ body }) => ({ docs: [body.document] }));
  const entry = newFrappeDoc('JournalEntry');
  t.after(() => clearTimeout(entry._previewTimer));
  await entry.append('accounts', { account: 'Cash' });
  await entry.accounts[0].set('debit', fyo.pesa(100));
  await entry.append('accounts', { account: 'Capital' });
  assert.equal(entry.accounts[1].credit.float, 100);

  // A filled row keeps its amount when another row changes.
  await entry.accounts[0].set('debit', fyo.pesa(150));
  assert.equal(entry.accounts[1].credit.float, 100);
  await entry.append('accounts', { account: 'Bank' });
  assert.equal(entry.accounts[2].credit.float, 50);
  assert.equal(entry.accounts[2].debit.float, 0);
});

test('journal entry links filter accounts and series as before', async () => {
  const JournalEntryAccount = getModel('JournalEntryAccount');
  assert.deepEqual(await JournalEntryAccount.filters.account(), {
    isGroup: false,
  });
  assert.deepEqual(await JournalEntry.filters.number_series(), {
    referenceType: 'JournalEntry',
  });
});

test('the journal entry list shows and filters what it did', () => {
  const { columns } = JournalEntry.getListViewSettings(fyo);
  assert.deepEqual(
    columns.map((column) =>
      typeof column === 'string' ? column : column.fieldname
    ),
    ['name', 'status', 'posting_date', 'entry_type', 'reference_number']
  );

  const fieldnames = getFrappeFieldnames('JournalEntry');
  const bridgeFilters = getFilterFields(
    bridgeSchemas.JournalEntry.fields,
    columns
  ).map(({ fieldname }) => fieldnames[fieldname] ?? fieldname);
  const filters = getFilterFields(getSchema('JournalEntry').fields, columns);
  const standard = {
    created: 'creation',
    createdBy: 'owner',
    modifiedBy: 'modified_by',
  };
  assert.deepEqual(
    filters.map(({ fieldname }) => fieldname).sort(),
    bridgeFilters.map((fieldname) => standard[fieldname] ?? fieldname).sort()
  );
  const status = filters.find(({ fieldname }) => fieldname === 'status');
  assert.deepEqual(
    status.options.map(({ value }) => value),
    ['Saved', 'Submitted', 'Cancelled']
  );
});
