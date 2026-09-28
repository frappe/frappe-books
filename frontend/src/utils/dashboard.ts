import { call } from 'src/web/api';
import type { PeriodKey } from './types';

export interface MonthlyCashflow {
  yearmonth: string;
  inflow: number;
  outflow: number;
}

export interface MonthlyBalance {
  yearmonth: string;
  balance: number;
}

export interface InvoiceSummary {
  total: number;
  paid: number;
  unpaid: number;
  paid_count: number;
  unpaid_count: number;
}

/** Dashboard figures are computed on the server for a period that ends today. */
export function getDashboardData<T>(
  method: 'get_cashflow' | 'get_profit_and_loss' | 'get_top_expenses',
  period: PeriodKey
): Promise<T> {
  return call<T>(`frappe_books.reports.dashboard.${method}`, { period });
}

export function getInvoiceSummary(
  doctype: string,
  period: PeriodKey
): Promise<InvoiceSummary> {
  return call<InvoiceSummary>(
    'frappe_books.reports.dashboard.get_invoice_summary',
    { doctype, period }
  );
}
