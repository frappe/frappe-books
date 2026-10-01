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
import { getLayout, loadFrappeModels } from './helpers/models.mjs';
import { previousForms } from './helpers/previousForms.mjs';

await loadFrappeModels();
const { JournalEntry } = frappeModels;

for (const schemaName of ['JournalEntry', 'JournalEntryAccount']) {
  test(`the ${schemaName} form shows the fields, labels, placeholders and sections it showed`, () => {
    const schema = getSchema(schemaName);
    assert.deepEqual(getLayout(schema), previousForms.layouts[schemaName]);
    assert.equal(schema.label, previousForms.labels[schemaName]);
  });
}

test('journal entry rows show the columns they showed', () => {
  assert.deepEqual(
    getSchema('JournalEntryAccount').tableFields,
    previousForms.tableFields.JournalEntryAccount
  );
});

test('a new journal entry is numbered as before, and its accounts group by root type', () => {
  const entry = newFrappeDoc('JournalEntry');
  assert.match(entry.name, /^New Journal Entry \d{2}$/);
  assert.equal(entry.isTransactional, true);
  const [account] = getSchema('JournalEntryAccount').fields;
  assert.deepEqual([account.groupBy, account.create], ['root_type', false]);
  assert.equal(getSchema('JournalEntry').fields[1].create, true);
});

test('a new journal entry is saved without its temporary name, which the server replaces', async () => {
  const requests = stubFrappe(({ path, body }) =>
    path.endsWith('run_doc_method')
      ? { docs: [body.document] }
      : { data: { ...body, name: 'JV-1001', modified: '2026-09-30 10:00:00' } }
  );
  const entry = newFrappeDoc('JournalEntry', {
    number_series: 'JV-',
    entry_type: 'Journal Entry',
    accounts: [
      { account: 'Cash', debit: fyo.pesa(5) },
      { account: 'Capital', credit: fyo.pesa(5) },
    ],
  });
  await entry.sync();

  const insert = requests.find(
    ({ method, path }) => method === 'POST' && path.endsWith('Entry')
  );
  assert.equal('name' in insert.body, false);
  assert.equal(entry.name, 'JV-1001');
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
  assert.deepEqual(await JournalEntryAccount.filters.account(), [
    ['is_group', '=', 0],
  ]);
  assert.deepEqual(await JournalEntry.filters.number_series(), [
    ['reference_type', '=', 'JournalEntry'],
  ]);
});

test('the journal entry list shows and filters what it did', () => {
  const { columns } = JournalEntry.getListViewSettings(fyo);
  assert.deepEqual(
    columns.map((column) =>
      typeof column === 'string' ? column : column.fieldname
    ),
    ['name', 'status', 'posting_date', 'entry_type', 'reference_number']
  );

  const filters = getFilterFields(getSchema('JournalEntry').fields, columns);
  assert.deepEqual(
    filters.map(({ fieldname }) => fieldname).sort(),
    previousForms.listFilters.JournalEntry
  );
  const status = filters.find(({ fieldname }) => fieldname === 'status');
  assert.deepEqual(
    status.options.map(({ value }) => value),
    ['Saved', 'Submitted', 'Cancelled']
  );
});
