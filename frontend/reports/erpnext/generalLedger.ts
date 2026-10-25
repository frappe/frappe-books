import { t } from 'fyo';
import { DEFAULT, OPTIONS } from './defaults';
import type { ERPNextReportDefinition } from './types';

export const generalLedger: ERPNextReportDefinition = {
  reportName: 'General Ledger',
  title: t`General Ledger`,
  source: 'erpnext/accounts/report/general_ledger/general_ledger.js',
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
      fieldname: 'from_date',
      label: t`From Date`,
      fieldtype: 'Date',
      default: DEFAULT.monthAgo,
      reqd: 1,
    },
    {
      fieldname: 'to_date',
      label: t`To Date`,
      fieldtype: 'Date',
      default: DEFAULT.today,
      reqd: 1,
    },
    {
      fieldname: 'account',
      label: t`Account`,
      fieldtype: 'MultiSelectList',
      options: 'Account',
      linkFilters: ({ company }) => ({ company }),
    },
    { fieldname: 'voucher_no', label: t`Voucher No`, fieldtype: 'Data' },
    {
      fieldname: 'party_type',
      label: t`Party Type`,
      fieldtype: 'Autocomplete',
      options: OPTIONS.partyTypes,
    },
    {
      fieldname: 'party',
      label: t`Party`,
      fieldtype: 'MultiSelectList',
      options: 'party_type',
      depends_on: 'party_type',
    },
    {
      fieldname: 'categorize_by',
      label: t`Categorize by`,
      fieldtype: 'Select',
      options: [
        '',
        { label: t`Categorize by Voucher`, value: 'Categorize by Voucher' },
        {
          label: t`Categorize by Voucher (Consolidated)`,
          value: 'Categorize by Voucher (Consolidated)',
        },
        { label: t`Categorize by Account`, value: 'Categorize by Account' },
        { label: t`Categorize by Party`, value: 'Categorize by Party' },
      ],
      default: 'Categorize by Voucher (Consolidated)',
    },
    {
      fieldname: 'cost_center',
      label: t`Cost Center`,
      fieldtype: 'MultiSelectList',
      options: 'Cost Center',
      linkFilters: ({ company }) => ({ company }),
    },
    {
      fieldname: 'presentation_currency',
      label: t`Currency`,
      fieldtype: 'Select',
      options: OPTIONS.currencies,
    },
    {
      fieldname: 'show_cancelled_entries',
      label: t`Show Cancelled Entries`,
      fieldtype: 'Check',
    },
    {
      fieldname: 'include_dimensions',
      label: t`Consider Accounting Dimensions`,
      fieldtype: 'Check',
      default: DEFAULT.includeDimensions,
      hidden: 1,
    },
    {
      fieldname: 'include_default_book_entries',
      label: t`Include Default FB Entries`,
      fieldtype: 'Check',
      default: 1,
      hidden: 1,
    },
  ],
  phoneLayout: {
    type: 'entries',
    date: 'posting_date',
    title: 'account',
    amount: 'debit',
    credit: 'credit',
    meta: ['voucher_no', 'party'],
    balance: 'balance',
    chips: ['account', 'party_type', 'party'],
  },
};
