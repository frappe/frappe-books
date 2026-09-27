import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { reports } from 'reports/index';
import type { Report } from 'reports/Report';
import { fyo } from 'src/initFyo';
import { QueryFilter } from 'utils/db/types';
import { PeriodKey } from './types';

export function getDatesAndPeriodList(period: PeriodKey): {
  periodList: DateTime[];
  fromDate: DateTime;
  toDate: DateTime;
} {
  const toDate: DateTime = DateTime.now().plus({ days: 1 });
  let fromDate: DateTime;

  if (period === 'This Year') {
    fromDate = toDate.minus({ months: 12 });
  } else if (period === 'YTD') {
    fromDate = DateTime.now().startOf('year');
  } else if (period === 'This Quarter') {
    fromDate = toDate.minus({ months: 3 });
  } else if (period === 'This Month') {
    fromDate = toDate.startOf('month');
  } else {
    fromDate = toDate.minus({ days: 1 });
  }

  /**
   * periodList: Monthly decrements before toDate until fromDate
   */
  const periodList: DateTime[] = [toDate];
  while (true) {
    const nextDate = periodList.at(0)!.minus({ months: 1 });
    if (nextDate.toMillis() < fromDate.toMillis()) {
      if (period === 'YTD') {
        periodList.unshift(nextDate);
        break;
      }
      break;
    }

    periodList.unshift(nextDate);
  }
  periodList.shift();

  return {
    periodList,
    fromDate,
    toDate,
  };
}

export function getSetupWizardDoc() {
  return fyo.doc.getNewDoc(ModelNameEnum.SetupWizard, {}, false);
}

export const docsPathMap: Record<string, string | undefined> = {
  // Analytics
  Dashboard: 'books/dashboard',
  Reports: 'books/reports',
  GeneralLedger: 'books/general-ledger',
  ProfitAndLoss: 'books/profit-and-loss',
  BalanceSheet: 'books/balance-sheet',
  TrialBalance: 'books/trial-balance',

  // Transactions
  [ModelNameEnum.SalesInvoice]: 'books/sales-invoices',
  [ModelNameEnum.PurchaseInvoice]: 'books/purchase-invoices',
  [ModelNameEnum.Payment]: 'books/payments',
  [ModelNameEnum.JournalEntry]: 'books/journal-entries',

  // Inventory
  [ModelNameEnum.StockMovement]: 'books/stock-movement',
  [ModelNameEnum.Shipment]: 'books/shipment',
  [ModelNameEnum.PurchaseReceipt]: 'books/purchase-receipt',
  StockLedger: 'books/stock-ledger',
  StockBalance: 'books/stock-balance',
  [ModelNameEnum.Batch]: 'books/batches',

  // Entries
  Entries: 'books/books',
  [ModelNameEnum.Party]: 'books/party',
  [ModelNameEnum.Item]: 'books/items',
  [ModelNameEnum.Tax]: 'books/taxes',
  [ModelNameEnum.PrintTemplate]: 'books/print-templates',

  // Miscellaneous
  Search: 'books/quick-search',
  NumberSeries: 'books/number-series',
  ImportWizard: 'books/import-wizard',
  Settings: 'books/settings',
  ChartOfAccounts: 'books/chart-of-accounts',
};

export function getCreateFiltersFromListViewFilters(filters: QueryFilter) {
  const createFilters: Record<string, string | number | boolean | null> = {};

  for (const key in filters) {
    let value: (typeof filters)[string] | undefined | number = filters[key];

    if (Array.isArray(value) && value[0] === 'in' && Array.isArray(value[1])) {
      value = value[1].filter((v) => v !== 'Both')[0];
    }

    if (value === undefined || Array.isArray(value)) {
      continue;
    }

    createFilters[key] = value;
  }

  return createFilters;
}

export function getIsMac() {
  return navigator.userAgent.indexOf('Mac') !== -1;
}

export async function getReport(name: keyof typeof reports) {
  const cachedReport = fyo.store.reports[name];
  if (cachedReport) {
    return cachedReport;
  }

  const report = new reports[name](fyo);
  await report.initialize();
  fyo.store.reports[name] = report;
  return report;
}

/** Load a report when it is first shown, and refetch its data when shown again. */
export async function showReport(
  report: Report | null,
  name: keyof typeof reports
): Promise<Report> {
  if (report === null) {
    return getReport(name);
  }

  await report.setReportData(undefined, true);
  return report;
}
