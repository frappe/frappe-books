import { t } from 'fyo';
import { AccountReport } from 'reports/AccountReport';
import { Field } from 'schemas/types';

export class BalanceSheet extends AccountReport {
  static title = t`Balance Sheet`;
  static reportName = 'balance-sheet';
  static serverReportName = 'Books Balance Sheet';

  /** Balances are as of each period's end, so one merged column would only repeat the newest. */
  getFilters(): Field[] {
    return super
      .getFilters()
      .filter(({ fieldname }) => fieldname !== 'consolidateColumns');
  }
}
