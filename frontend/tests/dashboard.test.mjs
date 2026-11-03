import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCashBalances,
  getDashboardData,
  getInvoiceListFilters,
  getInvoiceSummary,
} from './helpers/accounting.mjs';
import { stubServer } from './helpers/server.mjs';

test('dashboard figures come from the server for the chosen period', async () => {
  const calls = stubServer(() => ({ months: [], has_data: false }));

  await getDashboardData('get_cashflow', 'This month');
  await getInvoiceSummary('Books Sales Invoice', 'YTD');

  assert.deepEqual(calls, [
    {
      method: 'frappe_books.reports.dashboard.get_cashflow',
      args: { period: 'This month' },
    },
    {
      method: 'frappe_books.reports.dashboard.get_invoice_summary',
      args: { doctype: 'Books Sales Invoice', period: 'YTD' },
    },
  ]);
});

// covers: AC-2 (the balances take no period)
test('cash balances come from the server without a period', async () => {
  const balances = { accounts: [], total: 0, as_of: '2031-12-15' };
  const calls = stubServer(() => balances);

  const result = await getCashBalances();

  assert.deepEqual(calls, [
    { method: 'frappe_books.reports.dashboard.get_cash_balances', args: {} },
  ]);
  assert.deepEqual(result, balances);
});

test('paid and unpaid lists show the submitted invoices of the period', () => {
  const summary = { from_date: '2031-09-01', before_date: '2031-10-01' };
  const filters = (operator) => [
    ['docstatus', '=', 1],
    ['outstanding_amount', operator, 0],
    ['posting_date', '>=', '2031-09-01'],
    ['posting_date', '<', '2031-10-01'],
  ];

  assert.deepEqual(getInvoiceListFilters(summary, true), filters('='));
  assert.deepEqual(getInvoiceListFilters(summary, false), filters('!='));
});
