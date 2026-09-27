import { t } from 'fyo';
import { AccountReport } from 'reports/AccountReport';
import { AccountSection } from 'reports/types';

export class BalanceSheet extends AccountReport {
  static title = t`Balance Sheet`;
  static reportName = 'balance-sheet';
  loading = false;

  async setReportData() {
    this.loading = true;
    const { sections } = await this.fyo.db.getReportData<{
      sections: AccountSection[];
    }>('getBalanceSheet', this._getPeriods());

    this.reportData = this.getSectionRows(sections, {
      Asset: t`Total Asset (Debit)`,
      Liability: t`Total Liability (Credit)`,
      Equity: t`Total Equity (Credit)`,
    });
    this.loading = false;
  }
}
