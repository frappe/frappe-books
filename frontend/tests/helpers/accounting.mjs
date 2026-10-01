import { after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { withFieldProperties } from './doctypes.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'books-accounting-tests-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = path.join(directory, 'accounting.cjs');
const frontend = fileURLToPath(new URL('../..', import.meta.url));
await build({
  absWorkingDir: frontend,
  stdin: {
    contents: `
      export { Fyo } from './fyo';
      export { getSchemas } from './schemas';
      export { getDoctypeFieldProperties, getDoctypeSearchFields } from './tests/helpers/doctypeFieldProperties';
      export { frappeModels, models } from './models';
      export { BalanceSheet } from './reports/BalanceSheet/BalanceSheet';
      export { ProfitAndLoss } from './reports/ProfitAndLoss/ProfitAndLoss';
      export { GeneralLedger } from './reports/GeneralLedger/GeneralLedger';
      export { TrialBalance } from './reports/TrialBalance/TrialBalance';
      export { loadTranslations, useTranslations } from './src/web/translations';
      export { getAccountLabel } from './src/utils/accountLabel';
      export { t, setLanguageMapOnTranslationString } from './fyo/utils/translation';
      export { getJsonData, getCsvData } from './reports/commonExporter';
      export { getDocStatus, getDocStatusBadge, getLoyaltyProgramBadge, getStateBadge } from './models/helpers';
      export { getQuickEditFieldnames, getRowEditFieldnames } from './src/utils/sheetFields';
      export { getRowDetails } from './src/components/Controls/rowDetails';
      export * from './src/utils/filterQuery';
      export * from './src/utils/filterFields';
      export { getJsonExportData } from './src/utils/export';
      export {
        getMappedDoc,
        getStockTransferActions,
        validateQty,
      } from './models/helpers';
      export { getItemQtyMap, getPOSInventory, getPOSBatchQuantity, validatePOSStock } from './models/inventory/posStock';
      export {
        addBatchItem,
        addPOSItem,
        fillRowSerialNumbers,
        getPOSRowItem,
        setPOSRowQuantity,
        setPOSRowValue,
        validatePOSCheckout,
        validateSinv,
      } from './src/utils/pos';
      export { findScannedPOSItem } from './src/utils/posItemSearch';
      export { getReportCellColorClass } from './src/components/Report/cellColor';
      export { evaluateHidden, evaluateReadOnly, linkOnSave } from './src/utils/doc';
      export { loadListData, onListChange } from './src/utils/listData';
      export { showReport } from './src/utils/misc';
      export {
        getDashboardData,
        getInvoiceListFilters,
        getInvoiceSummary,
      } from './src/utils/dashboard';
      export { FrappeDatabaseDemux } from './src/web/databaseDemux';
      export { GSTR1 } from './reports/GoodsAndServiceTax/GSTR1';
      export { getGstrJsonData } from './reports/GoodsAndServiceTax/gstExporter';
      export { call } from './src/web/api';
      export * as errors from './fyo/utils/errors';
      export { getInsufficientItems } from './models/inventory/insufficientStock';
      export { getAvailableSerialNumbers } from './models/inventory/helpers';
      export { generateCSV, parseCSV } from './utils/csvParser';
      export { Importer, getGridRows, getImportableSchemaNames } from './src/importer';
      export { DataImport } from './src/dataImport';
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
export const { fieldProperties, getSchemas, searchFields } =
  withFieldProperties(bundle);
export const {
  Fyo,
  models,
  frappeModels,
  BalanceSheet,
  ProfitAndLoss,
  GeneralLedger,
  TrialBalance,
  loadTranslations,
  useTranslations,
  getAccountLabel,
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
  getJsonExportData,
  FilterSet,
  filterConditions,
  conditionsForField,
  defaultCondition,
  isCompleteFilter,
  mergeQueryFilters,
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
  fillRowSerialNumbers,
  getPOSRowItem,
  validatePOSCheckout,
  getReportCellColorClass,
  getDashboardData,
  getInvoiceListFilters,
  getInvoiceSummary,

  evaluateHidden,
  evaluateReadOnly,
  linkOnSave,
  loadListData,
  onListChange,
  showReport,
  FrappeDatabaseDemux,
  GSTR1,
  getGstrJsonData,
  call,
  errors,
  getInsufficientItems,
  getAvailableSerialNumbers,
  generateCSV,
  parseCSV,
  Importer,
  getGridRows,
  getImportableSchemaNames,
  DataImport,
} = bundle;

export async function makeFyo() {
  class Store {
    getSchemaMap() {
      return getSchemas('-', []);
    }
    call(method) {
      // The store holds no documents; a missing one reads as an empty map.
      if (method === 'exists') return false;
      if (method === 'get') return {};
      if (['getAll', 'getAllRaw'].includes(method)) return [];
      throw new Error(`Unexpected database call: ${method}`);
    }
    // Invoices preview their totals once edits pause; echo the values back.
    runDocMethod(method, schemaName, values) {
      return values;
    }
  }
  const fyo = new Fyo({ DatabaseDemux: Store });
  await fyo.db.init();
  fyo.doc.registerModels(models);
  fyo.singles.AccountingSettings = { enable_discounting: true };
  fyo.singles.SystemSettings = { currency: 'USD', display_precision: 2 };
  fyo.store.searchFields = searchFields;
  return fyo;
}
