import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fyo, MobileTree, ProfitAndLoss } from './helpers/frappe.mjs';

const periods = ['period_2026_08_31', 'period_2026_07_31'];

function getProfitAndLossTree(rows) {
  const report = new ProfitAndLoss(fyo);
  report.columns = [
    { fieldname: 'account', label: 'Account', fieldtype: 'Link' },
    ...periods.map((fieldname) => ({
      fieldname,
      label: fieldname,
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

test("the phone Total column shows the server's total of each row", () => {
  // Added up in the browser, 100010.135 + 123.45 shows as 1,00,133.58.
  const tree = getProfitAndLossTree([
    account('Income', 0, [null, null], null),
    account('Sales', 1, [100010.135, 123.45], 100133.585),
    account('Total Income (Credit)', 0, [100010.135, 123.45], 100133.585),
  ]);

  const [total] = tree.columnOptions;
  const rows = tree.getRows([total]);

  assert.equal(total.label, 'Total');
  assert.deepEqual(
    rows.map(({ label, values: [value] }) => [label, value.text, value.isZero]),
    [
      ['Income', '', true],
      ['Sales', '1,00,133.59', false],
      ['Total Income (Credit)', '1,00,133.59', false],
    ]
  );
});
