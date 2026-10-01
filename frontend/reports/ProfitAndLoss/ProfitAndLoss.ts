import { t } from 'fyo';
import { AccountReport } from 'reports/AccountReport';
import { ServerRow } from 'reports/serverReport';
import { ColumnField, ReportRow } from 'reports/types';

const TOTAL_COLUMN: ColumnField = {
  fieldname: 'total',
  label: t`Total`,
  fieldtype: 'Currency',
  align: 'right',
};

export class ProfitAndLoss extends AccountReport {
  static title = t`Profit And Loss`;
  static reportName = 'profit-and-loss';
  static serverReportName = 'Books Profit and Loss';
  static phoneLayout = {
    ...AccountReport.phoneLayout,
    periods: { total: true },
  };

  /**
   * Rows keep the server's total. The profit row is bold, with profits in
   * green and losses in red.
   */
  getReportRow(row: ServerRow): ReportRow {
    const reportRow = {
      ...super.getReportRow(row),
      total: this.getCell(TOTAL_COLUMN, row.total),
    };
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
