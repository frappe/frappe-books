import { t } from 'fyo';
import {
  financialStatementFilters,
  financialStatementOnLoad,
  financialStatementPhoneLayout,
} from './financialStatements';
import type { ERPNextReportDefinition } from './types';

export const balanceSheet: ERPNextReportDefinition = {
  reportName: 'Balance Sheet',
  title: t`Balance Sheet`,
  source: 'erpnext/accounts/report/balance_sheet/balance_sheet.js',
  filters: [
    ...financialStatementFilters,
    {
      fieldname: 'accumulated_values',
      label: t`Accumulated Values`,
      fieldtype: 'Check',
      default: 1,
    },
    {
      fieldname: 'include_default_book_entries',
      label: t`Include Default FB Entries`,
      fieldtype: 'Check',
      default: 1,
    },
    {
      fieldname: 'selected_view',
      label: t`Select View`,
      fieldtype: 'Select',
      options: [
        { value: 'Report', label: t`Report View` },
        { value: 'Growth', label: t`Growth View` },
      ],
      default: 'Report',
      reqd: 1,
      hidden: 1,
    },
  ],
  tree: true,
  tabs: ['filter_based_on'],
  onLoad: financialStatementOnLoad,
  phoneLayout: financialStatementPhoneLayout,
};
