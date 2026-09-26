import { t } from 'fyo';
import { AccountReport } from 'reports/AccountReport';
import { AccountSection, ReportData } from 'reports/types';

type ProfitAndLossData = { sections: AccountSection[]; profit: number[] };

export class ProfitAndLoss extends AccountReport {
  static title = t`Profit And Loss`;
  static reportName = 'profit-and-loss';
  loading = false;

  async setReportData() {
    this.loading = true;
    const data = await this.fyo.db.getReportData<ProfitAndLossData>(
      'getProfitAndLoss',
      this._getPeriods()
    );
    this.reportData = this.getReportDataFromSections(data);
    this.loading = false;
  }

  getReportDataFromSections({ sections, profit }: ProfitAndLossData) {
    const reportData = this.getSectionRows(sections, {
      Income: t`Total Income (Credit)`,
      Expense: t`Total Expense (Debit)`,
    });
    if (sections.length < 2) {
      return reportData;
    }

    const profitRow = this.getTotalRow(t`Total Profit`, profit);
    for (const cell of profitRow.cells) {
      cell.bold = true;
      if (typeof cell.rawValue === 'number' && cell.rawValue !== 0) {
        cell.color = cell.rawValue > 0 ? 'green' : 'red';
      }
    }

    return [...reportData, this.getEmptyRow(), profitRow] as ReportData;
  }
}
