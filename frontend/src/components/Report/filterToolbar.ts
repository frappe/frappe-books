import { t } from 'fyo';
import { DateTime } from 'luxon';
import type { Field, OptionField } from 'schemas/types';

export type FilterItem =
  | { type: 'dateRange'; key: string; from: Field; to: Field }
  | { type: 'tabs'; key: string; field: OptionField }
  | { type: 'field'; key: string; field: Field };

export interface DateRangePreset {
  label: string;
  range: [string, string];
}

/** The dates Accounting Settings gives the fiscal year. */
export interface FiscalYear {
  start?: Date;
  end?: Date;
}

/** Filter pairs a date range picker sets: Books' own and ERPNext's. */
const DATE_PAIRS = [
  ['fromDate', 'toDate'],
  ['from_date', 'to_date'],
  ['period_start_date', 'period_end_date'],
];

/** One range for the From and To dates, then the tabs, then the rest in order. */
export function getFilterItems(
  filters: Field[],
  tabs = ['periodicity']
): FilterItem[] {
  const range = getDateRange(filters);
  const items = filters
    .filter((field) => !range || (field !== range.from && field !== range.to))
    .map((field) => toFilterItem(field, tabs));

  return [
    ...(range ? [range] : []),
    ...items.filter(({ type }) => type === 'tabs'),
    ...items.filter(({ type }) => type !== 'tabs'),
  ];
}

function getDateRange(
  filters: Field[]
): Extract<FilterItem, { type: 'dateRange' }> | undefined {
  const find = (name: string) =>
    filters.find(({ fieldname }) => fieldname === name);
  for (const [fromName, toName] of DATE_PAIRS) {
    const from = find(fromName);
    const to = find(toName);
    if (from && to) {
      return { type: 'dateRange', key: 'dateRange', from, to };
    }
  }
}

/** A tab filter is a segmented control while its options fit one. */
function toFilterItem(field: Field, tabs: string[]): FilterItem {
  const isTabs =
    tabs.includes(field.fieldname) &&
    field.fieldtype === 'Select' &&
    field.options.length <= 4;
  return isTabs
    ? { type: 'tabs', key: field.fieldname, field }
    : { type: 'field', key: field.fieldname, field };
}

/** Ranges the date picker offers, by the fiscal year the server reports by. */
export function getDateRangePresets(
  fiscalYear: FiscalYear,
  date = new Date()
): DateRangePreset[] {
  const today = DateTime.fromJSDate(date).startOf('day');
  const month = today.startOf('month');
  const presets: [string, DateTime, DateTime][] = [
    [t`This month`, month, month.endOf('month')],
    [t`Last month`, month.minus({ months: 1 }), month.minus({ days: 1 })],
  ];

  if (fiscalYear.start && fiscalYear.end) {
    const [start, end] = getFiscalYear(fiscalYear.start, fiscalYear.end, today);
    const quarter = getQuarterStart(start, today);
    presets.unshift(
      [t`This fiscal year`, start, end],
      [t`Last fiscal year`, start.minus({ years: 1 }), end.minus({ years: 1 })],
      [t`This quarter`, quarter, quarter.plus({ months: 3 }).minus({ days: 1 })]
    );
  }

  return presets.map(([label, from, to]) => ({
    label,
    range: [from.toISODate(), to.toISODate()],
  }));
}

/** The settings' fiscal year moved by whole years to hold today, as the server does. */
function getFiscalYear(start: Date, end: Date, today: DateTime) {
  const fiscalStart = DateTime.fromJSDate(start).startOf('day');
  let years = today.year - fiscalStart.year;
  if (fiscalStart.plus({ years }) > today) {
    years -= 1;
  }

  return [
    fiscalStart.plus({ years }),
    DateTime.fromJSDate(end).startOf('day').plus({ years }),
  ];
}

function getQuarterStart(fiscalStart: DateTime, today: DateTime) {
  const months = Math.floor(today.diff(fiscalStart, 'months').months);
  return fiscalStart.plus({ months: months - (months % 3) });
}
