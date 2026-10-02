import { after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(path.join(tmpdir(), 'books-accounting-tests-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = path.join(directory, 'accounting.cjs');
const frontend = fileURLToPath(new URL('../..', import.meta.url));
await build({
  absWorkingDir: frontend,
  stdin: {
    contents: `
      export { Fyo } from './fyo';
      export { frappeModels } from './models';
      export { BalanceSheet } from './reports/BalanceSheet/BalanceSheet';
      export { ProfitAndLoss } from './reports/ProfitAndLoss/ProfitAndLoss';
      export { GeneralLedger } from './reports/GeneralLedger/GeneralLedger';
      export { TrialBalance } from './reports/TrialBalance/TrialBalance';
      export { StockBalance } from './reports/inventory/StockBalance';
      export { loadTranslations, useTranslations } from './src/web/translations';
      export { t, setLanguageMapOnTranslationString } from './fyo/utils/translation';
      export { getJsonData, getCsvData } from './reports/commonExporter';
      export { getDocStatus, getDocStatusBadge, getLoyaltyProgramBadge, getStateBadge } from './models/helpers';
      export { getQuickEditFieldnames, getRowEditFieldnames } from './src/utils/sheetFields';
      export { getRowDetails } from './src/components/Controls/rowDetails';
      export * from './src/utils/filterQuery';
      export * from './src/utils/filterFields';
      export { getMappedDoc, getStockTransferActions } from './models/helpers';
      export { findScannedPOSItem } from './src/utils/posItemSearch';
      export { getReportCellColorClass } from './src/components/Report/cellColor';
      export { getDateRangePresets, getFilterItems } from './src/components/Report/filterToolbar';
      export {
        evaluateHidden,
        evaluateReadOnly,
        getLinkedEntries,
        linkOnSave,
      } from './src/utils/doc';
      export { showReport } from './src/utils/misc';
      export { fyo as appFyo } from './src/initFyo';
      export { getDefaultFilters as getReportDefaultFilters } from './src/components/Report/Mobile/MobileFilters';
      export {
        getDashboardData,
        getInvoiceListFilters,
        getInvoiceSummary,
      } from './src/utils/dashboard';
      export { GSTR1 } from './reports/GoodsAndServiceTax/GSTR1';
      export { getGstrJsonData } from './reports/GoodsAndServiceTax/gstExporter';
      export { call } from './src/web/api';
      export { getDocuments } from './src/frappe/api';
      export * as errors from './fyo/utils/errors';
      export { getInsufficientItems } from './models/inventory/insufficientStock';
      export { generateCSV, parseCSV } from './utils/csvParser';
      export { getImportableSchemaNames } from './src/importer';
      export { DataImport } from './src/dataImport';
      export { reactive, watchSyncEffect } from 'vue';
    `,
    resolveDir: frontend,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  define: { 'import.meta.env.VITE_ROUTER_BASE': '"/books"' },
  outfile: output,
  plugins: [
    {
      name: 'browser-boundaries',
      setup(builder) {
        builder.onLoad({ filter: /\.vue$/ }, () => ({
          contents: 'export default {}',
        }));
      },
    },
  ],
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.css': 'empty' },
});
const bundle = createRequire(import.meta.url)(output);
export const {
  Fyo,
  frappeModels,
  BalanceSheet,
  ProfitAndLoss,
  GeneralLedger,
  TrialBalance,
  StockBalance,
  loadTranslations,
  useTranslations,
  t,
  setLanguageMapOnTranslationString,
  getJsonData,
  getCsvData,
  getDocStatus,
  getDocStatusBadge,
  getLoyaltyProgramBadge,
  getStateBadge,
  getQuickEditFieldnames,
  getRowEditFieldnames,
  getRowDetails,
  getFilterFields,
  getFieldLabel,
  FilterSet,
  filterConditions,
  conditionsForField,
  defaultCondition,
  isCompleteFilter,
  getItemQtyMap,
  getMappedDoc,
  getStockTransferActions,
  validateQty,
  getPOSInventory,
  getPOSBatchQuantity,
  validatePOSStock,
  setPOSRowQuantity,
  setPOSRowValue,
  findScannedPOSItem,
  validateSinv,
  addBatchItem,
  addPOSItem,
  getPOSRowItem,
  validatePOSCheckout,
  getReportCellColorClass,
  getDateRangePresets,
  getFilterItems,
  getDashboardData,
  getInvoiceListFilters,
  getInvoiceSummary,

  evaluateHidden,
  evaluateReadOnly,
  getLinkedEntries,
  linkOnSave,
  showReport,
  appFyo,
  getReportDefaultFilters,
  GSTR1,
  getGstrJsonData,
  call,
  getDocuments,
  errors,
  getInsufficientItems,
  generateCSV,
  parseCSV,
  getImportableSchemaNames,
  DataImport,
  reactive,
  watchSyncEffect,
} = bundle;

/** A Fyo with the settings tests read: discounting on, amounts in USD to two decimals. */
export async function makeFyo() {
  const fyo = new Fyo();
  fyo.singles.AccountingSettings = { enable_discounting: true };
  fyo.singles.SystemSettings = { currency: 'USD', display_precision: 2 };
  return fyo;
}
