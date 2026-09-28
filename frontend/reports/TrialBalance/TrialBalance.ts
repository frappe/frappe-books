import { t } from 'fyo';
import { AccountReport } from 'reports/AccountReport';
import { PhoneTreeLayout } from 'reports/types';
import { Field } from 'schemas/types';

export class TrialBalance extends AccountReport {
  static title = t`Trial Balance`;
  static reportName = 'trial-balance';
  static serverReportName = 'Books Trial Balance';
  static phoneLayout: PhoneTreeLayout = {
    type: 'tree',
    label: 'account',
    values: [
      { fieldname: 'closing_debit', width: 100 },
      { fieldname: 'closing_credit', width: 100 },
    ],
    chips: ['fromDate', 'toDate'],
    scroll: true,
  };

  fromDate?: string;

  getFilters(): Field[] {
    return [
      {
        fieldtype: 'Date',
        fieldname: 'fromDate',
        placeholder: t`From Date`,
        label: t`From Date`,
        required: true,
      },
      {
        fieldtype: 'Date',
        fieldname: 'toDate',
        placeholder: t`To Date`,
        label: t`To Date`,
        required: true,
      },
      {
        fieldtype: 'Check',
        label: t`Hide Group Amounts`,
        fieldname: 'hideGroupAmounts',
      } as Field,
    ] as Field[];
  }
}
