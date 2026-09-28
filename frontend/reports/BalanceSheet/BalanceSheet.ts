import { t } from 'fyo';
import { AccountReport } from 'reports/AccountReport';

export class BalanceSheet extends AccountReport {
  static title = t`Balance Sheet`;
  static reportName = 'balance-sheet';
  static serverReportName = 'Books Balance Sheet';
}
