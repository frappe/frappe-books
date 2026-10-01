import type { QueryFilter } from 'utils/db/types';
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
  from_date: string;
  before_date: string;
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

/** List filters for the submitted invoices the dashboard counts as paid or unpaid. */
export function getInvoiceListFilters(
  summary: InvoiceSummary,
  paid: boolean
): QueryFilter {
  // Invoices are Frappe-backed, so their filters use Frappe fieldnames.
  return {
    submitted: ['=', 1],
    cancelled: ['=', 0],
    outstanding_amount: [paid ? '=' : '!=', 0],
    date: ['>=', summary.from_date, '<', summary.before_date],
  };
}
