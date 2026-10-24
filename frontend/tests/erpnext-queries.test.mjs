import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  ERPNEXT_QUERIES,
  evaluateExpression,
  toFilterList,
} from './helpers/frappe.mjs';

// The boot's globals that ERPNext's rules read, as in /books.
globalThis.frappe = {
  boot: {
    docs: [
      {
        doctype: ':Company',
        name: 'Acme',
        default_currency: 'INR',
        enable_perpetual_inventory: 1,
      },
    ],
    party_account_types: { Customer: 'Receivable', Supplier: 'Payable' },
    sysdefaults: { currency: 'INR' },
  },
};
after(() => delete globalThis.frappe);

const doc = { company: 'Acme', item_code: 'PEN', party_type: 'Customer' };
const parent = { ...doc, apply_on: 'Item Code', posting_date: '2026-10-25' };

function getExpressions(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return Object.values(value).flatMap(getExpressions);
  }

  return typeof value === 'string' && value.startsWith('eval:')
    ? [value.slice(5)]
    : [];
}

test("every expression of ERPNext's link rules evaluates", () => {
  const expressions = getExpressions(ERPNEXT_QUERIES);
  assert.ok(expressions.length > 100);
  for (const expression of expressions) {
    assert.doesNotThrow(
      () => evaluateExpression(expression, doc, parent),
      expression
    );
  }
});

test("link rules read the row's document and the boot", () => {
  const { filters } = ERPNEXT_QUERIES['Journal Entry']['accounts.account'];
  assert.deepEqual(
    evaluateExpression(filters.account_currency.slice(5), {}, parent),
    ['in', ['INR', null]]
  );
  const paidFrom = ERPNEXT_QUERIES['Payment Entry'].paid_from.filters;
  assert.deepEqual(
    evaluateExpression(paidFrom.account_type[1].slice(5), doc, null),
    ['Receivable']
  );
});

test('dict filters become list filters', () => {
  assert.deepEqual(
    toFilterList({ company: 'Acme', root_type: ['in', ['Income']] }),
    [
      ['company', '=', 'Acme'],
      ['root_type', 'in', ['Income']],
    ]
  );
  assert.equal(toFilterList(null), null);
});
