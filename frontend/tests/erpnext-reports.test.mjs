import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  erpnextReports,
  fyo,
  getFilterItems,
  loadTestDocTypes,
  stubFrappe,
} from './helpers/frappe.mjs';

await loadTestDocTypes();
const RUN = '/api/method/frappe.desk.query_report.run';
const FISCAL_YEAR = '/api/method/erpnext.accounts.utils.get_fiscal_year';

let previousWindow;
beforeEach(() => {
  previousWindow = globalThis.window;
  globalThis.window = {
    location: { hostname: 'books.localhost' },
    frappe: {
      boot: {
        time_zone: { system: 'Asia/Kolkata' },
        books: { accessory_mode: true, company: 'Acme' },
        party_account_types: { Customer: 'Receivable', Supplier: 'Payable' },
        docs: [{ doctype: ':Company', name: 'Acme', default_currency: 'INR' }],
        sysdefaults: {},
      },
    },
  };
});

afterEach(() => {
  globalThis.window = previousWindow;
});

/** Answers ERPNext's fiscal year and each report run with `result`, recording the runs. */
function stubERPNext(result = { columns: [], result: [] }) {
  const runs = [];
  stubFrappe(({ path, body }) => {
    if (path === FISCAL_YEAR) {
      return { message: ['2026-2027', '2026-04-01', '2027-03-31'] };
    }

    if (path === RUN) {
      runs.push(body);
      return typeof result === 'function' ? result(body) : { message: result };
    }
  });
  return runs;
}

async function openReport(name, filters = {}) {
  const report = new erpnextReports[name](fyo);
  await report.initialize(filters);
  return report;
}

test('a report runs with the accessory company, its fiscal year and the defaults ERPNext hides', async () => {
  const runs = stubERPNext();
  await openReport('ProfitAndLoss');

  const { filters, js_filters, report_name } = runs[0];
  assert.equal(report_name, 'Profit and Loss Statement');
  assert.equal(filters.company, 'Acme');
  assert.equal(filters.filter_based_on, 'Fiscal Year');
  assert.equal(filters.from_fiscal_year, '2026-2027');
  assert.equal(filters.selected_view, 'Report');
  // A date range filter shown only for Date Range is not sent.
  assert.equal(filters.period_start_date, undefined);
  assert.ok(js_filters.some(({ fieldname }) => fieldname === 'company'));
});

test('a required filter left empty keeps the report from running', async () => {
  const runs = stubERPNext();
  const report = await openReport('ProfitAndLoss', {
    filter_based_on: 'Date Range',
    period_start_date: null,
  });

  assert.equal(runs.length, 0);
  assert.equal(report.missingFilter.fieldname, 'period_start_date');
});

test("ERPNext's error shows instead of the rows", async (t) => {
  // Node has no DOMParser; this one reads a message's text as a browser does.
  globalThis.DOMParser = class {
    parseFromString(html) {
      return { body: { textContent: html.replace(/<[^>]*>/g, '') } };
    }
  };
  t.after(() => delete globalThis.DOMParser);
  stubERPNext(() => ({
    status: 417,
    body: {
      exc_type: 'ValidationError',
      _server_messages: JSON.stringify([
        JSON.stringify({ message: 'From Date must be before To Date' }),
      ]),
    },
  }));
  const report = await openReport('GeneralLedger');

  assert.equal(report.error, 'From Date must be before To Date');
  assert.deepEqual(report.reportData, []);
});

test('account trees name accounts, fold groups and mark the quoted totals', async () => {
  stubERPNext({
    columns: [
      {
        fieldname: 'account',
        label: 'Account',
        fieldtype: 'Link',
        options: 'Account',
        width: 300,
      },
      {
        fieldname: 'currency',
        label: 'Currency',
        fieldtype: 'Link',
        hidden: 1,
      },
      {
        fieldname: 'total',
        label: 'Total',
        fieldtype: 'Currency',
        options: 'currency',
      },
    ],
    result: [
      {
        account: 'Income - AR',
        account_name: 'Income',
        indent: 0,
        is_group: 1,
        currency: 'INR',
        total: 10,
      },
      {
        account: 'Sales - AR',
        account_name: 'Sales',
        indent: 1,
        is_group: 0,
        currency: 'INR',
        total: 10,
      },
      {
        account: "'Total Income (Credit)'",
        account_name: "'Total Income (Credit)'",
        currency: 'INR',
        total: 10,
      },
    ],
    report_summary: [
      {
        label: 'Net Profit',
        value: 10,
        datatype: 'Currency',
        indicator: 'Green',
      },
    ],
    chart: {
      type: 'bar',
      data: {
        labels: ['2026-2027'],
        datasets: [{ name: 'Income', values: [10] }],
      },
    },
  });
  const report = await openReport('ProfitAndLoss');

  assert.deepEqual(
    report.columns.map(({ fieldname }) => fieldname),
    ['account', 'total']
  );
  const [group, leaf, total] = report.reportData;
  assert.equal(group.cells[0].value, 'Income');
  assert.equal(group.isGroup, true);
  assert.equal(leaf.cells[0].indent, 1);
  assert.equal(total.cells[0].value, 'Total Income (Credit)');
  assert.equal(total.isShaded, true);
  assert.equal(report.summary[0].label, 'Net Profit');
  assert.equal(report.chart.type, 'bar');
});

test("Frappe's total row, a list of values, lines up with the columns", async () => {
  stubERPNext({
    columns: [
      {
        fieldname: 'item_code',
        label: 'Item',
        fieldtype: 'Link',
        options: 'Item',
      },
      {
        fieldname: 'hidden_value',
        label: 'Hidden',
        fieldtype: 'Data',
        hidden: 1,
      },
      { fieldname: 'bal_qty', label: 'Balance Qty', fieldtype: 'Float' },
    ],
    result: [{ item_code: 'PEN', bal_qty: 5 }, ['Total', '', 5]],
  });
  const report = await openReport('StockBalance');

  const total = report.reportData.at(-1);
  assert.equal(total.isTotal, true);
  assert.deepEqual(
    total.cells.map(({ rawValue }) => rawValue),
    ['Total', 5]
  );
});

test('a party link sets a list of one party, which a new party type clears', async () => {
  const runs = stubERPNext();
  const report = await openReport('GeneralLedger', {
    party_type: 'Customer',
    party: 'Globex',
  });

  assert.deepEqual(runs.at(-1).filters.party, ['Globex']);
  await report.set('party_type', 'Supplier');
  assert.equal(report.get('party'), undefined);
});

test("ERPNext's date pairs share the date range picker and its tab filters show as tabs", async () => {
  stubERPNext();
  const report = await openReport('ProfitAndLoss', {
    filter_based_on: 'Date Range',
  });

  const items = getFilterItems(report.filters, report.tabFilters);
  assert.deepEqual(
    [items[0].type, items[0].from.fieldname, items[0].to.fieldname],
    ['dateRange', 'period_start_date', 'period_end_date']
  );
  assert.equal(items[1].type, 'tabs');
  assert.equal(items[1].field.fieldname, 'filter_based_on');
});
