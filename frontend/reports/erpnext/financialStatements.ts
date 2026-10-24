import { t } from 'fyo';
import type { PhoneTreeLayout } from 'reports/types';
import { DEFAULT } from './defaults';
import type { ERPNextFilter } from './types';

/** ERPNext's `erpnext/public/js/financial_statements.js` filters that Profit and Loss and Balance Sheet share. */
export const financialStatementFilters: ERPNextFilter[] = [
  {
    fieldname: 'company',
    label: t`Company`,
    fieldtype: 'Link',
    options: 'Company',
    default: DEFAULT.company,
    reqd: 1,
  },
  {
    fieldname: 'filter_based_on',
    label: t`Filter Based On`,
    fieldtype: 'Select',
    options: ['Fiscal Year', 'Date Range'],
    default: ['Fiscal Year'],
    reqd: 1,
  },
  {
    fieldname: 'period_start_date',
    label: t`Start Date`,
    fieldtype: 'Date',
    depends_on: "eval:doc.filter_based_on == 'Date Range'",
    mandatory_depends_on: "eval:doc.filter_based_on == 'Date Range'",
  },
  {
    fieldname: 'period_end_date',
    label: t`End Date`,
    fieldtype: 'Date',
    depends_on: "eval:doc.filter_based_on == 'Date Range'",
    mandatory_depends_on: "eval:doc.filter_based_on == 'Date Range'",
  },
  {
    fieldname: 'from_fiscal_year',
    label: t`Start Year`,
    fieldtype: 'Link',
    options: 'Fiscal Year',
    default: DEFAULT.fiscalYear,
    depends_on: "eval:doc.filter_based_on == 'Fiscal Year'",
    mandatory_depends_on: "eval:doc.filter_based_on == 'Fiscal Year'",
  },
  {
    fieldname: 'to_fiscal_year',
    label: t`End Year`,
    fieldtype: 'Link',
    options: 'Fiscal Year',
    default: DEFAULT.fiscalYear,
    depends_on: "eval:doc.filter_based_on == 'Fiscal Year'",
    mandatory_depends_on: "eval:doc.filter_based_on == 'Fiscal Year'",
  },
  {
    fieldname: 'periodicity',
    label: t`Periodicity`,
    fieldtype: 'Select',
    options: [
      { value: 'Monthly', label: t`Monthly` },
      { value: 'Quarterly', label: t`Quarterly` },
      { value: 'Half-Yearly', label: t`Half-Yearly` },
      { value: 'Yearly', label: t`Yearly` },
    ],
    default: 'Yearly',
    reqd: 1,
  },
  {
    fieldname: 'cost_center',
    label: t`Cost Center`,
    fieldtype: 'MultiSelectList',
    options: 'Cost Center',
    linkFilters: ({ company }) => ({ company }),
  },
  {
    fieldname: 'project',
    label: t`Project`,
    fieldtype: 'MultiSelectList',
    options: 'Project',
    linkFilters: ({ company }) => ({ company }),
  },
  {
    fieldname: 'finance_book',
    label: t`Finance Book`,
    fieldtype: 'Link',
    options: 'Finance Book',
  },
];

/** ERPNext's financial statements `onload`: a date range defaults to this fiscal year. */
export const financialStatementOnLoad = {
  period_start_date: DEFAULT.fiscalYearStart,
  period_end_date: DEFAULT.fiscalYearEnd,
};

/** Accounts with one period column at a time, picked in the Column sheet. */
export const financialStatementPhoneLayout: PhoneTreeLayout = {
  type: 'tree',
  label: 'account',
  periods: true,
  chips: ['periodicity'],
};
