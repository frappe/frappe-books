import { makeERPNextReport } from './ERPNextReport';
import { accountsPayable } from './accountsPayable';
import { accountsReceivable } from './accountsReceivable';
import { balanceSheet } from './balanceSheet';
import { generalLedger } from './generalLedger';
import { profitAndLoss } from './profitAndLoss';
import { stockBalance } from './stockBalance';
import { stockLedger } from './stockLedger';
import { trialBalance } from './trialBalance';

/** The ERPNext reports accessory mode shows, in the order the sidebar lists them. */
export const erpnextReports = {
  GeneralLedger: makeERPNextReport(generalLedger),
  TrialBalance: makeERPNextReport(trialBalance),
  ProfitAndLoss: makeERPNextReport(profitAndLoss),
  BalanceSheet: makeERPNextReport(balanceSheet),
  StockBalance: makeERPNextReport(stockBalance),
  StockLedger: makeERPNextReport(stockLedger),
  AccountsReceivable: makeERPNextReport(accountsReceivable),
  AccountsPayable: makeERPNextReport(accountsPayable),
} as const;
