import { BalanceSheet } from './BalanceSheet/BalanceSheet';
import { GeneralLedger } from './GeneralLedger/GeneralLedger';
import { GSTR1 } from './GoodsAndServiceTax/GSTR1';
import { GSTR2 } from './GoodsAndServiceTax/GSTR2';
import { ProfitAndLoss } from './ProfitAndLoss/ProfitAndLoss';
import { TrialBalance } from './TrialBalance/TrialBalance';
import { StockBalance } from './inventory/StockBalance';
import { StockLedger } from './inventory/StockLedger';
import { isAccessoryMode } from 'src/frappe/mode';
import { erpnextReports } from './erpnext';

export const reports = {
  GeneralLedger,
  ProfitAndLoss,
  BalanceSheet,
  TrialBalance,
  GSTR1,
  GSTR2,
  StockLedger,
  StockBalance,
} as const;

type BooksReport = (typeof reports)[keyof typeof reports];
type ERPNextReportClass = (typeof erpnextReports)[keyof typeof erpnextReports];
export type ReportClass = BooksReport | ERPNextReportClass;
export type ReportName = keyof typeof reports | keyof typeof erpnextReports;

/** The reports the mode shows, by route name: Books' own, or ERPNext's in accessory mode. */
export function getReports(): Partial<Record<ReportName, ReportClass>> {
  return isAccessoryMode() ? erpnextReports : reports;
}
