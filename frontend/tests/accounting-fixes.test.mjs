import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DateTime } from 'luxon';
import {
  makeFyo,
  BalanceSheet,
  ProfitAndLoss,
  getJsonData,
  getCsvData,
  matchesStatus,
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

test('balance sheets include opening balances while P&L shows each period', async () => {
  const fyo = await makeFyo();
  const ranges = [2023, 2024].map((year) => ({
    fromDate: DateTime.local(year, 1, 1),
    toDate: DateTime.local(year + 1, 1, 1),
  }));
  const entries = [
    { account: 'Cash', date: new Date('2022-01-01'), debit: 100 },
    { account: 'Cash', date: new Date('2023-01-01'), debit: 50 },
    { account: 'Cash', date: new Date('2024-01-01'), credit: 20 },
    { account: 'Cash', date: new Date('2025-01-01'), debit: 999 },
  ];
  const report = new BalanceSheet(fyo);
  report._dateRanges = ranges;
  report.accountMap = { Cash: { rootType: 'Asset' } };
  const values = (
    await report._getGroupedByDateRanges(new Map([['Cash', entries]]))
  ).get('Cash');
  assert.deepEqual(
    ranges.map((range) => values.get(range).balance),
    [150, 130]
  );
  report.toDate = '2024-12-31';
  assert.deepEqual((await report._getQueryFilters()).date, ['<', '2025-01-01']);

  const profit = new ProfitAndLoss(fyo);
  profit._dateRanges = ranges;
  profit.accountMap = { Sales: { rootType: 'Income' } };
  const income = [2023, 2024].map((year, i) => ({
    account: 'Sales',
    date: new Date(`${year}-02-01`),
    credit: (i + 1) * 100,
  }));
  const periods = (
    await profit._getGroupedByDateRanges(new Map([['Sales', income]]))
  ).get('Sales');
  assert.deepEqual(
    ranges.map((range) => periods.get(range).balance),
    [100, 200]
  );
});

test('computed filters work without rendered rows, for every offered operator', async () => {
  const fyo = await makeFyo();
  const row = {
    schema: fyo.schemaMap.JournalEntry,
    submitted: true,
    cancelled: true,
  };
  for (const [filter, expected] of [
    [['like', '%can%'], true],
    [['not like', '%can%'], false],
    [['=', 'Cancelled'], true],
    [['!=', 'Submitted'], true],
    [['>', 'a'], true],
    [['<', 'a'], false],
    [['is null', ''], false],
    [['is not null', ''], true],
  ])
    assert.equal(matchesStatus(row, filter), expected, JSON.stringify(filter));
  assert.throws(() => matchesStatus(row, ['invalid', '']), /Unsupported/);
});

test('currency formatting uses exactly the configured precision', async () => {
  const fyo = await makeFyo();
  fyo.singles.SystemSettings.displayPrecision = 0;
  assert.equal(fyo.format(fyo.pesa('123.99'), 'Currency'), '124');
});
