import { t } from 'fyo';
import { DEFAULT, getFiscalYear } from './defaults';
import type { ERPNextReportDefinition } from './types';

export const trialBalance: ERPNextReportDefinition = {
  reportName: 'Trial Balance',
  title: t`Trial Balance`,
  source: 'erpnext/accounts/report/trial_balance/trial_balance.js',
  filters: [
    {
      fieldname: 'company',
      label: t`Company`,
      fieldtype: 'Link',
      options: 'Company',
      default: DEFAULT.company,
      reqd: 1,
    },
    {
      fieldname: 'fiscal_year',
      label: t`Fiscal Year`,
      fieldtype: 'Link',
      options: 'Fiscal Year',
      default: DEFAULT.fiscalYear,
      reqd: 1,
    },
    {
      fieldname: 'from_date',
      label: t`From Date`,
      fieldtype: 'Date',
      default: DEFAULT.fiscalYearStart,
    },
    {
      fieldname: 'to_date',
      label: t`To Date`,
      fieldtype: 'Date',
      default: DEFAULT.fiscalYearEnd,
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
    {
      fieldname: 'show_zero_values',
      label: t`Show zero values`,
      fieldtype: 'Check',
    },
    {
      fieldname: 'with_period_closing_entry_for_opening',
      label: t`With Period Closing Entry For Opening Balances`,
      fieldtype: 'Check',
      default: 1,
      hidden: 1,
    },
    {
      fieldname: 'with_period_closing_entry_for_current_period',
      label: t`Period Closing Entry For Current Period`,
      fieldtype: 'Check',
      default: 1,
      hidden: 1,
    },
    {
      fieldname: 'include_default_book_entries',
      label: t`Include Default FB Entries`,
      fieldtype: 'Check',
      default: 1,
      hidden: 1,
    },
    {
      fieldname: 'show_net_values',
      label: t`Show net values in opening and closing columns`,
      fieldtype: 'Check',
      default: 1,
      hidden: 1,
    },
    {
      fieldname: 'show_group_accounts',
      label: t`Show Group Accounts`,
      fieldtype: 'Check',
      default: 1,
      hidden: 1,
    },
  ],
  tree: true,
  /** ERPNext's fiscal_year on_change: the dates become the year's. */
  onChange: {
    async fiscal_year({ fiscal_year, company }) {
      if (typeof fiscal_year !== 'string' || !fiscal_year) {
        return {};
      }

      const [, from_date, to_date] = await getFiscalYear({
        fiscal_year,
        company: company as string | undefined,
      });
      return from_date ? { from_date, to_date } : {};
    },
  },
  phoneLayout: {
    type: 'tree',
    label: 'account',
    values: [
      { fieldname: 'closing_debit', width: 100 },
      { fieldname: 'closing_credit', width: 100 },
    ],
    chips: ['fiscal_year'],
    scroll: true,
  },
};
