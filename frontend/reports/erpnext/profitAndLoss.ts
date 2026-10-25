import { t } from 'fyo';
import {
  financialStatementFilters,
  financialStatementOnLoad,
  financialStatementPhoneLayout,
} from './financialStatements';
import type { ERPNextReportDefinition } from './types';

export const profitAndLoss: ERPNextReportDefinition = {
  reportName: 'Profit and Loss Statement',
  title: t`Profit and Loss`,
  source:
    'erpnext/accounts/report/profit_and_loss_statement/profit_and_loss_statement.js',
  filters: [
    ...financialStatementFilters,
    {
      fieldname: 'accumulated_values',
      label: t`Accumulated Values`,
      fieldtype: 'Check',
      default: 0,
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
        { value: 'Margin', label: t`Margin View` },
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
