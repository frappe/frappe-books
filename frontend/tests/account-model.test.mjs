import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  frappeModels,
  fyo,
  getSchema,
  loadFrappeDocTypes,
  loadSaved,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

stubFrappe(({ path, body }) =>
  path.endsWith('get_books_meta')
    ? { message: getBooksMeta(body.doctypes) }
    : { data: [] }
);
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();

const Account = frappeModels.Account;
const schema = getSchema('Account');
const field = (fieldname) =>
  schema.fields.find((field) => field.fieldname === fieldname);

function newAccount(values) {
  return newFrappeDoc('Account', values);
}

async function savedAccount(values) {
  const account = newAccount(values);
  await loadSaved(account);
  return account;
}

test('the Account form shows the fields, labels and placeholders it showed', () => {
  const layout = schema.fields
    .filter((field) => !field.meta && !field.hidden)
    .map(({ fieldname, label, placeholder }) =>
      [fieldname, label, placeholder].join(' | ')
    );
  assert.deepEqual(layout, [
    'account_name | Account Name | ',
    'root_type | Root Type | Root Type',
    'parent_books_account | Parent Account | ',
    'account_type | Account Type | Account Type',
    'is_group | Is Group | ',
  ]);
  assert.deepEqual(schema.quickEditFields, [
    'root_type',
    'parent_books_account',
    'account_type',
    'is_group',
  ]);
  assert.equal(field('name').label, 'Account Name');
  assert.equal(schema.create, false);
  assert.equal(field('parent_books_account').create, false);
});

test('a ledger account needs a parent group; a root group does not', () => {
  const parent = field('parent_books_account');
  assert.equal(newAccount({ is_group: false }).getFieldState(parent).required, true);
  assert.equal(newAccount({ is_group: true }).getFieldState(parent).required, false);
});

test('a saved account keeps its name, types, parent and group; a saved type stays', async () => {
  const account = await savedAccount({
    account_name: 'Petty Cash',
    parent_books_account: 'Cash In Hand',
    root_type: 'Asset',
  });
  for (const fieldname of [
    'account_name',
    'root_type',
    'parent_books_account',
    'is_group',
  ]) {
    assert.equal(account.getFieldState(field(fieldname)).readOnly, true);
  }

  const accountType = field('account_type');
  assert.equal(account.getFieldState(accountType).readOnly, false);
  account.account_type = 'Cash';
  assert.equal(account.getFieldState(accountType).readOnly, false);
  assert.equal(
    (await savedAccount({ account_type: 'Cash' })).getFieldState(accountType)
      .readOnly,
    true
  );
  assert.equal(
    newAccount({ account_type: 'Cash' }).getFieldState(accountType).readOnly,
    false
  );
});

test('a child account takes its root type from its group, so it is read only', () => {
  const rootType = field('root_type');
  const root = newAccount({ is_group: true });
  assert.equal(root.getFieldState(rootType).readOnly, false);
  const child = newAccount({ parent_books_account: 'Current Assets' });
  assert.equal(child.getFieldState(rootType).readOnly, true);
});

test('a root account says it cannot be deleted before asking the server', async () => {
  const root = newAccount({ account_name: 'Assets', is_group: true });
  await assert.rejects(root.beforeDelete(), /Root accounts cannot be deleted/);
  const child = newAccount({
    account_name: 'Cash',
    parent_books_account: 'Assets',
  });
  await child.beforeDelete();
});

test('the parent picker offers groups of the account root type', () => {
  const { parent_books_account } = Account.filters;
  const groups = ['is_group', '=', 1];
  assert.deepEqual(parent_books_account(newAccount({})), [groups]);
  assert.deepEqual(parent_books_account(newAccount({ root_type: 'Income' })), [
    groups,
    ['root_type', '=', 'Income'],
  ]);
});

test('account links in other forms filter by Frappe fieldnames', async () => {
  const { PurchaseInvoice } = frappeModels;
  const JournalEntryAccount = frappeModels.JournalEntry.rowModels.accounts;
  const { Party, AccountingSettings, InventorySettings, POSSettings } =
    frappeModels;
  const ledger = ['is_group', '=', 0];
  assert.deepEqual(await Party.filters.default_account({ role: 'Customer' }), [
    ledger,
    ['account_type', '=', 'Receivable'],
  ]);
  assert.deepEqual(await PurchaseInvoice.filters.account({ isSales: false }), [
    ledger,
    ['account_type', '=', 'Payable'],
  ]);
  assert.deepEqual(JournalEntryAccount.filters.account(), [ledger]);
  assert.deepEqual(AccountingSettings.filters.discount_account(), [
    ledger,
    ['root_type', '=', 'Income'],
  ]);
  // As the DocField's link_filters say.
  const defaults = getSchema('Defaults').fields;
  assert.deepEqual(
    defaults.find((f) => f.fieldname === 'sales_payment_account').linkFilters,
    [ledger, ['account_type', 'in', ['Cash', 'Bank']]]
  );
  const taxRow = getSchema('TaxDetail').fields;
  for (const fieldname of ['account', 'payment_account']) {
    const field = taxRow.find((f) => f.fieldname === fieldname);
    assert.deepEqual(field.linkFilters, [ledger], fieldname);
  }
  assert.deepEqual(InventorySettings.filters.stock_in_hand(), [
    ledger,
    ['account_type', '=', 'Stock'],
  ]);
  assert.deepEqual(POSSettings.filters.cash_account(), [
    ['root_type', '=', 'Asset'],
    ['account_type', '=', 'Cash'],
    ledger,
  ]);
  assert.deepEqual(frappeModels.Item.filters.income_account(), [
    ledger,
    ['root_type', '=', 'Income'],
  ]);
});

test('the account list shows its name, root type, group and parent', () => {
  const { columns } = Account.getListViewSettings(fyo);
  assert.deepEqual(columns, [
    'name',
    'root_type',
    'is_group',
    'parent_books_account',
  ]);
});

test('an account saves without the nested set Frappe keeps', async () => {
  const account = await savedAccount({
    account_name: 'Petty Cash',
    parent_books_account: 'Cash In Hand',
  });
  const values = account.getFrappeValues();
  for (const fieldname of ['lft', 'rgt', 'old_parent']) {
    assert.equal(fieldname in values, false);
  }
});
