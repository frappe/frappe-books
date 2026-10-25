import { t } from 'fyo';
import { getAgeingFilters } from './accountsReceivable';
import { DEFAULT } from './defaults';
import type { ERPNextReportDefinition } from './types';

export const accountsPayable: ERPNextReportDefinition = {
  reportName: 'Accounts Payable',
  title: t`Accounts Payable`,
  source: 'erpnext/accounts/report/accounts_payable/accounts_payable.js',
  filters: [
    ...getAgeingFilters('Payable'),
    {
      fieldname: 'ageing_based_on',
      label: t`Ageing Based On`,
      fieldtype: 'Select',
      options: 'Posting Date\nDue Date\nSupplier Invoice Date',
      default: 'Due Date',
    },
    {
      fieldname: 'group_by_party',
      label: t`Group By Supplier`,
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
