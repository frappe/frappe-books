import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  getCompanyRow,
  getCompanyRowValue,
  setCompanyRowValue,
} from './helpers/frappe.mjs';

const books = globalThis.window.frappe.boot.books;
afterEach(() => {
  globalThis.window.frappe.boot.books = books;
});

const fields = ['company', 'account', 'advance_account'].map((fieldname) => ({
  fieldname,
}));

/** A party with `accounts` rows, as company-row fields read and write them. */
function makeParty(rows) {
  const makeRow = (values) => ({
    ...values,
    schema: { fields },
    _serverFilled: new Set(),
  });
  const party = {
    accounts: rows.map(makeRow),
    push(tableField, values) {
      party[tableField] = [...party[tableField], makeRow(values)];
    },
  };
  return party;
}

test('standalone rows are the one company’s: a value makes the row, clearing it removes the row', () => {
  globalThis.window.frappe.boot.books = { company: 'Lane Co' };
  const party = makeParty([]);
  setCompanyRowValue(party, 'accounts', 'account', 'Debtors');
  assert.equal(party.accounts.length, 1);
  assert.equal(getCompanyRowValue(party, 'accounts', 'account'), 'Debtors');

  setCompanyRowValue(party, 'accounts', 'account', 'Debtors 2');
  assert.equal(party.accounts.length, 1);
  assert.equal(party.accounts[0].account, 'Debtors 2');

  setCompanyRowValue(party, 'accounts', 'account', null);
  assert.deepEqual(party.accounts, []);
});

test('accessory mode reads and writes only the current company’s row', () => {
  globalThis.window.frappe.boot.books = {
    accessory_mode: true,
    company: 'Acme',
  };
  const party = makeParty([{ company: 'Beta', account: 'Debtors - B' }]);
  assert.equal(getCompanyRow(party, 'accounts'), undefined);
  assert.equal(getCompanyRowValue(party, 'accounts', 'account'), null);

  setCompanyRowValue(party, 'accounts', 'account', 'Debtors - A');
  assert.deepEqual(
    party.accounts.map(({ company, account }) => [company, account]),
    [
      ['Beta', 'Debtors - B'],
      ['Acme', 'Debtors - A'],
    ]
  );

  setCompanyRowValue(party, 'accounts', 'account', '');
  assert.deepEqual(
    party.accounts.map(({ company }) => company),
    ['Beta']
  );
});

test('a cleared field keeps a row that still holds other values', () => {
  globalThis.window.frappe.boot.books = {
    accessory_mode: true,
    company: 'Acme',
  };
  const party = makeParty([
    {
      company: 'Acme',
      account: 'Debtors - A',
      advance_account: 'Advances - A',
    },
  ]);
  setCompanyRowValue(party, 'accounts', 'account', null);
  assert.equal(party.accounts.length, 1);
  assert.equal(party.accounts[0].account, null);
  assert.equal(party.accounts[0].advance_account, 'Advances - A');
});
