import { t } from 'fyo';
import { AccountReport } from 'reports/AccountReport';
import { ServerRow } from 'reports/serverReport';
import { ReportRow } from 'reports/types';

export class ProfitAndLoss extends AccountReport {
  static title = t`Profit And Loss`;
  static reportName = 'profit-and-loss';
  static serverReportName = 'Books Profit and Loss';

  /** The profit row is bold, with profits in green and losses in red. */
  getReportRow(row: ServerRow): ReportRow {
    const reportRow = super.getReportRow(row);
    if (!row.bold) {
      return reportRow;
    }

    for (const cell of reportRow.cells) {
      cell.bold = true;
      if (typeof cell.rawValue === 'number' && cell.rawValue !== 0) {
        cell.color = cell.rawValue > 0 ? 'green' : 'red';
      }
    }

    return reportRow;
  }
}
