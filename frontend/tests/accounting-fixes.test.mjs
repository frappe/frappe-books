import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  makeFyo,
  ProfitAndLoss,
  getJsonData,
  getCsvData,
  getDocStatus,
  getDocStatusBadge,
  getLoyaltyProgramBadge,
  getStateBadge,
} from './helpers/accounting.mjs';
import { getSchema } from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/models.mjs';
import { reportResult, stubServer } from './helpers/server.mjs';

await loadFrappeModels();

test('CSV and JSON retain hidden groups and visible leaf amounts', async () => {
  const fyo = await makeFyo();
  const report = {
    fyo,
    reportName: 'balance-sheet',
    filters: [],
    columns: [
      { fieldname: 'account', label: 'Account' },
      { fieldname: 'balance', label: 'Balance' },
    ],
    reportData: [
      {
        isGroup: true,
        cells: [
          { value: 'Assets', rawValue: 'Assets' },
          { value: '', rawValue: 123 },
        ],
      },
      {
        isGroup: false,
        cells: [
          { value: 'Cash', rawValue: 'Cash' },
          { value: '123', rawValue: 123 },
        ],
      },
    ],
  };
  for (const precision of [0, 2]) {
    fyo.singles.SystemSettings.display_precision = precision;
    assert.deepEqual(JSON.parse(getJsonData(report)).rows, [
      { Account: 'Assets', Balance: '' },
      { Account: 'Cash', Balance: '123' },
    ]);
    assert.match(getCsvData(report), /Cash,123/);
    assert.doesNotMatch(getCsvData(report), /Assets,123/);
  }
});

test('P&L takes its defaults, periods and totals from the server', async () => {
  const fyo = await makeFyo();
  const columns = [
    ['account', 'Link', 240],
    ['period_2024_12_31', 'Currency', 150],
    ['period_2023_12_31', 'Currency', 150],
  ];
  const rows = [
    {
      account: 'Income',
      indent: 0,
      is_group: true,
      period_2024_12_31: null,
      period_2023_12_31: null,
    },
    {
      account: 'Sales',
      indent: 1,
      is_group: false,
      period_2024_12_31: 200,
      period_2023_12_31: 100,
    },
    {},
    {
      account: 'Total Profit',
      indent: 0,
      bold: 1,
      period_2024_12_31: 200,
      period_2023_12_31: -30,
    },
  ];
  const calls = stubServer((method) =>
    method.endsWith('get_default_filters')
      ? {
          based_on: 'Until Date',
          periodicity: 'Yearly',
          count: 2,
          to_date: '2024-12-31',
        }
      : reportResult(columns, rows)
  );
  const profit = new ProfitAndLoss(fyo);
  await profit.initialize();

  assert.deepEqual(calls[1].args.filters, {
    based_on: 'Until Date',
    periodicity: 'Yearly',
    to_date: '2024-12-31',
    count: 2,
    consolidate_columns: false,
    hide_group_amounts: false,
  });
  const [group, sales, blank, profitRow] = profit.reportData;
  assert.deepEqual(
    group.cells.map((cell) => cell.value),
    ['Income', '', '']
  );
  assert.equal(group.isGroup, true);
  assert.equal(sales.cells[0].indent, 1);
  assert.equal(blank.isEmpty, true);
  assert.equal(profitRow.cells[0].bold, true);
  assert.deepEqual(
    profitRow.cells.slice(1).map((cell) => [cell.rawValue, cell.color]),
    [
      [200, 'green'],
      [-30, 'red'],
    ]
  );
});

test('list and form statuses come from the stored status', () => {
  const schema = getSchema('SalesInvoice');
  assert.equal(getDocStatus({ schema, status: 'Partly Paid' }), 'Partly Paid');
  assert.equal(getDocStatus({ schema, notInserted: true }), 'Draft');
  assert.equal(
    getDocStatus({ schema, dirty: true, status: 'Saved' }),
    'NotSaved'
  );
  const shift = getSchema('POSOpeningShift');
  assert.equal(getDocStatus({ schema: shift, submitted: true }), 'Submitted');
  assert.equal(
    getDocStatus({ schema: getSchema('Lead'), status: 'Open' }),
    'Saved'
  );
});

test('status badges use the status option label and the DocType state colour', () => {
  const schema = getSchema('SalesInvoice');
  assert.deepEqual(getDocStatusBadge({ schema, status: 'Partly Paid' }), {
    label: 'Partly Paid',
    theme: 'amber',
  });
  assert.deepEqual(getDocStatusBadge({ schema, status: 'Paid' }), {
    label: 'Paid',
    theme: 'green',
  });
  assert.deepEqual(getDocStatusBadge({ schema, notInserted: true }), {
    label: 'Draft',
    theme: 'gray',
  });
  assert.deepEqual(
    getDocStatusBadge({ schema, dirty: true, status: 'Saved' }),
    { label: 'Not Saved', theme: 'amber' }
  );
  assert.deepEqual(getStateBadge(getSchema('Lead'), 'Do not Contact'), {
    label: 'Do not Contact',
    theme: 'red',
  });
  const program = getSchema('LoyaltyProgram');
  assert.deepEqual(
    getLoyaltyProgramBadge({ schema: program, status: 'Maxed' }),
    {
      label: 'Maxed',
      theme: 'amber',
    }
  );
});

test('currency formatting uses exactly the configured precision', async () => {
  const fyo = await makeFyo();
  fyo.singles.SystemSettings.display_precision = 0;
  assert.equal(fyo.format(fyo.pesa('123.99'), 'Currency'), '124');
});
