import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DateTime } from 'luxon';
import {
  makeFyo,
  BalanceSheet,
  ProfitAndLoss,
  getJsonData,
  getCsvData,
  getDocStatus,
} from './helpers/accounting.mjs';

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
    fyo.singles.SystemSettings.displayPrecision = precision;
    assert.deepEqual(JSON.parse(getJsonData(report)).rows, [
      { Account: 'Assets', Balance: '' },
      { Account: 'Cash', Balance: '123' },
    ]);
    assert.match(getCsvData(report), /Cash,123/);
    assert.doesNotMatch(getCsvData(report), /Assets,123/);
  }
});

test('balance sheet and P&L request their periods and render server totals', async () => {
  const fyo = await makeFyo();
  const calls = [];
  const section = (rootType, name, values) => ({
    rootType,
    accounts: [{ name, level: 0, isGroup: false, values }],
    total: values,
  });
  fyo.db.getReportData = async (query, ...args) => {
    calls.push([query, ...args]);
    if (query === 'getBalanceSheet')
      return { sections: [section('Asset', 'Cash', [130, 150])] };
    return {
      sections: [
        section('Income', 'Sales', [200, 100]),
        section('Expense', 'Rent', [0, 130]),
      ],
      profit: [200, -30],
    };
  };
  const ranges = [2024, 2023].map((year) => ({
    fromDate: DateTime.local(year, 1, 1),
    toDate: DateTime.local(year + 1, 1, 1),
  }));
  const rawValues = (report) =>
    report.reportData.map((row) => row.cells.map((cell) => cell.rawValue));

  const balanceSheet = new BalanceSheet(fyo);
  balanceSheet._dateRanges = ranges;
  await balanceSheet.setReportData();
  assert.deepEqual(calls[0], [
    'getBalanceSheet',
    [
      { fromDate: '2024-01-01', toDate: '2025-01-01' },
      { fromDate: '2023-01-01', toDate: '2024-01-01' },
    ],
  ]);
  assert.deepEqual(rawValues(balanceSheet), [
    ['Cash', 130, 150],
    ['Total Asset (Debit)', 130, 150],
  ]);

  const profit = new ProfitAndLoss(fyo);
  profit._dateRanges = ranges;
  await profit.setReportData();
  assert.equal(calls[1][0], 'getProfitAndLoss');
  assert.equal(profit.reportData.length, 7);
  const profitRow = profit.reportData.at(-1);
  assert.equal(profitRow.cells[0].rawValue, 'Total Profit');
  assert.deepEqual(
    profitRow.cells.slice(1).map((cell) => [cell.rawValue, cell.color]),
    [
      [200, 'green'],
      [-30, 'red'],
    ]
  );
});

test('list and form statuses come from the stored status', async () => {
  const fyo = await makeFyo();
  const schema = fyo.schemaMap.SalesInvoice;
  assert.equal(getDocStatus({ schema, status: 'PartlyPaid' }), 'PartlyPaid');
  assert.equal(getDocStatus({ schema, notInserted: true }), 'Draft');
  assert.equal(
    getDocStatus({ schema, dirty: true, status: 'Saved' }),
    'NotSaved'
  );
  const shift = fyo.schemaMap.POSOpeningShift;
  assert.equal(getDocStatus({ schema: shift, submitted: true }), 'Submitted');
  assert.equal(
    getDocStatus({ schema: fyo.schemaMap.Lead, status: 'Open' }),
    'Saved'
  );
});

test('currency formatting uses exactly the configured precision', async () => {
  const fyo = await makeFyo();
  fyo.singles.SystemSettings.displayPrecision = 0;
  assert.equal(fyo.format(fyo.pesa('123.99'), 'Currency'), '124');
});
