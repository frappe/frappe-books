import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDashboardData, getInvoiceSummary } from './helpers/accounting.mjs';
import { stubServer } from './helpers/server.mjs';

test('dashboard figures come from the server for the chosen period', async () => {
  const calls = stubServer(() => ({ months: [], has_data: false }));

  await getDashboardData('get_cashflow', 'This Month');
  await getInvoiceSummary('Books Sales Invoice', 'YTD');

  assert.deepEqual(calls, [
    {
      method: 'frappe_books.reports.dashboard.get_cashflow',
      args: { period: 'This Month' },
    },
    {
      method: 'frappe_books.reports.dashboard.get_invoice_summary',
      args: { doctype: 'Books Sales Invoice', period: 'YTD' },
    },
  ]);
});
