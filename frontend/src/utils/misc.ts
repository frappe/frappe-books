import { DocValue, DocValueMap } from 'fyo/core/types';
import { ModelNameEnum } from 'models/types';
import { reports } from 'reports/index';
import type { Report } from 'reports/Report';
import type { Filter } from 'src/frappe/api';
import { newFrappeDoc } from 'src/frappe/documents';
import { getField } from 'src/frappe/registry';
import { toDocValue } from 'src/frappe/values';
import { fyo } from 'src/initFyo';
import type { RawValue } from 'schemas/types';
import { reactive } from 'vue';

/** A new wizard, in the browser's time zone until Frappe's setup sets the system one. */
export function getSetupWizardDoc() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return newFrappeDoc(ModelNameEnum.SetupWizard, { time_zone: timeZone });
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
  [ModelNameEnum.PrintFormat]: 'books/print-templates',

  // Miscellaneous
  Search: 'books/quick-search',
  NumberSeries: 'books/number-series',
  ImportWizard: 'books/import-wizard',
  Settings: 'books/settings',
  ChartOfAccounts: 'books/chart-of-accounts',
};

/**
 * Values a new document takes from the filters of its list or link, as
 * Frappe's list does: each `=` filter, or an `in` filter's first value but
 * Both, on a field users enter.
 */
export function getNewDocValues(
  schemaName: string,
  filters: Filter[]
): DocValueMap {
  const values: DocValueMap = {};
  for (const filter of filters) {
    const field = getField(schemaName, filter[0]);
    const value = getFilterChoice(filter);
    if (field && !field.meta && !field.readOnly && value !== undefined) {
      values[field.fieldname] = toDocValue(value as RawValue, field, fyo);
    }
  }

  return values;
}

function getFilterChoice([, operator, value]: Filter): unknown {
  if (operator === '=') {
    return value;
  }

  if (operator === 'in' && Array.isArray(value)) {
    return value.find((option) => option !== 'Both');
  }
}

export function getIsMac() {
  return navigator.userAgent.indexOf('Mac') !== -1;
}

export async function getReport(
  name: keyof typeof reports,
  filters: Record<string, DocValue> = {}
) {
  const cachedReport = fyo.store.reports[name];
  if (cachedReport) {
    return cachedReport;
  }

  // Reactive, so refreshing the cached report updates the pages showing it.
  const report = reactive(new reports[name](fyo)) as unknown as Report;
  await report.initialize(filters);
  fyo.store.reports[name] = report;
  return report;
}

/** Ref filters pick one document, so they last only while a link sets them. */
const NO_REFERENCE: Record<string, DocValue> = {
  referenceType: 'All',
  referenceName: null,
};

/**
 * Load a report when it is first shown, and refetch its data when shown
 * again. Either way the server runs it once, with the filters set.
 */
export async function showReport(
  name: keyof typeof reports,
  filters: Record<string, DocValue> = {}
): Promise<Report> {
  const report = fyo.store.reports[name];
  if (!report) {
    return getReport(name, filters);
  }

  await report.setFilters({ ...NO_REFERENCE, ...filters });
  await report.setReportData(undefined, true);
  return report;
}
