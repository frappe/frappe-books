import { t } from 'fyo';
import { DEFAULT, OPTIONS } from './defaults';
import type { ERPNextFilter, ERPNextReportDefinition } from './types';

type Ledger = 'Receivable' | 'Payable';

/** The filters Accounts Receivable and Accounts Payable share, by the account type they age. */
export function getAgeingFilters(ledger: Ledger): ERPNextFilter[] {
  return [
    {
      fieldname: 'company',
      label: t`Company`,
      fieldtype: 'Link',
      options: 'Company',
      reqd: 1,
      default: DEFAULT.company,
    },
    {
      fieldname: 'report_date',
      label: t`Report Date`,
      fieldtype: 'Date',
      default: DEFAULT.today,
    },
    {
      fieldname: 'party_type',
      label: t`Party Type`,
      fieldtype: 'Autocomplete',
      options:
        ledger === 'Receivable'
          ? OPTIONS.receivablePartyTypes
          : OPTIONS.payablePartyTypes,
    },
    {
      fieldname: 'party',
      label: t`Party`,
      fieldtype: 'MultiSelectList',
      options: 'party_type',
    },
    {
      fieldname: 'party_account',
      label:
        ledger === 'Receivable' ? t`Receivable Account` : t`Payable Account`,
      fieldtype: 'Link',
      options: 'Account',
      linkFilters: ({ company }) => ({
        company,
        account_type: ledger,
        is_group: 0,
      }),
    },
    {
      fieldname: 'cost_center',
      label: t`Cost Center`,
      fieldtype: 'MultiSelectList',
      options: 'Cost Center',
      linkFilters: ({ company }) => ({ company }),
    },
    {
      fieldname: 'age_as_on',
      label: t`Age as on`,
      fieldtype: 'Select',
      options: 'Report Date\nToday',
      default: 'Report Date',
      hidden: 1,
    },
    {
      fieldname: 'range',
      label: t`Ageing Range`,
      fieldtype: 'Data',
      default: '30, 60, 90, 120',
      hidden: 1,
    },
  ];
}

export const accountsReceivable: ERPNextReportDefinition = {
  reportName: 'Accounts Receivable',
  title: t`Accounts Receivable`,
  source: 'erpnext/accounts/report/accounts_receivable/accounts_receivable.js',
  filters: [
    ...getAgeingFilters('Receivable'),
    {
      fieldname: 'ageing_based_on',
      label: t`Ageing Based On`,
      fieldtype: 'Select',
      options: 'Posting Date\nDue Date',
      default: 'Due Date',
    },
    {
      fieldname: 'group_by_party',
      label: t`Group By Customer`,
      fieldtype: 'Check',
    },
  ],
  /** ERPNext's `onload`: the ageing range Accounts Settings sets. */
  onLoad: { range: DEFAULT.ageingRange },
  phoneLayout: {
    type: 'tree',
    label: 'party',
    values: [{ fieldname: 'outstanding' }],
    chips: ['party_type', 'party'],
  },
};
