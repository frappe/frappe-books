import { t } from 'fyo';
import { DateTime } from 'luxon';
import {
  AccountReport,
  ACC_BAL_WIDTH,
  ACC_NAME_WIDTH,
  getFiscalEndpoints,
} from 'reports/AccountReport';
import { AccountSection, ColumnField } from 'reports/types';
import { Field } from 'schemas/types';

export class TrialBalance extends AccountReport {
  static title = t`Trial Balance`;
  static reportName = 'trial-balance';

  fromDate?: string;
  toDate?: string;
  hideGroupAmounts = false;
  loading = false;

  async setReportData() {
    this.loading = true;
    const toDate = DateTime.fromISO(this.toDate!).plus({ days: 1 }).toISODate();
    const { sections } = await this.fyo.db.getReportData<{
      sections: AccountSection[];
    }>('getTrialBalance', this.fromDate, toDate);
    this.reportData = this.getSectionRows(sections);
    this.loading = false;
  }

  async setDefaultFilters(): Promise<void> {
    if (!this.toDate || !this.fromDate) {
      const { year } = DateTime.now();
      const endpoints = await getFiscalEndpoints(year + 1, year, this.fyo);

      this.fromDate = endpoints.fromDate;
      this.toDate = DateTime.fromISO(endpoints.toDate)
        .minus({ days: 1 })
        .toISODate();
    }
  }

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

  getColumns(): ColumnField[] {
    return [
      {
        label: t`Account`,
        fieldtype: 'Link',
        fieldname: 'account',
        align: 'left',
        width: ACC_NAME_WIDTH,
      },
      {
        label: t`Opening (Dr)`,
        fieldtype: 'Data',
        fieldname: 'openingDebit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
      {
        label: t`Opening (Cr)`,
        fieldtype: 'Data',
        fieldname: 'openingCredit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
      {
        label: t`Debit`,
        fieldtype: 'Data',
        fieldname: 'debit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
      {
        label: t`Credit`,
        fieldtype: 'Data',
        fieldname: 'credit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
      {
        label: t`Closing (Dr)`,
        fieldtype: 'Data',
        fieldname: 'closingDebit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
      {
        label: t`Closing (Cr)`,
        fieldtype: 'Data',
        fieldname: 'closingCredit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
    ] as ColumnField[];
  }
}
