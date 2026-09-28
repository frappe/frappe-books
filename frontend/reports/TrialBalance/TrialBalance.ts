import { t } from 'fyo';
import { AccountReport } from 'reports/AccountReport';
import { Field } from 'schemas/types';

export class TrialBalance extends AccountReport {
  static title = t`Trial Balance`;
  static reportName = 'trial-balance';
  static serverReportName = 'Books Trial Balance';

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
