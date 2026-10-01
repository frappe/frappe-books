import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GeneralLedger,
  ProfitAndLoss,
  getDateRangePresets,
  getFilterItems,
  makeFyo,
} from './helpers/accounting.mjs';

const fiscalYear = {
  start: new Date(2026, 3, 1),
  end: new Date(2027, 2, 31),
};

function describe(items) {
  return items.map((item) =>
    item.type === 'dateRange'
      ? `${item.from.fieldname}-${item.to.fieldname}`
      : `${item.type}:${item.field.fieldname}`
  );
}

test('report filters show their From and To dates as one range, first', async () => {
  const report = new GeneralLedger(await makeFyo());

  assert.deepEqual(describe(getFilterItems(report.getFilters())), [
    'fromDate-toDate',
    'field:referenceType',
    'field:referenceName',
    'field:account',
    'field:party',
    'field:groupBy',
    'field:reverted',
    'field:ascending',
  ]);
});

test('financial statements show periodicity as tabs and a lone To Date as a date', async () => {
  const report = new ProfitAndLoss(await makeFyo());
  report.basedOn = 'Until Date';
  report.periodicity = 'Monthly';

  assert.deepEqual(describe(getFilterItems(report.getFilters())), [
    'tabs:periodicity',
    'field:basedOn',
    'field:toDate',
    'field:count',
    'field:consolidateColumns',
    'field:hideGroupAmounts',
  ]);
});

test('date range presets follow the fiscal year the settings set', () => {
  const presets = getDateRangePresets(fiscalYear, new Date(2027, 1, 15));

  assert.deepEqual(
    presets.map(({ range }) => range),
    [
      ['2026-04-01', '2027-03-31'],
      ['2025-04-01', '2026-03-31'],
      ['2027-01-01', '2027-03-31'],
      ['2027-02-01', '2027-02-28'],
      ['2027-01-01', '2027-01-31'],
    ]
  );
});

test('before its start in a calendar year, the fiscal year is the one that began a year earlier', () => {
  const [thisYear, , quarter] = getDateRangePresets(
    fiscalYear,
    new Date(2026, 2, 10)
  );

  assert.deepEqual(thisYear.range, ['2025-04-01', '2026-03-31']);
  assert.deepEqual(quarter.range, ['2026-01-01', '2026-03-31']);
});

test('without a fiscal year the presets are this month and the last', () => {
  const presets = getDateRangePresets({}, new Date(2026, 0, 20));

  assert.deepEqual(
    presets.map(({ range }) => range),
    [
      ['2026-01-01', '2026-01-31'],
      ['2025-12-01', '2025-12-31'],
    ]
  );
});
