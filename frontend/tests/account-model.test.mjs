import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMetaBundle } from './helpers/doctypes.mjs';
import {
  evaluateReadOnly,
  evaluateRequired,
  frappeModels,
  fyo,
  getSchema,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

stubFrappe(({ path, body }) =>
  path.endsWith('getdoctype')
    ? { docs: getMetaBundle(body.doctype) }
    : { data: [] }
);
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();

const Account = frappeModels.Account;
const schema = getSchema('Account');
const field = (fieldname) =>
  schema.fields.find((field) => field.fieldname === fieldname);

function newAccount(values) {
  const account = newFrappeDoc('Account', values);
  clearTimeout(account._previewTimer);
  return account;
}

function savedAccount(values) {
  const account = newAccount(values);
  account._notInserted = false;
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
  assert.equal(evaluateRequired(parent, newAccount({ is_group: false })), true);
  assert.equal(evaluateRequired(parent, newAccount({ is_group: true })), false);
});

test('a saved account keeps its name, types, parent and group; a set type stays', () => {
  const account = savedAccount({
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
    assert.equal(evaluateReadOnly(field(fieldname), account), true);
  }

  const accountType = field('account_type');
  assert.equal(evaluateReadOnly(accountType, account), false);
  account.account_type = 'Cash';
  assert.equal(evaluateReadOnly(accountType, account), true);
  assert.equal(
    evaluateReadOnly(accountType, newAccount({ account_type: 'Cash' })),
    false
  );
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
  assert.deepEqual(parent_books_account(newAccount({})), { is_group: true });
  assert.deepEqual(parent_books_account(newAccount({ root_type: 'Income' })), {
    is_group: true,
    root_type: 'Income',
  });
});

test('account links in other forms filter by Frappe fieldnames', async () => {
  const { PurchaseInvoice } = frappeModels;
  const JournalEntryAccount = frappeModels.JournalEntry.rowModels.accounts;
  const { Party, AccountingSettings, Defaults, InventorySettings, POSSettings } =
    frappeModels;
  const ledger = { is_group: false };
  assert.deepEqual(await Party.filters.default_account({ role: 'Customer' }), {
    ...ledger,
    account_type: 'Receivable',
  });
  assert.deepEqual(await PurchaseInvoice.filters.account({ isSales: false }), {
    ...ledger,
    account_type: 'Payable',
  });
  assert.deepEqual(JournalEntryAccount.filters.account(), ledger);
  assert.deepEqual(AccountingSettings.filters.discount_account(), {
    ...ledger,
    root_type: 'Income',
  });
  assert.deepEqual(Defaults.filters.sales_payment_account(), {
    ...ledger,
    account_type: ['in', ['Cash', 'Bank']],
  });
  assert.deepEqual(InventorySettings.filters.stock_in_hand(), {
    ...ledger,
    account_type: 'Stock',
  });
  assert.deepEqual(POSSettings.filters.cash_account(), {
    ...ledger,
    root_type: 'Asset',
    account_type: 'Cash',
  });
  assert.deepEqual(frappeModels.Item.filters.income_account(), {
    ...ledger,
    root_type: 'Income',
  });
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

test('an account saves without the nested set Frappe keeps', () => {
  const account = savedAccount({
    account_name: 'Petty Cash',
    parent_books_account: 'Cash In Hand',
  });
  const values = account.getFrappeValues();
  for (const fieldname of ['lft', 'rgt', 'old_parent']) {
    assert.equal(fieldname in values, false);
  }
});
