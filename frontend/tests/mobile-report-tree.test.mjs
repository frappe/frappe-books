import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fyo,
  MobileTree,
  ProfitAndLoss,
  StockBalance,
} from './helpers/frappe.mjs';

const periods = ['period_2026_08_31', 'period_2026_07_31'];

function getProfitAndLossTree(rows) {
  const report = new ProfitAndLoss(fyo);
  report.columns = [
    { fieldname: 'account', label: 'Account', fieldtype: 'Link' },
    ...[...periods, 'total'].map((fieldname) => ({
      fieldname,
      label: fieldname === 'total' ? 'Total' : fieldname,
      fieldtype: 'Currency',
    })),
  ];
  report.reportData = rows.map((row) => report.getReportRow(row));
  return new MobileTree(report, ProfitAndLoss.phoneLayout);
}

function account(name, indent, values, total) {
  return {
    account: name,
    indent,
    is_group: values[0] === null,
    ...Object.fromEntries(periods.map((key, index) => [key, values[index]])),
    total,
  };
}

test("the phone picks the server's Total column first", () => {
  // Added up in the browser, 100010.135 + 123.45 shows as 1,00,133.58.
  const tree = getProfitAndLossTree([
    account('Income', 0, [null, null], null),
    account('Sales', 1, [100010.135, 123.45], 100133.585),
    account('Total Income (Credit)', 0, [100010.135, 123.45], 100133.585),
  ]);

  const [total] = tree.columnOptions;
  const rows = tree.getRows([total]);

  assert.deepEqual(
    tree.columnOptions.map(({ key }) => key),
    ['total', ...periods]
  );
  assert.deepEqual(
    rows.map(({ label, values: [value] }) => [label, value.text, value.isZero]),
    [
      ['Income', '', true],
      ['Sales', '1,00,133.59', false],
      ['Total Income (Credit)', '1,00,133.59', false],
    ]
  );
});

test('a phone Stock Balance item counts its locations, not its batch rows', () => {
  const report = new StockBalance(fyo);
  report.columns = ['item', 'location', 'batch', 'balance_quantity'].map(
    (fieldname) => ({ fieldname, label: fieldname, fieldtype: 'Data' })
  );
  report.reportData = [
    { item: 'Pen', location: 'Stores', batch: 'B1', balance_quantity: 2 },
    { item: 'Pen', location: 'Stores', batch: 'B2', balance_quantity: 3 },
    { item: 'Pen', location: 'Counter', batch: 'B1', balance_quantity: 1 },
  ].map((row) => report.getReportRow(row));
  const tree = new MobileTree(report, StockBalance.phoneLayout);

  const [pen] = tree.getRows(tree.getValueColumns());

  assert.equal(pen.subtitle, '2 locations');
});
